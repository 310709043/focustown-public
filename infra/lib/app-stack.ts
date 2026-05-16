import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import { EnvConfig } from './config/types';
import { createFargateService } from './constructs/fargate-service-factory';

interface AppStackPeers {
  readonly vpc: ec2.IVpc;
  readonly albSg: ec2.ISecurityGroup;
  readonly apiSg: ec2.ISecurityGroup;
  readonly workerSg: ec2.ISecurityGroup;
  readonly frontendSg: ec2.ISecurityGroup;

  readonly auroraEndpoint: string;
  readonly auroraSecret: secretsmanager.ISecret;
  readonly redisEndpoint: string;
  readonly redisAuthSecret: secretsmanager.Secret;
  readonly assetsBucketArn: string;
  readonly assetsBucketName: string;
  readonly userPoolId: string;
  readonly userPoolArn: string;
  readonly userPoolClientId: string;
  readonly appSecretKeyArn: string;
  readonly sesConfigSetName: string;
  readonly sesDomainArn: string;
}

/**
 * AppStack — ECR + ECS cluster + 3 Fargate services + ALB.
 *
 * Image tags are floating (``latest-dev`` / ``latest-prod``) for MVP; the
 * GitHub Actions deploy workflow calls ``aws ecs update-service
 * --force-new-deployment`` after each ECR push to trigger a rolling
 * deploy. Path-based ALB routing: ``/api/*`` and ``/api/v1/ws/*`` →
 * backend target group; everything else → frontend target group.
 */
export class AppStack extends cdk.Stack {
  readonly backendRepo: ecr.Repository;
  readonly frontendRepo: ecr.Repository;
  readonly cluster: ecs.Cluster;
  readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
    config: EnvConfig,
    peers: AppStackPeers
  ) {
    super(scope, id, props);

    const removalPolicy = config.removalPolicyDestroy
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;
    const logRetention = this._daysToRetention(config.logRetentionDays);

    // ── ECR ───────────────────────────────────────────────────────────────
    this.backendRepo = new ecr.Repository(this, 'BackendRepo', {
      repositoryName: 'focustown-backend',
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20 }],
      removalPolicy,
      emptyOnDelete: config.removalPolicyDestroy,
    });
    this.frontendRepo = new ecr.Repository(this, 'FrontendRepo', {
      repositoryName: 'focustown-frontend',
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20 }],
      removalPolicy,
      emptyOnDelete: config.removalPolicyDestroy,
    });

    // ── ECS cluster ───────────────────────────────────────────────────────
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: peers.vpc,
      clusterName: `focustown-${config.envName}`,
      containerInsightsV2: config.containerInsights
        ? ecs.ContainerInsights.ENABLED
        : ecs.ContainerInsights.DISABLED,
    });

    // ── Shared task-role policies (api + worker) ──────────────────────────
    // Backend reads its own bucket, sends from its SES identity, and
    // delegates auth via Cognito. Each statement is ARN-scoped so the
    // task can't reach into another product's resources.
    const sharedBackendPolicies: iam.PolicyStatement[] = [
      new iam.PolicyStatement({
        sid: 'ReadAppSecrets',
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/focustown/${config.envName}/*`,
        ],
      }),
      new iam.PolicyStatement({
        sid: 'ReadSsmParams',
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/focustown/${config.envName}/*`,
        ],
      }),
      new iam.PolicyStatement({
        sid: 'AssetsBucketReadWrite',
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:AbortMultipartUpload',
        ],
        resources: [`${peers.assetsBucketArn}/*`],
      }),
      new iam.PolicyStatement({
        sid: 'AssetsBucketList',
        actions: ['s3:ListBucket'],
        resources: [peers.assetsBucketArn],
      }),
      new iam.PolicyStatement({
        sid: 'CognitoUserAdmin',
        actions: [
          'cognito-idp:AdminInitiateAuth',
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminUpdateUserAttributes',
          'cognito-idp:AdminDeleteUser',
        ],
        resources: [peers.userPoolArn],
      }),
      new iam.PolicyStatement({
        sid: 'SesSendFromOwnIdentity',
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: [peers.sesDomainArn],
        conditions: {
          StringLike: {
            'ses:FromAddress': `noreply@${config.sesDomain}`,
          },
        },
      }),
    ];

    // ── Common container env / secrets ────────────────────────────────────
    // We inject the Aurora password and the Redis AUTH token as SEPARATE
    // env vars (DB_PASSWORD, REDIS_AUTH_TOKEN), and rely on the backend
    // container's entrypoint to compose DATABASE_URL / REDIS_URL from the
    // pieces. This avoids needing the AWS SDK at process boot.
    const backendEnv: { [k: string]: string } = {
      APP_ENV: config.envName === 'prod' ? 'production' : 'development',
      AWS_REGION: this.region,
      APP_CORS_ORIGINS: config.corsOrigins.join(','),
      AUTH_PROVIDER: 'cognito',
      STORAGE_BACKEND: 's3',
      NOTIFIER_BACKEND: 'ses',
      SECRETS_BACKEND: 'aws',
      COGNITO_USER_POOL_ID: peers.userPoolId,
      COGNITO_CLIENT_ID: peers.userPoolClientId,
      S3_BUCKET: peers.assetsBucketName,
      S3_REGION: this.region,
      SES_FROM_EMAIL: `noreply@${config.sesDomain}`,
      DB_HOST: peers.auroraEndpoint,
      DB_PORT: '5432',
      DB_NAME: 'focustown',
      REDIS_HOST: peers.redisEndpoint,
      REDIS_PORT: '6379',
      RESET_URL_BASE:
        config.envName === 'prod'
          ? `https://${config.sesDomain}/reset-password`
          : `https://dev.${config.sesDomain}/reset-password`,
    };

    const backendSecrets = {
      APP_SECRET_KEY: ecs.Secret.fromSecretsManager(
        secretsmanager.Secret.fromSecretCompleteArn(
          this,
          'AppSecretKeyImport',
          peers.appSecretKeyArn
        )
      ),
      DB_USER: ecs.Secret.fromSecretsManager(peers.auroraSecret, 'username'),
      DB_PASSWORD: ecs.Secret.fromSecretsManager(peers.auroraSecret, 'password'),
      REDIS_AUTH_TOKEN: ecs.Secret.fromSecretsManager(peers.redisAuthSecret),
    };

    // ── API service ───────────────────────────────────────────────────────
    const api = createFargateService(this, {
      id: 'Api',
      containerName: 'app',
      cluster: this.cluster,
      vpc: peers.vpc,
      securityGroup: peers.apiSg,
      size: config.apiTask,
      desiredCount: config.apiDesiredCount,
      image: ecs.ContainerImage.fromEcrRepository(
        this.backendRepo,
        `latest-${config.envName}`
      ),
      containerPort: 8000,
      environment: backendEnv,
      secrets: backendSecrets,
      logRetention,
      removalPolicy,
      taskRolePolicies: sharedBackendPolicies,
    });

    // ── Worker service ────────────────────────────────────────────────────
    createFargateService(this, {
      id: 'Worker',
      containerName: 'worker',
      cluster: this.cluster,
      vpc: peers.vpc,
      securityGroup: peers.workerSg,
      size: config.workerTask,
      desiredCount: config.workerDesiredCount,
      image: ecs.ContainerImage.fromEcrRepository(
        this.backendRepo,
        `latest-${config.envName}`
      ),
      environment: backendEnv,
      secrets: backendSecrets,
      command: ['python', '-m', 'app.worker'],
      logRetention,
      removalPolicy,
      taskRolePolicies: sharedBackendPolicies,
    });

    // ── Frontend service ──────────────────────────────────────────────────
    // Next.js standalone server. Build-time NEXT_PUBLIC_* vars are baked
    // into the image during CI; runtime env carries only NODE_ENV / PORT.
    const frontend = createFargateService(this, {
      id: 'Frontend',
      containerName: 'web',
      cluster: this.cluster,
      vpc: peers.vpc,
      securityGroup: peers.frontendSg,
      size: config.frontendTask,
      desiredCount: config.frontendDesiredCount,
      image: ecs.ContainerImage.fromEcrRepository(
        this.frontendRepo,
        `latest-${config.envName}`
      ),
      containerPort: 3000,
      environment: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      logRetention,
      removalPolicy,
    });

    // ── ALB + listeners ───────────────────────────────────────────────────
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: peers.vpc,
      internetFacing: true,
      securityGroup: peers.albSg,
      deletionProtection: config.enableDeletionProtection,
    });

    const cert = acm.Certificate.fromCertificateArn(this, 'AlbCert', config.acmCertArn);

    const apiTg = new elbv2.ApplicationTargetGroup(this, 'ApiTg', {
      vpc: peers.vpc,
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/healthz',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });
    apiTg.addTarget(api.service);

    const frontendTg = new elbv2.ApplicationTargetGroup(this, 'FrontendTg', {
      vpc: peers.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200-399',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });
    frontendTg.addTarget(frontend.service);

    this.alb.addListener('HttpRedirect', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    const httpsListener = this.alb.addListener('Https', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [cert],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      defaultTargetGroups: [frontendTg],
    });
    httpsListener.addAction('ApiRoutes', {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/api/*', '/api/v1/ws/*', '/healthz']),
      ],
      action: elbv2.ListenerAction.forward([apiTg]),
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'ALB DNS — point your Route53 record here',
    });
    new cdk.CfnOutput(this, 'BackendRepoUri', {
      value: this.backendRepo.repositoryUri,
    });
    new cdk.CfnOutput(this, 'FrontendRepoUri', {
      value: this.frontendRepo.repositoryUri,
    });
  }

  private _daysToRetention(days: number): logs.RetentionDays {
    const map: Record<number, logs.RetentionDays> = {
      1: logs.RetentionDays.ONE_DAY,
      7: logs.RetentionDays.ONE_WEEK,
      14: logs.RetentionDays.TWO_WEEKS,
      30: logs.RetentionDays.ONE_MONTH,
      60: logs.RetentionDays.TWO_MONTHS,
      90: logs.RetentionDays.THREE_MONTHS,
      180: logs.RetentionDays.SIX_MONTHS,
      365: logs.RetentionDays.ONE_YEAR,
    };
    return map[days] ?? logs.RetentionDays.ONE_MONTH;
  }
}

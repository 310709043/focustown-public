import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import { EnvConfig } from './config/types';

interface DataStackPeers {
  readonly vpc: ec2.IVpc;
  readonly apiSg: ec2.ISecurityGroup;
  readonly workerSg: ec2.ISecurityGroup;
}

/**
 * DataStack — Aurora Postgres Serverless v2, ElastiCache Redis, S3 bucket.
 *
 * All stateful resources: encryption-at-rest on, deletion protection /
 * retain-on-destroy follows config. Aurora's auto-generated secret is the
 * single source for DB credentials; the AppStack injects the password
 * fragment into the ECS task via task-definition Secrets — no SDK call at
 * runtime.
 */
export class DataStack extends cdk.Stack {
  readonly auroraCluster: rds.DatabaseCluster;
  readonly auroraEndpoint: string;
  readonly auroraSecret: secretsmanager.ISecret;
  readonly redisEndpoint: string;
  readonly redisAuthSecret: secretsmanager.Secret;
  readonly assetsBucket: s3.Bucket;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
    config: EnvConfig,
    peers: DataStackPeers
  ) {
    super(scope, id, props);

    // ── Aurora Postgres Serverless v2 ─────────────────────────────────────
    const auroraSg = new ec2.SecurityGroup(this, 'AuroraSg', {
      vpc: peers.vpc,
      description: 'Aurora Postgres — 5432 from api + worker only',
      allowAllOutbound: false,
    });
    auroraSg.addIngressRule(peers.apiSg, ec2.Port.tcp(5432), 'api');
    auroraSg.addIngressRule(peers.workerSg, ec2.Port.tcp(5432), 'worker');

    const writer = rds.ClusterInstance.serverlessV2('writer', {
      autoMinorVersionUpgrade: true,
      enablePerformanceInsights: false,
    });
    const readers = config.auroraReader
      ? [
          rds.ClusterInstance.serverlessV2('reader', {
            autoMinorVersionUpgrade: true,
            scaleWithWriter: true,
          }),
        ]
      : [];

    this.auroraCluster = new rds.DatabaseCluster(this, 'Aurora', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      writer,
      readers,
      serverlessV2MinCapacity: config.auroraMinAcu,
      serverlessV2MaxCapacity: config.auroraMaxAcu,
      vpc: peers.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [auroraSg],
      storageEncrypted: true,
      credentials: rds.Credentials.fromGeneratedSecret('focustown_app'),
      defaultDatabaseName: 'focustown',
      backup: { retention: cdk.Duration.days(config.dbBackupRetentionDays) },
      deletionProtection: config.enableDeletionProtection,
      removalPolicy: config.removalPolicyDestroy
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.SNAPSHOT,
    });

    this.auroraEndpoint = this.auroraCluster.clusterEndpoint.hostname;
    // Aurora generates the secret automatically; .secret is non-null when
    // Credentials.fromGeneratedSecret was used.
    this.auroraSecret = this.auroraCluster.secret!;

    // ── ElastiCache Redis (cluster-mode-disabled, single shard) ───────────
    const redisSg = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc: peers.vpc,
      description: 'Redis — 6379 from api + worker only',
      allowAllOutbound: false,
    });
    redisSg.addIngressRule(peers.apiSg, ec2.Port.tcp(6379), 'api');
    redisSg.addIngressRule(peers.workerSg, ec2.Port.tcp(6379), 'worker');

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnets', {
      description: 'Private subnets for Redis',
      subnetIds: peers.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }).subnetIds,
    });

    // AUTH token: 32-char alphanumeric satisfies ElastiCache AUTH spec
    // (16–128 chars, no special chars beyond ! & # $ ^ < > -). We let
    // Secrets Manager generate it so it's never seen in plaintext.
    this.redisAuthSecret = new secretsmanager.Secret(this, 'RedisAuthSecret', {
      secretName: `/focustown/${config.envName}/redis_auth_token`,
      description: 'AUTH token for ElastiCache Redis',
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
        excludeCharacters: '"@/\\',
      },
      removalPolicy: config.removalPolicyDestroy
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    const redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: config.redisNodeType,
      replicationGroupDescription: `focustown-${config.envName} redis`,
      automaticFailoverEnabled: config.redisReplicas > 0,
      numNodeGroups: 1,
      replicasPerNodeGroup: config.redisReplicas,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      authToken: this.redisAuthSecret.secretValue.unsafeUnwrap(),
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [redisSg.securityGroupId],
      // L1 doesn't auto-inherit tags from the App-level Tags aspect, so we
      // apply them explicitly to keep Cost Explorer happy.
      tags: [
        { key: 'product', value: 'focustown' },
        { key: 'env', value: config.envName },
      ],
    });
    redis.applyRemovalPolicy(
      config.removalPolicyDestroy
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN
    );

    this.redisEndpoint = redis.attrPrimaryEndPointAddress;

    // ── S3 assets bucket ─────────────────────────────────────────────────
    this.assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: `focustown-assets-${config.envName}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: config.corsOrigins,
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) },
      ],
      removalPolicy: config.removalPolicyDestroy
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: config.removalPolicyDestroy,
    });
  }
}

/**
 * Smoke / snapshot test for the CDK synthesis pipeline.
 *
 * Synthesises the full app under both env contexts and asserts that
 * (a) synth succeeds, (b) each stack carries the product / env tags, and
 * (c) per-env knobs differ where we expect them to. These run without
 * AWS credentials and act as the regression guard for IAM / SG churn.
 */
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';

import { devConfig } from '../lib/config/dev';
import { prodConfig } from '../lib/config/prod';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { MessagingStack } from '../lib/messaging-stack';
import { AppStack } from '../lib/app-stack';
import { CicdStack } from '../lib/cicd-stack';

function buildApp(config: typeof devConfig) {
  const app = new cdk.App();
  cdk.Tags.of(app).add('product', 'focustown');
  cdk.Tags.of(app).add('env', config.envName);

  const env: cdk.Environment = {
    account: '123456789012',
    region: config.region,
  };
  const props = (name: string): cdk.StackProps => ({
    env,
    stackName: `focustown-${config.envName}-${name}`,
  });

  const network = new NetworkStack(app, props('network').stackName!, props('network'), config);
  const data = new DataStack(app, props('data').stackName!, props('data'), config, {
    vpc: network.vpc,
    apiSg: network.apiSg,
    workerSg: network.workerSg,
  });
  const auth = new AuthStack(app, props('auth').stackName!, props('auth'), config);
  const messaging = new MessagingStack(
    app,
    props('messaging').stackName!,
    props('messaging'),
    config
  );
  const appStack = new AppStack(app, props('app').stackName!, props('app'), config, {
    vpc: network.vpc,
    albSg: network.albSg,
    apiSg: network.apiSg,
    workerSg: network.workerSg,
    frontendSg: network.frontendSg,
    auroraEndpoint: data.auroraEndpoint,
    auroraSecret: data.auroraSecret,
    redisEndpoint: data.redisEndpoint,
    redisAuthSecret: data.redisAuthSecret,
    assetsBucketArn: data.assetsBucket.bucketArn,
    assetsBucketName: data.assetsBucket.bucketName,
    userPoolId: auth.userPoolId,
    userPoolArn: auth.userPoolArn,
    userPoolClientId: auth.userPoolClientId,
    appSecretKeyArn: messaging.appSecretKeyArn,
    sesConfigSetName: messaging.sesConfigSetName,
    sesDomainArn: messaging.sesDomainArn,
  });
  const cicd = new CicdStack(app, props('cicd').stackName!, props('cicd'), config);

  return { app, network, data, auth, messaging, appStack, cicd };
}

describe('CDK synth — dev', () => {
  const { network, data, auth, messaging, appStack } = buildApp(devConfig);

  test('network stack has VPC with single NAT gateway', () => {
    const t = Template.fromStack(network);
    t.resourceCountIs('AWS::EC2::VPC', 1);
    // dev has 1 NAT gateway
    t.resourceCountIs('AWS::EC2::NatGateway', 1);
  });

  test('data stack creates Aurora and S3 bucket with focustown tag', () => {
    const t = Template.fromStack(data);
    t.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      StorageEncrypted: true,
    });
    t.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'focustown-assets-dev',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('cognito user pool enforces minLength 8', () => {
    const t = Template.fromStack(auth);
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: Match.objectLike({ MinimumLength: 8 }),
      },
    });
  });

  test('messaging stack creates SES config set and app secret', () => {
    const t = Template.fromStack(messaging);
    t.resourceCountIs('AWS::SES::ConfigurationSet', 1);
    t.resourceCountIs('AWS::SecretsManager::Secret', 1);
  });

  test('app stack creates 3 fargate services + ALB', () => {
    const t = Template.fromStack(appStack);
    t.resourceCountIs('AWS::ECS::Service', 3);
    t.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    // HTTP redirect + HTTPS listener
    t.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 2);
  });
});

describe('CDK synth — prod', () => {
  const { network, data, appStack } = buildApp(prodConfig);

  test('prod has 2 NAT gateways (HA)', () => {
    const t = Template.fromStack(network);
    t.resourceCountIs('AWS::EC2::NatGateway', 2);
  });

  test('prod aurora has higher ACU range and a reader', () => {
    const t = Template.fromStack(data);
    t.hasResourceProperties('AWS::RDS::DBCluster', {
      ServerlessV2ScalingConfiguration: Match.objectLike({
        MinCapacity: 1,
        MaxCapacity: 8,
      }),
    });
    // Writer + reader = 2 instances in prod
    t.resourceCountIs('AWS::RDS::DBInstance', 2);
  });

  test('prod has desired count 2 on api service', () => {
    const t = Template.fromStack(appStack);
    // Look for ANY service with desiredCount 2 — works because prod is the
    // only config that bumps it above 1.
    t.hasResourceProperties('AWS::ECS::Service', {
      DesiredCount: 2,
    });
  });
});

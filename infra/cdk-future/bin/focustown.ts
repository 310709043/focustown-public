#!/usr/bin/env node
/**
 * CDK app entry point for Focus Town.
 *
 * Reads ``-c env=dev|prod`` from CDK context, loads the matching config,
 * applies root tags (``product=focustown`` plus ``env=<envName>``), and
 * instantiates the six stacks in dependency order. Cross-stack refs are
 * passed as L2 construct references — CDK auto-emits CFN Exports/Imports
 * so adding a new stack never breaks an existing one.
 *
 * Future Organizations migration is a one-line change here: swap the
 * account resolution from CDK_DEFAULT_ACCOUNT to a per-env account map.
 */
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { devConfig } from '../lib/config/dev';
import { prodConfig } from '../lib/config/prod';
import { EnvConfig } from '../lib/config/types';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { MessagingStack } from '../lib/messaging-stack';
import { AppStack } from '../lib/app-stack';
import { CicdStack } from '../lib/cicd-stack';

const app = new cdk.App();

const envContext = app.node.tryGetContext('env');
if (envContext !== 'dev' && envContext !== 'prod') {
  throw new Error(
    `Usage: cdk <command> -c env=dev|prod (got "${envContext ?? '<missing>'}")`
  );
}

const config: EnvConfig = envContext === 'prod' ? prodConfig : devConfig;
const env: cdk.Environment = {
  account: config.account ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};

// Root tags propagate to every L2 construct underneath. ElastiCache (L1) is
// covered separately inside DataStack because CfnReplicationGroup does NOT
// honour CDK's aspect-based tag inheritance.
cdk.Tags.of(app).add('product', 'focustown');
cdk.Tags.of(app).add('env', config.envName);

const stackName = (suffix: string) => `focustown-${config.envName}-${suffix}`;
const stackProps = (suffix: string): cdk.StackProps => ({
  env,
  stackName: stackName(suffix),
  description: `Focus Town ${suffix} stack — ${config.envName} environment`,
});

const network = new NetworkStack(app, stackName('network'), stackProps('network'), config);

const data = new DataStack(
  app,
  stackName('data'),
  stackProps('data'),
  config,
  { vpc: network.vpc, apiSg: network.apiSg, workerSg: network.workerSg }
);

const auth = new AuthStack(app, stackName('auth'), stackProps('auth'), config);

const messaging = new MessagingStack(
  app,
  stackName('messaging'),
  stackProps('messaging'),
  config
);

new AppStack(
  app,
  stackName('app'),
  stackProps('app'),
  config,
  {
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
  }
);

new CicdStack(app, stackName('cicd'), stackProps('cicd'), config);

app.synth();

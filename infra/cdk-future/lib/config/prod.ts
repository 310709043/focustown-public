import { EnvConfig } from './types';

/**
 * Prod environment config — Multi-AZ Aurora, HA NAT, Redis replica,
 * Container Insights on, RETAIN policies on every stateful resource. CIDR
 * is non-overlapping with dev so future VPC peering between envs stays
 * trivially expressible.
 */
export const prodConfig: EnvConfig = {
  envName: 'prod',
  region: 'ap-northeast-1',
  account: process.env.CDK_DEFAULT_ACCOUNT,

  vpcCidr: '10.30.0.0/16',
  natGatewayCount: 2,
  flowLogRetentionDays: 90,

  auroraMinAcu: 1,
  auroraMaxAcu: 8,
  auroraReader: true,
  dbBackupRetentionDays: 14,
  redisNodeType: 'cache.t4g.small',
  redisReplicas: 1,

  apiTask: { cpu: 1024, memoryMiB: 2048 },
  workerTask: { cpu: 512, memoryMiB: 1024 },
  frontendTask: { cpu: 512, memoryMiB: 1024 },
  apiDesiredCount: 2,
  workerDesiredCount: 2,
  frontendDesiredCount: 2,
  containerInsights: true,

  logRetentionDays: 90,
  corsOrigins: ['https://focustown.example'],
  sesDomain: 'focustown.example',
  sesSandboxEmail: '',
  acmCertArn: 'arn:aws:acm:ap-northeast-1:000000000000:certificate/REPLACE-PROD-CERT',

  removalPolicyDestroy: false,
  enableDeletionProtection: true,
};

import { EnvConfig } from './types';

/**
 * Dev environment config — sized for ~10 internal testers, optimised for
 * cost (single NAT, no Aurora reader, no Redis replica, log retention low).
 * Stateful resources get RemovalPolicy.DESTROY + autoDeleteObjects so the
 * stack tears down cleanly without manual cleanup.
 */
export const devConfig: EnvConfig = {
  envName: 'dev',
  region: 'ap-northeast-1',
  account: process.env.CDK_DEFAULT_ACCOUNT,

  vpcCidr: '10.20.0.0/16',
  natGatewayCount: 1,
  flowLogRetentionDays: 14,

  auroraMinAcu: 0.5,
  auroraMaxAcu: 2,
  auroraReader: false,
  dbBackupRetentionDays: 1,
  redisNodeType: 'cache.t4g.small',
  redisReplicas: 0,

  apiTask: { cpu: 256, memoryMiB: 512 },
  workerTask: { cpu: 256, memoryMiB: 512 },
  frontendTask: { cpu: 256, memoryMiB: 512 },
  apiDesiredCount: 1,
  workerDesiredCount: 1,
  frontendDesiredCount: 1,
  containerInsights: false,

  logRetentionDays: 30,
  corsOrigins: ['https://dev.focustown.example'],
  sesDomain: 'dev.focustown.example',
  sesSandboxEmail: 'team+dev@focustown.example',
  // Placeholder — operator must update before first deploy. The synth
  // step will still pass because nothing dereferences the cert at synth
  // time beyond constructing a Certificate.fromCertificateArn(...).
  acmCertArn: 'arn:aws:acm:ap-northeast-1:000000000000:certificate/REPLACE-DEV-CERT',

  removalPolicyDestroy: true,
  enableDeletionProtection: false,
};

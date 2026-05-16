/**
 * EnvConfig — every per-env knob that varies between dev and prod.
 *
 * Keeping this explicit (rather than scattered constants) makes adding a
 * third environment (staging, qa) a single new file under config/. Account
 * and region are typed as nullable so callers can override via env vars or
 * future Organizations migration without editing every file.
 */
export interface FargateSize {
  readonly cpu: number; // 256 | 512 | 1024 | 2048 | 4096
  readonly memoryMiB: number;
}

export interface EnvConfig {
  readonly envName: 'dev' | 'prod';
  readonly region: string;
  /** Resolved at synth-time from CDK_DEFAULT_ACCOUNT; can be overridden via context. */
  readonly account: string | undefined;

  // Network
  readonly vpcCidr: string;
  readonly natGatewayCount: number;
  readonly flowLogRetentionDays: number;

  // Data
  readonly auroraMinAcu: number;
  readonly auroraMaxAcu: number;
  readonly auroraReader: boolean;
  readonly dbBackupRetentionDays: number;
  readonly redisNodeType: string;
  readonly redisReplicas: number;

  // App / compute
  readonly apiTask: FargateSize;
  readonly workerTask: FargateSize;
  readonly frontendTask: FargateSize;
  readonly apiDesiredCount: number;
  readonly workerDesiredCount: number;
  readonly frontendDesiredCount: number;
  readonly containerInsights: boolean;

  // Edges / ops
  readonly logRetentionDays: number;
  readonly corsOrigins: string[];
  readonly sesDomain: string;
  /** When SES is still sandboxed (dev), the verified personal address. */
  readonly sesSandboxEmail: string;
  /** Region-local ACM cert ARN for the ALB HTTPS listener. */
  readonly acmCertArn: string;

  // Lifecycle
  /** dev → DESTROY + autoDelete; prod → RETAIN + final snapshot. */
  readonly removalPolicyDestroy: boolean;
  /** Whether ECS service deletion-protection is on (prod only). */
  readonly enableDeletionProtection: boolean;
}

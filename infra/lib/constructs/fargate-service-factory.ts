import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { FargateSize } from '../config/types';

/**
 * Wiring shared by every Focus Town Fargate service (api, worker, frontend):
 * task role, execution role, log group, container, optional ALB attachment.
 * Keeps AppStack readable — each service-specific call is ~10 lines.
 */
export interface FargateServiceSpec {
  readonly id: string;
  readonly containerName: string;
  readonly cluster: ecs.ICluster;
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly size: FargateSize;
  readonly desiredCount: number;
  readonly image: ecs.ContainerImage;
  readonly containerPort?: number;
  readonly environment: { [k: string]: string };
  readonly secrets?: { [k: string]: ecs.Secret };
  readonly command?: string[];
  readonly logRetention: logs.RetentionDays;
  readonly removalPolicy: cdk.RemovalPolicy;
  readonly healthCheckCommand?: string[];
  readonly taskRolePolicies?: iam.PolicyStatement[];
}

export interface FargateServiceArtifacts {
  readonly taskDef: ecs.FargateTaskDefinition;
  readonly taskRole: iam.Role;
  readonly executionRole: iam.Role;
  readonly service: ecs.FargateService;
  readonly logGroup: logs.LogGroup;
}

export function createFargateService(
  scope: Construct,
  spec: FargateServiceSpec
): FargateServiceArtifacts {
  const logGroup = new logs.LogGroup(scope, `${spec.id}LogGroup`, {
    logGroupName: `/aws/ecs/focustown/${spec.id.toLowerCase()}`,
    retention: spec.logRetention,
    removalPolicy: spec.removalPolicy,
  });

  const taskRole = new iam.Role(scope, `${spec.id}TaskRole`, {
    assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    description: `Focus Town ${spec.id} task role — least privilege`,
  });
  for (const stmt of spec.taskRolePolicies ?? []) {
    taskRole.addToPolicy(stmt);
  }

  const executionRole = new iam.Role(scope, `${spec.id}ExecRole`, {
    assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    description: `Focus Town ${spec.id} execution role`,
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AmazonECSTaskExecutionRolePolicy'
      ),
    ],
  });

  const taskDef = new ecs.FargateTaskDefinition(scope, `${spec.id}TaskDef`, {
    cpu: spec.size.cpu,
    memoryLimitMiB: spec.size.memoryMiB,
    taskRole,
    executionRole,
  });

  const container = taskDef.addContainer(spec.containerName, {
    image: spec.image,
    environment: spec.environment,
    secrets: spec.secrets,
    command: spec.command,
    logging: ecs.LogDrivers.awsLogs({ streamPrefix: spec.id, logGroup }),
    healthCheck: spec.healthCheckCommand
      ? {
          command: spec.healthCheckCommand,
          interval: cdk.Duration.seconds(15),
          startPeriod: cdk.Duration.seconds(60),
          retries: 3,
          timeout: cdk.Duration.seconds(5),
        }
      : undefined,
  });
  if (spec.containerPort) {
    container.addPortMappings({ containerPort: spec.containerPort });
  }

  const service = new ecs.FargateService(scope, `${spec.id}Service`, {
    cluster: spec.cluster,
    taskDefinition: taskDef,
    desiredCount: spec.desiredCount,
    assignPublicIp: false,
    securityGroups: [spec.securityGroup],
    circuitBreaker: { rollback: true },
    healthCheckGracePeriod: spec.containerPort
      ? cdk.Duration.seconds(60)
      : undefined,
    // Keep 100% capacity during rolling deploys so a single-task service
    // doesn't drop to zero. Allow up to 200% so the deploy can stand up
    // a fresh task alongside the old one before draining.
    minHealthyPercent: 100,
    maxHealthyPercent: 200,
    enableExecuteCommand: false,
  });

  return { taskDef, taskRole, executionRole, service, logGroup };
}

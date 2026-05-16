import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { EnvConfig } from './config/types';

/**
 * NetworkStack — VPC, subnets, NAT, security-group placeholders.
 *
 * Security groups are created empty here (no ingress rules) and referenced
 * by downstream stacks, which attach narrow ingress rules at the owning
 * stack level. Doing it this way avoids the classic CDK security-group
 * circular-import trap (Aurora SG referencing API SG referencing Aurora SG
 * inside one stack).
 */
export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly albSg: ec2.SecurityGroup;
  readonly apiSg: ec2.SecurityGroup;
  readonly workerSg: ec2.SecurityGroup;
  readonly frontendSg: ec2.SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
    config: EnvConfig
  ) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
      maxAzs: 2,
      natGateways: config.natGatewayCount,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private-with-egress',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 22,
        },
      ],
    });

    // Flow logs to CloudWatch — retention scoped per env per config.
    new ec2.FlowLog(this, 'VpcFlowLogs', {
      resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(
        new logs.LogGroup(this, 'VpcFlowLogGroup', {
          retention: this._daysToRetention(config.flowLogRetentionDays),
          removalPolicy: config.removalPolicyDestroy
            ? cdk.RemovalPolicy.DESTROY
            : cdk.RemovalPolicy.RETAIN,
        })
      ),
    });

    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      description: 'ALB ingress — 80/443 from the internet',
      allowAllOutbound: true,
    });
    this.albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'http (redirected to 443)'
    );
    this.albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'https (frontend + api)'
    );

    this.apiSg = new ec2.SecurityGroup(this, 'ApiSg', {
      vpc: this.vpc,
      description: 'Backend API Fargate tasks',
      allowAllOutbound: true,
    });
    this.apiSg.addIngressRule(
      this.albSg,
      ec2.Port.tcp(8000),
      'ALB → backend container'
    );

    this.workerSg = new ec2.SecurityGroup(this, 'WorkerSg', {
      vpc: this.vpc,
      description: 'Worker Fargate tasks — no inbound',
      allowAllOutbound: true,
    });

    this.frontendSg = new ec2.SecurityGroup(this, 'FrontendSg', {
      vpc: this.vpc,
      description: 'Next.js Fargate tasks',
      allowAllOutbound: true,
    });
    this.frontendSg.addIngressRule(
      this.albSg,
      ec2.Port.tcp(3000),
      'ALB → Next.js container'
    );
  }

  /** Map a day count to the nearest valid CloudWatch retention enum. */
  private _daysToRetention(days: number): logs.RetentionDays {
    const map: Record<number, logs.RetentionDays> = {
      1: logs.RetentionDays.ONE_DAY,
      3: logs.RetentionDays.THREE_DAYS,
      5: logs.RetentionDays.FIVE_DAYS,
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

import * as cdk from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import { EnvConfig } from './config/types';

/**
 * MessagingStack — SES domain + ConfigSet + app-level Secrets Manager keys.
 *
 * SES identity uses the domain in prod (DKIM verifiable) and the personal
 * sandbox email in dev (anything @ ses-sandbox-email.example will fail
 * delivery, but signup / reset flows still execute the call). ConfigSet
 * enables bounce + complaint metrics from day one so we don't lose
 * reputation visibility post-launch.
 *
 * The app secret key (used for HS256 JWT signing in local_jwt mode) is
 * generated here; ECS task definitions reference its ARN to inject the
 * value into ``APP_SECRET_KEY`` env at task start.
 */
export class MessagingStack extends cdk.Stack {
  readonly sesConfigSetName: string;
  readonly sesDomainArn: string;
  readonly appSecretKey: secretsmanager.Secret;
  readonly appSecretKeyArn: string;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
    config: EnvConfig
  ) {
    super(scope, id, props);

    const configSet = new ses.ConfigurationSet(this, 'SesConfigSet', {
      configurationSetName: `focustown-${config.envName}`,
      sendingEnabled: true,
      reputationMetrics: true,
      suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
    });
    this.sesConfigSetName = configSet.configurationSetName;

    // In prod we register the apex domain identity so SES can verify DKIM
    // / SPF / DMARC. In dev we keep the sandbox email — the call still
    // works against any address verified in the dev account.
    const identity =
      config.envName === 'prod'
        ? ses.Identity.domain(config.sesDomain)
        : ses.Identity.email(config.sesSandboxEmail || 'team@example.com');

    const sesIdentity = new ses.EmailIdentity(this, 'SesIdentity', {
      identity,
      configurationSet: configSet,
    });
    this.sesDomainArn = sesIdentity.emailIdentityArn;

    this.appSecretKey = new secretsmanager.Secret(this, 'AppSecretKey', {
      secretName: `/focustown/${config.envName}/app_secret_key`,
      description: 'HS256 signing key for local_jwt mode (≥32 chars required)',
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
        excludeCharacters: '"@/\\',
      },
      removalPolicy: config.removalPolicyDestroy
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });
    this.appSecretKeyArn = this.appSecretKey.secretArn;
  }
}

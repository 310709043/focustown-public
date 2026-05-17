import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { EnvConfig } from './config/types';

/**
 * AuthStack — Cognito User Pool + App Client.
 *
 * Password policy is min-length 8 only, matching the backend's
 * ``validate_password_strength`` (no symbol / mixed-case requirement so we
 * don't surprise the user with two divergent rules). Token revocation is
 * on and refresh tokens last 30 days, matching the backend's session
 * expectations. SSM parameters expose pool / client ids to the running
 * service via a read-scoped IAM policy in AppStack.
 */
export class AuthStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly userPoolId: string;
  readonly userPoolArn: string;
  readonly userPoolClientId: string;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
    config: EnvConfig
  ) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `focustown-${config.envName}`,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: false,
        requireSymbols: false,
        requireUppercase: false,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: config.removalPolicyDestroy
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient('AppClient', {
      userPoolClientName: `focustown-${config.envName}-app`,
      authFlows: {
        adminUserPassword: true,
        userPassword: false,
        userSrp: true,
      },
      generateSecret: false,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    this.userPoolId = this.userPool.userPoolId;
    this.userPoolArn = this.userPool.userPoolArn;
    this.userPoolClientId = this.userPoolClient.userPoolClientId;

    new ssm.StringParameter(this, 'PoolIdParam', {
      parameterName: `/focustown/${config.envName}/cognito/user_pool_id`,
      stringValue: this.userPoolId,
    });
    new ssm.StringParameter(this, 'ClientIdParam', {
      parameterName: `/focustown/${config.envName}/cognito/client_id`,
      stringValue: this.userPoolClientId,
    });
  }
}

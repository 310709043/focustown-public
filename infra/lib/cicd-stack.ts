import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { EnvConfig } from './config/types';

/**
 * CicdStack — GitHub OIDC provider + per-branch deploy / push roles.
 *
 * The OIDC provider is an AWS-account-singleton. When CDK is first run on
 * an account that already has the GitHub provider, the synth will fail
 * with "EntityAlreadyExistsException" — operator should then comment out
 * the ``new iam.OpenIdConnectProvider`` and replace with
 * ``OpenIdConnectProvider.fromOpenIdConnectProviderArn(...)``. We don't
 * conditionally look it up at synth-time because that needs an
 * AWS-account-resolution path which complicates the dev / prod symmetry.
 */
export class CicdStack extends cdk.Stack {
  readonly githubOidcProvider: iam.OpenIdConnectProvider;
  readonly deployRole: iam.Role;
  readonly ecrPushRole: iam.Role;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
    config: EnvConfig
  ) {
    super(scope, id, props);

    this.githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GithubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      // GitHub publishes their root CA fingerprint at the URL above; this
      // value is documented and stable. Pinning means an MITM cert swap
      // breaks OIDC rather than silently succeeding.
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    const branch = config.envName === 'prod' ? 'main' : 'dev';
    const repoSub = `repo:jieyao-MilestoneHub/focustwon:ref:refs/heads/${branch}`;

    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: `focustown-${config.envName}-deploy`,
      assumedBy: new iam.WebIdentityPrincipal(
        this.githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': repoSub,
          },
        }
      ),
      description: `CDK + ECS deploy role for ${config.envName}; assumed by GitHub Actions via OIDC.`,
      // Initial scope is broad so CDK / cloudformation can touch any
      // service the stacks declare; tighten post-MVP by replacing this with
      // a custom inline policy enumerating only the API actions used by
      // CDK on this app. Tracking TODO in the plan_docs.
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
      maxSessionDuration: cdk.Duration.hours(1),
    });

    this.ecrPushRole = new iam.Role(this, 'EcrPushRole', {
      roleName: `focustown-${config.envName}-ecr-push`,
      assumedBy: new iam.WebIdentityPrincipal(
        this.githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            // Narrower than deployRole — allow any branch / tag to push
            // images, but only deploy from main/dev.
            'token.actions.githubusercontent.com:sub':
              'repo:jieyao-MilestoneHub/focustwon:*',
          },
        }
      ),
      description: `Push backend + frontend images to ECR for ${config.envName}.`,
      maxSessionDuration: cdk.Duration.hours(1),
    });
    this.ecrPushRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrAuth',
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'], // AWS requires '*' for GetAuthorizationToken
      })
    );
    this.ecrPushRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrPush',
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
          'ecr:BatchGetImage',
        ],
        resources: [
          `arn:aws:ecr:${this.region}:${this.account}:repository/focustown-backend`,
          `arn:aws:ecr:${this.region}:${this.account}:repository/focustown-frontend`,
        ],
      })
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description: 'Use in .github/workflows/deploy.yml role-to-assume',
    });
    new cdk.CfnOutput(this, 'EcrPushRoleArn', {
      value: this.ecrPushRole.roleArn,
      description: 'Use in .github/workflows/*.yml for ECR pushes',
    });
  }
}

# infra/ — AWS Deployment Plan (v2)

This directory is reserved for AWS CDK (TypeScript) stacks. **Not implemented in MVP.** The placeholder exists so the layout is ready when we cut over from `docker-compose` to AWS.

## Planned stacks

| Stack | Resources | Notes |
|---|---|---|
| `network` | VPC, public/private subnets in 2 AZs, NAT gw, route tables | Once per environment |
| `data` | Aurora Serverless v2 (Postgres), ElastiCache Redis (cluster mode disabled for MVP), S3 (`focustown-assets-${env}`) | Multi-AZ from staging onward |
| `app` | ECR repo, ECS Fargate cluster, 2 services (api + worker), ALB with WebSocket listener, target group sticky sessions | API and worker share the image tag |
| `edge` | CloudFront distribution → S3 (static) + ALB (api), Cognito User Pool + Hosted UI | Hosted UI domain registered via Route53 |
| `observability` | CloudWatch log groups, OpenTelemetry collector sidecar, X-Ray sampling rule | Wire via OTEL_EXPORTER_OTLP_ENDPOINT |

## Swap points the backend already exposes

When `infra/` is implemented, these ports get swapped without touching domain or API code:

- `AuthProvider`: `LocalJWTProvider` → `CognitoProvider`
- `IFileStorage`: `LocalFSStorage` → `S3Storage` (presigned URLs)
- `INotificationService`: `LogNotifier` → `SESNotifier` / `SNSNotifier`
- `ISecretsProvider`: `EnvSecretsProvider` → `AWSSecretsManagerProvider`
- `IJobScheduler`: `APSchedulerAdapter` → `EventBridgeAdapter`

All concrete classes live under `backend/app/infrastructure/<port>/`; the abstract Protocol stays in `backend/app/domain/repositories/` or `backend/app/infrastructure/<port>/base.py`.

## Realtime on AWS

- ECS Fargate + ALB: ALB supports WebSocket — sticky sessions on by default
- ElastiCache Redis (cluster-mode-disabled, single shard) for the existing pub/sub channels — **no code change** because `RedisPubSubPublisher` already targets `REDIS_URL`
- Future v3: API Gateway WebSocket + Lambda fan-out, only if WebSocket scaling exceeds 50k concurrent connections per region

## CI/CD pipeline (planned)

1. GitHub Actions → ECR push (backend + frontend images)
2. CDK `deploy` triggered from `main` branch via OIDC role assumption (no long-lived AWS keys)
3. Blue/green via ECS deployment circuit breaker; rollback on failed healthcheck

## Cost budget assumptions (single-region, dev tier)

| Service | Monthly est. |
|---|---|
| Aurora Serverless v2 (0.5–2 ACU) | ~$45 |
| ElastiCache cache.t4g.small | ~$15 |
| ECS Fargate (2 tasks × 0.25 vCPU, on-demand) | ~$22 |
| ALB + data transfer | ~$22 |
| CloudFront + S3 | ~$5 |
| Cognito (first 50k MAU free) | $0 |
| **Total** | **~$110/mo** |

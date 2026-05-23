# Collaboration Server Deployment Guide

This document provides a quick-reference guide for deploying the Hocuspocus collaboration server on AWS ECS/Fargate. For the full architecture diagrams, detailed configuration, and scaling notes, see the [design document](../.kiro/specs/collaborative-editing/design.md#aws-deployment-guide).

## Prerequisites

- AWS account with ECS, ECR, ALB, and Secrets Manager access
- Docker installed locally
- Supabase PostgreSQL connection string (use the connection pooler on port 6543)
- Supabase JWT secret (found in Supabase dashboard → Settings → API → JWT Secret)
- A domain for the collaboration server (e.g., `collab.notes9.com`)
- ACM certificate for TLS termination

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Supabase pooler recommended) |
| `JWT_SECRET` | Yes | Supabase JWT secret for token validation |
| `PORT` | No | HTTP/WebSocket port (default: `8080`) |
| `ALLOWED_ORIGINS` | Yes | Comma-separated allowed CORS origins |

## Quick Start (Local)

```bash
cd collaboration-server
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS in .env
pnpm install
pnpm build
pnpm start
```

The server starts on port 8080 with a health check at `GET /health`.

## Deployment Steps

### 1. Build and Push Docker Image

```bash
docker build -t collaboration-server .

aws ecr create-repository --repository-name collaboration-server
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

docker tag collaboration-server:latest \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/collaboration-server:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/collaboration-server:latest
```

### 2. Store Secrets in AWS Secrets Manager

```bash
aws secretsmanager create-secret --name collab-server/database-url \
  --secret-string "postgresql://user:pass@host:6543/db"

aws secretsmanager create-secret --name collab-server/jwt-secret \
  --secret-string "your-supabase-jwt-secret"
```

### 3. Create ECS Task Definition

- **CPU:** 512 (0.5 vCPU)
- **Memory:** 1024 MB
- **Container port:** 8080
- **Health check:** `curl -f http://localhost:8080/health || exit 1`
- **Secrets:** Reference `collab-server/database-url` and `collab-server/jwt-secret` from Secrets Manager

See the [full task definition JSON](../.kiro/specs/collaborative-editing/design.md#step-2-create-ecs-task-definition) in the design document.

### 4. Configure Application Load Balancer

Key settings for WebSocket support:

- **Idle timeout:** 3600 seconds (critical — default 60s kills WebSocket connections)
- **Stickiness:** Enabled (required for multi-instance deployments)
- **Target group health check:** `GET /health` on port 8080
- **Deregistration delay:** 300 seconds (allow connections to drain)
- **TLS termination:** Attach ACM certificate for `wss://` support on port 443

### 5. Create ECS Service

```bash
aws ecs create-service \
  --cluster collaboration \
  --service-name collaboration-server \
  --task-definition collaboration-server \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=collaboration-server,containerPort=8080"
```

### 6. DNS Configuration

Create a CNAME or A-record (alias) pointing your collaboration domain to the ALB DNS name.

### 7. Configure the Next.js Client

Add to your Next.js deployment environment (e.g., Vercel, Amplify, or `.env.local`):

```
NEXT_PUBLIC_COLLABORATION_URL=wss://collab.notes9.com
```

When this variable is set, the paper editor enables real-time collaboration. When unset, the app uses single-user editing with client-side auto-save.

## Security Groups

| Security Group | Inbound | Outbound |
|----------------|---------|----------|
| ALB SG | TCP 443 from 0.0.0.0/0 | TCP 8080 to ECS SG |
| ECS SG | TCP 8080 from ALB SG | TCP 5432 to Supabase, TCP 443 (health checks) |

## Auto-Scaling (Optional)

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/collaboration/collaboration-server \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 --max-capacity 4

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/collaboration/collaboration-server \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration \
    "TargetValue=70,PredefinedMetricSpecification={PredefinedMetricType=ECSServiceAverageCPUUtilization}"
```

## Important Notes

- **WebSocket idle timeout** must be at least 3600s on the ALB. The default 60s will terminate connections.
- **Sticky sessions** are required when running multiple Fargate tasks (Hocuspocus holds document state in memory).
- **Single instance** is recommended for initial deployment. Multi-instance requires Redis pub/sub for cross-instance sync (future enhancement).
- **Connection pooling:** Use Supabase's connection pooler (port 6543, transaction mode) for `DATABASE_URL`.

## Further Reading

- [Full design document](../.kiro/specs/collaborative-editing/design.md) — architecture, data models, error handling, testing strategy
- [Hocuspocus documentation](https://tiptap.dev/hocuspocus/introduction)
- [AWS ECS/Fargate documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)

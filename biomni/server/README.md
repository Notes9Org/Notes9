# Biomni Server (EC2 + S3)

This server exposes a lightweight HTTP gateway for Biomni.

## What this supports
- Host the Biomni gateway on EC2
- Keep Biomni data in S3 (`BIOMNI_DATA_PATH=s3://bucket/prefix`)
- Sync S3 data to local cache via AWS S3 API before task execution
- Gemini-only model routing (`GOOGLE_API_KEY`)
- Run tasks via async (`/agent/run`) or sync (`/agent/run/sync`) endpoints

## API contract

### POST `/agent/run`
```json
{
  "task": "Analyze these sequences for motif enrichment",
  "history": [],
  "session_id": "session-123",
  "user_id": "user-456"
}
```

### POST `/agent/run/sync`
Same payload as `/agent/run` but waits for completion.

### GET `/tasks/:taskId`
Poll async task status.

### GET `/health`
Health/readiness information.

## Quick start on EC2
1. Create env file from `.env.example`.
2. Ensure EC2 IAM role has S3 permissions for your data bucket/prefix.
3. Install Python env with `biomni` package and set `BIOMNI_PYTHON_PATH`.
4. Start server:

```bash
pnpm --dir biomni/server dev
```

Production build:

```bash
pnpm --dir biomni/server build
pnpm --dir biomni/server start
```

## S3 behavior
- If `BIOMNI_DATA_PATH` is local, it is used directly.
- If `BIOMNI_DATA_PATH` is `s3://...`, the server syncs objects to `BIOMNI_S3_LOCAL_CACHE_DIR`.
- Cache refresh interval is controlled with `BIOMNI_S3_CACHE_TTL_SECONDS`.
- Set `BIOMNI_S3_SYNC_ON_EVERY_TASK=true` to force refresh on every request.
- For `serverless.yml` IAM policies, also set `BIOMNI_DATA_BUCKET` and optional `BIOMNI_DATA_PREFIX`.

## Security defaults
- Protect endpoints with `BIOMNI_API_KEY`.
- Restrict browser origins with `BIOMNI_ALLOWED_ORIGINS` (avoid `*` in production).
- Limit request size with `BIOMNI_MAX_REQUEST_BYTES`.

## Optional custom Python runner
If your Biomni install uses a custom invocation function:

- `BIOMNI_RUNNER_MODULE` (example: `my_biomni_runner`)
- `BIOMNI_RUNNER_FUNC` (default: `run`)

The function should accept a JSON payload dict and return a string/object result.

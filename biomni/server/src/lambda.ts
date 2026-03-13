/**
 * Biomni Server — AWS Lambda Handler
 *
 * AWS Lambda compatible entry point for the Biomni agent.
 * Integrates with API Gateway via Lambda Function URL or REST API.
 *
 * For Lambda deployment:
 *   1. Package biomni as a Lambda Layer (Python 3.11+)
 *   2. Set BIOMNI_DATA_PATH to S3 bucket path (s3://bucket/path)
 *   3. Configure environment variables in Lambda console
 *
 * Deployment:
 *   - Runtime: Python 3.11 (for biomni layer)
 *   - Handler: dist/lambda.handler
 *   - Timeout: 900s (15 min) max
 *   - Memory: 10240MB (10GB) recommended for biomni
 */

import { randomUUID } from 'crypto';
import { serverConfig, validateConfig } from './config.js';
import { runBiomniTask } from './agent/factory.js';
import { createTask, updateTask, getTask } from './agent/task-store.js';
import { AgentQueryRequestSchema, isValidUUID } from './schemas/models.js';
import type { AgentQueryResponse } from './schemas/models.js';
import { isBearerAuthorized } from './http/auth.js';

validateConfig();

export interface LambdaEvent {
  httpMethod: string;
  path: string;
  queryStringParameters?: Record<string, string | null>;
  headers?: Record<string, string>;
  body?: string;
  requestContext?: {
    requestId: string;
    authorizer?: {
      principalId?: string;
    };
  };
}

export interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

function isAuthorized(headers: Record<string, string> | undefined): boolean {
  const auth = headers?.authorization ?? headers?.Authorization;
  return isBearerAuthorized(auth, serverConfig.biomniApiKey);
}

function getPathParts(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function getUserId(event: LambdaEvent): string | undefined {
  return event.requestContext?.authorizer?.principalId;
}

export async function handler(event: LambdaEvent): Promise<LambdaResponse> {
  const method = event.httpMethod;
  const pathParts = getPathParts(event.path);
  const headers = event.headers ?? {};
  const requestOrigin = headers.origin ?? headers.Origin;
  const allowOrigin = serverConfig.allowedOrigins.includes('*')
    ? '*'
    : requestOrigin && serverConfig.allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : undefined;

  const corsHeaders = {
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin } : {}),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    ...(allowOrigin && allowOrigin !== '*' ? { Vary: 'Origin' } : {}),
  };

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (!isAuthorized(headers)) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  try {
    const path = '/' + pathParts.join('/');

    if (path === '/health' && method === 'GET') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
      };
    }

    if (path === '/agent/run' && method === 'POST') {
      return await handleAgentRun(event, corsHeaders);
    }

    if (path === '/agent/run/sync' && method === 'POST') {
      return await handleAgentRunSync(event, corsHeaders);
    }

    if (path.startsWith('/tasks/') && method === 'GET') {
      const taskId = pathParts[1];
      return handleGetTask(taskId, corsHeaders);
    }

    if (path.startsWith('/agent/') && path.endsWith('/cancel') && method === 'DELETE') {
      const taskId = pathParts[1];
      return handleCancelTask(taskId, corsHeaders);
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (err) {
    console.error('[Lambda] Error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

async function handleAgentRun(
  event: LambdaEvent,
  corsHeaders: Record<string, string>
): Promise<LambdaResponse> {
  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const parsed = AgentQueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      statusCode: 422,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Validation error', details: parsed.error.flatten() }),
    };
  }

  const request = parsed.data;
  const taskId = randomUUID();
  const userId = getUserId(event) ?? request.user_id;
  const record = createTask(taskId, request.task);

  void (async () => {
    updateTask(taskId, { status: 'running' });
    try {
      const { result } = await runBiomniTask({
        task: request.task,
        history: request.history,
        sessionId: request.session_id,
        userId: userId,
        timeoutMs: (request.timeout ?? serverConfig.biomniTimeoutSeconds) * 1000,
        signal: record.abortController.signal,
      });
      updateTask(taskId, { status: 'completed', result });
    } catch (err) {
      updateTask(taskId, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  const response: AgentQueryResponse = {
    task_id: taskId,
    status: 'queued',
    created_at: record.created_at.toISOString(),
  };

  return {
    statusCode: 202,
    headers: corsHeaders,
    body: JSON.stringify(response),
  };
}

async function handleAgentRunSync(
  event: LambdaEvent,
  corsHeaders: Record<string, string>
): Promise<LambdaResponse> {
  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const parsed = AgentQueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      statusCode: 422,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Validation error', details: parsed.error.flatten() }),
    };
  }

  const request = parsed.data;
  const taskId = randomUUID();
  const userId = getUserId(event) ?? request.user_id;
  const record = createTask(taskId, request.task);
  updateTask(taskId, { status: 'running' });

  try {
    const { result, elapsed_ms } = await runBiomniTask({
      task: request.task,
      history: request.history,
      sessionId: request.session_id,
      userId: userId,
      timeoutMs: (request.timeout ?? serverConfig.biomniTimeoutSeconds) * 1000,
      signal: record.abortController.signal,
    });

    updateTask(taskId, { status: 'completed', result });

    const response: AgentQueryResponse = {
      task_id: taskId,
      status: 'completed',
      result,
      created_at: record.created_at.toISOString(),
      completed_at: new Date().toISOString(),
    };

    console.log(`[Agent] Task ${taskId} completed in ${elapsed_ms}ms`);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    updateTask(taskId, { status: 'failed', error });

    const response: AgentQueryResponse = {
      task_id: taskId,
      status: 'failed',
      error,
      created_at: record.created_at.toISOString(),
      completed_at: new Date().toISOString(),
    };

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  }
}

function handleGetTask(
  taskId: string,
  corsHeaders: Record<string, string>
): LambdaResponse {
  if (!isValidUUID(taskId)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid task ID format' }),
    };
  }

  const record = getTask(taskId);
  if (!record) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Task ${taskId} not found` }),
    };
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      task_id: taskId,
      status: record.status,
      result: record.result,
      error: record.error,
      created_at: record.created_at.toISOString(),
      completed_at: record.completed_at?.toISOString(),
    }),
  };
}

function handleCancelTask(
  taskId: string,
  corsHeaders: Record<string, string>
): LambdaResponse {
  if (!isValidUUID(taskId)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid task ID format' }),
    };
  }

  const record = getTask(taskId);
  if (!record) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Task ${taskId} not found` }),
    };
  }

  if (record.status === 'completed' || record.status === 'failed') {
    return {
      statusCode: 409,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Task ${taskId} is already ${record.status}` }),
    };
  }

  record.abortController.abort();
  updateTask(taskId, { status: 'failed', error: 'Cancelled by client' });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ task_id: taskId, status: 'cancelled' }),
  };
}

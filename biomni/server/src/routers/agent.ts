import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { AgentQueryRequestSchema } from '../schemas/models.js';
import { createTask, updateTask, getTask } from '../agent/task-store.js';
import { runBiomniTask } from '../agent/factory.js';
import { serverConfig } from '../config.js';
import { readBody, sendJson, sendError, RequestBodyTooLargeError } from '../http/utils.js';
import { getAuthHeaderValue, isBearerAuthorized } from '../http/auth.js';

function isAuthorized(req: IncomingMessage): boolean {
  return isBearerAuthorized(
    getAuthHeaderValue(req.headers.authorization),
    serverConfig.biomniApiKey
  );
}

export async function handleAgentRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthorized(req)) {
    sendError(res, 401, 'Unauthorized');
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req, serverConfig.maxRequestBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      sendError(res, 413, 'Request body too large');
      return;
    }
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const parsed = AgentQueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendError(res, 422, 'Validation error', parsed.error.flatten());
    return;
  }

  const request = parsed.data;
  const taskId = randomUUID();
  const record = createTask(taskId, request.task);

  void (async () => {
    updateTask(taskId, { status: 'running' });

    try {
      const { result } = await runBiomniTask({
        task: request.task,
        history: request.history,
        sessionId: request.session_id,
        userId: request.user_id,
        timeoutMs: (request.timeout ?? serverConfig.biomniTimeoutSeconds) * 1000,
        signal: record.abortController.signal,
      });
      updateTask(taskId, { status: 'completed', result });
    } catch (error) {
      updateTask(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  sendJson(res, 202, {
    task_id: taskId,
    status: 'queued',
    created_at: record.created_at.toISOString(),
  });
}

export async function handleAgentRunSync(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!isAuthorized(req)) {
    sendError(res, 401, 'Unauthorized');
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req, serverConfig.maxRequestBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      sendError(res, 413, 'Request body too large');
      return;
    }
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const parsed = AgentQueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendError(res, 422, 'Validation error', parsed.error.flatten());
    return;
  }

  const request = parsed.data;
  const taskId = randomUUID();
  const record = createTask(taskId, request.task);
  updateTask(taskId, { status: 'running' });

  try {
    const { result, elapsed_ms } = await runBiomniTask({
      task: request.task,
      history: request.history,
      sessionId: request.session_id,
      userId: request.user_id,
      timeoutMs: (request.timeout ?? serverConfig.biomniTimeoutSeconds) * 1000,
      signal: record.abortController.signal,
    });

    updateTask(taskId, { status: 'completed', result });
    console.log(`[Agent] Task ${taskId} completed in ${elapsed_ms}ms`);

    sendJson(res, 200, {
      task_id: taskId,
      status: 'completed',
      result,
      created_at: record.created_at.toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Agent] Task ${taskId} failed:`, message);
    updateTask(taskId, { status: 'failed', error: message });

    sendJson(res, 500, {
      task_id: taskId,
      status: 'failed',
      error: 'Biomni task failed',
      created_at: record.created_at.toISOString(),
      completed_at: new Date().toISOString(),
    });
  }
}

export function handleAgentCancel(
  req: IncomingMessage,
  res: ServerResponse,
  taskId: string
): void {
  if (!isAuthorized(req)) {
    sendError(res, 401, 'Unauthorized');
    return;
  }

  const record = getTask(taskId);
  if (!record) {
    sendError(res, 404, `Task ${taskId} not found`);
    return;
  }

  if (record.status === 'completed' || record.status === 'failed') {
    sendError(res, 409, `Task ${taskId} is already ${record.status}`);
    return;
  }

  record.abortController.abort();
  updateTask(taskId, { status: 'failed', error: 'Cancelled by client' });
  sendJson(res, 200, { task_id: taskId, status: 'cancelled' });
}

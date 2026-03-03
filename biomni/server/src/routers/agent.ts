/**
 * Biomni Agent Router
 *
 * Handles POST /agent/run  — async task submission (recommended)
 * Handles POST /agent/run/sync — synchronous execution (short tasks only)
 * Handles DELETE /agent/:taskId/cancel — cancel a running task
 *
 * This module exports plain handler functions that the HTTP server wires up.
 * No Express / Fastify dependency — uses Node.js IncomingMessage / ServerResponse
 * directly, keeping the dependency footprint minimal (mirrors collaboration server).
 */

import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { AgentQueryRequestSchema } from '../schemas/models.js';
import type { AgentQueryResponse } from '../schemas/models.js';
import { createTask, updateTask, getTask } from '../agent/task-store.js';
import { runBiomniTask } from '../agent/factory.js';
import { serverConfig } from '../config.js';
import { readBody, sendJson, sendError } from '../http/utils.js';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function isAuthorized(req: IncomingMessage): boolean {
  if (!serverConfig.biomniApiKey) return true; // No auth configured
  const auth = req.headers['authorization'] ?? '';
  return auth === `Bearer ${serverConfig.biomniApiKey}`;
}

// ---------------------------------------------------------------------------
// POST /agent/run  (async — returns task_id immediately)
// ---------------------------------------------------------------------------

export async function handleAgentRun(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!isAuthorized(req)) {
    sendError(res, 401, 'Unauthorized');
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
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

  // Fire-and-forget: run in background
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

  sendJson(res, 202, response);
}

// ---------------------------------------------------------------------------
// POST /agent/run/sync  (synchronous — waits for result)
// ---------------------------------------------------------------------------

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
    body = await readBody(req);
  } catch {
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

    const response: AgentQueryResponse = {
      task_id: taskId,
      status: 'completed',
      result,
      created_at: record.created_at.toISOString(),
      completed_at: new Date().toISOString(),
    };

    console.log(`[Agent] Task ${taskId} completed in ${elapsed_ms}ms`);
    sendJson(res, 200, response);
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

    sendJson(res, 500, response);
  }
}

// ---------------------------------------------------------------------------
// DELETE /agent/:taskId/cancel
// ---------------------------------------------------------------------------

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

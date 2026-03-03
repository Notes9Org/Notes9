/**
 * Biomni Tasks Router
 *
 * GET /tasks/:taskId — poll status of an async task
 * GET /tasks        — list all active tasks (admin only)
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getTask, getActiveTasks } from '../agent/task-store.js';
import type { AgentQueryResponse } from '../schemas/models.js';
import { serverConfig } from '../config.js';
import { sendJson, sendError } from '../http/utils.js';

function isAuthorized(req: IncomingMessage): boolean {
  if (!serverConfig.biomniApiKey) return true;
  const auth = req.headers['authorization'] ?? '';
  return auth === `Bearer ${serverConfig.biomniApiKey}`;
}

// ---------------------------------------------------------------------------
// GET /tasks/:taskId
// ---------------------------------------------------------------------------

export function handleGetTask(
  _req: IncomingMessage,
  res: ServerResponse,
  taskId: string
): void {
  const record = getTask(taskId);
  if (!record) {
    sendError(res, 404, `Task ${taskId} not found`);
    return;
  }

  const response: AgentQueryResponse = {
    task_id: record.task_id,
    status: record.status,
    result: record.result,
    pdf_path: record.pdf_path,
    error: record.error,
    created_at: record.created_at.toISOString(),
    completed_at: record.completed_at?.toISOString(),
  };

  sendJson(res, 200, response);
}

// ---------------------------------------------------------------------------
// GET /tasks  (admin — lists active tasks)
// ---------------------------------------------------------------------------

export function handleListTasks(
  req: IncomingMessage,
  res: ServerResponse
): void {
  if (!isAuthorized(req)) {
    sendError(res, 401, 'Unauthorized');
    return;
  }

  const tasks = getActiveTasks().map((r) => ({
    task_id: r.task_id,
    status: r.status,
    created_at: r.created_at.toISOString(),
  }));

  sendJson(res, 200, { tasks, count: tasks.length });
}

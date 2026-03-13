import type { IncomingMessage, ServerResponse } from 'http';
import { getTask, getActiveTasks } from '../agent/task-store.js';
import { serverConfig } from '../config.js';
import { sendJson, sendError } from '../http/utils.js';
import { getAuthHeaderValue, isBearerAuthorized } from '../http/auth.js';

function isAuthorized(req: IncomingMessage): boolean {
  return isBearerAuthorized(
    getAuthHeaderValue(req.headers.authorization),
    serverConfig.biomniApiKey
  );
}

export function handleGetTask(req: IncomingMessage, res: ServerResponse, taskId: string): void {
  if (!isAuthorized(req)) {
    sendError(res, 401, 'Unauthorized');
    return;
  }

  const record = getTask(taskId);
  if (!record) {
    sendError(res, 404, `Task ${taskId} not found`);
    return;
  }

  sendJson(res, 200, {
    task_id: record.task_id,
    status: record.status,
    result: record.result,
    pdf_path: record.pdf_path,
    error: record.error,
    created_at: record.created_at.toISOString(),
    completed_at: record.completed_at?.toISOString(),
  });
}

export function handleListTasks(req: IncomingMessage, res: ServerResponse): void {
  if (!isAuthorized(req)) {
    sendError(res, 401, 'Unauthorized');
    return;
  }

  const tasks = getActiveTasks().map((record) => ({
    task_id: record.task_id,
    status: record.status,
    created_at: record.created_at.toISOString(),
  }));

  sendJson(res, 200, { tasks, count: tasks.length });
}

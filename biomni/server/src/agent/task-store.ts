import type { TaskStatus } from '../schemas/models.js';

export interface TaskRecord {
  task_id: string;
  status: TaskStatus;
  task: string;
  created_at: Date;
  completed_at?: Date;
  result?: string;
  pdf_path?: string;
  error?: string;
  abortController: AbortController;
}

const store = new Map<string, TaskRecord>();
let totalProcessed = 0;

export function createTask(taskId: string, task: string): TaskRecord {
  const record: TaskRecord = {
    task_id: taskId,
    status: 'queued',
    task,
    created_at: new Date(),
    abortController: new AbortController(),
  };
  store.set(taskId, record);
  return record;
}

export function getTask(taskId: string): TaskRecord | undefined {
  return store.get(taskId);
}

export function updateTask(
  taskId: string,
  update: Partial<Pick<TaskRecord, 'status' | 'result' | 'pdf_path' | 'error' | 'completed_at'>>
): TaskRecord | undefined {
  const record = store.get(taskId);
  if (!record) return undefined;

  Object.assign(record, update);

  if (update.status === 'completed' || update.status === 'failed') {
    record.completed_at = record.completed_at ?? new Date();
    totalProcessed += 1;
  }

  return record;
}

export function cancelTask(taskId: string): boolean {
  const record = store.get(taskId);
  if (!record) return false;

  record.abortController.abort();
  updateTask(taskId, { status: 'failed', error: 'Cancelled by client' });
  return true;
}

export function deleteTask(taskId: string): boolean {
  return store.delete(taskId);
}

export function getActiveTasks(): TaskRecord[] {
  return Array.from(store.values()).filter(
    (record) => record.status === 'queued' || record.status === 'running'
  );
}

export function getStoreStats(): { active_tasks: number; total_tasks_processed: number } {
  return {
    active_tasks: getActiveTasks().length,
    total_tasks_processed: totalProcessed,
  };
}

export function evictStale(maxAgeMs = 1000 * 60 * 60 * 24): number {
  const cutoff = Date.now() - maxAgeMs;
  let evicted = 0;

  for (const [id, record] of store.entries()) {
    if (
      (record.status === 'completed' || record.status === 'failed') &&
      record.completed_at &&
      record.completed_at.getTime() < cutoff
    ) {
      store.delete(id);
      evicted += 1;
    }
  }

  return evicted;
}

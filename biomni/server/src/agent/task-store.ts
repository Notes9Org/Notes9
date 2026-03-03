/**
 * Biomni Task Store
 *
 * In-memory store for async task tracking.
 * In production, swap the underlying Map for a Redis or PostgreSQL backend.
 *
 * Mirrors the `task_store` dict from the architecture plan's task_queue.py,
 * implemented as a typed singleton in TypeScript.
 */

import type { TaskRecord } from '../schemas/models.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = new Map<string, TaskRecord>();
let totalProcessed = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a new task entry and return the initial record. */
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

/** Retrieve a task by ID. Returns undefined if not found. */
export function getTask(taskId: string): TaskRecord | undefined {
  return store.get(taskId);
}

/** Update status and optional fields for an existing task. */
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

/** Cancel a running task via its AbortController signal. */
export function cancelTask(taskId: string): boolean {
  const record = store.get(taskId);
  if (!record) return false;
  record.abortController.abort();
  updateTask(taskId, { status: 'failed', error: 'Cancelled by client' });
  return true;
}

/** Delete a task record from the store. */
export function deleteTask(taskId: string): boolean {
  return store.delete(taskId);
}

/** Returns all active (queued / running) tasks. */
export function getActiveTasks(): TaskRecord[] {
  return Array.from(store.values()).filter(
    (r) => r.status === 'queued' || r.status === 'running'
  );
}

/** Summary stats for health checks. */
export function getStoreStats(): { active_tasks: number; total_tasks_processed: number } {
  return {
    active_tasks: getActiveTasks().length,
    total_tasks_processed: totalProcessed,
  };
}

/**
 * Evict completed / failed tasks older than `maxAgeMs` milliseconds.
 * Call periodically to prevent unbounded memory growth.
 */
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

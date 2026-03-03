/**
 * Biomni Server — Request / Response Schemas (Zod)
 *
 * Mirrors the Pydantic models from the architecture plan,
 * adapted to TypeScript/Zod for the Node.js HTTP server.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Inbound request schemas
// ---------------------------------------------------------------------------

export const AgentQueryRequestSchema = z.object({
  /** The natural-language biomedical task to execute. */
  task: z.string().min(1, 'task must be non-empty'),
  /** Optional override of the reasoning LLM for this request. */
  llm_override: z.string().optional(),
  /** Whether to save conversation history as a PDF after completion. */
  save_pdf: z.boolean().default(false),
  /** Per-request timeout in seconds (overrides server default). */
  timeout: z.number().int().positive().optional(),
  /** Conversation history from prior turns (role + content pairs). */
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .default([]),
  /** Caller-supplied session identifier for context tracking. */
  session_id: z.string().optional(),
  /** Caller-supplied user identifier. */
  user_id: z.string().optional(),
});

export type AgentQueryRequest = z.infer<typeof AgentQueryRequestSchema>;

// ---------------------------------------------------------------------------
// Outbound response schemas
// ---------------------------------------------------------------------------

export const TaskStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const AgentQueryResponseSchema = z.object({
  task_id: z.string(),
  status: TaskStatusSchema,
  result: z.string().optional(),
  pdf_path: z.string().optional(),
  error: z.string().optional(),
  created_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
});

export type AgentQueryResponse = z.infer<typeof AgentQueryResponseSchema>;

// ---------------------------------------------------------------------------
// Internal task record (extends response with runtime bookkeeping)
// ---------------------------------------------------------------------------

export interface TaskRecord {
  task_id: string;
  status: TaskStatus;
  task: string;
  result?: string;
  pdf_path?: string;
  error?: string;
  created_at: Date;
  completed_at?: Date;
  /** AbortController signal so we can cancel a running task. */
  abortController: AbortController;
}

// ---------------------------------------------------------------------------
// Health check response
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  uptime: number;
  timestamp: string;
  active_tasks: number;
  total_tasks_processed: number;
  biomni_ready: boolean;
}

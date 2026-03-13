/**
 * Biomni Server — Request/Response schemas
 */
import { z } from 'zod';

export const AgentQueryRequestSchema = z.object({
  task: z.string().min(1, 'task must be non-empty').max(20_000, 'task is too long'),
  llm_override: z.string().max(200, 'llm_override is too long').optional(),
  save_pdf: z.boolean().default(false),
  timeout: z.number().int().positive().max(3600).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(10_000, 'history content is too long'),
      })
    )
    .max(100, 'history has too many messages')
    .default([]),
  session_id: z.string().max(200, 'session_id is too long').optional(),
  user_id: z.string().max(200, 'user_id is too long').optional(),
});

export const TaskStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);

export const AgentQueryResponseSchema = z.object({
  task_id: z.string(),
  status: TaskStatusSchema,
  result: z.string().optional(),
  pdf_path: z.string().optional(),
  error: z.string().optional(),
  created_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
});

export type AgentQueryRequest = z.infer<typeof AgentQueryRequestSchema>;
export type AgentQueryResponse = z.infer<typeof AgentQueryResponseSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export function isValidUUID(value: string): boolean {
  return z.string().uuid().safeParse(value).success;
}

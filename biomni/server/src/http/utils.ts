/**
 * HTTP utility helpers for the Biomni server.
 * Keeps routers free of boilerplate.
 */

import type { IncomingMessage, ServerResponse } from 'http';

/** Read and JSON-parse the request body. */
export async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || 'null'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** Send a JSON response. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

/** Send a structured error response. */
export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  detail?: unknown
): void {
  sendJson(res, status, { error: message, detail: detail ?? null });
}

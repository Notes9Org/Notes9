import type { IncomingMessage, ServerResponse } from 'http';

export class RequestBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = 'RequestBodyTooLargeError';
  }
}

export async function readBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    let data = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new RequestBodyTooLargeError(maxBytes));
        return;
      }
      data += chunk.toString();
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(data || 'null'));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  detail?: unknown
): void {
  sendJson(res, status, { error: message, detail: detail ?? null });
}

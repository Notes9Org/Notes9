/**
 * The write side of an SSE response, with the client-went-away cases handled in
 * one place.
 *
 * This exists as a module rather than inline in the route because those cases
 * are exactly what needs testing, and a `ReadableStream` start/cancel pair
 * inside a route handler cannot be driven from a test. The rules it enforces:
 *
 *  - Enqueueing onto a cancelled or errored controller throws. Every write is
 *    guarded, and the first failure latches the channel closed so the rest of a
 *    long handler becomes a no-op instead of throwing repeatedly.
 *  - `finish` is idempotent. The spec-author route calls it from the happy path
 *    AND from its outer catch, and a second `close()` on a closed controller
 *    throws — which used to escape `start()` as an unhandled rejection.
 *  - `close()` is what a stream's `cancel()` calls when the consumer
 *    disconnects, so nothing further is written to a controller that is gone.
 */

/** The slice of ReadableStreamDefaultController this needs, so tests can fake it. */
export interface SseSink {
  enqueue(chunk: Uint8Array): void
  close(): void
}

export interface SseChannel {
  /** Write one event. No-op once the channel is closed; never throws. */
  send(event: Record<string, unknown>): void
  /** Write a final `result` event and close. Idempotent; never throws. */
  finish(payload: Record<string, unknown>): void
  /** Latch closed without writing — for the stream's `cancel()`. */
  close(): void
  /** True once the consumer is gone or the final event has been written. */
  readonly closed: boolean
}

export function createSseChannel(
  sink: SseSink,
  encoder: TextEncoder = new TextEncoder()
): SseChannel {
  let closed = false

  const send = (event: Record<string, unknown>) => {
    if (closed) return
    try {
      sink.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    } catch {
      // The consumer is gone. Stop producing rather than throwing upward.
      closed = true
    }
  }

  return {
    send,
    finish(payload) {
      if (closed) return
      send({ type: "result", ...payload })
      closed = true
      try {
        sink.close()
      } catch {
        /* already closed or cancelled */
      }
    },
    close() {
      closed = true
    },
    get closed() {
      return closed
    },
  }
}

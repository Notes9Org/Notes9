import { describe, expect, it, vi } from "vitest"

import { createSseChannel, type SseSink } from "./sse-channel"

const decoder = new TextDecoder()

/** A controller stand-in that records frames and can be made to throw on demand. */
function fakeSink() {
  const frames: string[] = []
  const state = { enqueueThrows: false, closeThrows: false, closeCount: 0 }
  const sink: SseSink = {
    enqueue(chunk) {
      if (state.enqueueThrows) throw new TypeError("Controller is already closed")
      frames.push(decoder.decode(chunk))
    },
    close() {
      state.closeCount += 1
      if (state.closeThrows) throw new TypeError("Controller is already closed")
    },
  }
  return { sink, frames, state }
}

const events = (frames: string[]) =>
  frames.map((f) => JSON.parse(f.replace(/^data: /, "").trimEnd()))

describe("createSseChannel", () => {
  it("writes events as SSE frames", () => {
    const { sink, frames } = fakeSink()
    const channel = createSseChannel(sink)

    channel.send({ type: "phase", phase: "screen", status: "done" })

    expect(frames).toHaveLength(1)
    expect(frames[0].startsWith("data: ")).toBe(true)
    expect(frames[0].endsWith("\n\n")).toBe(true)
    expect(events(frames)[0]).toEqual({ type: "phase", phase: "screen", status: "done" })
  })

  it("writes a result event and closes on finish", () => {
    const { sink, frames, state } = fakeSink()
    const channel = createSseChannel(sink)

    channel.finish({ outcome: "ok" })

    expect(events(frames)).toEqual([{ type: "result", outcome: "ok" }])
    expect(state.closeCount).toBe(1)
    expect(channel.closed).toBe(true)
  })

  // The regression: the route calls finish() from the happy path AND from its
  // outer catch. The second call used to throw on close().
  it("is idempotent across repeated finish calls", () => {
    const { sink, frames, state } = fakeSink()
    const channel = createSseChannel(sink)

    channel.finish({ outcome: "ok" })
    expect(() => channel.finish({ outcome: "unavailable" })).not.toThrow()

    expect(events(frames)).toHaveLength(1)
    expect(state.closeCount).toBe(1)
  })

  it("swallows a throwing close instead of propagating it", () => {
    const { sink, state } = fakeSink()
    state.closeThrows = true
    const channel = createSseChannel(sink)

    expect(() => channel.finish({ outcome: "ok" })).not.toThrow()
    expect(channel.closed).toBe(true)
  })

  // The client aborted mid-stream: enqueue throws. Nothing may escape.
  it("does not throw when the consumer disappears mid-stream", () => {
    const { sink, frames, state } = fakeSink()
    const channel = createSseChannel(sink)

    channel.send({ type: "phase", phase: "screen", status: "done" })
    state.enqueueThrows = true

    expect(() => channel.send({ type: "phase", phase: "context", status: "done" })).not.toThrow()
    expect(channel.closed).toBe(true)
    expect(frames).toHaveLength(1)
  })

  it("latches closed after a failed write, so later writes are silent no-ops", () => {
    const { sink, frames, state } = fakeSink()
    const channel = createSseChannel(sink)

    state.enqueueThrows = true
    channel.send({ type: "phase", phase: "screen", status: "done" })
    state.enqueueThrows = false

    channel.send({ type: "phase", phase: "context", status: "done" })
    expect(() => channel.finish({ outcome: "ok" })).not.toThrow()

    expect(frames).toHaveLength(0)
    expect(state.closeCount).toBe(0)
  })

  // What cancel() calls. After it, the in-flight handler keeps running and its
  // remaining writes must be inert.
  it("stops producing after close(), without writing a result", () => {
    const { sink, frames, state } = fakeSink()
    const channel = createSseChannel(sink)

    channel.close()
    channel.send({ type: "phase", phase: "draft", status: "done" })
    channel.finish({ outcome: "ok" })

    expect(frames).toHaveLength(0)
    expect(state.closeCount).toBe(0)
    expect(channel.closed).toBe(true)
  })

  it("survives the full abort sequence a superseded request produces", () => {
    const { sink, state } = fakeSink()
    const channel = createSseChannel(sink)
    const run = () => {
      channel.send({ type: "phase", phase: "screen", status: "done" })
      channel.close() // cancel() fires here
      state.enqueueThrows = true
      state.closeThrows = true
      channel.send({ type: "phase", phase: "draft", status: "done" })
      channel.finish({ outcome: "ok" })
      channel.finish({ outcome: "unavailable" }) // outer catch
    }
    expect(run).not.toThrow()
  })
})

describe("createSseChannel wired to a real ReadableStream", () => {
  it("does not reject when the reader cancels mid-stream", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)

    let channel: ReturnType<typeof createSseChannel> | null = null
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        channel = createSseChannel(controller)
        channel.send({ type: "phase", phase: "screen", status: "done" })
      },
      cancel() {
        channel?.close()
      },
    })

    const reader = stream.getReader()
    await reader.read()
    await reader.cancel()

    // Everything the handler would still have done after the client left.
    expect(() => {
      channel?.send({ type: "phase", phase: "draft", status: "done" })
      channel?.finish({ outcome: "ok" })
      channel?.finish({ outcome: "unavailable" })
    }).not.toThrow()

    await new Promise((resolve) => setImmediate(resolve))
    expect(unhandled).not.toHaveBeenCalled()
    process.off("unhandledRejection", unhandled)
  })
})

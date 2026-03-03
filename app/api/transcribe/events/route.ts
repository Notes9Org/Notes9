import {
  addListener,
  removeListener,
  sessionExists,
} from "@/lib/transcribe-session";

export const maxDuration = 120;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("id");

  if (!sessionId || !sessionExists(sessionId)) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const listener = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          const parsed = JSON.parse(data);
          if (parsed.done) {
            controller.close();
            removeListener(sessionId, listener);
          }
        } catch {
          // ignore
        }
      };

      addListener(sessionId, listener);

      // Clean up if client disconnects
      req.signal.addEventListener("abort", () => {
        removeListener(sessionId, listener);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

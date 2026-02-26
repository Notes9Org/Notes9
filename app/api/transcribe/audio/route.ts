import { feedAudio, sessionExists } from "@/lib/transcribe-session";

export async function POST(req: Request) {
  const sessionId = req.headers.get("x-session-id");
  if (!sessionId || !sessionExists(sessionId)) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const buffer = await req.arrayBuffer();
  feedAudio(sessionId, new Uint8Array(buffer));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

import { closeSession, sessionExists } from "@/lib/transcribe-session";

export async function POST(req: Request) {
  const sessionId = req.headers.get("x-session-id");
  if (!sessionId || !sessionExists(sessionId)) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  closeSession(sessionId);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

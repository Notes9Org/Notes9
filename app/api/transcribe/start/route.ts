import { createSession } from "@/lib/transcribe-session";

export async function POST() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return new Response(
      JSON.stringify({ error: "AWS credentials not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const sessionId = createSession();

  return new Response(JSON.stringify({ sessionId }), {
    headers: { "Content-Type": "application/json" },
  });
}

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const NOTES9_API_BASE =
  process.env.CHAT_API_URL?.replace(/\/$/, "") ||
  "";

export async function POST(req: Request) {
  if (!NOTES9_API_BASE) {
    return NextResponse.json(
      { error: "Notes9 API URL not configured." },
      { status: 503 }
    );
  }

  // Auth gate: without this an unauthenticated caller can POST here and burn
  // AWS Transcribe quota billed to our account. The previous implementation
  // forwarded the client's Authorization header verbatim, trusting it as auth
  // — but the header itself is client-controlled, so any random string passed.
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token?.trim() ?? "";
  if (!accessToken) {
    return NextResponse.json({ error: "Session unavailable" }, { status: 401 });
  }

  const bodyText = await req.text();

  try {
    const upstream = await fetch(`${NOTES9_API_BASE}/AWS_transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: bodyText,
    });

    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("AWS Transcribe proxy error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transcription service unavailable",
      },
      { status: 502 }
    );
  }
}


import { NextResponse } from "next/server";

const NOTES9_API_BASE =
  process.env.NEXT_PUBLIC_NOTES9_API_URL?.replace(/\/$/, "") || "";

export async function POST(req: Request) {
  if (!NOTES9_API_BASE) {
    return NextResponse.json(
      { error: "Notes9 API URL not configured." },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const bodyText = await req.text();

  try {
    const upstream = await fetch(`${NOTES9_API_BASE}/AWS_transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
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


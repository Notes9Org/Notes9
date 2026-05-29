import crypto from "crypto";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function presignTranscribeUrl(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  languageCode: string;
  sampleRate: number;
  mediaEncoding: string;
}): string {
  const now = new Date();
  // e.g. "20240115T120000Z"
  const amzDate =
    now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const host = `transcribestreaming.${opts.region}.amazonaws.com`;
  // Port 8443 is non-standard, so it must be included in the Host header
  // value used during signing — AWS validates the host header with port.
  const hostHeader = `${host}:8443`;
  const path = "/stream-transcription-websocket";
  const credentialScope = `${dateStamp}/${opts.region}/transcribe/aws4_request`;

  const params: Record<string, string> = {
    "language-code": opts.languageCode,
    "media-encoding": opts.mediaEncoding,
    "sample-rate": String(opts.sampleRate),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${opts.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "300",
    "X-Amz-SignedHeaders": "host",
    // Required for temporary credentials (IAM role / STS / SSO)
    ...(opts.sessionToken ? { "X-Amz-Security-Token": opts.sessionToken } : {}),
  };

  // Canonical query string — sorted, URI-encoded, no X-Amz-Signature yet
  const canonicalQueryString = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");

  // SHA-256 of an empty body (presigned GET)
  const payloadHash =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const canonicalRequest = [
    "GET",
    path,
    canonicalQueryString,
    `host:${hostHeader}\n`,
    "host",
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(
      hmac(hmac(`AWS4${opts.secretAccessKey}`, dateStamp), opts.region),
      "transcribe"
    ),
    "aws4_request"
  );

  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `wss://${host}:8443${path}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  const region = process.env.AWS_REGION ?? "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json(
      { error: "AWS credentials not configured." },
      { status: 503 }
    );
  }

  let body: {
    language_code?: string;
    sample_rate_hz?: number;
    media_encoding?: string;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // use defaults
  }

  const streamUrl = presignTranscribeUrl({
    accessKeyId,
    secretAccessKey,
    sessionToken,
    region,
    languageCode: body.language_code ?? "en-US",
    sampleRate: body.sample_rate_hz ?? 16000,
    mediaEncoding: body.media_encoding ?? "pcm",
  });

  return NextResponse.json({ stream_url: streamUrl });
}

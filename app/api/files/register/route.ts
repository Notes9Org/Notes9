import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket";
import { enforceLimits, checkBodyBytes, checkRegisterItems } from "@/lib/limits/guards";

// Back-fill chat_attachments rows for files that were uploaded BEFORE a chat
// session existed (the very first message of a new conversation). The upload
// route registers files when a session_id is known; this endpoint covers the
// gap so every chat file ends up with a row — which is what (a) gives it the
// 7-day TTL the cleanup cron enforces and (b) lets catalyst's read_document
// tool fetch it in later turns.
//
// Idempotent: chat_attachments has UNIQUE (storage_bucket, storage_path), so a
// duplicate insert is swallowed.
type RegisterItem = {
  storagePath?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  size?: unknown;
};

export async function POST(request: Request) {
  try {
    // Pre-parse: Content-Length ceiling before buffering.
    const preParseBlocked = enforceLimits('files_register', [checkBodyBytes(request)]);
    if (preParseBlocked) return preParseBlocked;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { sessionId?: unknown; items?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.trim().length > 0
        ? body.sessionId.trim()
        : null;
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: "items must be an array" }, { status: 400 });
    }

    // Post-parse: register items ceiling.
    const postParseBlocked = enforceLimits('files_register', [checkRegisterItems(body.items)]);
    if (postParseBlocked) return postParseBlocked;

    const ownPrefix = `${user.id}/`;
    const rows = (body.items as RegisterItem[])
      .map((it) => ({
        storagePath: typeof it.storagePath === "string" ? it.storagePath.trim() : "",
        fileName: typeof it.fileName === "string" ? it.fileName : "file",
        mimeType: typeof it.mimeType === "string" ? it.mimeType : "application/octet-stream",
        size: typeof it.size === "number" && it.size >= 0 ? it.size : 0,
      }))
      .filter((it) => it.storagePath.startsWith(ownPrefix))
      .map((it) => ({
        user_id: user.id,
        session_id: sessionId,
        storage_bucket: USER_STORAGE_BUCKET,
        storage_path: it.storagePath,
        file_name: it.fileName,
        mime_type: it.mimeType,
        size_bytes: it.size,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ registered: 0, ids: {} });
    }

    const supabase = await createClient();
    // onConflict ignore — duplicates from a retried send are harmless.
    const { data, error } = await supabase
      .from("chat_attachments")
      .upsert(rows, { onConflict: "storage_bucket,storage_path", ignoreDuplicates: true })
      .select("id, storage_path");

    if (error) {
      console.error("chat_attachment_register_backfill_failed", {
        user_id: user.id,
        session_id: sessionId,
        error: error.message,
      });
      return NextResponse.json({ error: "Failed to register attachments" }, { status: 500 });
    }

    const ids: Record<string, string> = {};
    for (const r of data ?? []) {
      if (r.id && r.storage_path) ids[r.storage_path] = r.id;
    }
    return NextResponse.json({ registered: data?.length ?? 0, ids });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

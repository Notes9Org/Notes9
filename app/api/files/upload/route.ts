import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket"
import { fileTypeFromBuffer } from "file-type"

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/json',
];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    // Optional. When present, the upload is registered in chat_attachments so
    // catalyst's read_document tool can fetch it AND the daily cron purges it
    // after 7 days. Non-chat uploads (lab notes, papers) leave this null and
    // are NOT auto-deleted.
    const sessionIdRaw = formData.get("session_id");
    const sessionId =
      typeof sessionIdRaw === "string" && sessionIdRaw.trim().length > 0
        ? sessionIdRaw.trim()
        : null;
    const messageIdRaw = formData.get("message_id");
    const messageId =
      typeof messageIdRaw === "string" && messageIdRaw.trim().length > 0
        ? messageIdRaw.trim()
        : null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type ${file.type} not allowed` },
        { status: 400 }
      );
    }

    // Server-side magic-byte verification — rejects spoofed MIME types.
    const buf = Buffer.from(await file.slice(0, 4096).arrayBuffer());
    const detected = await fileTypeFromBuffer(buf);

    if (file.type.startsWith('text/')) {
      // file-type cannot sniff plain text; accept if the buffer is valid UTF-8.
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        console.warn(JSON.stringify({ event: 'upload_mime_mismatch', declared: file.type, detected: detected?.mime ?? null, user_id: user.id }));
        return NextResponse.json({ error: 'File content is not valid UTF-8 text' }, { status: 400 });
      }
    } else if (!detected || detected.mime !== file.type || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
      console.warn(JSON.stringify({ event: 'upload_mime_mismatch', declared: file.type, detected: detected?.mime ?? null, user_id: user.id }));
      return NextResponse.json(
        { error: `File content does not match declared type ${file.type}` },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/chat-attachments/${timestamp}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(USER_STORAGE_BUCKET)
      .upload(storagePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage
      .from(USER_STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    const publicUrl = publicUrlData?.publicUrl ?? "";

    if (!publicUrl.startsWith("https://")) {
      await supabase.storage.from(USER_STORAGE_BUCKET).remove([storagePath]);
      return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
    }

    // Register chat-context uploads in chat_attachments so they appear in
    // catalyst's read_document tool and get auto-purged after 7 days. Other
    // uploads (lab notes, papers) skip this step and are NOT TTL'd.
    let chatAttachmentId: string | null = null;
    if (sessionId) {
      const { data: attRow, error: attErr } = await supabase
        .from("chat_attachments")
        .insert({
          user_id: user.id,
          session_id: sessionId,
          message_id: messageId,
          storage_bucket: USER_STORAGE_BUCKET,
          storage_path: storagePath,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        })
        .select("id")
        .single();

      if (attErr) {
        // Don't fail the upload — the bytes are already in Storage. Surface
        // the registration failure so the frontend can warn the user that
        // the file won't be readable by the AI agent. The storage object
        // still lives in the bucket but lacks a chat_attachments row, so
        // the cron won't reap it; we log so it can be manually swept later.
        console.warn(
          JSON.stringify({
            event: "chat_attachment_register_failed",
            user_id: user.id,
            session_id: sessionId,
            storage_path: storagePath,
            error: attErr.message,
          }),
        );
      } else {
        chatAttachmentId = attRow?.id ?? null;
      }
    }

    return NextResponse.json({
      url: publicUrl,
      storagePath,
      pathname: file.name,
      contentType: file.type,
      size: file.size,
      chatAttachmentId,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

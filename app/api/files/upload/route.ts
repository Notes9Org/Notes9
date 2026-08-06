import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket"
import { fileTypeFromBuffer } from "file-type"
import { enforceLimits, checkBodyBytes } from "@/lib/limits/guards"
import {
  ALLOWED_MIME_TYPES,
  ATTACHMENT_MAX_FILE_SIZE as MAX_FILE_SIZE,
  OOXML_MIME_TYPES,
  TEXT_SNIFF_MIME_TYPES,
  resolveAttachmentMime,
} from "@/lib/attachment-types"

// The `user` bucket is PRIVATE (see scripts/057_security_hardening.sql §4), so
// getPublicUrl() returns a dead link. We mint a signed URL whose lifetime ==
// the chat-attachment TTL (7 days), so the link is valid for exactly as long
// as the file exists. `storagePath` is returned alongside so the client can
// persist it and re-sign later (e.g. when chat history reloads).
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// OOXML container markers (stored as raw entry names in the zip). Used to
// confirm a generic-zip detection is genuinely a .docx/.xlsx and not a plain
// .zip/.jar/.apk/.odt masquerading as one.
const OOXML_CONTENT_TYPES_MARKER = Buffer.from("[Content_Types].xml");
const OOXML_WORD_MARKER = Buffer.from("word/document.xml");
const OOXML_XL_MARKER = Buffer.from("xl/workbook.xml");

export async function POST(request: Request) {
  try {
    // Pre-parse: 25 MB hard body ceiling (belt-and-suspenders over the 10 MB per-file cap).
    const preParseBlocked = enforceLimits('files_upload', [checkBodyBytes(request)]);
    if (preParseBlocked) return preParseBlocked;

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
    // Resolve the canonical MIME. Browsers report a blank or generic type for
    // .docx/.xlsx on some OS/browser combos and for files from zips/cloud
    // drives, so fall back to the filename extension when the declared type is
    // missing or not in the allow-list.
    const effectiveType = resolveAttachmentMime({
      type: file.type,
      name: file.name,
    });
    if (!effectiveType) {
      return NextResponse.json(
        { error: `File type ${file.type || file.name} not allowed` },
        { status: 400 }
      );
    }

    // Server-side content verification, still rejects spoofed MIME types.
    if (TEXT_SNIFF_MIME_TYPES.includes(effectiveType)) {
      // Text/markdown/JSON/SVG have no reliable magic bytes; require valid UTF-8.
      const textBuf = Buffer.from(await file.slice(0, 4096).arrayBuffer());
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(textBuf);
      } catch {
        console.warn(JSON.stringify({ event: "upload_mime_mismatch", declared: effectiveType, detected: "non-utf8", user_id: user.id }));
        return NextResponse.json({ error: "File content is not valid UTF-8 text" }, { status: 400 });
      }
    } else if (OOXML_MIME_TYPES.includes(effectiveType)) {
      // .docx/.xlsx are ZIP containers; the identifying entries can sit past the
      // first few KB, so sniff the WHOLE buffer (10MB-capped above), fixes
      // larger Office files 400ing.
      const zipBuf = Buffer.from(await file.arrayBuffer());
      const detected = await fileTypeFromBuffer(zipBuf);
      let ok = detected?.mime === effectiveType;
      if (!ok && detected?.mime === "application/zip") {
        // file-type only resolved the generic container. Confirm OOXML-specific
        // parts are present so a plain .zip/.jar/.apk/.odt can't pass as Office.
        const isXlsx = effectiveType.includes("spreadsheetml");
        ok =
          zipBuf.includes(OOXML_CONTENT_TYPES_MARKER) &&
          zipBuf.includes(isXlsx ? OOXML_XL_MARKER : OOXML_WORD_MARKER);
        if (ok) {
          console.warn(JSON.stringify({ event: "upload_ooxml_zip_fallback", declared: effectiveType, user_id: user.id }));
        }
      }
      if (!ok) {
        console.warn(JSON.stringify({ event: "upload_mime_mismatch", declared: effectiveType, detected: detected?.mime ?? null, user_id: user.id }));
        return NextResponse.json({ error: `File content does not match declared type ${effectiveType}` }, { status: 400 });
      }
    } else {
      // Images and PDF carry magic bytes at offset 0, cheap 4 KB slice.
      const buf = Buffer.from(await file.slice(0, 4096).arrayBuffer());
      const detected = await fileTypeFromBuffer(buf);
      if (!detected || detected.mime !== effectiveType || !(ALLOWED_MIME_TYPES as readonly string[]).includes(detected.mime)) {
        console.warn(JSON.stringify({ event: "upload_mime_mismatch", declared: effectiveType, detected: detected?.mime ?? null, user_id: user.id }));
        return NextResponse.json({ error: `File content does not match declared type ${effectiveType}` }, { status: 400 });
      }
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

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(USER_STORAGE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    const signedUrl = signedUrlData?.signedUrl ?? "";

    if (signedUrlError || !signedUrl.startsWith("http")) {
      console.error("Failed to sign uploaded file URL", {
        storagePath,
        error: signedUrlError?.message,
      });
      await supabase.storage.from(USER_STORAGE_BUCKET).remove([storagePath]);
      return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
    }

    // Register chat-context uploads in chat_attachments so they appear in
    // catalyst's read_document tool and get auto-purged after 7 days. Other
    // uploads (lab notes, papers) skip this step and are NOT TTL'd.
    let chatAttachmentId: string | null = null;
    let attachmentWarning: string | null = null;
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
          mime_type: effectiveType,
          size_bytes: file.size,
        })
        .select("id")
        .single();

      if (attErr) {
        // Registration failed. The bytes are in Storage but have no
        // chat_attachments row, so the TTL cron can never reap them, a storage
        // leak. Delete the just-uploaded object to avoid the orphan, then ask the
        // user to retry. (Without a row the file also can't be re-signed on reload
        // or read by read_document in later turns anyway, so keeping it has little
        // upside.)
        let removed = false;
        try {
          const { error: rmErr } = await supabase.storage
            .from(USER_STORAGE_BUCKET)
            .remove([storagePath]);
          removed = !rmErr;
        } catch {
          /* best-effort cleanup */
        }
        console.warn(
          JSON.stringify({
            event: "chat_attachment_register_failed",
            user_id: user.id,
            session_id: sessionId,
            storage_path: storagePath,
            error: attErr.message,
            orphan_object_removed: removed,
          }),
        );
        if (removed) {
          // The object is gone, so any signed URL we'd return is dead. Fail the
          // request so the client drops the attachment instead of keeping a chip
          // that points at nothing.
          return NextResponse.json(
            {
              error:
                "Upload could not be registered and was removed. Please try attaching the file again.",
            },
            { status: 500 },
          );
        }
        attachmentWarning =
          "File uploaded but could not be registered for AI access. The assistant may not be able to read it.";
      } else {
        chatAttachmentId = attRow?.id ?? null;
      }
    }

    return NextResponse.json({
      url: signedUrl,
      storagePath,
      pathname: file.name,
      contentType: effectiveType,
      size: file.size,
      chatAttachmentId,
      attachmentWarning,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

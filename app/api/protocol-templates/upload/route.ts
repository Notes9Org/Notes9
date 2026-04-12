/**
 * Legacy: multipart upload through Next.js (large bodies can fail with "Failed to fetch").
 * Prefer `POST /api/protocol-templates/reserve-upload` + client Storage upload + `POST .../finalize`.
 */
import { randomUUID } from "crypto"
import { NextResponse } from "next/server"

import {
  extractProtocolTemplateFromFile,
  isAllowedProtocolTemplateMime,
} from "@/lib/protocol-template-extract"
import {
  createProtocolTemplateSourceKey,
  getProtocolTemplatesStorageBucket,
} from "@/lib/protocol-templates-storage"
import { createClient } from "@/lib/supabase/server"
import { PROTOCOL_TEMPLATE_MAX_FILE_BYTES } from "@/lib/protocol-template-types"

export const runtime = "nodejs"

/** Parsing + storage can exceed default limits on serverless hosts. */
export const maxDuration = 300

async function getOrganizationId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", userId).single()
  return profile?.organization_id ?? null
}

/** Browsers often send empty type or octet-stream for DOCX; infer from filename. */
function resolveMimeType(file: File): string {
  const raw = (file.type || "").trim().toLowerCase()
  if (raw && isAllowedProtocolTemplateMime(raw)) return raw
  const name = file.name.toLowerCase()
  if (name.endsWith(".pdf")) return "application/pdf"
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
  return file.type || "application/octet-stream"
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = await getOrganizationId(supabase, user.id)
    if (!organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 })
    }

    const form = await request.formData()
    const file = form.get("file")
    const nameRaw = form.get("name")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 })
    }

    if (file.size > PROTOCOL_TEMPLATE_MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.round(PROTOCOL_TEMPLATE_MAX_FILE_BYTES / 1024 / 1024)} MB)` },
        { status: 400 }
      )
    }

    const mimeType = resolveMimeType(file)
    if (!isAllowedProtocolTemplateMime(mimeType)) {
      return NextResponse.json({ error: "Only .docx and .pdf files are allowed" }, { status: 400 })
    }

    const templateId = randomUUID()
    const ext: "pdf" | "docx" = mimeType.includes("pdf") ? "pdf" : "docx"
    const bucket = getProtocolTemplatesStorageBucket()
    const storagePath = createProtocolTemplateSourceKey(organizationId, templateId, ext)
    const buf = Buffer.from(await file.arrayBuffer())
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buf, {
        contentType: mimeType,
        upsert: false,
      })

    if (upErr) {
      console.error("[protocol-templates/upload] storage", upErr)
      return NextResponse.json(
        {
          error: upErr.message.includes("Bucket")
            ? "Storage bucket `user` is missing or not configured (same bucket as literature). Create it per scripts/036_literature_catalog_placement.sql."
            : upErr.message,
        },
        { status: 500 }
      )
    }

    let extracted
    try {
      extracted = await extractProtocolTemplateFromFile({
        mimeType,
        arrayBuffer,
        supabase,
        organizationId,
        templateId,
      })
    } catch (e) {
      await supabase.storage.from(bucket).remove([storagePath])
      throw e
    }

    const displayName =
      typeof nameRaw === "string" && nameRaw.trim()
        ? nameRaw.trim().slice(0, 200)
        : file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled template"

    const { data: row, error: insErr } = await supabase
      .from("protocol_document_templates")
      .insert({
        id: templateId,
        organization_id: organizationId,
        created_by: user.id,
        name: displayName,
        source_filename: file.name.slice(0, 512),
        mime_type: mimeType,
        storage_path: storagePath,
        extracted: extracted as unknown as Record<string, unknown>,
      })
      .select("id, name, extracted, created_at, mime_type, source_filename")
      .single()

    if (insErr) {
      console.error("[protocol-templates/upload] insert", insErr)
      await supabase.storage.from(bucket).remove([storagePath])
      if (/does not exist|schema/i.test(insErr.message ?? "")) {
        return NextResponse.json(
          { error: "Database migration not applied. Run scripts/040_protocol_document_templates.sql." },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({ template: row })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Upload failed"
    console.error("[protocol-templates/upload]", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

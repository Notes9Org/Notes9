import { NextResponse } from "next/server"

import { extractProtocolTemplateFromFile } from "@/lib/protocol-template-extract"
import {
  getProtocolTemplatesStorageBucket,
  isReservedProtocolTemplateSourcePath,
  removeProtocolTemplateStorageObjects,
} from "@/lib/protocol-templates-storage"
import { createClient } from "@/lib/supabase/server"
import { PROTOCOL_TEMPLATE_MAX_FILE_BYTES } from "@/lib/protocol-template-types"

export const runtime = "nodejs"

export const maxDuration = 120

async function getOrganizationId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", userId).single()
  return profile?.organization_id ?? null
}

function mimeFromExt(ext: "pdf" | "docx"): string {
  return ext === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}

/**
 * Step 2: after client uploaded to Storage, download, parse, insert DB row.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  let storagePathForCleanup: string | null = null
  let bucket = getProtocolTemplatesStorageBucket()

  try {
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

    const body = (await request.json()) as {
      templateId?: string
      storagePath?: string
      fileName?: string
      name?: string | null
    }
    const templateId = typeof body.templateId === "string" ? body.templateId : ""
    const storagePath = typeof body.storagePath === "string" ? body.storagePath : ""
    const fileName = typeof body.fileName === "string" ? body.fileName : "file"
    const nameRaw = body.name

    if (!templateId || !storagePath) {
      return NextResponse.json({ error: "Missing templateId or storagePath" }, { status: 400 })
    }

    if (!isReservedProtocolTemplateSourcePath(organizationId, templateId, storagePath)) {
      return NextResponse.json({ error: "Invalid storage path for this organization" }, { status: 400 })
    }

    const ext: "pdf" | "docx" = storagePath.endsWith(".pdf") ? "pdf" : "docx"
    const mimeType = mimeFromExt(ext)
    storagePathForCleanup = storagePath

    const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
    if (dlErr || !blob) {
      console.error("[protocol-templates/finalize] download", dlErr)
      return NextResponse.json(
        { error: dlErr?.message ?? "Could not read uploaded file from storage. Upload may have failed." },
        { status: 400 }
      )
    }

    const buf = Buffer.from(await blob.arrayBuffer())
    if (buf.byteLength > PROTOCOL_TEMPLATE_MAX_FILE_BYTES) {
      await supabase.storage.from(bucket).remove([storagePath])
      return NextResponse.json({ error: "File too large" }, { status: 400 })
    }

    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

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
        : fileName.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled template"

    const { data: row, error: insErr } = await supabase
      .from("protocol_document_templates")
      .insert({
        id: templateId,
        organization_id: organizationId,
        created_by: user.id,
        name: displayName,
        source_filename: fileName.slice(0, 512),
        mime_type: mimeType,
        storage_path: storagePath,
        extracted: extracted as unknown as Record<string, unknown>,
      })
      .select("id, name, extracted, created_at, mime_type, source_filename")
      .single()

    if (insErr) {
      console.error("[protocol-templates/finalize] insert", insErr)
      const pathsToRemove = [storagePath]
      if (extracted.logos?.length) {
        for (const l of extracted.logos) {
          if (l.storage_path) pathsToRemove.push(l.storage_path)
        }
      }
      await removeProtocolTemplateStorageObjects(supabase, pathsToRemove)
      if (/does not exist|schema/i.test(insErr.message ?? "")) {
        return NextResponse.json(
          { error: "Database migration not applied. Run scripts/040_protocol_document_templates.sql." },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    storagePathForCleanup = null
    return NextResponse.json({ template: row })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Finalize failed"
    console.error("[protocol-templates/finalize]", e)
    if (storagePathForCleanup) {
      await supabase.storage.from(bucket).remove([storagePathForCleanup]).catch(() => {})
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

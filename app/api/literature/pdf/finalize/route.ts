import { NextResponse } from "next/server"

import {
  clampText,
  createLiteraturePdfPath,
  getLiteratureStorageBucket,
  normalizeDoi,
  validateTextLimits,
} from "@/lib/literature-pdf-storage"
import { createClient } from "@/lib/supabase/server"
import type { PdfMatchSource, SaveMode } from "@/types/literature-pdf"

function explainSchemaError(message: string) {
  if (/column .* does not exist|relation .* does not exist/i.test(message)) {
    return "Literature PDF schema is not installed yet. Run scripts/027_literature_pdf_support.sql first."
  }
  return message
}

type FinalizeAction = "attach_existing" | "replace_existing_pdf" | "create_record_and_attach"

interface FinalizePayload {
  action: FinalizeAction
  saveMode: SaveMode
  literatureId?: string
  newRecordData?: {
    title?: string
    authors?: string
    journal?: string
    publication_year?: number | null
    doi?: string
    pmid?: string
    abstract?: string
    personal_notes?: string
    url?: string
    keywords?: string[]
  }
  tempUploadPath: string
  fileName: string
  checksum: string
  extractedMetadata?: Record<string, unknown>
  confirmedClearAnnotations?: boolean
}

async function getOrganizationId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .single()

  return profile?.organization_id ?? null
}

function resolveMatchSource(action: FinalizeAction, saveMode: SaveMode): PdfMatchSource {
  if (action === "replace_existing_pdf") return "replacement"
  if (action === "create_record_and_attach") return "manual_new_record_creation"
  return saveMode === "naming_convention" ? "manual_record_upload" : "manual_existing_record_selection"
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

    const payload = (await request.json()) as FinalizePayload

    if (!payload.tempUploadPath || !payload.fileName || !payload.action || !payload.saveMode) {
      return NextResponse.json({ error: "Missing finalize parameters" }, { status: 400 })
    }

    let literatureId = payload.literatureId ?? null

    if (payload.action === "create_record_and_attach") {
      const record = payload.newRecordData ?? {}
      const validationErrors = validateTextLimits({
        title: record.title,
        authors: record.authors,
        journal: record.journal,
        doi: record.doi,
        pmid: record.pmid,
        url: record.url,
        abstract: record.abstract,
        personal_notes: record.personal_notes,
      })

      if (!record.title?.trim()) {
        validationErrors.push("title is required")
      }

      if (validationErrors.length > 0) {
        return NextResponse.json({ error: validationErrors.join(", ") }, { status: 400 })
      }

      const organizationId = await getOrganizationId(supabase, user.id)
      const { data: createdRecord, error: createError } = await supabase
        .from("literature_reviews")
        .insert({
          title: clampText(record.title, "title"),
          authors: clampText(record.authors, "authors"),
          journal: clampText(record.journal, "journal"),
          publication_year: record.publication_year ?? null,
          doi: clampText(normalizeDoi(record.doi), "doi"),
          pmid: clampText(record.pmid, "pmid"),
          abstract: clampText(record.abstract, "abstract"),
          personal_notes: clampText(record.personal_notes, "personal_notes"),
          url: clampText(record.url, "url"),
          keywords: Array.isArray(record.keywords) ? record.keywords.slice(0, 20) : null,
          status: "saved",
          created_by: user.id,
          organization_id: organizationId,
        })
        .select("id")
        .single()

      if (createError || !createdRecord) {
        return NextResponse.json(
          { error: explainSchemaError(createError?.message ?? "Failed to create literature record") },
          { status: 500 }
        )
      }

      literatureId = createdRecord.id
    }

    if (!literatureId) {
      return NextResponse.json({ error: "A literature record is required" }, { status: 400 })
    }

    const { data: literature, error: literatureError } = await supabase
      .from("literature_reviews")
      .select("id, pdf_storage_path, pdf_file_name")
      .eq("id", literatureId)
      .single()

    if (literatureError || !literature) {
      return NextResponse.json(
        { error: literatureError ? explainSchemaError(literatureError.message) : "Literature record not found" },
        { status: literatureError ? 500 : 404 }
      )
    }

    if (
      payload.action === "replace_existing_pdf" &&
      literature.pdf_storage_path &&
      !payload.confirmedClearAnnotations
    ) {
      return NextResponse.json(
        { error: "Replacing an existing PDF requires annotation-clear confirmation" },
        { status: 400 }
      )
    }

    const storage = supabase.storage.from(getLiteratureStorageBucket())
    const { data: downloaded, error: downloadError } = await storage.download(payload.tempUploadPath)
    if (downloadError || !downloaded) {
      return NextResponse.json({ error: downloadError?.message ?? "Temp PDF was not found" }, { status: 404 })
    }

    const finalStoragePath = createLiteraturePdfPath(literatureId, payload.fileName)
    const { error: finalUploadError } = await storage.upload(finalStoragePath, downloaded, {
      cacheControl: "3600",
      upsert: false,
      contentType: "application/pdf",
    })

    if (finalUploadError) {
      return NextResponse.json({ error: finalUploadError.message }, { status: 500 })
    }

    const { data: urlData } = storage.getPublicUrl(finalStoragePath)
    const metadata = payload.extractedMetadata ?? null
    const matchSource = resolveMatchSource(payload.action, payload.saveMode)

    const { error: updateError } = await supabase
      .from("literature_reviews")
      .update({
        pdf_file_url: urlData.publicUrl,
        pdf_file_name: clampText(payload.fileName, "pdf_file_name"),
        pdf_file_size: downloaded.size,
        pdf_file_type: clampText("application/pdf", "pdf_file_type"),
        pdf_storage_path: clampText(finalStoragePath, "pdf_storage_path"),
        pdf_uploaded_at: new Date().toISOString(),
        pdf_checksum: clampText(payload.checksum, "pdf_checksum"),
        pdf_match_source: clampText(matchSource, "pdf_match_source"),
        pdf_metadata: metadata,
      })
      .eq("id", literatureId)

    if (updateError) {
      return NextResponse.json({ error: explainSchemaError(updateError.message) }, { status: 500 })
    }

    if (payload.action === "replace_existing_pdf") {
      await supabase.from("literature_pdf_annotations").delete().eq("literature_review_id", literatureId)
      if (literature.pdf_storage_path) {
        await storage.remove([literature.pdf_storage_path])
      }
    }

    await storage.remove([payload.tempUploadPath])

    return NextResponse.json({
      success: true,
      literatureId,
      pdfUrl: urlData.publicUrl,
      storagePath: finalStoragePath,
      matchSource,
    })
  } catch (error) {
    console.error("Failed to finalize literature PDF", error)
    return NextResponse.json({ error: "Failed to finalize literature PDF" }, { status: 500 })
  }
}

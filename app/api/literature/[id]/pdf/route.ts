import { NextResponse } from "next/server"

import { analyzeLiteraturePdfUpload } from "@/lib/literature-pdf-match"
import { createClient } from "@/lib/supabase/server"
import {
  createLiteraturePdfPath,
  getLiteratureStorageBucket,
  validatePdfFile,
} from "@/lib/literature-pdf-storage"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF file is required" }, { status: 400 })
    }

    const validationError = validatePdfFile(file)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const storagePath = createLiteraturePdfPath(user.id, id, file.name)
    const { error: uploadError } = await supabase.storage
      .from(getLiteratureStorageBucket())
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const analysis = await analyzeLiteraturePdfUpload({
      fileBuffer: await file.arrayBuffer(),
      fileName: file.name,
      currentLiteratureId: id,
    })

    return NextResponse.json({
      ...analysis,
      tempUploadPath: storagePath,
      fileSize: file.size,
    })
  } catch (error: any) {
    console.error("Failed to analyze literature PDF for record", error)
    return NextResponse.json({ error: error?.message ?? "Failed to analyze PDF" }, { status: 500 })
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: literature, error } = await supabase
      .from("literature_reviews")
      .select("pdf_storage_path")
      .eq("id", id)
      .single()

    if (error || !literature) {
      return NextResponse.json({ error: "Literature record not found" }, { status: 404 })
    }

    if (literature.pdf_storage_path) {
      await supabase.storage.from(getLiteratureStorageBucket()).remove([literature.pdf_storage_path])
    }

    await supabase.from("literature_pdf_annotations").delete().eq("literature_review_id", id)
    const { error: updateError } = await supabase
      .from("literature_reviews")
      .update({
        pdf_file_url: null,
        pdf_file_name: null,
        pdf_file_size: null,
        pdf_file_type: null,
        pdf_storage_path: null,
        pdf_uploaded_at: null,
        pdf_checksum: null,
        pdf_match_source: null,
        pdf_metadata: null,
        pdf_import_status: "none",
      })
      .eq("id", id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete literature PDF", error)
    return NextResponse.json({ error: "Failed to delete literature PDF" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"

import { getLiteratureStorageBucket } from "@/lib/literature-pdf-storage"
import { createClient } from "@/lib/supabase/server"

/** Delete a literature row, its PDF in storage, and annotations. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
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

    const { data: row, error: fetchError } = await supabase
      .from("literature_reviews")
      .select("id, pdf_storage_path")
      .eq("id", id)
      .single()

    if (fetchError || !row) {
      return NextResponse.json({ error: "Literature record not found" }, { status: 404 })
    }

    const bucket = getLiteratureStorageBucket()
    if (row.pdf_storage_path) {
      await supabase.storage.from(bucket).remove([row.pdf_storage_path])
    }

    await supabase.from("literature_pdf_annotations").delete().eq("literature_review_id", id)

    const { error: deleteError } = await supabase.from("literature_reviews").delete().eq("id", id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete literature review", error)
    return NextResponse.json({ error: "Failed to delete literature review" }, { status: 500 })
  }
}

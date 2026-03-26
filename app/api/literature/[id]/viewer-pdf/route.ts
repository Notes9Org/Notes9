import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { getLiteratureStorageBucket } from "@/lib/literature-pdf-storage"

/**
 * Same-origin PDF stream for the in-app reader (pdf.js).
 * The browser cannot reliably fetch Supabase `getPublicUrl` objects when the bucket is private
 * or RLS requires an authenticated session — pdf.js runs client-side without Supabase JWT.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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

    const { data: row, error: selErr } = await supabase
      .from("literature_reviews")
      .select("pdf_storage_path")
      .eq("id", id)
      .maybeSingle()

    if (selErr || !row?.pdf_storage_path) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 })
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from(getLiteratureStorageBucket())
      .download(row.pdf_storage_path)

    if (dlErr || !blob) {
      return NextResponse.json(
        { error: dlErr?.message ?? "Could not load PDF from storage" },
        { status: 502 }
      )
    }

    const buf = await blob.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
      },
    })
  } catch (e) {
    console.error("viewer-pdf", e)
    return NextResponse.json({ error: "Failed to stream PDF" }, { status: 500 })
  }
}

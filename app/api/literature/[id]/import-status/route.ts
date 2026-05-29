import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"

/** Lightweight poll endpoint — avoids full page refresh while background PDF import runs. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: row, error } = await supabase
      .from("literature_reviews")
      .select("pdf_import_status, pdf_storage_path, pdf_file_name")
      .eq("id", id)
      .maybeSingle()

    if (error || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({
      pdf_import_status: row.pdf_import_status ?? "none",
      pdf_storage_path: row.pdf_storage_path ?? null,
      pdf_file_name: row.pdf_file_name ?? null,
    })
  } catch (e) {
    console.error("import-status", e)
    return NextResponse.json({ error: "Failed to read import status" }, { status: 500 })
  }
}

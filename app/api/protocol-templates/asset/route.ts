import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import type { ProtocolTemplateExtracted } from "@/lib/protocol-template-types"
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const templateId = url.searchParams.get("templateId")
    const i = url.searchParams.get("i")
    if (!templateId || i === null) {
      return NextResponse.json({ error: "Missing templateId or i" }, { status: 400 })
    }

    const index = Number.parseInt(i, 10)
    if (!Number.isFinite(index) || index < 0) {
      return NextResponse.json({ error: "Invalid index" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: row, error } = await supabase
      .from("protocol_document_templates")
      .select("extracted")
      .eq("id", templateId)
      .single()

    if (error || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const extracted = row.extracted as ProtocolTemplateExtracted
    const logo = extracted.logos?.find((l) => l.index === index)
    if (!logo?.storage_path) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 })
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from(USER_STORAGE_BUCKET)
      .download(logo.storage_path)

    if (dlErr || !blob) {
      return NextResponse.json({ error: "Could not load file" }, { status: 500 })
    }

    const lower = logo.storage_path.toLowerCase()
    const ct = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
        ? "image/jpeg"
        : lower.endsWith(".gif")
          ? "image/gif"
          : "application/octet-stream"

    return new NextResponse(blob, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

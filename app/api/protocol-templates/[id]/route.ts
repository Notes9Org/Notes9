import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import type { ProtocolTemplateExtracted } from "@/lib/protocol-template-types"
import { removeProtocolTemplateStorageObjects } from "@/lib/protocol-templates-storage"

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: row, error: fetchErr } = await supabase
      .from("protocol_document_templates")
      .select("id, organization_id, storage_path, extracted")
      .eq("id", id)
      .single()

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const extracted = row.extracted as ProtocolTemplateExtracted | null
    const paths = new Set<string>()
    if (row.storage_path) paths.add(row.storage_path)
    if (extracted?.logos?.length) {
      for (const l of extracted.logos) {
        if (l.storage_path) paths.add(l.storage_path)
      }
    }

    const { error: delErr } = await supabase.from("protocol_document_templates").delete().eq("id", id)
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    const toRemove = [...paths]
    if (toRemove.length > 0) {
      await removeProtocolTemplateStorageObjects(supabase, toRemove)
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

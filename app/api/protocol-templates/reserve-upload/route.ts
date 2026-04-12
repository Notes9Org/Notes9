import { randomUUID } from "crypto"
import { NextResponse } from "next/server"

import {
  createProtocolTemplateSourceKey,
  getProtocolTemplatesStorageBucket,
} from "@/lib/protocol-templates-storage"
import { createClient } from "@/lib/supabase/server"
import { PROTOCOL_TEMPLATE_MAX_FILE_BYTES } from "@/lib/protocol-template-types"

/**
 * Step 1 (literature-style): return a storage path + template id. Client uploads the file
 * directly to Supabase Storage — avoids Next.js proxy body limits that cause "Failed to fetch".
 */
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

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single()
    const organizationId = profile?.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 })
    }

    const body = (await request.json()) as { fileName?: string }
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : ""
    const lower = fileName.toLowerCase()
    let ext: "pdf" | "docx"
    if (lower.endsWith(".pdf")) ext = "pdf"
    else if (lower.endsWith(".docx")) ext = "docx"
    else {
      return NextResponse.json({ error: "File name must end with .pdf or .docx" }, { status: 400 })
    }

    const templateId = randomUUID()
    const path = createProtocolTemplateSourceKey(organizationId, templateId, ext)

    return NextResponse.json({
      templateId,
      path,
      bucket: getProtocolTemplatesStorageBucket(),
      maxBytes: PROTOCOL_TEMPLATE_MAX_FILE_BYTES,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to reserve upload"
    console.error("[protocol-templates/reserve-upload]", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

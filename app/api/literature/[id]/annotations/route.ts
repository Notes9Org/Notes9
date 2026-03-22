import { NextResponse } from "next/server"

import { clampText, validateTextLimits } from "@/lib/literature-pdf-storage"
import { createClient } from "@/lib/supabase/server"

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
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

    const { data, error } = await supabase
      .from("literature_pdf_annotations")
      .select("*")
      .eq("literature_review_id", id)
      .order("page_number")
      .order("created_at")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ annotations: data ?? [] })
  } catch (error) {
    console.error("Failed to fetch annotations", error)
    return NextResponse.json({ error: "Failed to fetch annotations" }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const payload = await request.json()
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const validationErrors = validateTextLimits({
      quote_text: payload.quote_text,
      comment_text: payload.comment_text,
    })

    if (!payload.page_number || !payload.type) {
      validationErrors.push("page_number and type are required")
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join(", ") }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()

    const { data, error } = await supabase
      .from("literature_pdf_annotations")
      .insert({
        literature_review_id: id,
        organization_id: profile?.organization_id ?? null,
        created_by: user.id,
        type: payload.type,
        page_number: payload.page_number,
        quote_text: clampText(payload.quote_text, "quote_text"),
        comment_text: clampText(payload.comment_text, "comment_text"),
        color: payload.color ?? null,
        rects: payload.rects ?? null,
        anchor: payload.anchor ?? null,
      })
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ annotation: data })
  } catch (error) {
    console.error("Failed to create annotation", error)
    return NextResponse.json({ error: "Failed to create annotation" }, { status: 500 })
  }
}

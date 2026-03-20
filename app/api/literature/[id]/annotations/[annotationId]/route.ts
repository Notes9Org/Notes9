import { NextResponse } from "next/server"

import { clampText, validateTextLimits } from "@/lib/literature-pdf-storage"
import { createClient } from "@/lib/supabase/server"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; annotationId: string }> }
) {
  try {
    const { annotationId } = await context.params
    const payload = await request.json()
    const validationErrors = validateTextLimits({
      quote_text: payload.quote_text,
      comment_text: payload.comment_text,
    })

    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join(", ") }, { status: 400 })
    }

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
      .update({
        comment_text: clampText(payload.comment_text, "comment_text"),
        quote_text: clampText(payload.quote_text, "quote_text"),
        color: payload.color ?? null,
        rects: payload.rects ?? null,
        anchor: payload.anchor ?? null,
      })
      .eq("id", annotationId)
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ annotation: data })
  } catch (error) {
    console.error("Failed to update annotation", error)
    return NextResponse.json({ error: "Failed to update annotation" }, { status: 500 })
  }
}

export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string; annotationId: string }> }
) {
  try {
    const { annotationId } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("literature_pdf_annotations")
      .delete()
      .eq("id", annotationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete annotation", error)
    return NextResponse.json({ error: "Failed to delete annotation" }, { status: 500 })
  }
}

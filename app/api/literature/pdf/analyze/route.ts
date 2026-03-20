import { createHash } from "crypto"

import { NextResponse } from "next/server"

import { analyzeLiteraturePdfUpload } from "@/lib/literature-pdf-match"
import {
  createTempLiteraturePdfPath,
  getLiteratureStorageBucket,
  validatePdfFile,
} from "@/lib/literature-pdf-storage"
import { createClient } from "@/lib/supabase/server"

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

    const formData = await request.formData()
    const file = formData.get("file")
    const currentLiteratureId = formData.get("currentLiteratureId")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF file is required" }, { status: 400 })
    }

    const validationError = validatePdfFile(file)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const tempUploadPath = createTempLiteraturePdfPath(user.id, file.name)

    const { error: uploadError } = await supabase.storage
      .from(getLiteratureStorageBucket())
      .upload(tempUploadPath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const checksum = createHash("sha256").update(Buffer.from(buffer)).digest("hex")
    const result = await analyzeLiteraturePdfUpload({
      fileBuffer: buffer,
      fileName: file.name,
      currentLiteratureId: typeof currentLiteratureId === "string" ? currentLiteratureId : null,
    })

    return NextResponse.json({
      ...result,
      checksum,
      tempUploadPath,
    })
  } catch (error: any) {
    console.error("Failed to analyze literature PDF", error)
    return NextResponse.json({ error: error?.message ?? "Failed to analyze PDF" }, { status: 500 })
  }
}

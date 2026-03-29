import { createHash } from "crypto"

import { NextResponse } from "next/server"

import { analyzeLiteraturePdfUpload } from "@/lib/literature-pdf-match"
import {
  createLiteraturePdfPath,
  createTempLiteraturePdfPath,
  getLiteratureStorageBucket,
  isValidOwnedLiteratureUploadPath,
  validateLiteraturePdfDisplayName,
  validatePdfBuffer,
  validatePdfFile,
} from "@/lib/literature-pdf-storage"
import { createClient } from "@/lib/supabase/server"

interface AnalyzeFromStorageBody {
  storagePath?: string
  fileName?: string
  currentLiteratureId?: string | null
}

async function analyzeFromStorage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  storagePath: string,
  fileName: string,
  currentLiteratureId: string | null
) {
  const nameError = validateLiteraturePdfDisplayName(fileName)
  if (nameError) {
    return NextResponse.json({ error: nameError }, { status: 400 })
  }

  if (!isValidOwnedLiteratureUploadPath(userId, storagePath, currentLiteratureId)) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 })
  }

  const bucket = getLiteratureStorageBucket()
  const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(storagePath)

  if (downloadError || !blob) {
    return NextResponse.json(
      { error: downloadError?.message ?? "Uploaded PDF was not found" },
      { status: 404 }
    )
  }

  const buffer = await blob.arrayBuffer()
  const byteLength = buffer.byteLength
  const header = new Uint8Array(buffer.slice(0, Math.min(1024, byteLength)))
  const bufferError = validatePdfBuffer(byteLength, header.subarray(0, Math.min(4, header.length)))
  if (bufferError) {
    return NextResponse.json({ error: bufferError }, { status: 400 })
  }

  const checksum = createHash("sha256").update(Buffer.from(buffer)).digest("hex")
  const result = await analyzeLiteraturePdfUpload({
    fileBuffer: buffer,
    fileName,
    currentLiteratureId,
  })

  return NextResponse.json({
    ...result,
    checksum,
    tempUploadPath: storagePath,
    fileSize: byteLength,
  })
}

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

    const contentType = request.headers.get("content-type") ?? ""
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as AnalyzeFromStorageBody
      const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : ""
      const fileName = typeof body.fileName === "string" ? body.fileName : ""
      const currentLiteratureId =
        typeof body.currentLiteratureId === "string" && body.currentLiteratureId.length > 0
          ? body.currentLiteratureId
          : null

      if (!storagePath || !fileName) {
        return NextResponse.json({ error: "storagePath and fileName are required" }, { status: 400 })
      }

      return analyzeFromStorage(supabase, user.id, storagePath, fileName, currentLiteratureId)
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
    const literatureIdForPath =
      typeof currentLiteratureId === "string" && currentLiteratureId.length > 0
        ? currentLiteratureId
        : null
    const uploadPath = literatureIdForPath
      ? createLiteraturePdfPath(user.id, literatureIdForPath, file.name)
      : createTempLiteraturePdfPath(user.id, file.name)

    const { error: uploadError } = await supabase.storage
      .from(getLiteratureStorageBucket())
      .upload(uploadPath, file, {
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
      tempUploadPath: uploadPath,
      fileSize: file.size,
    })
  } catch (error: unknown) {
    console.error("Failed to analyze literature PDF", error)
    const message = error instanceof Error ? error.message : "Failed to analyze PDF"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

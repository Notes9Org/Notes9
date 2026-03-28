import { NextResponse } from "next/server"

import {
  createLiteraturePdfPath,
  createTempLiteraturePdfPath,
  getLiteratureStorageBucket,
  validateLiteraturePdfDisplayName,
} from "@/lib/literature-pdf-storage"
import { createClient } from "@/lib/supabase/server"

interface ReserveBody {
  fileName?: string
  currentLiteratureId?: string | null
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

    const body = (await request.json()) as ReserveBody
    const fileName = typeof body.fileName === "string" ? body.fileName : ""
    const nameError = validateLiteraturePdfDisplayName(fileName)
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 })
    }

    const literatureIdForPath =
      typeof body.currentLiteratureId === "string" && body.currentLiteratureId.length > 0
        ? body.currentLiteratureId
        : null

    const path = literatureIdForPath
      ? createLiteraturePdfPath(user.id, literatureIdForPath, fileName)
      : createTempLiteraturePdfPath(user.id, fileName)

    return NextResponse.json({
      path,
      bucket: getLiteratureStorageBucket(),
    })
  } catch (error: unknown) {
    console.error("literature pdf reserve-upload", error)
    return NextResponse.json({ error: "Failed to reserve upload path" }, { status: 500 })
  }
}

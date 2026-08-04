import { NextResponse } from "next/server"

import { callCatalyst } from "@/lib/catalyst-client"
import { isTableType } from "@/types/analysis"
import { catalystErrorResponse, requireSession } from "../_shared"

/**
 * GET /api/analyses/catalog?table_type=, the analyses (and their params
 * schema) available for a table shape. Pass-through to catalyst; the catalog
 * is declared there, never mirrored here.
 */
export async function GET(request: Request) {
  try {
    const s = await requireSession()
    if ("error" in s) return s.error
    if (!s.token) {
      return NextResponse.json({ error: "No active session token available." }, { status: 401 })
    }

    const tableType = new URL(request.url).searchParams.get("table_type")
    if (!isTableType(tableType)) {
      return NextResponse.json({ error: "table_type is required" }, { status: 400 })
    }

    try {
      const catalog = await callCatalyst<undefined, unknown>(
        `/analysis/catalog?table_type=${encodeURIComponent(tableType)}`,
        undefined,
        s.token,
        { method: "GET" }
      )
      return NextResponse.json(catalog)
    } catch (e: unknown) {
      const mapped = catalystErrorResponse(e)
      if (mapped) return mapped
      throw e
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load analysis catalog"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

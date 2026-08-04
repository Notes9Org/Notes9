import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { CatalystHttpError, CatalystUnavailableError } from "@/lib/catalyst-client"

/**
 * Every column of `public.analyses` EXCEPT `code`.
 *
 * `code` is the generated runtime script, server-side only, and it must never
 * reach a client. Always select with this list; never `select("*")`.
 */
export const ANALYSIS_COLUMNS = [
  "id",
  "user_id",
  "project_id",
  "experiment_id",
  "organization_id",
  "title",
  "table_type",
  "analysis_type",
  "runtime",
  "analysis_spec",
  "source_data_id",
  "source_ref",
  "source_fingerprint",
  "source_analysis_ids",
  "results",
  "figure_spec",
  "figure_data_id",
  "status",
  "error",
  "ai_provenance",
  "created_at",
  "updated_at",
].join(", ")

/**
 * Auth gate for every /api/analyses route: verified user + the Supabase access
 * token the catalyst backend expects as its bearer.
 *
 * Usage: `const s = await requireSession(); if ("error" in s) return s.error`
 */
export async function requireSession() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const { data } = await supabase.auth.getSession()
  return {
    supabase,
    userId: user.id,
    token: data.session?.access_token?.trim() ?? "",
  }
}

/** Map a catalyst failure onto a proxy response, preserving its 4xx detail. */
export function catalystErrorResponse(e: unknown) {
  if (e instanceof CatalystUnavailableError) {
    return NextResponse.json({ error: "Analysis service unavailable" }, { status: 503 })
  }
  if (e instanceof CatalystHttpError) {
    const detail =
      (e.body as { detail?: string } | undefined)?.detail ?? "Analysis request failed"
    // 4xx is the user's spec/data; anything else is ours to own as a 502.
    const status = e.status >= 400 && e.status < 500 ? e.status : 502
    return NextResponse.json({ error: detail }, { status })
  }
  return null
}

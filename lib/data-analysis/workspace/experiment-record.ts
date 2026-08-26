/**
 * Reading the notes9 experiment record for the analysis workspace.
 *
 * The only I/O in the design-inference path. It is read-only, it never blocks
 * first render, and it never throws into the caller: an analysis must still
 * open when the record is unreachable, because a sheet the user can see is
 * worth more than a cross-check they cannot. A null return means "no record
 * to check against", which the semantic layer treats as file-only inference —
 * exactly the behaviour that existed before this file.
 *
 * There is no `GET /api/experiments/[id]`, and the one existing route under
 * `app/api/experiments/**` serves workbook bytes, not the record. So this uses
 * the supabase browser client directly, which is how the rest of the workspace
 * reads its own data (`lib/data-analysis/saved-analysis.ts`,
 * `components/data-analysis/save-chart-dialog.tsx`). RLS applies to every
 * query below, so this can only ever see experiments the viewer may see.
 */

import { createClient } from "@/lib/supabase/client"
import type { ExperimentRecord } from "@/lib/data-analysis/semantic/record"

/** A samples row, narrowed to the two fields the design cross-check reads. */
interface SampleRow {
  sample_code: string | null
  sample_type: string | null
}

const isSampleRow = (v: unknown): v is SampleRow =>
  typeof v === "object" && v !== null && ("sample_code" in v || "sample_type" in v)

/** `parameters.replicates`, when the assay declares a positive integer count. */
function replicatesFrom(params: unknown): number | null {
  if (typeof params !== "object" || params === null) return null
  const value = (params as Record<string, unknown>).replicates
  const n = typeof value === "number" ? value : Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

const text = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim()
  return t === "" ? null : t
}

/**
 * The record for one experiment, or null when there is nothing to check.
 *
 * SSR-guarded: on the server there is no browser client and no viewer session,
 * so it returns null rather than constructing one. Callers run it from an
 * effect after mount, so the first render never waits on it.
 */
export async function fetchExperimentRecord(
  experimentId: string | null | undefined
): Promise<ExperimentRecord | null> {
  if (!experimentId) return null
  // Frontend guard: this path must never run during SSR or hydration.
  if (typeof window === "undefined") return null

  try {
    const supabase = createClient()

    // Samples reach an experiment two ways: the original `samples.experiment_id`
    // FK and the `sample_experiments` junction that superseded it. Both are
    // still populated, so both are read and merged — using only one silently
    // under-reports the experiment on data written through the other path.
    const [direct, linked, assays] = await Promise.all([
      supabase
        .from("samples")
        .select("sample_code, sample_type")
        .eq("experiment_id", experimentId),
      supabase
        .from("sample_experiments")
        .select("sample:samples(sample_code, sample_type)")
        .eq("experiment_id", experimentId),
      supabase
        .from("experiment_assays")
        .select("parameters, assay:assays(default_parameters)")
        .eq("experiment_id", experimentId),
    ])

    const rows: SampleRow[] = []
    for (const row of direct.data ?? []) if (isSampleRow(row)) rows.push(row)
    for (const row of linked.data ?? []) {
      // A `!inner`-less embed yields an object, but PostgREST returns an array
      // shape for some relationship configurations; accept both.
      const sample = (row as { sample?: unknown }).sample
      const candidates = Array.isArray(sample) ? sample : [sample]
      for (const c of candidates) if (isSampleRow(c)) rows.push(c)
    }

    const subjects = new Set<string>()
    const groups = new Set<string>()
    for (const row of rows) {
      const code = text(row.sample_code)
      if (code) subjects.add(code)
      const type = text(row.sample_type)
      if (type) groups.add(type)
    }

    // A per-experiment override beats the assay's default, which is what
    // `experiment_assays.parameters` is for.
    let replicates: number | null = null
    for (const row of assays.data ?? []) {
      const r = row as { parameters?: unknown; assay?: unknown }
      const assay = Array.isArray(r.assay) ? r.assay[0] : r.assay
      const fallback =
        typeof assay === "object" && assay !== null
          ? replicatesFrom((assay as Record<string, unknown>).default_parameters)
          : null
      const declared = replicatesFrom(r.parameters) ?? fallback
      if (declared !== null) {
        replicates = declared
        break
      }
    }

    // Nothing registered means nothing to cross-check against. Returning null
    // keeps the caller on pure file inference rather than handing it an empty
    // record that would read as "the experiment has zero groups".
    if (subjects.size === 0 && groups.size === 0 && replicates === null) return null

    return {
      experimentId,
      subjects: [...subjects],
      groups: [...groups],
      replicates,
      // No column stores a declared design yet; see ExperimentRecord.design.
      design: null,
    }
  } catch {
    // An unreachable record must never stop a sheet from opening.
    return null
  }
}

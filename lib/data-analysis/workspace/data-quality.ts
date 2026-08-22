import type { ColumnProfile } from "@/lib/data-analysis/semantic/infer"
import { COERCIBLE_SHARE_THRESHOLD } from "@/lib/data-analysis/semantic/infer"
import { grubbs } from "@/lib/data-analysis/statistics"
import type { AnalysisSpec, Transform } from "@/lib/data-analysis/spec/analysis-spec"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { describeTransform } from "@/lib/data-analysis/provenance"
import { prepOffers, type PreparedColumn } from "@/lib/data-analysis/workspace/prep-offers"

/**
 * DATA QUALITY — the findings behind the review a researcher works through
 * after attaching a file (Tier 0, "Data preparation").
 *
 * Deliberately free of any model call. Every detector here is a pure function
 * over column statistics and every fix is a typed spec mutation, so the receipt
 * the researcher reads is arithmetic they could redo by hand. A summary the
 * model wrote would be precisely what §3.2 forbids — and the summary is the
 * part that has to be trusted.
 *
 * TWO SEVERITIES, and the split is the whole governance story:
 *
 *   `structural` — the file is misread as written. `"12.3 ng/mL"` is not a
 *     number and `"<LOD"` is not a measurement. Repairing these changes no
 *     result the researcher could have wanted, so they auto-apply and are
 *     reported as applied-with-undo.
 *
 *   `decision` — anything that moves a number or an n: which outliers go, how
 *     missing values are disposed of, whether to log, whether replicates
 *     collapse. These are never automatic. §8.1 exists because a tool that
 *     removes points until the bars show stars is a p-hacking machine, and the
 *     defence is not to withhold the capability but to make every use of it
 *     say its own name.
 *
 * `findFindings` is pure: `now` and `actor` are parameters rather than reads of
 * the clock, so a fixture produces the same findings on every run and the
 * exclusion timestamps in tests are the test's own.
 */

export type FindingSeverity = "structural" | "decision"

export interface FindingAction {
  label: string
  /** Empty means "leave as is" — always offered, always explicit. */
  mutations: SpecMutation[]
  /**
   * How to undo `mutations` when the researcher changes their mind and picks a
   * different action on the same finding. Only needed where the inverse cannot
   * be derived from the mutation itself: `data.addTransform` and
   * `data.excludeRow` invert structurally (drop the transform, restore the
   * row), but `roles.set` overwrites the whole role list, so the prior list has
   * to be captured here, at detection time, while it is still known.
   */
  revert?: SpecMutation[]
}

/**
 * Do these two transforms denote the same pipeline step? Compares the fields
 * that give a transform its identity, so a spec round-tripped through
 * `parseSpec` (defaults filled, keys re-ordered) still matches the transform a
 * finding authored.
 */
function sameTransform(a: Transform, b: Transform): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case "collapseReplicates": {
      const other = b as Extract<Transform, { kind: "collapseReplicates" }>
      return (
        a.statistic === other.statistic &&
        a.by.length === other.by.length &&
        a.by.every((c, i) => c === other.by[i])
      )
    }
    case "coerceNumeric": {
      const other = b as Extract<Transform, { kind: "coerceNumeric" }>
      return a.column === other.column
    }
    default:
      // Anything a finding does not author falls back to structural equality.
      return JSON.stringify(a) === JSON.stringify(b)
  }
}

/**
 * The mutations that undo `action`, for when the researcher picks a different
 * action on a finding they have already answered. Without this, switching from
 * "Exclude it" to "Keep it" left the exclusion in the spec while the UI showed
 * "Keep it" selected — the figure and the label disagreed.
 *
 * `action.revert` wins when present (see FindingAction). Otherwise the inverse
 * is structural: drop the transform we added, restore the row we excluded.
 * Transform indices are resolved against the LIVE spec and removed
 * highest-first, so removing one does not shift the next.
 *
 * REACHABILITY, as of this change: none of it fires yet. Every decision
 * detector filters itself out once answered — `constantColumns` skips roles
 * already "ignore", `duplicateRows` drops rows already in spec.exclusions, and
 * `technicalReplicates` bails when a collapseReplicates transform exists — and
 * `decisionPending` is recomputed live, so an answered finding leaves the list
 * and the gate can never offer a second choice on it. That the gate tracks
 * `chosen` per finding and renders a selected state says the intent was for
 * answered findings to stay revisable; making them stay is a gate-level change
 * (hold the list stable while open) that is deliberately NOT made here, because
 * the live derivation was itself added to fix an arrival/input race. This stays
 * correct and ready for that fix rather than being written twice.
 */
export function revertActionMutations(
  spec: AnalysisSpec,
  action: FindingAction,
): SpecMutation[] {
  if (action.revert) return action.revert

  const restores: SpecMutation[] = []
  const removeIndices: number[] = []
  for (const m of action.mutations) {
    if (m.kind === "data.excludeRow") {
      restores.push({ kind: "data.restoreRow", rowId: m.exclusion.rowId })
    } else if (m.kind === "data.addTransform") {
      // Matched on a stable identity, NOT JSON.stringify equality. derivedSpec
      // is rebuilt through parseSpec whenever aiOverlay is non-empty, which
      // fills schema defaults and re-orders keys — so a serialization compare
      // silently fails to match, findIndex returns -1, and the removal is
      // dropped, leaving the old transform applied under the new label.
      const index = spec.transforms.findIndex((t) => sameTransform(t, m.transform))
      if (index >= 0) removeIndices.push(index)
    }
  }
  return [
    ...restores,
    ...removeIndices
      .sort((a, b) => b - a)
      .map((index) => ({ kind: "data.removeTransform" as const, index })),
  ]
}

export interface Finding {
  id: string
  severity: FindingSeverity
  /** Null for findings about the table as a whole, e.g. duplicate rows. */
  column: string | null
  /** What is wrong, in the researcher's terms. */
  summary: string
  /** The counts or statistic behind it. Never a bare assertion. */
  evidence: string
  actions: FindingAction[]
  /** Index into `actions`. Null when the tool should not have a preference. */
  recommended: number | null
}

/**
 * Group keys are built by joining cell values, so the separator must be one no
 * cell can contain. A space would make `["a b", "c"]` and `["a", "b c"]` the
 * same group.
 */
const KEY_SEP = String.fromCharCode(31)

/** Above this share, "duplicates" are the shape of the data, not a defect. */
const MAX_DUPLICATE_SHARE = 0.5
/** Grubbs needs a real n before its verdict means anything. */
const MIN_GRUBBS_N = 7
const GRUBBS_ALPHA = 0.05
/** Replicates worth collapsing: at least this many rows per group. */
const MIN_REPLICATES = 2
/** Below this share of rows participating, replication is not the explanation. */
const MIN_REPLICATED_SHARE = 0.5

const LEAVE_AS_IS: FindingAction = { label: "Leave as is", mutations: [] }

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function groupKey(columns: string[], values: Record<string, unknown>): string {
  return columns.map((c) => String(values[c] ?? "")).join(KEY_SEP)
}

/* ── structural: the file is misread as written ────────────────────────────*/

/**
 * A numeric column carrying text. Covers both shapes in one finding per column,
 * because they arrive together — a plate export writes `"<LOD"` into the same
 * column it writes `"0.42 ng/mL"` into, and asking twice about one column reads
 * as two problems.
 */
function contaminatedColumns(spec: AnalysisSpec, prepared: PreparedColumn[]): Finding[] {
  const already = new Set(
    spec.transforms.filter((t) => t.kind === "coerceNumeric").map((t) => t.column),
  )
  const out: Finding[] = []
  for (const p of prepared) {
    if (already.has(p.column)) continue
    if (p.contaminants.length === 0 && p.unitSuffix === null) continue
    // Below the threshold the numbers are the anomaly, not the text: a "Notes"
    // column that happens to hold three numeric readings is not a broken
    // measurement column and must not be offered a coercion.
    if (p.numericShareAfterCoercion < COERCIBLE_SHARE_THRESHOLD) continue
    // Nothing to repair: the column already parses cleanly end to end.
    if (p.numericShare >= 1 && p.unitSuffix === null) continue

    const tokens = p.contaminants.map((c) => c.token)
    const evidence: string[] = []
    if (p.contaminants.length) {
      evidence.push(p.contaminants.map((c) => `"${c.token}" x${c.count}`).join(", "))
    }
    if (p.unitSuffix !== null) {
      evidence.push(`unit "${p.unitSuffix.trim()}" on every value`)
    }

    const actions: FindingAction[] = [
      {
        label: tokens.length ? "Read the text as missing" : "Remove the unit",
        mutations: [
          {
            kind: "data.addTransform",
            transform: {
              kind: "coerceNumeric",
              column: p.column,
              tokensToMissing: tokens,
              stripSuffix: p.unitSuffix,
            },
          },
        ],
      },
      { label: "Keep as text", mutations: [] },
    ]

    out.push({
      id: `coerce:${p.column}`,
      severity: "structural",
      column: p.column,
      summary: `"${p.column}" holds text where numbers are expected`,
      evidence: `${evidence.join("; ")} — ${Math.round(
        p.numericShareAfterCoercion * 100,
      )}% reads as numeric once repaired`,
      actions,
      recommended: 0,
    })
  }
  return out
}

/* ── decision: anything that moves a number or an n ────────────────────────*/

function duplicateRows(
  spec: AnalysisSpec,
  table: Table,
  now: string,
  actor: string,
): Finding[] {
  const alreadyExcluded = new Set(spec.exclusions.map((e) => e.rowId))
  const firstSeen = new Set<string>()
  const repeats: string[] = []
  for (const row of table.rows) {
    const key = groupKey(table.columns, row.values)
    if (firstSeen.has(key)) {
      if (!alreadyExcluded.has(row.rowId)) repeats.push(row.rowId)
      continue
    }
    firstSeen.add(key)
  }
  if (repeats.length === 0) return []
  // A table that is mostly duplicates is not a table with a duplicate problem;
  // it is long-format data whose key columns we have not been told about.
  if (repeats.length / table.rows.length > MAX_DUPLICATE_SHARE) return []

  const actions: FindingAction[] = [
    {
      // Excluded, not deleted. A duplicate is still a row that was in the file,
      // and §8.1 wants it greyed on the figure with a reason attached rather
      // than silently gone. Keeping the first occurrence is the only defensible
      // choice — which of two identical rows survives cannot matter.
      label: "Exclude the repeats",
      mutations: repeats.map((rowId) => ({
        kind: "data.excludeRow",
        exclusion: {
          rowId,
          reasonKind: "other",
          reasonText: "Exact duplicate of an earlier row in the source file",
          method: null,
          excludedBy: actor,
          excludedAt: now,
        },
      })),
    },
    LEAVE_AS_IS,
  ]

  return [
    {
      id: "duplicateRows",
      severity: "decision",
      column: null,
      summary: `${plural(repeats.length, "row")} repeated exactly`,
      evidence: `${table.rows.length} rows, ${firstSeen.size} distinct — every value matches across all ${plural(
        table.columns.length,
        "column",
      )}`,
      actions,
      recommended: null,
    },
  ]
}

/**
 * Grubbs on each numeric response column. The finding never carries "remove
 * this" as a recommendation — §8.1 is explicit that the assistant will not
 * action outlier removal, only surface it and demand a reason.
 */
function grubbsOutliers(
  spec: AnalysisSpec,
  table: Table,
  prepared: PreparedColumn[],
  now: string,
  actor: string,
): Finding[] {
  const responses = new Set(
    spec.roles.filter((r) => r.role === "response").map((r) => r.column),
  )
  const excluded = new Set(spec.exclusions.map((e) => e.rowId))
  const out: Finding[] = []

  for (const p of prepared) {
    if (p.type !== "numeric" || !responses.has(p.column)) continue
    const points = table.rows
      .filter((r) => !excluded.has(r.rowId))
      .map((r) => ({ rowId: r.rowId, value: Number(r.values[p.column]) }))
      .filter((d) => Number.isFinite(d.value))
    if (points.length < MIN_GRUBBS_N) continue

    const result = grubbs(
      points.map((d) => d.value),
      GRUBBS_ALPHA,
    )
    if (!result || result.outlier === null || result.p >= GRUBBS_ALPHA) continue

    const hit = points.find((d) => d.value === result.outlier)
    if (!hit) continue

    const actions: FindingAction[] = [
      {
        label: "Exclude it (records the method)",
        mutations: [
          {
            kind: "data.excludeRow",
            exclusion: {
              rowId: hit.rowId,
              reasonKind: "statistical-outlier",
              reasonText: null,
              method: { name: "Grubbs", params: { alpha: GRUBBS_ALPHA } },
              excludedBy: actor,
              excludedAt: now,
            },
          },
        ],
      },
      { label: "Keep it", mutations: [] },
    ]

    out.push({
      id: `grubbs:${p.column}:${hit.rowId}`,
      severity: "decision",
      column: p.column,
      summary: `One value in "${p.column}" is a statistical outlier`,
      evidence: `${result.outlier} — Grubbs ${result.stat[0].label}=${result.stat[0].value.toFixed(3)}, p=${result.p.toFixed(4)}, alpha=${GRUBBS_ALPHA}, n=${points.length}`,
      actions,
      // No recommendation, on purpose. See §8.1.
      recommended: null,
    })
  }
  return out
}

/**
 * Rows that agree on every design column are technical replicates. Collapsing
 * them is a real statistical choice — it changes n from wells to samples — so
 * it is offered, never assumed.
 */
function technicalReplicates(spec: AnalysisSpec, table: Table): Finding[] {
  if (spec.transforms.some((t) => t.kind === "collapseReplicates")) return []
  const design = spec.roles
    .filter((r) => r.role !== "response" && r.role !== "ignore")
    .map((r) => r.column)
  const responses = spec.roles.filter((r) => r.role === "response").map((r) => r.column)
  if (design.length === 0 || responses.length === 0) return []

  const groups = new Map<string, number>()
  for (const row of table.rows) {
    const key = groupKey(design, row.values)
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const replicated = [...groups.values()]
    .filter((n) => n >= MIN_REPLICATES)
    .reduce((a, b) => a + b, 0)
  if (replicated === 0) return []
  // Every group being a singleton is not replication, it is a design column we
  // have not identified; only offer when most rows participate.
  if (replicated / table.rows.length < MIN_REPLICATED_SHARE) return []

  // ONE transform, not one per response column. `CollapseReplicates` is
  // {kind, by, statistic} — it has no `column` field, and the resolver collapses
  // every numeric column in a single pass. Emitting one per response therefore
  // produced N byte-identical transforms: the provenance card and the prep
  // receipt each printed the same line N times, and Undo removed them one by one.
  const collapse = (statistic: "mean" | "median"): FindingAction => ({
    label: `Collapse to the ${statistic}`,
    mutations: [
      {
        kind: "data.addTransform",
        transform: { kind: "collapseReplicates", by: design, statistic },
      },
    ],
  })

  return [
    {
      id: "collapseReplicates",
      severity: "decision",
      column: null,
      summary: "Rows repeat across the same conditions — technical replicates",
      evidence: `${groups.size} distinct combination${
        groups.size === 1 ? "" : "s"
      } of ${plural(design.length, "design column")} across ${plural(
        table.rows.length,
        "row",
      )}; collapsing changes n to ${groups.size}`,
      actions: [collapse("mean"), collapse("median"), { label: "Keep every replicate", mutations: [] }],
      recommended: null,
    },
  ]
}

/** A column with one value carries no information and cannot hold a role. */
function constantColumns(spec: AnalysisSpec, prepared: PreparedColumn[]): Finding[] {
  const roled = new Map(spec.roles.map((r) => [r.column, r.role]))
  const out: Finding[] = []
  for (const p of prepared) {
    if (p.count === 0 || p.cardinality !== 1) continue
    const role = roled.get(p.column)
    if (role === undefined || role === "ignore") continue

    const actions: FindingAction[] = [
      {
        label: "Drop it from the analysis",
        mutations: [
          {
            kind: "roles.set",
            roles: spec.roles.map((r) =>
              r.column === p.column ? { ...r, role: "ignore" as const, source: "user" as const } : r,
            ),
          },
        ],
        // roles.set overwrites the whole list, so its inverse cannot be derived
        // from the mutation — capture the prior roles here, while we hold them.
        revert: [{ kind: "roles.set", roles: spec.roles }],
      },
      LEAVE_AS_IS,
    ]

    out.push({
      id: `constant:${p.column}`,
      severity: "decision",
      column: p.column,
      summary: `"${p.column}" is the same in every row`,
      evidence: `Only value: "${p.levels[0] ?? ""}" across ${plural(p.count, "row")}`,
      actions,
      recommended: 0,
    })
  }
  return out
}

/* ── the existing pipeline offers, re-expressed ────────────────────────────*/

/**
 * `prepOffers` already produces missing-value, skew, wide-format, rare-level
 * and normalise-to-control proposals with evidence and typed mutations. They
 * are lifted rather than reimplemented so the pipeline bar and the gate can
 * never disagree about what the data needs.
 */
function fromPrepOffers(spec: AnalysisSpec, prepared: PreparedColumn[]): Finding[] {
  return prepOffers(spec, prepared).map((offer) => ({
    id: `offer:${offer.id}`,
    severity: "decision" as const,
    column: null,
    summary: offer.summary,
    evidence: offer.evidence,
    actions: [{ label: "Apply", mutations: offer.apply }, LEAVE_AS_IS],
    recommended: null,
  }))
}

/* ── entry point ───────────────────────────────────────────────────────────*/

export function findFindings(
  spec: AnalysisSpec,
  table: Table,
  prepared: PreparedColumn[],
  now: string,
  actor: string,
): Finding[] {
  return [
    // Structural first: they are cheap, certain, and repairing them changes
    // what every detector below sees.
    ...contaminatedColumns(spec, prepared),
    ...duplicateRows(spec, table, now, actor),
    ...constantColumns(spec, prepared),
    ...technicalReplicates(spec, table),
    ...grubbsOutliers(spec, table, prepared, now, actor),
    ...fromPrepOffers(spec, prepared),
  ]
}

export function structuralFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === "structural")
}

export function decisionFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === "decision")
}

export type { ColumnProfile }

/* ── the preparation receipt ───────────────────────────────────────────────*/

/**
 * What happened to the data, in the researcher's terms.
 *
 * Derived from the spec on every call rather than accumulated as the gate runs.
 * A stored receipt is a second source of truth about the same events, and the
 * failure it produces is the worst one available here: a summary that says
 * something the resolver did not do. If it is derived, it cannot drift.
 *
 * `origin` is read from the transform kind rather than tracked separately —
 * `coerceNumeric` is the only structural repair, so it is the only thing that
 * can have been applied without being asked for.
 */
export interface ReceiptLine {
  text: string
  origin: "auto" | "chosen"
  /** The mutation that reverses this line, when one exists. */
  undo: SpecMutation | null
}

export interface PrepReceipt {
  lines: ReceiptLine[]
  rowsBefore: number
  /** Null until the payload resolves; the delta is not guessed. */
  rowsAfter: number | null
}

export function prepReceipt(
  spec: AnalysisSpec,
  table: Table,
  rowsAfter: number | null,
): PrepReceipt {
  const lines: ReceiptLine[] = []

  for (const t of spec.transforms) {
    lines.push({
      text: describeTransform(t),
      origin: t.kind === "coerceNumeric" ? "auto" : "chosen",
      undo: { kind: "data.removeTransform", index: spec.transforms.indexOf(t) },
    })
  }

  if (spec.filters.length > 0) {
    lines.push({
      text: `Filtered to ${spec.filters
        .map((f) => `${f.column} ${f.op} ${String(f.value)}`)
        .join(", ")}`,
      origin: "chosen",
      undo: { kind: "data.setFilters", filters: [] },
    })
  }

  // Exclusions are grouped by reason: fifteen Grubbs lines is a wall, and the
  // thing a reader checks is how many went and under what rule, not which
  // row ids they were. The rows themselves stay on the provenance card.
  const byReason = new Map<string, number>()
  for (const e of spec.exclusions) {
    const label =
      e.method !== null ? `${e.reasonKind} (${e.method.name})` : e.reasonKind
    byReason.set(label, (byReason.get(label) ?? 0) + 1)
  }
  for (const [reason, count] of byReason) {
    lines.push({
      text: `${count} row${count === 1 ? "" : "s"} excluded — ${reason}`,
      origin: "chosen",
      undo: null,
    })
  }

  const ignored = spec.roles.filter((r) => r.role === "ignore").map((r) => r.column)
  if (ignored.length > 0) {
    lines.push({
      text: `Dropped from the analysis: ${ignored.join(", ")}`,
      origin: "chosen",
      undo: null,
    })
  }

  if (spec.analysis.missingValues !== "listwise" || spec.transforms.some((t) => t.kind === "coerceNumeric")) {
    lines.push({
      text:
        spec.analysis.missingValues === "median-impute"
          ? "Missing values replaced with the column median"
          : "Rows with any missing value dropped (listwise)",
      origin: "chosen",
      undo: null,
    })
  }

  return { lines, rowsBefore: table.rows.length, rowsAfter }
}

/**
 * The notes9 experiment record, read as design evidence (§2 Tier 1.1).
 *
 * `infer.ts` reads the file and nothing else, on purpose. This is the other
 * half: what the PROJECT already knows about the experiment, so test selection
 * can come from the design the researcher recorded rather than from the shape
 * of the numbers. That is the whole point of the feature — a competitor with
 * the same spreadsheet cannot reach the same answer, because they do not have
 * the record.
 *
 * Two rules govern everything here.
 *
 *   1. The record is the higher authority for design, so a role it knows is
 *      never re-guessed (§6.2) — it is emitted with `source: "project-record"`
 *      and `inferRoles` locks it.
 *   2. The record can still be stale or wrong, and the researcher is the one
 *      who decides. So the file is always read too, and where the two disagree
 *      the disagreement is surfaced with BOTH sides named. Nothing here ever
 *      picks a winner quietly.
 *
 * What the record can actually supply today is narrow, and deliberately not
 * dressed up as more than it is. See `ExperimentRecord`.
 */

import type { ColumnRole, DesignDeclaration } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { describeDesignMismatch, joinNotes } from "./infer"

/**
 * What the notes9 record knows about one experiment.
 *
 * These are the facts the schema genuinely holds, and no others. The
 * `experiments` row itself carries only identity, status, dates and free-text
 * `description` / `hypothesis` — nothing machine-readable about design — so
 * `design` is null in every case today and exists for when a design field is
 * added. The load-bearing fields are the ones derived from registered samples
 * and assay parameters, which are real, structured and per-experiment.
 */
export interface ExperimentRecord {
  experimentId: string
  /**
   * Registered `samples.sample_code` values: the biological units the project
   * says this experiment runs on. Unique per row in the samples table, so a
   * file column whose values match these IS the subject column, established
   * rather than guessed.
   */
  subjects: string[]
  /**
   * Distinct `samples.sample_type` values registered against the experiment:
   * the conditions the project says the samples fall into.
   */
  groups: string[]
  /**
   * Replicate count declared on the experiment's assays
   * (`experiment_assays.parameters.replicates`, falling back to
   * `assays.default_parameters.replicates`). Null when nothing declares one.
   */
  replicates: number | null
  /**
   * A design the record states outright. No column stores this yet, so it is
   * always null in production; the plumbing is here so that adding the field
   * later needs no change on this side.
   */
  design: DesignDeclaration | null
}

const norm = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim().toLowerCase()

/** Distinct non-empty values of a column, normalised for comparison. */
function columnValues(table: Table, column: string): Set<string> {
  const out = new Set<string>()
  for (const row of table.rows) {
    const v = norm(row.values[column])
    if (v !== "") out.add(v)
  }
  return out
}

/**
 * The same distinct values, keyed by their normalised form but keeping the
 * spelling the sheet used. Comparison has to be case-insensitive; a message
 * shown to the researcher has to quote their own cells back to them.
 */
function labelledValues(table: Table, column: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const row of table.rows) {
    const raw = row.values[column]
    const key = norm(raw)
    if (key !== "" && !out.has(key)) out.set(key, String(raw).trim())
  }
  return out
}

/**
 * How well a column's values are covered by a set the record registered.
 *
 * Coverage is measured against the COLUMN, not the record: a record listing 40
 * samples of which a sheet uses 8 is a normal subset of a larger experiment,
 * and should still match. The reverse — a column full of values the record has
 * never heard of — is what must not match.
 */
function coverage(values: Set<string>, known: Set<string>): { hits: number; ratio: number } {
  if (values.size === 0 || known.size === 0) return { hits: 0, ratio: 0 }
  let hits = 0
  for (const v of values) if (known.has(v)) hits++
  return { hits, ratio: hits / values.size }
}

/**
 * A column is identified by the record when nearly everything in it is a value
 * the record registered. The bar is high on purpose: locking the wrong column
 * to `project-record` would suppress inference on it permanently (§6.2), which
 * is worse than leaving it to be guessed with a visible confidence.
 */
const MATCH_RATIO = 0.8
const MIN_HITS = 2

function bestMatch(
  table: Table,
  known: string[]
): { column: string; hits: number; ratio: number } | null {
  const set = new Set(known.map(norm).filter((v) => v !== ""))
  if (set.size === 0) return null
  let best: { column: string; hits: number; ratio: number } | null = null
  for (const column of table.columns) {
    const { hits, ratio } = coverage(columnValues(table, column), set)
    if (hits < MIN_HITS || ratio < MATCH_RATIO) continue
    if (!best || ratio > best.ratio || (ratio === best.ratio && hits > best.hits)) {
      best = { column, hits, ratio }
    }
  }
  return best
}

/**
 * The roles the record already knows, ready to hand to `inferRoles` as its
 * locked set.
 *
 * A role is only claimed when the column's values ACTUALLY match what the
 * record registered — never on a column name. Name-matching is inference's
 * job, and inference marks its output as a guess; this list is presented as
 * fact, so it has to be earned by the data.
 */
export function rolesFromRecord(table: Table, record: ExperimentRecord): ColumnRole[] {
  const roles: ColumnRole[] = []

  const subject = bestMatch(table, record.subjects)
  if (subject) {
    roles.push({
      column: subject.column,
      role: "subject",
      unit: null,
      source: "project-record",
      confidence: 1,
    })
  }

  const group = bestMatch(table, record.groups)
  if (group && group.column !== subject?.column) {
    roles.push({
      column: group.column,
      role: "treatment",
      unit: null,
      source: "project-record",
      confidence: 1,
    })
  }

  return roles
}

/** The column the design treats as the grouping factor, same order as `inferDesign`. */
function factorColumn(roles: ColumnRole[]): string | null {
  return (
    roles.find((r) => r.role === "treatment")?.column ??
    roles.find((r) => r.role === "group")?.column ??
    roles.find((r) => r.role === "time")?.column ??
    null
  )
}

/**
 * Cross-check the file against the record, and say where they disagree.
 *
 * Returns the design to store: the record's declared design when it has one
 * (it is the higher authority), otherwise the file's — but either way carrying
 * `recordMismatch`, a plain-language account of every disagreement with BOTH
 * sides named. A disagreement is not an error and does not stop the analysis;
 * it is the most valuable thing this feature produces, because it is the point
 * where the researcher learns their sheet and their record are out of step.
 */
export function applyRecord(
  table: Table,
  roles: ColumnRole[],
  fileDesign: DesignDeclaration,
  record: ExperimentRecord
): DesignDeclaration {
  const notes: string[] = []

  // Groups: the classic case — the record names four arms, the file has three.
  const factor = factorColumn(roles)
  if (record.groups.length > 0 && factor) {
    const levels = labelledValues(table, factor)
    if (levels.size > 0 && levels.size !== record.groups.length) {
      notes.push(
        `The experiment record registers ${record.groups.length} sample ${record.groups.length === 1 ? "type" : "types"} (${record.groups.join(", ")}), but "${factor}" in the file has ${levels.size} ${levels.size === 1 ? "level" : "levels"} (${[...levels.values()].join(", ")}).`
      )
    }
  }

  // Subjects: a file measuring units the project never registered is either a
  // mislabelled sheet or an incomplete record. Both are worth saying out loud.
  const subjectColumn = fileDesign.subjectColumn
  if (record.subjects.length > 0 && subjectColumn) {
    const known = new Set(record.subjects.map(norm).filter((v) => v !== ""))
    const values = labelledValues(table, subjectColumn)
    const unknown = [...values.entries()].filter(([key]) => !known.has(key)).map(([, label]) => label)
    if (unknown.length > 0 && unknown.length < values.size) {
      notes.push(
        `The record registers ${record.subjects.length} ${record.subjects.length === 1 ? "sample" : "samples"} for this experiment, but "${subjectColumn}" also contains ${unknown.length} the record does not know (${unknown.slice(0, 4).join(", ")}${unknown.length > 4 ? ", ..." : ""}).`
      )
    }
  }

  // Replicates: a declared count the sheet does not carry usually means rows
  // are missing, which changes the power of every test chosen from here.
  if (record.replicates !== null && record.replicates > 0 && subjectColumn && factor) {
    const perCell = new Map<string, number>()
    for (const row of table.rows) {
      const s = norm(row.values[subjectColumn])
      const f = norm(row.values[factor])
      if (s === "" || f === "") continue
      const cell = `${s} ${f}`
      perCell.set(cell, (perCell.get(cell) ?? 0) + 1)
    }
    let observed = 0
    for (const n of perCell.values()) if (n > observed) observed = n
    if (observed > 0 && observed !== record.replicates) {
      notes.push(
        `The record declares ${record.replicates} replicates per condition; the file carries at most ${observed}.`
      )
    }
  }

  // A design the record states outright outranks the file's, but the file's
  // reading is still reported next to it rather than discarded.
  if (record.design) {
    const declared = describeDesignMismatch(record.design, fileDesign)
    if (declared) notes.push(declared)
    return {
      ...record.design,
      source: "project-record",
      recordMismatch: joinNotes(notes),
    }
  }

  // With no declared design the file's reading stands, but it is now marked as
  // having been checked against the record, and carries anything that differed.
  return { ...fileDesign, recordMismatch: joinNotes(notes) }
}

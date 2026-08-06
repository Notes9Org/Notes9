import type { Exclusion, RowFilter, Transform } from "@/lib/data-analysis/spec/analysis-spec"
import { describeMutation } from "@/lib/data-analysis/spec/mutations"

/**
 * Chip text for the pipeline bar (P5).
 *
 * Every label borrows `describeMutation`'s own wording rather than inventing a
 * second phrasing for the same concept, "excluded", "Transform", so a chip
 * reads the same as the sentence the AI reply card or the history list would
 * use for the identical fact. `data.excludeRow` already says exactly what an
 * exclusion chip needs, so that one is a direct call-through; a filter has no
 * single-item wording in `describeMutation` (`data.setFilters` only describes
 * the whole array), so that label is built here instead.
 */

const FILTER_OP_TEXT: Record<RowFilter["op"], string> = {
  eq: "=",
  neq: "≠",
  lt: "<",
  lte: "≤",
  gt: ">",
  gte: "≥",
  in: "in",
  notIn: "not in",
  contains: "contains",
  isNull: "is empty",
  notNull: "is not empty",
}

export function filterChipLabel(filter: RowFilter): string {
  const opText = FILTER_OP_TEXT[filter.op]
  if (filter.op === "isNull" || filter.op === "notNull") return `${filter.column} ${opText}`
  const value = Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value)
  return `${filter.column} ${opText} ${value}`
}

export function transformChipLabel(transform: Transform): string {
  // "Transform added: {kind}" is the right vocabulary, wrong tense for a step
  // that already exists, a chip is showing current state, not narrating an
  // edit, so only the tense is adjusted, not the wording.
  return describeMutation({ kind: "data.addTransform", transform }).replace(/^Transform added:/, "Transform:")
}

export function exclusionChipLabel(exclusion: Exclusion): string {
  return describeMutation({ kind: "data.excludeRow", exclusion })
}

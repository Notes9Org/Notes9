"use client"

import { Badge } from "@/components/ui/badge"
import type { TableType } from "@/types/analysis"
import type { ColumnAssignment, ColumnRole } from "./column-role-grid"

/**
 * The table type is DERIVED from the column roles by rule, never picked from a
 * menu — Prism makes you choose the table first and then fight it; here the
 * roles you assign decide the shape, and this chip just tells you what came out.
 */

const TABLE_TYPE_LABELS: Record<TableType, string> = {
  column: "Column",
  grouped: "Grouped",
  xy: "XY",
  contingency: "Contingency",
  survival: "Survival",
  nested: "Nested",
}

const TABLE_TYPE_REASONS: Record<TableType, string> = {
  column: "one measurement compared across one grouping column",
  grouped: "one measurement across two or more grouping columns",
  xy: "a continuous X against a measured Y",
  contingency: "two categorical columns counted against each other",
  survival: "a time column paired with an event column",
  nested: "subjects nested inside groups (repeated measures)",
}

/**
 * Maps role assignments onto one of the six table types.
 *
 * Order is precedence, not preference: survival and XY are recognised by the
 * roles that only they use, nesting outranks plain grouping, and a pair of
 * categoricals with nothing measured is a contingency table. Returns null when
 * the roles do not yet describe any analysable shape.
 */
export function deriveTableType(roles: ColumnRole[]): TableType | null {
  const count = (role: ColumnRole) => roles.filter((r) => r === role).length
  const measurements = count("measurement")
  const groups = count("group")

  if (count("time") > 0 && count("event") > 0) return "survival"
  if (count("x") > 0 && measurements > 0) return "xy"
  if (count("subject") > 0 && groups > 0 && measurements > 0) return "nested"
  if (groups >= 2 && measurements === 0) return "contingency"
  if (groups >= 2 && measurements > 0) return "grouped"
  if (groups >= 1 && measurements > 0) return "column"
  return null
}

export function TableTypeChip({
  columns,
  className,
}: {
  columns: ColumnAssignment[]
  className?: string
}) {
  const tableType = deriveTableType(columns.map((c) => c.role))

  if (!tableType) {
    return (
      <Badge variant="outline" className={className}>
        <span className="text-muted-foreground">
          Assign roles to see the table type
        </span>
      </Badge>
    )
  }

  return (
    <Badge
      variant="secondary"
      className={className}
      title={`${TABLE_TYPE_LABELS[tableType]} table — ${TABLE_TYPE_REASONS[tableType]}`}
    >
      {TABLE_TYPE_LABELS[tableType]} table
    </Badge>
  )
}

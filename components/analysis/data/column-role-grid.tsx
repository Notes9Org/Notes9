"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Columns } from "@phosphor-icons/react/ssr"

/**
 * THE key screen: every column in the picked sheet gets a role, and the roles
 * are what make an analysis possible — `AnalysisSpec.roles` (types/analysis.ts)
 * and the derived table type both come from here.
 *
 * The dtype is DETECTED from the cell values but stays overridable: a numeric
 * dose coded 1/2/3 is a group, not a measurement, and only the scientist knows.
 */

export const COLUMN_DTYPES = ["number", "text", "date", "boolean"] as const
export type ColumnDtype = (typeof COLUMN_DTYPES)[number]

/**
 * Roles map onto the spec as follows: `measurement`/`group`/`subject` are the
 * three `AnalysisSpec.roles` arrays; `x` (continuous predictor), `time` and
 * `event` are survival/regression roles the engine reads off the same arrays;
 * `ignore` drops the column entirely.
 */
export const COLUMN_ROLES = [
  "measurement",
  "group",
  "subject",
  "x",
  "time",
  "event",
  "ignore",
] as const
export type ColumnRole = (typeof COLUMN_ROLES)[number]

export const ROLE_LABELS: Record<ColumnRole, string> = {
  measurement: "Measurement",
  group: "Group",
  subject: "Subject ID",
  x: "X (continuous)",
  time: "Time",
  event: "Event",
  ignore: "Ignore",
}

const DTYPE_LABELS: Record<ColumnDtype, string> = {
  number: "Number",
  text: "Text",
  date: "Date",
  boolean: "Boolean",
}

export type ColumnAssignment = {
  /** Zero-based column index within the picked range. */
  index: number
  name: string
  role: ColumnRole
  dtype: ColumnDtype
  /** What `detectDtype` said, so an override can be shown as such. */
  detectedDtype: ColumnDtype
  /** First few non-blank values, for the "is this the column I mean?" check. */
  sample: string[]
}

const BOOLEAN_WORDS = new Set(["true", "false", "yes", "no"])

/**
 * Detects a column's type from its raw cell values. Blank cells are ignored —
 * a column with a few gaps is still numeric. An all-blank column is text.
 */
export function detectDtype(values: unknown[]): ColumnDtype {
  const present = values
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter((v) => v.length > 0)
  if (present.length === 0) return "text"

  if (present.every((v) => Number.isFinite(Number(v)))) return "number"
  if (present.every((v) => BOOLEAN_WORDS.has(v.toLowerCase()))) return "boolean"
  // Require a date separator so bare numbers never fall through to Date.parse.
  if (present.every((v) => /[-/]/.test(v) && !Number.isNaN(Date.parse(v)))) return "date"
  return "text"
}

/** The role we suggest before the user touches anything. */
export function suggestRole(dtype: ColumnDtype): ColumnRole {
  return dtype === "number" ? "measurement" : "group"
}

export function ColumnRoleGrid({
  columns,
  onChange,
  disabled = false,
}: {
  columns: ColumnAssignment[]
  onChange: (index: number, patch: Partial<Pick<ColumnAssignment, "role" | "dtype">>) => void
  disabled?: boolean
}) {
  if (columns.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Columns aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No columns to assign</EmptyTitle>
          <EmptyDescription>
            Pick a data file and a sheet above — its header row becomes the list of
            columns you assign roles to.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Column</TableHead>
            <TableHead className="hidden md:table-cell">Sample values</TableHead>
            <TableHead className="w-[140px]">Type</TableHead>
            <TableHead className="w-[180px]">Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((column) => (
            <TableRow key={column.index}>
              <TableCell className="max-w-[200px]">
                <span className="truncate block font-medium" title={column.name}>
                  {column.name}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell max-w-[240px]">
                <span className="truncate block text-muted-foreground text-xs">
                  {column.sample.length > 0 ? column.sample.join(", ") : "—"}
                </span>
              </TableCell>
              <TableCell>
                <Select
                  value={column.dtype}
                  onValueChange={(v) => onChange(column.index, { dtype: v as ColumnDtype })}
                  disabled={disabled}
                >
                  <SelectTrigger
                    aria-label={`Type for ${column.name}`}
                    className="h-8 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_DTYPES.map((dtype) => (
                      <SelectItem key={dtype} value={dtype}>
                        {DTYPE_LABELS[dtype]}
                        {dtype === column.detectedDtype ? " (detected)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select
                  value={column.role}
                  onValueChange={(v) => onChange(column.index, { role: v as ColumnRole })}
                  disabled={disabled}
                >
                  <SelectTrigger
                    aria-label={`Role for ${column.name}`}
                    className="h-8 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

"use client"

/**
 * The column-roles inspector.
 *
 * T0.4: `roles.set` and `design.set` existed, were typed, were applied and were
 * described — and nothing outside the AI path ever emitted one. Inference put a
 * role on every column and the researcher who could see it was wrong had no way
 * to say so. This is that way.
 *
 * It emits mutations rather than owning state, for the same reason the rail's
 * 23 style controls were rewired to `railEdit`: a control that moves the
 * picture and leaves no mutation cannot be undone, cannot be announced, and
 * cannot be defended against a later AI patch. The parent hands each edit to
 * `applySpecMutation`, which is the one path hand edits and assistant patches
 * share.
 *
 * `roles.set` replaces the whole array — that is the mutation's shape — so
 * every edit here rebuilds the list from what is on screen and marks only the
 * touched column as the user's.
 */

import { useId } from "react"

import type { ColumnRole, DesignDeclaration, VariableRole } from "@/lib/data-analysis/spec/analysis-spec"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"

/** Every role the spec can hold, with the wording a bench scientist uses. */
export const ROLE_LABELS: Record<VariableRole, string> = {
  subject: "Subject / ID",
  group: "Group",
  treatment: "Treatment / dose",
  time: "Time",
  replicate: "Replicate",
  response: "Measured response",
  covariate: "Covariate",
  ignore: "Ignore",
}

const ROLE_ORDER = Object.keys(ROLE_LABELS) as VariableRole[]

/** Where a role came from, in words. Never colour alone (a11y). */
const SOURCE_LABEL: Record<ColumnRole["source"], string> = {
  "project-record": "from the project record",
  inferred: "inferred",
  user: "set by you",
}

/**
 * The roles for a set of columns, filling in anything inference did not name.
 *
 * A column with no role must still get a row: the whole point of this panel is
 * the column the inference missed.
 */
export function rolesForColumns(columns: string[], roles: ColumnRole[]): ColumnRole[] {
  const byColumn = new Map(roles.map((r) => [r.column, r]))
  return columns.map(
    (column) =>
      byColumn.get(column) ?? { column, role: "ignore" as VariableRole, unit: null, source: "inferred" as const, confidence: null }
  )
}

/** One column's row, edited; the rest carried through untouched. */
export function rolesWithEdit(
  current: ColumnRole[],
  column: string,
  patch: Partial<Pick<ColumnRole, "role" | "unit">>
): ColumnRole[] {
  return current.map((r) =>
    r.column === column
      ? // `source: "user"` and `confidence: null` are the record that this is a
        // decision rather than a guess — which is what stops the next
        // derivation inferring it away again.
        { ...r, ...patch, source: "user" as const, confidence: null }
      : r
  )
}

export function RolesPanel({
  columns,
  roles,
  design,
  onMutate,
}: {
  columns: string[]
  roles: ColumnRole[]
  design: DesignDeclaration
  onMutate: (mutation: SpecMutation) => void
}) {
  const idBase = useId()
  const rows = rolesForColumns(columns, roles)

  const setRole = (column: string, patch: Partial<Pick<ColumnRole, "role" | "unit">>) =>
    onMutate({ kind: "roles.set", roles: rolesWithEdit(rows, column, patch) })

  if (columns.length === 0) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">Load a sheet to see its column roles.</p>
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.map((r) => {
          const roleId = `${idBase}-role-${r.column}`
          const unitId = `${idBase}-unit-${r.column}`
          return (
            <div key={r.column} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={roleId} className="truncate text-[11px] font-medium text-foreground/80">
                  {r.column}
                </label>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {SOURCE_LABEL[r.source]}
                  {r.confidence != null ? ` · ${Math.round(r.confidence * 100)}%` : ""}
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  id={roleId}
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                  value={r.role}
                  onChange={(e) => setRole(r.column, { role: e.target.value as VariableRole })}
                >
                  {ROLE_ORDER.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <input
                  id={unitId}
                  aria-label={`Unit for ${r.column}`}
                  className="h-8 w-20 rounded-md border border-border bg-background px-2 text-xs"
                  placeholder="unit"
                  value={r.unit ?? ""}
                  onChange={(e) => setRole(r.column, { unit: e.target.value || null })}
                />
              </div>
            </div>
          )
        })}
      </div>

      <fieldset className="space-y-2 border-t border-border pt-3">
        <legend className="sr-only">Experimental design</legend>
        <p className="text-[11px] font-medium text-foreground/80">Design</p>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={design.paired}
            onChange={(e) => onMutate({ kind: "design.set", patch: { paired: e.target.checked, source: "user" } })}
          />
          Paired / repeated on the same subjects
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={design.repeatedMeasures}
            onChange={(e) => onMutate({ kind: "design.set", patch: { repeatedMeasures: e.target.checked, source: "user" } })}
          />
          Repeated measures
        </label>
        <div className="space-y-1">
          <label htmlFor={`${idBase}-subject`} className="block text-[11px] text-muted-foreground">
            Subject column
          </label>
          <select
            id={`${idBase}-subject`}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={design.subjectColumn ?? ""}
            onChange={(e) =>
              onMutate({ kind: "design.set", patch: { subjectColumn: e.target.value || null, source: "user" } })
            }
          >
            <option value="">None</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
    </div>
  )
}

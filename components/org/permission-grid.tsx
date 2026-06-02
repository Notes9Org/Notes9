"use client"

/**
 * Placeholder for PermissionGrid component.
 * Full implementation will be added in task 7.5.
 */

import { Checkbox } from "@/components/ui/checkbox"
import { RESOURCES, ACTIONS } from "@/lib/org/permissions"

interface Permission {
  id: string
  resource: string
  action: string
  description: string | null
}

interface PermissionGridProps {
  permissions: Permission[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "?"
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function PermissionGrid({
  permissions,
  selectedIds,
  onChange,
  disabled = false,
}: PermissionGridProps) {
  function findPermission(resource: string, action: string) {
    return permissions.find(
      (p) => p.resource === resource && p.action === action
    )
  }

  function toggle(permissionId: string) {
    if (disabled) return
    onChange(
      selectedIds.includes(permissionId)
        ? selectedIds.filter((id) => id !== permissionId)
        : [...selectedIds, permissionId]
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">Resource</th>
            {ACTIONS.map((action) => (
              <th key={action} className="px-3 py-2 text-center font-medium">
                {capitalize(action)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RESOURCES.map((resource) => (
            <tr key={resource} className="border-t">
              <td className="px-3 py-2 font-medium">{capitalize(resource)}</td>
              {ACTIONS.map((action) => {
                const perm = findPermission(resource, action)
                if (!perm) return <td key={action} className="px-3 py-2 text-center">—</td>
                return (
                  <td key={action} className="px-3 py-2 text-center">
                    <Checkbox
                      checked={selectedIds.includes(perm.id)}
                      onCheckedChange={() => toggle(perm.id)}
                      disabled={disabled}
                      aria-label={`${capitalize(action)} ${capitalize(resource)}`}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

export type SampleLinkOption = {
  id: string
  label: string
  detail?: string | null
  project_id?: string | null
}

type SampleContextPickerProps = {
  label: string
  options: SampleLinkOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  emptyLabel: string
}

export function SampleContextPicker({
  label,
  options,
  selectedIds,
  onChange,
  emptyLabel,
}: SampleContextPickerProps) {
  const selected = options.filter((option) => selectedIds.includes(option.id))

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      onChange(Array.from(new Set([...selectedIds, id])))
    } else {
      onChange(selectedIds.filter((selectedId) => selectedId !== id))
    }
  }

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {selected.slice(0, 3).map((option) => (
              <Badge key={option.id} variant="secondary" className="max-w-[12rem] truncate">
                {option.label}
              </Badge>
            ))}
            {selected.length > 3 ? <Badge variant="outline">+{selected.length - 3}</Badge> : null}
          </div>
        ) : null}
      </div>
      <ScrollArea className="h-44 rounded-md border">
        <div className="space-y-1 p-2">
          {options.length > 0 ? (
            options.map((option) => {
              const checked = selectedIds.includes(option.id)
              return (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => toggle(option.id, value === true)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{option.label}</span>
                    {option.detail ? (
                      <span className="block truncate text-xs text-muted-foreground">{option.detail}</span>
                    ) : null}
                  </span>
                </label>
              )
            })
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

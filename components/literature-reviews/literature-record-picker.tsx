"use client"

import { Check, FileText } from "lucide-react"

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import type { LiteratureRecordSummary } from "@/types/literature-pdf"

interface LiteratureRecordPickerProps {
  records: LiteratureRecordSummary[]
  value: string | null
  onChange: (value: string) => void
}

export function LiteratureRecordPicker({ records, value, onChange }: LiteratureRecordPickerProps) {
  return (
    <div className="rounded-md border">
      <Command>
        <CommandInput placeholder="Search saved literature..." />
        <CommandList>
          <CommandEmpty>No matching literature records.</CommandEmpty>
          <CommandGroup>
            {records.map((record) => (
              <CommandItem key={record.id} value={`${record.title} ${record.authors ?? ""} ${record.doi ?? ""}`} onSelect={() => onChange(record.id)}>
                <div className="flex flex-1 items-start gap-3">
                  <div className="mt-0.5 rounded-md border p-1 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{record.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {[record.authors, record.publication_year, record.doi].filter(Boolean).join(" • ")}
                    </div>
                    {record.pdf_storage_path && (
                      <div className="mt-1 text-xs text-[var(--n9-accent)]">PDF already attached</div>
                    )}
                  </div>
                </div>
                <Check className={`h-4 w-4 ${value === record.id ? "opacity-100" : "opacity-0"}`} />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { FileText, FilePlus, Search, Check, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProtocolTemplate {
  id: string
  name: string
  description: string | null
  version: string
  category: string | null
  content: string
  /** Derived: first ~160 chars of plain text from content */
  contentPreview: string
}

interface ProtocolTemplatePickerProps {
  organizationId: string | null
  onSelect: (template: ProtocolTemplate | null) => void
  selectedId: string | null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function ProtocolTemplatePicker({
  organizationId,
  onSelect,
  selectedId,
}: ProtocolTemplatePickerProps) {
  const [templates, setTemplates] = useState<ProtocolTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!organizationId) return
    setIsLoading(true)
    const supabase = createClient()
    supabase
      .from("protocols")
      .select("id, name, description, version, category, content")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const items: ProtocolTemplate[] = (data ?? []).map((row: any) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          version: row.version,
          category: row.category,
          content: row.content ?? "",
          contentPreview: stripHtml(row.content ?? "").slice(0, 160),
        }))
        setTemplates(items)
        setIsLoading(false)
      })
  }, [organizationId])

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.category ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-3">
      {/* Search */}
      {templates.length > 4 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Previews show a snippet of the source protocol. After you continue, only the letterhead (titles, logos, short header lines) is copied — not the full procedure body.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {/* Blank option */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "relative flex items-start gap-3 rounded-lg border-2 p-3.5 text-left transition-all hover:border-primary/50 hover:bg-accent/40",
            selectedId === null
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-dashed border-muted-foreground/30"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FilePlus className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Blank Protocol</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Start from scratch with an empty editor
            </p>
          </div>
          {selectedId === null && (
            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          )}
        </button>

        {/* Loading skeletons */}
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3.5 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}

        {/* Template cards */}
        {!isLoading &&
          filtered.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className={cn(
                "relative flex items-start gap-3 rounded-lg border-2 p-3.5 text-left transition-all hover:border-primary/50 hover:bg-accent/40",
                selectedId === template.id
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border"
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1.5">
                  <p className="text-sm font-semibold text-foreground leading-tight truncate">
                    {template.name}
                  </p>
                  {selectedId === template.id && (
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {template.category && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                      {template.category}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 font-mono">
                    v{template.version}
                  </Badge>
                </div>
                {template.contentPreview && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-snug">
                    {template.contentPreview}
                    {template.contentPreview.length === 160 ? "…" : ""}
                  </p>
                )}
              </div>
            </button>
          ))}

        {!isLoading && filtered.length === 0 && search && (
          <div className="col-span-full text-center py-6 text-sm text-muted-foreground">
            No templates match "{search}"
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { FileText, FilePlus, Search, Check, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProtocolTemplateExtracted } from "@/lib/protocol-template-types"

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

export type ProtocolTemplateChoice =
  | { kind: "blank" }
  | { kind: "protocol"; template: ProtocolTemplate }
  | {
      kind: "document"
      id: string
      name: string
      extracted: ProtocolTemplateExtracted
    }

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function choiceMatches(a: ProtocolTemplateChoice | null, b: ProtocolTemplateChoice): boolean {
  if (!a || !b) return false
  if (a.kind !== b.kind) return false
  if (a.kind === "blank" && b.kind === "blank") return true
  if (a.kind === "protocol" && b.kind === "protocol") return a.template.id === b.template.id
  if (a.kind === "document" && b.kind === "document") return a.id === b.id
  return false
}

type DocumentTemplateRow = {
  id: string
  name: string
  extracted: ProtocolTemplateExtracted | null
}

interface ProtocolTemplatePickerProps {
  organizationId: string | null
  onSelect: (choice: ProtocolTemplateChoice) => void
  selected: ProtocolTemplateChoice | null
  /** Shorter copy for dialogs */
  compact?: boolean
}

export function ProtocolTemplatePicker({
  organizationId,
  onSelect,
  selected,
  compact = false,
}: ProtocolTemplatePickerProps) {
  const [protocolTemplates, setProtocolTemplates] = useState<ProtocolTemplate[]>([])
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplateRow[]>([])
  const [loadingProtocols, setLoadingProtocols] = useState(false)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!organizationId) return
    setLoadingProtocols(true)
    const supabase = createClient()
    supabase
      .from("protocols")
      .select("id, name, description, version, category, content")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const items: ProtocolTemplate[] = (data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          name: row.name as string,
          description: (row.description as string | null) ?? null,
          version: row.version as string,
          category: (row.category as string | null) ?? null,
          content: (row.content as string) ?? "",
          contentPreview: stripHtml((row.content as string) ?? "").slice(0, 160),
        }))
        setProtocolTemplates(items)
        setLoadingProtocols(false)
      })
  }, [organizationId])

  useEffect(() => {
    if (!organizationId) return
    setLoadingDocuments(true)
    fetch("/api/protocol-templates")
      .then((r) => r.json())
      .then((data) => {
        const rows = (data.templates ?? []) as {
          id: string
          name: string
          extracted: ProtocolTemplateExtracted | null
        }[]
        setDocumentTemplates(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            extracted: r.extracted,
          }))
        )
      })
      .catch(() => setDocumentTemplates([]))
      .finally(() => setLoadingDocuments(false))
  }, [organizationId])

  const q = search.toLowerCase().trim()

  const filteredDoc = useMemo(() => {
    return documentTemplates.filter((t) => {
      if (!q) return true
      return t.name.toLowerCase().includes(q)
    })
  }, [documentTemplates, q])

  const filteredProtocol = useMemo(() => {
    return protocolTemplates.filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q)
    )
  }, [protocolTemplates, q])

  const isLoading = loadingProtocols || loadingDocuments
  const showSearch =
    documentTemplates.length + protocolTemplates.length > 4 || search.length > 0

  const blankSelected = selected ? choiceMatches(selected, { kind: "blank" }) : false

  return (
    <div className="space-y-3">
      {showSearch && (
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

      {!compact && (
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground/90">Uploaded documents</strong> use headings and logos from your file.
          <strong className="text-foreground/90"> Library protocols</strong> copy only the letterhead (titles, logos,
          short header lines), not the full procedure. You can manage uploads under{" "}
          <span className="font-medium">Protocols → Templates</span>.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => onSelect({ kind: "blank" })}
          className={cn(
            "relative flex items-start gap-3 rounded-lg border-2 p-3.5 text-left transition-all hover:border-primary/50 hover:bg-accent/40",
            blankSelected
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-dashed border-muted-foreground/30"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FilePlus className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Blank Protocol</p>
            <p className="text-xs text-muted-foreground mt-0.5">Start from scratch with an empty editor</p>
          </div>
          {blankSelected && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
        </button>

        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3.5 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}

        {!isLoading && filteredDoc.length > 0 && (
          <div className="col-span-full text-xs font-semibold text-muted-foreground pt-1">
            Uploaded document templates
          </div>
        )}

        {!isLoading &&
          filteredDoc.map((t) => {
            const choice: ProtocolTemplateChoice = {
              kind: "document",
              id: t.id,
              name: t.name,
              extracted:
                t.extracted ?? ({ sectionHeadings: [], logos: [] } satisfies ProtocolTemplateExtracted),
            }
            const hit = selected ? choiceMatches(selected, choice) : false
            const sections = t.extracted?.sectionHeadings?.length ?? 0
            const logos = t.extracted?.logos?.length ?? 0
            return (
              <button
                key={`d-${t.id}`}
                type="button"
                onClick={() => onSelect(choice)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border-2 p-3.5 text-left transition-all hover:border-primary/50 hover:bg-accent/40",
                  hit ? "border-primary bg-primary/5 shadow-sm" : "border-border"
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Upload className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="text-sm font-semibold text-foreground leading-tight truncate">{t.name}</p>
                    {hit && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                      Document
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {sections} sections · {logos} logos
                    </span>
                  </div>
                </div>
              </button>
            )
          })}

        {!isLoading && filteredProtocol.length > 0 && (
          <div className="col-span-full text-xs font-semibold text-muted-foreground pt-1">
            Protocols in your library
          </div>
        )}

        {!isLoading &&
          filteredProtocol.map((template) => {
            const choice: ProtocolTemplateChoice = { kind: "protocol", template }
            const hit = selected ? choiceMatches(selected, choice) : false
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelect(choice)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border-2 p-3.5 text-left transition-all hover:border-primary/50 hover:bg-accent/40",
                  hit ? "border-primary bg-primary/5 shadow-sm" : "border-border"
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="text-sm font-semibold text-foreground leading-tight truncate">{template.name}</p>
                    {hit && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
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
            )
          })}

        {!isLoading && filteredDoc.length === 0 && filteredProtocol.length === 0 && q && (
          <div className="col-span-full text-center py-6 text-sm text-muted-foreground">
            No templates match &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  )
}

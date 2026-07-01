"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { FileStack, FilePlus, Search, Check, Upload } from "lucide-react"
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

function TruncateBadge({
  children,
  variant = "secondary",
  className,
}: {
  children: ReactNode
  variant?: "secondary" | "outline"
  className?: string
}) {
  return (
    <Badge
      variant={variant}
      title={typeof children === "string" ? children : undefined}
      className={cn(
        "h-5 max-w-full min-w-0 shrink truncate px-1.5 py-0 text-xs font-normal",
        className
      )}
    >
      {children}
    </Badge>
  )
}

function TemplatePickerCard({
  selected,
  onClick,
  icon,
  title,
  meta,
  badges,
  description,
  dashed,
}: {
  selected: boolean
  onClick: () => void
  icon: ReactNode
  title: string
  meta?: string
  badges?: ReactNode
  description?: string
  dashed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full min-w-0 flex-col gap-2 overflow-hidden rounded-lg border-2 p-3 text-left transition-all",
        "hover:border-primary/50 hover:bg-accent/40",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : dashed
            ? "border-dashed border-muted-foreground/30"
            : "border-border"
      )}
    >
      <div className="flex min-w-0 w-full items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{title}</p>
          {meta && (
            <p className="mt-0.5 truncate text-2xs text-muted-foreground" title={meta}>
              {meta}
            </p>
          )}
        </div>
        {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />}
      </div>

      {badges ? <div className="flex min-w-0 w-full flex-wrap gap-1">{badges}</div> : null}

      {description ? (
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{description}</p>
      ) : null}
    </button>
  )
}

type DocumentTemplateRow = {
  id: string
  name: string
  source_filename: string | null
  extracted: ProtocolTemplateExtracted | null
}

interface ProtocolTemplatePickerProps {
  organizationId: string | null
  onSelect: (choice: ProtocolTemplateChoice) => void
  selected: ProtocolTemplateChoice | null
  /** Shorter copy for dialogs */
  compact?: boolean
  /**
   * When false (default), only uploaded document templates + blank are shown.
   * Library protocols are not templates and are hidden unless explicitly enabled.
   */
  includeLibraryProtocols?: boolean
}

export function ProtocolTemplatePicker({
  organizationId,
  onSelect,
  selected,
  compact = false,
  includeLibraryProtocols = false,
}: ProtocolTemplatePickerProps) {
  const [protocolTemplates, setProtocolTemplates] = useState<ProtocolTemplate[]>([])
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplateRow[]>([])
  const [loadingProtocols, setLoadingProtocols] = useState(false)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!organizationId || !includeLibraryProtocols) {
      setProtocolTemplates([])
      setLoadingProtocols(false)
      return
    }
    setLoadingProtocols(true)
    const supabase = createClient()
    supabase
      .from("protocols")
      .select("id, name, description, version, category, content")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }: { data: Record<string, unknown>[] | null }) => {
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
  }, [organizationId, includeLibraryProtocols])

  const fetchDocumentTemplates = () => {
    if (!organizationId) return
    setLoadingDocuments(true)
    setLoadError(null)
    fetch("/api/protocol-templates")
      .then((r) => r.json())
      .then((data) => {
        const rows = (data.templates ?? []) as {
          id: string
          name: string
          source_filename?: string | null
          extracted: ProtocolTemplateExtracted | null
        }[]
        setDocumentTemplates(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            source_filename: r.source_filename ?? null,
            extracted: r.extracted,
          }))
        )
      })
      .catch((err) => {
        setLoadError("Couldn't load templates. Please retry.")
        console.error('protocol_templates_fetch_failed', err)
      })
      .finally(() => setLoadingDocuments(false))
  }

  useEffect(() => {
    fetchDocumentTemplates()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  const q = search.toLowerCase().trim()

  const filteredDoc = useMemo(() => {
    return documentTemplates.filter((t) => {
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        (t.source_filename ?? "").toLowerCase().includes(q)
      )
    })
  }, [documentTemplates, q])

  const filteredProtocol = useMemo(() => {
    if (!includeLibraryProtocols) return []
    return protocolTemplates.filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q)
    )
  }, [protocolTemplates, q, includeLibraryProtocols])

  const isLoading =
    loadingDocuments || (includeLibraryProtocols && loadingProtocols)
  const templateCount =
    documentTemplates.length + (includeLibraryProtocols ? protocolTemplates.length : 0)
  const showSearch = templateCount > 4 || search.length > 0

  const blankSelected = selected ? choiceMatches(selected, { kind: "blank" }) : false

  return (
    <div className="space-y-3">
      {showSearch && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-transparent bg-transparent pl-8 text-sm shadow-none transition-colors hover:border-border focus-visible:border-border focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
      )}

      {!compact && (
        <p className="text-xs text-muted-foreground">
          Choose an <strong className="text-foreground/90">uploaded document template</strong> from
          Protocols → Templates (DOCX/PDF letterhead and section skeleton), or start blank.
          {includeLibraryProtocols ? (
            <>
              {" "}
              You can also reuse letterhead from an existing protocol below — that copies titles and
              logos only, not the full procedure.
            </>
          ) : null}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TemplatePickerCard
          selected={blankSelected}
          onClick={() => onSelect({ kind: "blank" })}
          dashed
          icon={<FilePlus className="size-4 text-muted-foreground" />}
          title="Blank protocol"
          description="Start from scratch with an empty editor"
        />

        {isLoading &&
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}

        {!isLoading && filteredDoc.length > 0 && (
          <div className="col-span-full text-xs font-semibold text-muted-foreground pt-0.5">
            Document templates
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
            const fileLabel = t.source_filename?.trim() || null

            return (
              <TemplatePickerCard
                key={`d-${t.id}`}
                selected={hit}
                onClick={() => onSelect(choice)}
                icon={<Upload className="h-4 w-4 text-primary" />}
                title={t.name}
                meta={fileLabel ?? undefined}
                badges={
                  <>
                    <TruncateBadge>Document template</TruncateBadge>
                    <TruncateBadge variant="outline">
                      {sections} sections · {logos} logos
                    </TruncateBadge>
                  </>
                }
                description={
                  sections > 0
                    ? `Includes ${sections} section heading${sections === 1 ? "" : "s"} from your upload.`
                    : "Letterhead and structure from your uploaded file."
                }
              />
            )
          })}

        {!isLoading && loadError && (
          <div className="col-span-full rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
            {loadError}
            <button
              type="button"
              onClick={fetchDocumentTemplates}
              className="ml-2 underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !loadError && filteredDoc.length === 0 && !includeLibraryProtocols && !q && (
          <div className="col-span-full rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            No document templates yet. Upload DOCX or PDF under{" "}
            <span className="font-medium text-foreground">Protocols → Templates</span>.
          </div>
        )}

        {!isLoading && includeLibraryProtocols && filteredProtocol.length > 0 && (
          <div className="col-span-full text-xs font-semibold text-muted-foreground pt-1">
            Letterhead from existing protocol
          </div>
        )}

        {!isLoading &&
          includeLibraryProtocols &&
          filteredProtocol.map((template) => {
            const choice: ProtocolTemplateChoice = { kind: "protocol", template }
            const hit = selected ? choiceMatches(selected, choice) : false
            return (
              <TemplatePickerCard
                key={template.id}
                selected={hit}
                onClick={() => onSelect(choice)}
                icon={<FileStack className="h-4 w-4 text-primary" />}
                title={template.name}
                badges={
                  <>
                    <TruncateBadge>Letterhead only</TruncateBadge>
                    {template.category ? (
                      <TruncateBadge variant="outline">{template.category}</TruncateBadge>
                    ) : null}
                    <TruncateBadge variant="outline" className="font-mono">
                      v{template.version}
                    </TruncateBadge>
                  </>
                }
                description={
                  template.contentPreview
                    ? `${template.contentPreview}${template.contentPreview.length === 160 ? "…" : ""}`
                    : "Copies titles and logos from this protocol, not the full procedure."
                }
              />
            )
          })}

        {!isLoading && filteredDoc.length === 0 && filteredProtocol.length === 0 && q && (
          <div className="col-span-full py-6 text-center text-sm text-muted-foreground">
            No templates match &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  )
}

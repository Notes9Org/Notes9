"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { PaperEditor, DEFAULT_PAPER_TEMPLATE } from "@/components/text-editor/paper-editor"
import { usePaperAI } from "@/contexts/paper-ai-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, Download, Upload } from "lucide-react"
import { toast } from "sonner"
import { SaveStatusIndicator } from "@/components/ui/save-status"
import { useAutoSave } from "@/hooks/use-auto-save"
import { PaperActions } from "./[id]/paper-actions"
import { IS_PAPERS_MOCKED, getMockPaper, updateMockPaper } from "@/lib/papers-mock"
import { downloadLatex } from "@/lib/latex-export"
import { JOURNAL_TEMPLATES } from "@/lib/latex-templates"
import { downloadBibtex, parseBibtex, parseAuthors, type CitationForBib, type BibEntry } from "@/lib/bibtex"
import { getEffectivePublicationYear } from "@/components/text-editor/citation-utils"
import { latexToHtml } from "@/lib/latex-import"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { FileDropzone } from "@/components/ui/file-dropzone"
import { NoteExportMenu } from "@/components/note-export-menu"

function publicationYearFromBib(entry: BibEntry, title: string, journal: string): string {
  const raw = entry.year?.trim() ?? ""
  const parsed = parseInt(raw, 10)
  const yNum = !Number.isNaN(parsed) && parsed > 0 ? parsed : 0
  const y = getEffectivePublicationYear({
    year: yNum,
    title,
    journal,
    url: entry.url ?? "",
  })
  return y != null ? String(y) : ""
}

export type PaperWorkspaceProps = {
  paperId: string
  /** When set, show a back control to return to the writing hub (or elsewhere). */
  backLink?: { href: string }
  /** Called after delete or status change so parent lists/tabs can refresh. */
  onPaperMutated?: () => void
  /** Called when the paper title is saved so hub tabs / lists can update without a full refetch. */
  onPaperTitleUpdated?: (paperId: string, title: string) => void
}

function statusVariant(status: string): "default" | "outline" | "success" {
  switch (status) {
    case "draft":
      return "outline"
    case "in_review":
      return "default"
    case "published":
      return "success"
    default:
      return "outline"
  }
}

export function PaperWorkspace({ paperId, backLink, onPaperMutated, onPaperTitleUpdated }: PaperWorkspaceProps) {
  const router = useRouter()
  const id = paperId

  const [paper, setPaper] = useState<Record<string, unknown> | null>(null)
  const [titleInput, setTitleInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState("")
  const bibInputRef = useRef<HTMLInputElement>(null)
  const texInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<any>(null)
  const contentRef = useRef("")
  const paperAI = usePaperAI()

  useEffect(() => {
    const fetchPaper = async () => {
      setLoading(true)
      if (IS_PAPERS_MOCKED) {
        const mock = getMockPaper(id)
        if (!mock) {
          toast.error("Paper not found")
          router.push("/papers")
          return
        }
        setPaper(mock as Record<string, unknown>)
        const c = mock.content && mock.content.trim().length > 0 ? mock.content : DEFAULT_PAPER_TEMPLATE
        setContent(c)
        setLoading(false)
        return
      }

      const supabase = createClient()
      const { data, error } = await supabase.from("papers").select("*").eq("id", id).single()

      if (error || !data) {
        toast.error("Paper not found")
        router.push("/papers")
        return
      }

      setPaper(data as Record<string, unknown>)
      const c = data.content && String(data.content).trim().length > 0 ? String(data.content) : DEFAULT_PAPER_TEMPLATE
      setContent(c)
      setLoading(false)
    }
    void fetchPaper()
  }, [id, router])

  useEffect(() => {
    if (!paper) return
    setTitleInput(((paper.title as string) || "").trim() || "Untitled")
  }, [id, paper?.title])

  const handleAutoSave = useCallback(
    async (newContent: string) => {
      if (IS_PAPERS_MOCKED) {
        updateMockPaper(id, { content: newContent })
        return
      }

      const supabase = createClient()
      const { error } = await supabase
        .from("papers")
        .update({ content: newContent, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
    },
    [id]
  )

  const { status: saveStatus, debouncedSave } = useAutoSave({
    onSave: handleAutoSave,
    delay: 2000,
    enabled: !loading && !!paper,
  })

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent)
      debouncedSave(newContent)
    },
    [debouncedSave]
  )

  const handleEditorReady = useCallback((editor: any) => {
    editorRef.current = editor
  }, [])

  const commitTitle = useCallback(async () => {
    const next = titleInput.trim() || "Untitled"
    const current = ((paper?.title as string) || "").trim() || "Untitled"
    if (!paper || next === current) return

    if (IS_PAPERS_MOCKED) {
      updateMockPaper(id, { title: next })
      setPaper((p) => (p ? { ...p, title: next } : p))
      onPaperTitleUpdated?.(id, next)
      router.refresh()
      return
    }

    const supabase = createClient()
    const { error } = await supabase
      .from("papers")
      .update({ title: next, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      toast.error("Could not save title")
      setTitleInput(current)
      return
    }
    setPaper((p) => (p ? { ...p, title: next } : p))
    onPaperTitleUpdated?.(id, next)
    router.refresh()
  }, [titleInput, paper, id, onPaperTitleUpdated, router])

  useEffect(() => {
    contentRef.current = content
  }, [content])

  const displayTitle = titleInput.trim() || "Untitled"

  useEffect(() => {
    if (!paper || !paperAI) return
    paperAI.register({
      id,
      title: displayTitle,
      getContent: () => contentRef.current,
      onInsert: (html: string) => {
        const editor = editorRef.current
        if (!editor) return
        editor.chain().focus().insertContent(html).run()
      },
      getEditorContext: () => {
        const editor = editorRef.current
        if (!editor) return { before: "", after: "" }
        const { state } = editor
        const { doc, selection } = state
        const pos = selection.anchor
        const textBefore = doc.textBetween(Math.max(0, pos - 200), pos, "\n")
        const textAfter = doc.textBetween(pos, Math.min(doc.content.size, pos + 200), "\n")
        return { before: textBefore, after: textAfter }
      },
    })
    return () => paperAI.unregister()
  }, [paper, paperAI, displayTitle, id])

  const extractCitationsFromContent = useCallback((): CitationForBib[] => {
    const linkRegex = /<a[^>]*>\[\d+\]<\/a>/g
    const citations: CitationForBib[] = []
    const seen = new Set<string>()
    let match: RegExpExecArray | null

    while ((match = linkRegex.exec(content)) !== null) {
      const tag = match[0]
      const titleMatch = tag.match(/data-paper-title="([^"]*)"/)
      const authorsMatch = tag.match(/data-paper-authors="([^"]*)"/)
      const yearMatch = tag.match(/data-paper-year="([^"]*)"/)
      const journalMatch = tag.match(/data-paper-journal="([^"]*)"/)
      const doiMatch = tag.match(/data-paper-doi="([^"]*)"/)
      const urlMatch = tag.match(/href="([^"]*)"/)

      const citeTitle = titleMatch?.[1]?.replace(/&quot;/g, '"') || ""
      if (!citeTitle || seen.has(citeTitle)) continue
      seen.add(citeTitle)

      let authors: string[] = []
      if (authorsMatch) {
        try {
          authors = JSON.parse(authorsMatch[1].replace(/&quot;/g, '"'))
        } catch {
          /* ignore */
        }
      }

      citations.push({
        title: citeTitle,
        authors,
        year: yearMatch ? parseInt(yearMatch[1]) || 0 : 0,
        journal: journalMatch?.[1]?.replace(/&quot;/g, '"') || undefined,
        doi: doiMatch?.[1] || undefined,
        url: urlMatch?.[1] || undefined,
      })
    }

    return citations
  }, [content])

  const handleBibImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        if (!text) return

        const entries = parseBibtex(text)
        if (entries.length === 0) {
          toast.error("No entries found in .bib file")
          return
        }

        let refsHtml = "<h2>References</h2>"
        entries.forEach((entry, idx) => {
          const authors = parseAuthors(entry.author)
          const authorStr = authors.length > 0 ? authors.join(", ") : ""
          const t = entry.title || "Untitled"
          const journal = entry.journal || ""
          const year = publicationYearFromBib(entry, t, journal)
          const doi = entry.doi || ""

          if (authorStr) {
            refsHtml += year
              ? `<p>[${idx + 1}] ${authorStr} (${year}). ${t}.`
              : `<p>[${idx + 1}] ${authorStr}. ${t}.`
          } else {
            refsHtml += year
              ? `<p>[${idx + 1}] ${t}. (${year}).`
              : `<p>[${idx + 1}] ${t}.`
          }
          if (journal) refsHtml += ` <em>${journal}</em>.`
          if (doi) refsHtml += ` DOI: ${doi}`
          refsHtml += `</p>`
        })

        setContent((prev) => {
          const updated = prev + refsHtml
          debouncedSave(updated)
          return updated
        })

        toast.success(`Imported ${entries.length} references from .bib file`)
      }
      reader.readAsText(file)
      e.target.value = ""
    },
    [debouncedSave]
  )

  const handleTexImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (ev) => {
        const tex = ev.target?.result as string
        if (!tex) return

        const html = latexToHtml(tex)
        if (!html.trim()) {
          toast.error("Could not parse .tex file")
          return
        }

        setContent(html)
        debouncedSave(html)
        toast.success("Imported LaTeX document")
      }
      reader.readAsText(file)
      e.target.value = ""
    },
    [debouncedSave]
  )

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!paper) return null

  const status = String(paper.status || "draft")

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {backLink ? (
            <Button variant="ghost" size="icon" asChild>
              <Link href={backLink.href}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <Input
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            aria-label="Paper title"
            className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-2xl font-bold shadow-none focus-visible:ring-1 focus-visible:ring-ring/40 md:text-2xl"
          />
          <Badge variant={statusVariant(status)}>{status.replace("_", " ")}</Badge>
          <SaveStatusIndicator status={saveStatus} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title="Export">
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
              <DropdownMenuLabel>Export as LaTeX (.tex)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {JOURNAL_TEMPLATES.map((tmpl) => (
                <DropdownMenuItem
                  key={tmpl.id}
                  onClick={() => {
                    downloadLatex(content, {
                      title: displayTitle,
                      templateId: tmpl.id,
                    })
                    toast.success(`Exported as ${tmpl.name} LaTeX`)
                  }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm">{tmpl.name}</span>
                    <span className="text-xs text-muted-foreground">{tmpl.description}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Bibliography</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  const citations = extractCitationsFromContent()
                  if (citations.length === 0) {
                    toast.error("No citations found in the paper", {
                      description: "Add citations using 'Cite with AI' first.",
                    })
                    return
                  }
                  downloadBibtex(citations, displayTitle || "references")
                  toast.success(`Exported ${citations.length} references as .bib`)
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">Export BibTeX (.bib)</span>
                  <span className="text-xs text-muted-foreground">Download citations as BibTeX file</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Import dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title="Import">
                <Upload className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Import</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => texInputRef.current?.click()}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">Import LaTeX (.tex)</span>
                  <span className="text-xs text-muted-foreground">Replace paper content from a .tex file</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => bibInputRef.current?.click()}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">Import BibTeX (.bib)</span>
                  <span className="text-xs text-muted-foreground">Add references from a .bib file</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <NoteExportMenu title={displayTitle} htmlContent={content} />
          <PaperActions
            paper={{ id, title: displayTitle, status }}
            onAfterMutation={onPaperMutated}
          />
        </div>
      </div>

      <div style={{ height: "calc(100vh - 180px)" }}>
        <FileDropzone
          onFilesDrop={(files) => {
            const texFile = files.find(f => f.name.endsWith('.tex'))
            const bibFile = files.find(f => f.name.endsWith('.bib'))
            if (texFile) {
              const reader = new FileReader()
              reader.onload = (ev) => {
                const tex = ev.target?.result as string
                if (!tex) return
                const html = latexToHtml(tex)
                if (!html.trim()) { toast.error("Could not parse .tex file"); return }
                setContent(html)
                debouncedSave(html)
                toast.success("Imported LaTeX document")
              }
              reader.readAsText(texFile)
            } else if (bibFile) {
              const reader = new FileReader()
              reader.onload = (ev) => {
                const text = ev.target?.result as string
                if (!text) return
                const entries = parseBibtex(text)
                if (entries.length === 0) {
                  toast.error("No entries found in .bib file")
                  return
                }
                let refsHtml = "<h2>References</h2>"
                entries.forEach((entry, idx) => {
                  const authors = parseAuthors(entry.author)
                  const authorStr = authors.length > 0 ? authors.join(", ") : ""
                  const t = entry.title || "Untitled"
                  const journal = entry.journal || ""
                  const year = publicationYearFromBib(entry, t, journal)
                  const doi = entry.doi || ""
                  if (authorStr) {
                    refsHtml += year
                      ? `<p>[${idx + 1}] ${authorStr} (${year}). ${t}.`
                      : `<p>[${idx + 1}] ${authorStr}. ${t}.`
                  } else {
                    refsHtml += year
                      ? `<p>[${idx + 1}] ${t}. (${year}).`
                      : `<p>[${idx + 1}] ${t}.`
                  }
                  if (journal) refsHtml += ` <em>${journal}</em>.`
                  if (doi) refsHtml += ` DOI: ${doi}`
                  refsHtml += `</p>`
                })
                setContent((prev) => {
                  const updated = prev + refsHtml
                  debouncedSave(updated)
                  return updated
                })
                toast.success(`Imported ${entries.length} references from .bib file`)
              }
              reader.readAsText(bibFile)
            } else {
              toast.error("Please drop a .tex or .bib file")
            }
          }}
          accept={[".bib", ".tex"]}
          description="Drop .tex or .bib file to import"
          activeClassName="ring-4 ring-primary ring-inset bg-primary/5 rounded-xl"
          className="h-full"
        >
          <PaperEditor
            content={content}
            onChange={handleContentChange}
            minHeight="calc(100vh - 180px)"
            title={titleInput}
            onDocumentTitleChange={setTitleInput}
            onDocumentTitleCommit={() => void commitTitle()}
            autoSave
            onAutoSave={handleAutoSave}
            onEditorReady={handleEditorReady}
          />
        </FileDropzone>
      </div>

      <input
        ref={bibInputRef}
        type="file"
        accept=".bib"
        className="hidden"
        onChange={handleBibImport}
      />
      <input
        ref={texInputRef}
        type="file"
        accept=".tex"
        className="hidden"
        onChange={handleTexImport}
      />
    </div>
  )
}

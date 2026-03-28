"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { PaperEditor, DEFAULT_PAPER_TEMPLATE } from "@/components/text-editor/paper-editor"
import { usePaperAI } from "@/contexts/paper-ai-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, Download } from "lucide-react"
import { toast } from "sonner"
import { SaveStatusIndicator } from "@/components/ui/save-status"
import { useAutoSave } from "@/hooks/use-auto-save"
import { PaperActions } from "./[id]/paper-actions"
import { IS_PAPERS_MOCKED, getMockPaper, updateMockPaper } from "@/lib/papers-mock"
import { downloadLatex } from "@/lib/latex-export"
import { JOURNAL_TEMPLATES } from "@/lib/latex-templates"
import { downloadBibtex, parseBibtex, parseAuthors, type CitationForBib } from "@/lib/bibtex"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { FileDropzone } from "@/components/ui/file-dropzone"

export type PaperWorkspaceProps = {
  paperId: string
  /** When set, show a back control to return to the writing hub (or elsewhere). */
  backLink?: { href: string }
  /** Called after delete or status change so parent lists/tabs can refresh. */
  onPaperMutated?: () => void
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

export function PaperWorkspace({ paperId, backLink, onPaperMutated }: PaperWorkspaceProps) {
  const router = useRouter()
  const id = paperId

  const [paper, setPaper] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState("")
  const bibInputRef = useRef<HTMLInputElement>(null)
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

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    if (!paper || !paperAI) return
    const title = (paper.title as string) || "Untitled"
    paperAI.register({
      title,
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
  }, [paper, paperAI])

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
          const authorStr = authors.length > 0 ? authors.join(", ") : "Unknown"
          const year = entry.year || "n.d."
          const t = entry.title || "Untitled"
          const journal = entry.journal || ""
          const doi = entry.doi || ""

          refsHtml += `<p>[${idx + 1}] ${authorStr} (${year}). ${t}.`
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!paper) return null

  const title = (paper.title as string) || "Untitled"
  const status = String(paper.status || "draft")

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {backLink ? (
            <Button variant="ghost" size="icon" asChild>
              <Link href={backLink.href}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <h1 className="truncate text-2xl font-bold">{title}</h1>
          <Badge variant={statusVariant(status)}>{status.replace("_", " ")}</Badge>
          <SaveStatusIndicator status={saveStatus} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
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
                      title,
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
                  downloadBibtex(citations, title || "references")
                  toast.success(`Exported ${citations.length} references as .bib`)
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">Export BibTeX (.bib)</span>
                  <span className="text-xs text-muted-foreground">Download citations as BibTeX file</span>
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
          <PaperActions
            paper={{ id, title, status }}
            onAfterMutation={onPaperMutated}
          />
        </div>
      </div>

      <div style={{ height: "calc(100vh - 180px)" }}>
        <FileDropzone
          onFilesDrop={(files) => {
            const bibFile = files.find(f => f.name.endsWith('.bib'))
            if (bibFile) {
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
                  const authorStr = authors.length > 0 ? authors.join(", ") : "Unknown"
                  const year = entry.year || "n.d."
                  const t = entry.title || "Untitled"
                  const journal = entry.journal || ""
                  const doi = entry.doi || ""
                  refsHtml += `<p>[${idx + 1}] ${authorStr} (${year}). ${t}.`
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
              toast.error("Please drop a .bib file")
            }
          }}
          accept={[".bib"]}
          description="Drop .bib file to import references"
          activeClassName="ring-4 ring-primary ring-inset bg-primary/5 rounded-xl"
          className="h-full"
        >
          <PaperEditor
            content={content}
            onChange={handleContentChange}
            minHeight="calc(100vh - 180px)"
            title={title}
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
    </div>
  )
}

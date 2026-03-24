"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { PaperEditor, DEFAULT_PAPER_TEMPLATE } from "@/components/text-editor/paper-editor"
import { PaperAIPanel } from "@/components/text-editor/paper-ai-panel"
import { usePaperAI } from "@/contexts/paper-ai-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, Download, Sparkles } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { SaveStatusIndicator } from "@/components/ui/save-status"
import { useAutoSave } from "@/hooks/use-auto-save"
import { PaperActions } from "./paper-actions"
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

export default function PaperDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [paper, setPaper] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState("")
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const bibInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<any>(null)
  const contentRef = useRef("")
  const paperAI = usePaperAI()

  useEffect(() => {
    const fetchPaper = async () => {
      if (IS_PAPERS_MOCKED) {
        const mock = getMockPaper(id)
        if (!mock) {
          toast.error("Paper not found")
          router.push("/papers")
          return
        }
        setPaper(mock)
        const c = mock.content && mock.content.trim().length > 0 ? mock.content : DEFAULT_PAPER_TEMPLATE
        setContent(c)
        setLoading(false)
        return
      }

      const supabase = createClient()
      const { data, error } = await supabase
        .from("papers")
        .select("*")
        .eq("id", id)
        .single()

      if (error || !data) {
        toast.error("Paper not found")
        router.push("/papers")
        return
      }

      setPaper(data)
      const c = data.content && data.content.trim().length > 0 ? data.content : DEFAULT_PAPER_TEMPLATE
      setContent(c)
      setLoading(false)
    }
    fetchPaper()
  }, [id, router])

  const handleAutoSave = useCallback(async (newContent: string) => {
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
  }, [id])

  const {
    status: saveStatus,
    debouncedSave,
  } = useAutoSave({
    onSave: handleAutoSave,
    delay: 2000,
    enabled: !loading && !!paper,
  })

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
    debouncedSave(newContent)
  }, [debouncedSave])

  const handleEditorReady = useCallback((editor: any) => {
    editorRef.current = editor
  }, [])

  /** Insert AI-generated HTML into the editor at cursor position */
  const handleAIInsert = useCallback((html: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.chain().focus().insertContent(html).run()
  }, [])

  /** Get text around the current cursor for diff context */
  const getEditorContext = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return { before: "", after: "" }

    const { state } = editor
    const { doc, selection } = state
    const pos = selection.anchor

    // Get text before cursor (last ~200 chars)
    const textBefore = doc.textBetween(Math.max(0, pos - 200), pos, "\n")
    // Get text after cursor (next ~200 chars)
    const textAfter = doc.textBetween(pos, Math.min(doc.content.size, pos + 200), "\n")

    return { before: textBefore, after: textAfter }
  }, [])

  // Keep content ref in sync for the paper AI context
  useEffect(() => {
    contentRef.current = content
  }, [content])

  // Register with PaperAI context so the right sidebar shows "Write with AI"
  useEffect(() => {
    if (!paper || !paperAI) return
    paperAI.register({
      title: paper.title || "Untitled",
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

  /** Extract citation metadata from the current HTML content for .bib export */
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

      const title = titleMatch?.[1]?.replace(/&quot;/g, '"') || ""
      if (!title || seen.has(title)) continue
      seen.add(title)

      let authors: string[] = []
      if (authorsMatch) {
        try {
          authors = JSON.parse(authorsMatch[1].replace(/&quot;/g, '"'))
        } catch { /* ignore */ }
      }

      citations.push({
        title,
        authors,
        year: yearMatch ? parseInt(yearMatch[1]) || 0 : 0,
        journal: journalMatch?.[1]?.replace(/&quot;/g, '"') || undefined,
        doi: doiMatch?.[1] || undefined,
        url: urlMatch?.[1] || undefined,
      })
    }

    return citations
  }, [content])

  /** Handle .bib file import */
  const handleBibImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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

      let refsHtml = '<h2>References</h2>'
      entries.forEach((entry, idx) => {
        const authors = parseAuthors(entry.author)
        const authorStr = authors.length > 0 ? authors.join(", ") : "Unknown"
        const year = entry.year || "n.d."
        const title = entry.title || "Untitled"
        const journal = entry.journal || ""
        const doi = entry.doi || ""

        refsHtml += `<p>[${idx + 1}] ${authorStr} (${year}). ${title}.`
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
  }, [debouncedSave])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!paper) return null

  const statusColor = (status: string) => {
    switch (status) {
      case "draft": return "outline"
      case "in_review": return "default"
      case "published": return "success" as any
      default: return "outline"
    }
  }

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/papers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold truncate">{paper.title}</h1>
          <Badge variant={statusColor(paper.status)}>
            {paper.status?.replace("_", " ")}
          </Badge>
          <SaveStatusIndicator status={saveStatus} />
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Export as LaTeX (.tex)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {JOURNAL_TEMPLATES.map((tmpl) => (
                <DropdownMenuItem
                  key={tmpl.id}
                  onClick={() => {
                    downloadLatex(content, {
                      title: paper.title,
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
                  downloadBibtex(citations, paper.title || "references")
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
          <PaperActions paper={paper} />
        </div>
      </div>

      {/* Editor */}
      <div style={{ height: "calc(100vh - 180px)" }}>
        <PaperEditor
          content={content}
          onChange={handleContentChange}
          minHeight="calc(100vh - 180px)"
          title={paper.title}
          autoSave
          onAutoSave={handleAutoSave}
          onEditorReady={handleEditorReady}
        />
      </div>

      {/* Hidden file input for .bib import */}
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

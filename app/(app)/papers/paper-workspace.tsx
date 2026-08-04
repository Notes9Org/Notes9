"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { updatePaperContent, updatePaperMeta } from "@/lib/papers"
import { useAuthUser } from "@/components/auth/auth-provider"
import { useProjectScope } from "@/contexts/project-scope-context"
import { SetScopedBreadcrumb } from "@/components/layout/breadcrumb-context"
import { PaperEditor, DEFAULT_PAPER_TEMPLATE } from "@/components/text-editor/paper-editor"
import { usePaperAI } from "@/contexts/paper-ai-context"
import { useCollaboration } from "@/lib/collaboration/use-collaboration"
import { isCollaborationEnabled } from "@/lib/collaboration/config"
import { getCollaboratorColor } from "@/lib/collaboration/colors"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { InlineDocTitle } from "@/components/text-editor/inline-doc-title"
import { ArrowLeft, CircleNotch as Loader2, DownloadSimple as Download, UploadSimple as Upload, FileCode, NotePencil as NotebookPen, FileText, FileArrowDown as FileDown } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { ConnectionStatus } from "@/components/collaboration/connection-status"
import { CollaboratorAvatars } from "@/components/collaboration/collaborator-avatars"
import { useAutoSave } from "@/hooks/use-auto-save"
import { useMentionEntities } from "@/hooks/use-mention-entities"
import { PaperActions } from "./[id]/paper-actions"
import { downloadLatex } from "@/lib/latex-export"
import { JOURNAL_TEMPLATES } from "@/lib/latex-templates"
import { downloadBibtex, parseBibtex, parseAuthors, type CitationForBib, type BibEntry } from "@/lib/bibtex"
import { getEffectivePublicationYear } from "@/components/text-editor/citation-utils"
import { latexToHtml } from "@/lib/latex-import"
import { importFileToEditorHtml, IMPORT_ACCEPT } from "@/lib/import-file-to-html"
import { NotePrintButton } from "@/components/note-export-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { FileDropzone } from "@/components/ui/file-dropzone"
import {
  exportNoteAsDocx,
  exportNoteAsHtml,
  exportNoteAsMarkdown,
  exportNoteAsPdfFromHtml,
  exportNoteAsPlainText,
} from "@/lib/note-export"

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

import type { ReactNode, RefObject } from "react"

export type PaperWorkspaceProps = {
  paperId: string
  /** When set, show a back control to return to the writing hub (or elsewhere). */
  backLink?: { href: string }
  /** Optional extra controls to render to the right of the back link (e.g. sidebar toggle) */
  leftControls?: ReactNode
  /** Called after delete or status change so parent lists/tabs can refresh. */
  onPaperMutated?: () => void
  /** Called when the paper title is saved so hub tabs / lists can update without a full refetch. */
  onPaperTitleUpdated?: (paperId: string, title: string) => void
  /** Wrapping element (list + editor) that editor fullscreen should expand, so
   *  the papers list stays visible in fullscreen. */
  fullscreenWorkspaceRef?: RefObject<HTMLElement | null>
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

export function PaperWorkspace({ paperId, backLink, leftControls, onPaperMutated, onPaperTitleUpdated, fullscreenWorkspaceRef }: PaperWorkspaceProps) {
  const user = useAuthUser();
  const router = useRouter()
  const { projectId, projectName } = useProjectScope()
  const id = paperId

  const [paper, setPaper] = useState<Record<string, unknown> | null>(null)
  const [titleInput, setTitleInput] = useState("")
  const [editorFullscreen, setEditorFullscreen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState("")
  const [userName, setUserName] = useState("")
  const [userId, setUserId] = useState("")
  const bibInputRef = useRef<HTMLInputElement>(null)
  const texInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<any>(null)
  const contentRef = useRef("")
  const paperAI = usePaperAI()

  // Fetch current user info for collaboration. The display name is always the
  // first name set in Settings (profiles.first_name), never the login email.
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      if (user) {
        setUserId(user.id)
        const { data: prof } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single()
        const fullName = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim()
        setUserName(
          fullName ||
            (user.user_metadata?.first_name as string | undefined)?.trim() ||
            "Anonymous",
        )
      }
    }
    void fetchUser()
  }, [user])

  // Collaboration hook
  const { provider, ydoc, status: collaborationStatus, collaborators } = useCollaboration({
    paperId: id,
    enabled: isCollaborationEnabled() && !loading && !!paper,
  })

  const collaborationConnected = collaborationStatus === "connected"
  // Mount the collab editor only after the provider has actually connected at
  // least once (latched). Mounting on mere ydoc/provider EXISTENCE meant an
  // unreachable collab server produced an empty, never-seeded Yjs doc, the
  // paper looked wiped after every refresh even though the DB had the content.
  // Until the latch flips, the solo editor shows the DB content; once it
  // flips it stays collab for the session (reconnects keep local Yjs edits).
  const collaborationReady = !!(ydoc && provider)
  const [collabEditorActive, setCollabEditorActive] = useState(false)

  useEffect(() => {
    const fetchPaper = async () => {
      setLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase.from("papers").select("*").eq("id", id).single()

      if (error || !data) {
        toast.error("Paper not found")
        ;(() => { const pq = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("project") : null; router.push(pq ? "/papers?project=" + pq : "/papers"); })()
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
    async (newContent: string): Promise<void> => {
      const supabase = createClient()
      const { error } = await updatePaperContent(supabase, id, newContent)
      if (error) throw error
    },
    [id]
  )

  // DB autosave stays on even while collaboration is connected: the collab
  // server also stores HTML, but the client-side write is the refresh-safety
  // net when that server is down, restarting, or failing to store.
  const { status: saveStatus, debouncedSave, forceSave } = useAutoSave({
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

  // Switch to the collab editor only once connected, flushing any pending
  // solo edits to the DB first so the server-side doc fetch can include them.
  useEffect(() => {
    if (!collaborationConnected || !collaborationReady || collabEditorActive) return
    let cancelled = false
    void (async () => {
      await forceSave()
      if (!cancelled) setCollabEditorActive(true)
    })()
    return () => {
      cancelled = true
    }
  }, [collaborationConnected, collaborationReady, collabEditorActive, forceSave])

  // Refresh/close with a pending debounce would drop the last ~2s of typing
  // flush when the tab is hidden or the page is being torn down.
  useEffect(() => {
    const flush = () => {
      void forceSave()
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [forceSave])

  const handleEditorReady = useCallback((editor: any) => {
    editorRef.current = editor
  }, [])

  // Org-wide @-mention candidates, same data the lab-notes/protocol editors get.
  const { protocols: mentionProtocols, samples: mentionSamples } = useMentionEntities()

  const commitTitle = useCallback(async () => {
    const next = titleInput.trim() || "Untitled"
    const current = ((paper?.title as string) || "").trim() || "Untitled"
    if (!paper || next === current) return

    const supabase = createClient()
    const { error } = await updatePaperMeta(supabase, id, { title: next })

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
        } catch (err) {
          console.warn("Failed to parse citation authors metadata", err)
          authors = []
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

  // Generic document import (PDF, Word, Markdown, plain text, HTML), the same
  // converter used by lab notes / protocols / reports, so behavior is consistent.
  const handleDocImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      try {
        const html = await importFileToEditorHtml(file)
        if (!html || !html.trim()) {
          toast.error("Could not import this file", { description: "Unsupported or empty document." })
          return
        }
        const editor = editorRef.current
        let nextContent: string
        if (editor) {
          // Insert at the cursor so it composes with existing content.
          editor.chain().focus().insertContent(html).run()
          nextContent = editor.getHTML()
        } else {
          nextContent = (contentRef.current || content || "") + html
        }
        setContent(nextContent)
        contentRef.current = nextContent
        debouncedSave(nextContent)
        // Autosave is gated while collaborating, so persist the import directly
        // to make sure it isn't lost.
        try {
          await handleAutoSave(nextContent)
        } catch (saveErr) {
          console.error("Failed to persist imported document", saveErr)
        }
        toast.success(`Imported ${file.name}`)
      } catch (err) {
        console.error("Document import failed", err)
        toast.error("Import failed", { description: "Could not read this document." })
      }
    },
    [content, debouncedSave, handleAutoSave]
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
  const breadcrumbTitle = (titleInput.trim() || (paper.title as string) || "Untitled Paper").slice(0, 60)

  // Print / import / export cluster, rendered in the page header and, in
  // editor fullscreen (where the header is covered), in the toolbar's trailing
  // slot, matching the lab-notes/protocol pattern.
  const paperDocActions = (
    <>
      {/* Print / save as PDF */}
      <NotePrintButton
        title={titleInput.trim() || ((paper.title as string) || "Untitled Paper")}
        getHtmlContent={() => contentRef.current || content}
        size="icon-sm"
        className="text-muted-foreground hover:text-foreground"
      />
      {/* Import dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Import"
            aria-label="Import"
            data-tour="paper-import"
            className="text-muted-foreground hover:text-foreground"
          >
            <Upload className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Import Documents</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => docInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">Import document…</span>
              <span className="text-xs text-muted-foreground">PDF, Word, Markdown, text, HTML, insert at cursor</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => texInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">Import LaTeX (.tex)</span>
              <span className="text-xs text-muted-foreground">Replace paper content</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => bibInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">Import BibTeX (.bib)</span>
              <span className="text-xs text-muted-foreground">Add references</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Export dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Export"
            aria-label="Export"
            data-tour="paper-export"
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 w-64 overflow-y-auto">
          <DropdownMenuLabel>Export Formats</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void exportNoteAsMarkdown(content, displayTitle)}>
            <Download className="mr-2 h-4 w-4" />
            Markdown (.md)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportNoteAsHtml(content, displayTitle)}>
            <Download className="mr-2 h-4 w-4" />
            HTML (.html)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportNoteAsPlainText(content, displayTitle)}>
            <Download className="mr-2 h-4 w-4" />
            Plain text (.txt)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void exportNoteAsDocx(content, displayTitle)}>
            <Download className="mr-2 h-4 w-4" />
            Word (.docx)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              void exportNoteAsPdfFromHtml(content, displayTitle)
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Save as PDF…
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Export as LaTeX</DropdownMenuLabel>
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
              <Download className="mr-2 h-4 w-4 text-transparent" />
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
            <Download className="mr-2 h-4 w-4" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">Export BibTeX (.bib)</span>
              <span className="text-xs text-muted-foreground">Download citations</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )

  /** Fullscreen: list toggle + title share the toolbar row (lab-notes pattern). */
  const paperFullscreenLeading = editorFullscreen ? (
    // flex-1: the title row is full-width in the merged toolbar, so let the
    // document name take all free space instead of clipping at ~18rem.
    <div className="flex min-w-0 w-full flex-1 items-center gap-1.5 sm:gap-2">
      {leftControls}
      {/* Hairline divider, separates the list toggle from the document
          identity, Notion-style: [toggle] | Title */}
      <div aria-hidden className="h-4 w-px shrink-0 bg-border/70" />
      <div className="min-w-0 flex-1 pl-1.5 sm:pl-2">
        <InlineDocTitle
          value={titleInput}
          onChange={setTitleInput}
          onCommit={() => void commitTitle()}
          size="base"
          aria-label="Paper title"
        />
      </div>
    </div>
  ) : (
    leftControls
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <SetScopedBreadcrumb
        scope={{ projectId, projectName }}
        sectionSegments={[
          { label: "Writing", href: projectId ? `/papers?project=${projectId}` : "/papers" },
          { label: breadcrumbTitle },
        ]}
      />
      {/* Header hides in editor fullscreen, list toggle + title + doc actions
          merge into the Tiptap toolbar row, same pattern as lab notes/protocols. */}
      {!editorFullscreen && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {backLink ? (
              <Button variant="ghost" size="icon" asChild>
                <Link href={backLink.href}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <InlineDocTitle
                value={titleInput}
                onChange={setTitleInput}
                onCommit={() => void commitTitle()}
                size="2xl"
                data-tour="paper-title"
                aria-label="Paper title"
              />
            </div>
            <Badge variant={statusVariant(status)}>{status.replace("_", " ")}</Badge>
          </div>
          {isCollaborationEnabled() && (
            <CollaboratorAvatars collaborators={collaborators} />
          )}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {paperDocActions}
            <PaperActions
              paper={{ id, title: displayTitle, status }}
              onAfterMutation={onPaperMutated}
            />
          </div>
        </div>
      )}

      {/* Flex-fill like the other editor surfaces (no hardcoded viewport math);
          the parent chain is height-bounded down from the app shell. */}
      <div className="min-h-0 flex-1">
        <FileDropzone
          onFilesDrop={(files) => {
            const MAX_IMPORT_BYTES = 5 * 1024 * 1024
            const texFile = files.find(f => f.name.endsWith('.tex'))
            const bibFile = files.find(f => f.name.endsWith('.bib'))
            const candidate = texFile || bibFile
            if (candidate && candidate.size > MAX_IMPORT_BYTES) {
              toast.error("File too large (max 5MB)")
              return
            }
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
          {collabEditorActive && collaborationReady ? (
            <PaperEditor
              key={`collab-${id}`}
              fullscreenWorkspaceRef={fullscreenWorkspaceRef}
              leadingToolbarSlot={paperFullscreenLeading}
              trailingToolbarSlot={editorFullscreen ? paperDocActions : null}
              onEditorFullscreenChange={setEditorFullscreen}
              protocols={mentionProtocols}
              samples={mentionSamples}
              content=""
              onChange={handleContentChange}
              minHeight="100%"
              title={titleInput}
              onDocumentTitleChange={setTitleInput}
              onDocumentTitleCommit={() => void commitTitle()}
              onEditorReady={handleEditorReady}
              ydoc={ydoc}
              provider={provider}
              collaborationEnabled={true}
              userName={userName}
              userColor={userId ? getCollaboratorColor(userId) : undefined}
            />
          ) : (
            <PaperEditor
              key={`solo-${id}`}
              fullscreenWorkspaceRef={fullscreenWorkspaceRef}
              leadingToolbarSlot={paperFullscreenLeading}
              trailingToolbarSlot={editorFullscreen ? paperDocActions : null}
              onEditorFullscreenChange={setEditorFullscreen}
              protocols={mentionProtocols}
              samples={mentionSamples}
              content={content}
              onChange={handleContentChange}
              minHeight="100%"
              title={titleInput}
              onDocumentTitleChange={setTitleInput}
              onDocumentTitleCommit={() => void commitTitle()}
              onEditorReady={handleEditorReady}
            />
          )}
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
      <input
        ref={docInputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={handleDocImport}
      />
    </div>
  )
}

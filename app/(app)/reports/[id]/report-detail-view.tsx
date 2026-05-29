"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { marked } from "marked"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeading } from "@/components/ui/page-heading"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Calendar,
  FileText,
  User,
  FlaskConical,
  FolderOpen,
  Trash2,
  ArrowLeft,
  Download,
} from "lucide-react"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { NoteExportMenu } from "@/components/note-export-menu"
import { SaveStatusIndicator } from "@/components/ui/save-status"
import { useAutoSave } from "@/hooks/use-auto-save"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import type { ReportRow } from "../reports-page-client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"

import type { ReactNode } from "react"

interface ReportDetailViewProps {
  report: ReportRow & { content: string | null }
  leftControls?: ReactNode
  sidebar?: ReactNode
}

/** Build a QuickChart.io image URL from a Chart.js config object. */
function buildChartUrl(chartJson: string): string | null {
  try {
    JSON.parse(chartJson)
    return `https://quickchart.io/chart?c=${encodeURIComponent(chartJson)}&w=600&h=350&bkg=white`
  } catch {
    return null
  }
}

/** Extract chart blocks from markdown/mixed content — used for export alt text. */
function extractChartAltTexts(content: string): string[] {
  const alts: string[] = []
  const regex = /```chart\s*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    try {
      const config = JSON.parse(match[1].trim())
      alts.push(config?.options?.plugins?.title?.text || "Chart")
    } catch { alts.push("Chart") }
  }
  return alts
}

/**
 * Convert markdown content (from AI) to HTML for TipTap.
 * Chart code blocks are converted to inline <img> tags via QuickChart.
 * Uses the `marked` library for proper markdown parsing (tables, lists, etc.).
 * Only used on first load when content is markdown.
 */
function markdownToHtml(md: string): string {
  // First, convert chart blocks to placeholder img tags before marked processes them
  let processed = md.replace(/```chart\s*\n([\s\S]*?)```/g, (_match, chartJson: string) => {
    const trimmed = chartJson.trim()
    const url = buildChartUrl(trimmed)
    if (!url) return ""
    let altText = "Data visualization chart"
    try {
      const config = JSON.parse(trimmed)
      altText = config?.options?.plugins?.title?.text || altText
    } catch { /* use default */ }
    return `\n\n<img src="${url}" alt="${altText}" style="max-width:100%;border-radius:8px;margin:1em auto;display:block;" />\n\n`
  })

  // Use marked for proper markdown → HTML (handles tables, nested lists, etc.)
  const html = marked.parse(processed, { async: false, gfm: true, breaks: false }) as string
  return html
}

function isMarkdown(content: string): boolean {
  const trimmed = content.trim()
  if (trimmed.startsWith("<")) return false
  if (/^#{1,3}\s/m.test(trimmed)) return true
  if (/\*\*.+\*\*/.test(trimmed)) return true
  return true
}


export function ReportDetailView({ report, leftControls, sidebar }: ReportDetailViewProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const initialHtml = useMemo(() => {
    if (!report.content) return ""
    if (isMarkdown(report.content)) return markdownToHtml(report.content)
    return report.content
  }, [report.content])

  const [content, setContent] = useState(initialHtml)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const statusVariant =
    report.status === "final" ? "default" : report.status === "review" ? "secondary" : "outline"

  const handleAutoSave = useCallback(
    async (htmlContent: string) => {
      const { error } = await supabase.from("reports").update({ content: htmlContent }).eq("id", report.id)
      if (error) throw new Error(error.message)
    },
    [report.id, supabase]
  )

  const { status: autoSaveStatus, lastSaved, debouncedSave } = useAutoSave({
    onSave: handleAutoSave,
    delay: 2000,
    enabled: true,
  })

  const handleContentChange = useCallback(
    (html: string) => {
      setContent(html)
      debouncedSave(html)
    },
    [debouncedSave]
  )

  const confirmDelete = async () => {
    setIsDeleting(true)
    try {
      const { error } = await supabase.from("reports").delete().eq("id", report.id)
      if (error) {
        toast.error(`Failed to delete: ${error.message}`)
        return
      }
      toast.success("Report deleted")
      setDeleteOpen(false)
      ;(() => { const pq = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("project") : null; router.push(pq ? "/reports?project=" + pq : "/reports"); })()
      router.refresh()
    } finally {
      setIsDeleting(false)
    }
  }

  const exportTitle = report.title || "Data Analysis Report"

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:gap-6 h-full">
      {/* Header: stacked on mobile, row on desktop */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => (() => { const pq = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("project") : null; router.push(pq ? "/reports?project=" + pq : "/reports"); })()} title="Back to reports">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <PageHeading>{report.title}</PageHeading>
              <Badge variant={statusVariant}>{report.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {report.report_type.replace(/_/g, " ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <NoteExportMenu
            title={exportTitle}
            htmlContent={content}
            trigger={
              <Button variant="outline" size="sm" title="Download report" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            }
          />
          <Button variant="outline" size="sm" className="text-destructive gap-2" onClick={() => setDeleteOpen(true)} title="Delete report">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>"{report.title}"</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className={buttonVariants({ variant: "destructive" })}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main Content Area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch overflow-hidden">
        <Tabs defaultValue="editor" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-2">
            <TabsList className="h-9 w-fit min-w-0 shrink-0">
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="editor"
            className="mt-0 flex min-h-0 min-w-0 flex-1 flex-row gap-4 overflow-hidden focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {sidebar && (
              <Card className="flex min-h-0 shrink-0 flex-col gap-0 py-0 border-0 shadow-none rounded-none sm:border sm:shadow-sm sm:rounded-xl">
                {sidebar}
              </Card>
            )}
            <Card className="flex-1 flex flex-col min-h-0">
              <CardContent className="flex-1 min-h-0 overflow-y-auto pt-6 p-4">
                {content || report.content ? (
                  <TiptapEditor
                    key={report.id}
                    content={content}
                    onChange={handleContentChange}
                    placeholder="Start writing your report..."
                    title={exportTitle}
                    minHeight="100%"
                    showAITools
                    showAiWritingDropdown={false}
                    enableMath
                    hideExportControls
                    leadingToolbarSlot={leftControls}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                    <FileText className="h-10 w-10 mb-3" />
                    <p>No content yet. Start writing above.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="mt-0 space-y-4 focus-visible:outline-none overflow-y-auto min-h-0 pb-4">
            <Card>
              <CardHeader>
                <span className="text-sm font-medium text-muted-foreground">Report Details</span>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Created</span>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{new Date(report.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {report.generated_by && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Author</span>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{report.generated_by.first_name} {report.generated_by.last_name}</span>
                      </div>
                    </div>
                  )}
                  {report.project && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Project</span>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{report.project.name}</span>
                      </div>
                    </div>
                  )}
                  {report.experiment && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Experiment</span>
                      <div className="flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{report.experiment.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

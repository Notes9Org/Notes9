"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { marked } from "marked"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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

interface ReportDetailViewProps {
  report: ReportRow & { content: string | null }
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


export function ReportDetailView({ report }: ReportDetailViewProps) {
  const router = useRouter()

  const initialHtml = useMemo(() => {
    if (!report.content) return ""
    if (isMarkdown(report.content)) return markdownToHtml(report.content)
    return report.content
  }, [report.content])

  const [content, setContent] = useState(initialHtml)

  const statusVariant =
    report.status === "final" ? "default" : report.status === "review" ? "secondary" : "outline"

  const handleAutoSave = useCallback(
    async (htmlContent: string) => {
      const supabase = createClient()
      const { error } = await supabase.from("reports").update({ content: htmlContent }).eq("id", report.id)
      if (error) throw new Error(error.message)
    },
    [report.id]
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

  const handleDelete = async () => {
    if (!confirm("Delete this report? This cannot be undone.")) return
    const supabase = createClient()
    const { error } = await supabase.from("reports").delete().eq("id", report.id)
    if (error) {
      toast.error(`Failed to delete: ${error.message}`)
    } else {
      toast.success("Report deleted")
      router.push("/reports")
    }
  }

  const exportTitle = report.title || "Data Analysis Report"

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.push("/reports")} title="Back to reports">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">{report.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-10">
            <Badge variant={statusVariant}>{report.status}</Badge>
            <Badge variant="outline">{report.report_type.replace(/_/g, " ")}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SaveStatusIndicator status={autoSaveStatus} lastSaved={lastSaved} variant="icon" />
          <NoteExportMenu
            title={exportTitle}
            htmlContent={content}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Download report">
                <Download className="h-4 w-4" />
              </Button>
            }
          />
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={handleDelete} title="Delete report">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-muted-foreground">Report Details</span>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>Created: {new Date(report.created_at).toLocaleDateString()}</span>
            </div>
            {report.generated_by && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4 shrink-0" />
                <span>Author: {report.generated_by.first_name} {report.generated_by.last_name}</span>
              </div>
            )}
            {report.project && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span>Project: {report.project.name}</span>
              </div>
            )}
            {report.experiment && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FlaskConical className="h-4 w-4 shrink-0" />
                <span>Experiment: {report.experiment.name}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {content || report.content ? (
            <TiptapEditor
              content={content}
              onChange={handleContentChange}
              placeholder="Start writing your report..."
              title={exportTitle}
              minHeight="400px"
              showAITools
              showAiWritingDropdown={false}
              enableMath
              hideExportControls
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mb-3" />
              <p>No content yet. Start writing above.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

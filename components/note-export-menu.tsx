"use client"

import { Braces, FileCode, FileDown, FileText, NotebookPen, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "sonner"
import {
  exportNoteAsDocx,
  exportNoteAsHtml,
  exportNoteAsMarkdown,
  exportNoteAsPdfFromHtml,
  exportNoteAsPlainText,
  exportNoteAsTiptapJson,
} from "@/lib/note-export"

export type NoteExportPdfOptions = {
  includeComments?: boolean
  marginsMm?: { top: number; bottom: number; left: number; right: number }
}

function resolveHtml(getHtmlContent?: () => string, htmlContent?: string): string {
  return getHtmlContent?.() ?? htmlContent ?? ""
}

export type NotePrintButtonProps = {
  title: string
  htmlContent?: string
  getHtmlContent?: () => string
  includeCommentsInPdf?: boolean
  pdfMarginsMm?: NoteExportPdfOptions["marginsMm"]
  disabled?: boolean
  className?: string
}

/** Opens the browser print dialog (save as PDF from there). Separate from the Export formats menu. */
export function NotePrintButton({
  title,
  htmlContent,
  getHtmlContent,
  includeCommentsInPdf = false,
  pdfMarginsMm,
  disabled,
  className,
}: NotePrintButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className ?? "h-8 w-8 text-muted-foreground hover:text-foreground"}
          disabled={disabled}
          aria-label="Print"
          onClick={() => {
            const html = resolveHtml(getHtmlContent, htmlContent)
            const exportTitle = (title || "").trim() || "document"
            void exportNoteAsPdfFromHtml(html, exportTitle, {
              includeComments: includeCommentsInPdf,
              marginsMm: pdfMarginsMm,
            })
          }}
        >
          <Printer className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Print or save as PDF…</TooltipContent>
    </Tooltip>
  )
}

type NoteExportMenuProps = {
  title: string
  /** Static HTML (e.g. form state). */
  htmlContent?: string
  /** Live HTML from the editor — preferred when both are available. */
  getHtmlContent?: () => string
  disabled?: boolean
  includeCommentsInPdf?: boolean
  pdfMarginsMm?: NoteExportPdfOptions["marginsMm"]
  /** When set, adds TipTap JSON download (call from live editor). */
  getTiptapJson?: () => object | null | undefined
  trigger?: React.ReactNode
  align?: "start" | "end" | "center"
}

export function NoteExportMenu({
  title,
  htmlContent,
  getHtmlContent,
  disabled,
  includeCommentsInPdf = false,
  pdfMarginsMm,
  getTiptapJson,
  trigger,
  align = "end",
}: NoteExportMenuProps) {
  const getHtml = () => resolveHtml(getHtmlContent, htmlContent)
  const exportTitle = (title || "").trim() || "document"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            disabled={disabled}
            aria-label="Export"
          >
            <NotebookPen className="h-4 w-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[13rem]" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Download as…</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void exportNoteAsMarkdown(getHtml(), exportTitle)}>
          <FileCode className="mr-2 h-4 w-4" />
          Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportNoteAsHtml(getHtml(), exportTitle)}>
          <NotebookPen className="mr-2 h-4 w-4" />
          HTML (.html)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportNoteAsPlainText(getHtml(), exportTitle)}>
          <FileText className="mr-2 h-4 w-4" />
          Plain text (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void exportNoteAsDocx(getHtml(), exportTitle)}>
          <NotebookPen className="mr-2 h-4 w-4" />
          Word (.docx)
        </DropdownMenuItem>
        {getTiptapJson ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                const json = getTiptapJson()
                if (!json || typeof json !== "object") {
                  toast.error("Could not export JSON", { description: "Editor is not ready." })
                  return
                }
                exportNoteAsTiptapJson(json, exportTitle)
              }}
            >
              <Braces className="mr-2 h-4 w-4" />
              TipTap JSON (.json)
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            void exportNoteAsPdfFromHtml(getHtml(), exportTitle, {
              includeComments: includeCommentsInPdf,
              marginsMm: pdfMarginsMm,
            })
          }
        >
          <FileDown className="mr-2 h-4 w-4" />
          Save as PDF…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

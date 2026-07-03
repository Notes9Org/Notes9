"use client"

import { useRef, useState } from "react"
import { Braces, FileCode, FileDown, FileText, NotebookPen, Printer, Upload, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { IMPORT_ACCEPT } from "@/lib/import-file-to-html"
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
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
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
  variant = "ghost",
  size = "icon",
}: NotePrintButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
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
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
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

type NoteFileMenuProps = NoteExportMenuProps & {
  /** Receives editor HTML parsed from an imported PDF/Word/Markdown/text/HTML file. */
  onImportHtml?: (html: string) => void
  includeCommentsInPdf?: boolean
  pdfMarginsMm?: NoteExportPdfOptions["marginsMm"]
}

/**
 * Single "File" menu that groups Print, Import and Export-as-formats under one
 * toolbar entry (used by lab notes / protocols / reports / papers). Reuses the
 * same export helpers as {@link NoteExportMenu} and the importer used by
 * {@link NoteImportButton}.
 */
export function NoteFileMenu({
  title,
  htmlContent,
  getHtmlContent,
  getTiptapJson,
  includeCommentsInPdf = false,
  pdfMarginsMm,
  align = "end",
  disabled,
  onImportHtml,
  trigger,
}: NoteFileMenuProps) {
  const getHtml = () => resolveHtml(getHtmlContent, htmlContent)
  const exportTitle = (title || "").trim() || "document"
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const printPdf = () =>
    void exportNoteAsPdfFromHtml(getHtml(), exportTitle, {
      includeComments: includeCommentsInPdf,
      marginsMm: pdfMarginsMm,
    })

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !onImportHtml) return
    setImporting(true)
    try {
      const { importFileToEditorHtml } = await import("@/lib/import-file-to-html")
      const html = await importFileToEditorHtml(file)
      if (html && html.trim()) {
        onImportHtml(html)
        toast.success(`Imported ${file.name}`)
      } else {
        toast.error("Couldn't import this file", {
          description: "Use a PDF, Word (.docx), Markdown, text, or HTML file.",
        })
      }
    } catch (err) {
      console.error("Import failed", err)
      toast.error("Import failed", { description: "Could not read this document." })
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      {onImportHtml ? (
        <input ref={inputRef} type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={handleImportChange} />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              disabled={disabled}
              aria-label="Import, export & print"
            >
              <FileDown className="h-4 w-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="min-w-[12rem]" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={printPdf}>
            <Printer className="mr-2 h-4 w-4" />
            Print / Save as PDF…
          </DropdownMenuItem>
          {onImportHtml ? (
            <DropdownMenuItem onClick={() => inputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Import document…
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {/* Export formats listed flat (not a submenu) so they're always on-screen,
              even when the File menu sits at the right edge of the toolbar. */}
          <DropdownMenuLabel className="text-xs text-muted-foreground">Export as…</DropdownMenuLabel>
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
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

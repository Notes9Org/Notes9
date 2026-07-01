"use client"

import { useRef, useState, type ComponentProps } from "react"
import { toast } from "sonner"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { IMPORT_ACCEPT } from "@/lib/import-file-to-html"

/**
 * Icon-only "Import" button for rich-text surfaces (lab notes, protocols,
 * reports, papers). Converts a PDF / Word / Markdown / text / HTML file into
 * editor HTML via the shared importer and hands it back through `onImportHtml`.
 * Style props (variant/size/className) let each surface match its Export button
 * exactly so the pair reads as a set.
 */
export function NoteImportButton({
  onImportHtml,
  disabled,
  variant = "ghost",
  size = "icon-sm",
  className,
}: {
  onImportHtml: (html: string) => void
  disabled?: boolean
  variant?: ComponentProps<typeof Button>["variant"]
  size?: ComponentProps<typeof Button>["size"]
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const open = () => {
    if (!disabled && !busy) inputRef.current?.click()
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
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
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={open}
        disabled={disabled || busy}
        title="Import a PDF, Word, Markdown, text, or HTML file"
        aria-label="Import document"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </Button>
    </>
  )
}

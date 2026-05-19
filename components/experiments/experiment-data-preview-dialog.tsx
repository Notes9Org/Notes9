"use client"

import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { createBucketSignedUrl } from "@/lib/storage-signed-url"
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { sanitizeHtml } from "@/lib/sanitize-html"
import {
  Download,
  ExternalLink,
  File as FileIcon,
  FileImage,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react"

type PreviewKind = "image" | "tiff" | "pdf" | "docx" | "text" | "unsupported"

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".tsv", ".log", ".json", ".xml", ".tex", ".bib"]
const TEXT_MIMES = ["text/plain", "text/markdown", "text/csv", "application/json", "application/xml", "text/xml"]
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]
const TIFF_EXTENSIONS = [".tif", ".tiff"]
const TIFF_MIMES = ["image/tiff", "image/tif", "image/x-tiff"]

function ext(name: string): string {
  const idx = name.lastIndexOf(".")
  return idx >= 0 ? name.slice(idx).toLowerCase() : ""
}

function isTiff(file: { file_name: string; file_type?: string | null }): boolean {
  const e = ext(file.file_name)
  const mime = (file.file_type || "").toLowerCase()
  return TIFF_EXTENSIONS.includes(e) || TIFF_MIMES.includes(mime)
}

export function detectPreviewKind(file: { file_name: string; file_type?: string | null }): PreviewKind {
  if (isTiff(file)) return "tiff"
  const e = ext(file.file_name)
  const mime = (file.file_type || "").toLowerCase()
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.includes(e)) return "image"
  if (mime === "application/pdf" || e === ".pdf") return "pdf"
  if (
    e === ".docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx"
  }
  if (TEXT_MIMES.includes(mime) || TEXT_EXTENSIONS.includes(e)) return "text"
  return "unsupported"
}

/** Quick predicate used by callers to decide whether to open this dialog vs delegate elsewhere. */
export function isPreviewableExperimentFile(file: { file_name: string; file_type?: string | null }): boolean {
  return detectPreviewKind(file) !== "unsupported"
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Storage path inside the `user` bucket, OR a legacy full public URL. */
  fileUrl: string
  fileName: string
  fileType?: string | null
}

/**
 * Generic in-app preview dialog for Data & Files. Same portal-overlay pattern
 * as `ExperimentDataTabularDialog` so opening a PDF/image/docx feels like
 * opening a spreadsheet. Each file type uses the native browser renderer
 * where possible (no extra bundles, no shortcut hijacking):
 *  - **PDF**  → `<iframe>` with the browser's built-in PDF viewer
 *  - **Image** → `<img>` with object-fit-contain
 *  - **DOCX** → converted to HTML via dynamic `mammoth` import
 *  - **Text/CSV/MD/JSON/XML** → rendered as monospaced `<pre>`
 *
 * Spreadsheets (xlsx/xls/csv with tabular_format) keep using
 * `ExperimentDataTabularDialog` — Univer needs its own portal handling.
 */
export function ExperimentDataPreviewDialog({ open, onOpenChange, fileUrl, fileName, fileType }: Props) {
  const { toast } = useToast()
  const titleId = useId()
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fullPage, setFullPage] = useState(false)
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [textBody, setTextBody] = useState<string | null>(null)
  const [tiffPages, setTiffPages] = useState<{ url: string; width: number; height: number }[] | null>(null)
  const [tiffPageIndex, setTiffPageIndex] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const kind = useMemo<PreviewKind>(
    () => detectPreviewKind({ file_name: fileName, file_type: fileType ?? null }),
    [fileName, fileType],
  )

  // Sign on open / file change. Then for docx/text/tiff we also fetch the body.
  useEffect(() => {
    if (!open || !fileUrl) {
      setSignedUrl(null)
      setDocxHtml(null)
      setTextBody(null)
      setTiffPages((current) => {
        if (current) {
          for (const page of current) URL.revokeObjectURL(page.url)
        }
        return null
      })
      setTiffPageIndex(0)
      setPreviewError(null)
      return
    }
    let cancelled = false
    let createdBlobUrls: string[] = []
    setLoading(true)
    setPreviewError(null)
    setDocxHtml(null)
    setTextBody(null)
    setTiffPages((current) => {
      if (current) {
        for (const page of current) URL.revokeObjectURL(page.url)
      }
      return null
    })
    setTiffPageIndex(0)

    ;(async () => {
      try {
        const supabase = createClient()
        const url = await createBucketSignedUrl(supabase, USER_STORAGE_BUCKET, fileUrl)
        if (cancelled) return
        if (!url) {
          setPreviewError("Could not generate a download URL for this file.")
          setSignedUrl(null)
          return
        }
        setSignedUrl(url)

        if (kind === "docx") {
          const buf = await (await fetch(url)).arrayBuffer()
          if (cancelled) return
          const mammoth = await import("mammoth")
          const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf })
          if (cancelled) return
          setDocxHtml(sanitizeHtml(html))
        } else if (kind === "text") {
          const body = await (await fetch(url)).text()
          if (cancelled) return
          setTextBody(body)
        } else if (kind === "tiff") {
          // Browsers can't render TIFF natively. Decode every page with UTIF
          // and convert each one to a PNG blob URL so a plain <img> can show it.
          const buf = await (await fetch(url)).arrayBuffer()
          if (cancelled) return
          const UTIF = (await import("utif")).default
          const ifds = UTIF.decode(buf)
          if (!ifds.length) throw new Error("No image pages found in TIFF.")
          const pages: { url: string; width: number; height: number }[] = []
          for (const ifd of ifds) {
            if (cancelled) break
            UTIF.decodeImage(buf, ifd, ifds)
            const rgba = UTIF.toRGBA8(ifd)
            const width = Number(ifd.width) || (Array.isArray(ifd.t256) ? ifd.t256[0] : 0)
            const height = Number(ifd.height) || (Array.isArray(ifd.t257) ? ifd.t257[0] : 0)
            if (!width || !height) continue
            const canvas = document.createElement("canvas")
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext("2d")
            if (!ctx) continue
            const imageData = ctx.createImageData(width, height)
            imageData.data.set(rgba)
            ctx.putImageData(imageData, 0, 0)
            const blob: Blob | null = await new Promise((resolve) =>
              canvas.toBlob((b) => resolve(b), "image/png")
            )
            if (!blob) continue
            const pngUrl = URL.createObjectURL(blob)
            createdBlobUrls.push(pngUrl)
            pages.push({ url: pngUrl, width, height })
          }
          if (cancelled) {
            for (const u of createdBlobUrls) URL.revokeObjectURL(u)
            createdBlobUrls = []
            return
          }
          if (!pages.length) throw new Error("Could not decode any TIFF pages.")
          setTiffPages(pages)
        }
      } catch (e) {
        if (cancelled) return
        for (const u of createdBlobUrls) URL.revokeObjectURL(u)
        createdBlobUrls = []
        const msg = e instanceof Error ? e.message : "Unknown error"
        setPreviewError(msg)
        toast({
          title: "Could not preview file",
          description: msg,
          variant: "destructive",
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      // Note: tiffPages blob URLs are revoked when state is replaced/cleared
      // above; we don't revoke createdBlobUrls here because successful pages
      // are still being rendered.
    }
  }, [open, fileUrl, kind, toast])

  // Esc closes (matches tabular dialog UX).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  // Revoke TIFF blob URLs when the component unmounts entirely.
  useEffect(() => {
    return () => {
      setTiffPages((current) => {
        if (current) {
          for (const page of current) URL.revokeObjectURL(page.url)
        }
        return null
      })
    }
  }, [])

  const handleDownload = useCallback(() => {
    if (!signedUrl) return
    const a = document.createElement("a")
    a.href = signedUrl
    a.download = fileName
    a.rel = "noopener noreferrer"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [signedUrl, fileName])

  const handleOpenNewTab = useCallback(() => {
    if (!signedUrl) return
    window.open(signedUrl, "_blank", "noopener,noreferrer")
  }, [signedUrl])

  if (!open) return null
  if (typeof document === "undefined") return null

  const viewerHeightClass = fullPage ? "min-h-0 flex-1 h-full" : "h-[78vh] min-h-[420px]"

  const headerIcon =
    kind === "image" || kind === "tiff" ? (
      <FileImage className="h-5 w-5 shrink-0 text-amber-600" />
    ) : kind === "pdf" ? (
      <FileText className="h-5 w-5 shrink-0 text-rose-600" />
    ) : kind === "docx" || kind === "text" ? (
      <FileText className="h-5 w-5 shrink-0 text-blue-600" />
    ) : (
      <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
    )

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading preview…
        </div>
      )
    }
    if (previewError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <FileIcon className="h-10 w-10 text-muted-foreground/60" />
          <p>{previewError}</p>
          {signedUrl && (
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download instead
            </Button>
          )}
        </div>
      )
    }
    if (!signedUrl) return null

    switch (kind) {
      case "image":
        return (
          <div className="flex flex-1 items-center justify-center overflow-auto p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signedUrl}
              alt={fileName}
              className="max-h-full max-w-full select-text rounded-md object-contain"
              draggable={false}
            />
          </div>
        )

      case "tiff": {
        if (!tiffPages || tiffPages.length === 0) return null
        const safeIndex = Math.min(tiffPageIndex, tiffPages.length - 1)
        const current = tiffPages[safeIndex]
        return (
          <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2">
            {tiffPages.length > 1 ? (
              <div className="flex shrink-0 items-center justify-between gap-2 rounded-md border bg-background/60 px-2 py-1 text-xs">
                <span className="text-muted-foreground">
                  Page {safeIndex + 1} of {tiffPages.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setTiffPageIndex((i) => Math.max(0, i - 1))}
                    disabled={safeIndex === 0}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setTiffPageIndex((i) => Math.min(tiffPages.length - 1, i + 1))}
                    disabled={safeIndex >= tiffPages.length - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-1 items-center justify-center overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt={`${fileName} page ${safeIndex + 1}`}
                width={current.width}
                height={current.height}
                className="max-h-full max-w-full select-text rounded-md object-contain"
                draggable={false}
              />
            </div>
          </div>
        )
      }

      case "pdf":
        return (
          <iframe
            src={signedUrl}
            title={fileName}
            className="h-full w-full flex-1 rounded-md border bg-background"
          />
        )

      case "docx":
        return (
          <div
            className="prose prose-sm dark:prose-invert max-w-none flex-1 overflow-auto rounded-md border bg-background p-6"
            dangerouslySetInnerHTML={{ __html: docxHtml ?? "" }}
          />
        )

      case "text":
        return (
          <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-4 font-mono text-xs leading-relaxed text-foreground">
            {textBody ?? ""}
          </pre>
        )

      case "unsupported":
      default:
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <FileIcon className="h-10 w-10 text-muted-foreground/60" />
            <p>
              No inline preview for <span className="font-medium text-foreground">{fileName}</span>.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button variant="ghost" size="sm" onClick={handleOpenNewTab}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in new tab
              </Button>
            </div>
          </div>
        )
    }
  }

  const overlay = (
    <div
      className={cn(
        "fixed inset-0 z-[130] flex overflow-y-auto",
        fullPage ? "items-stretch justify-stretch p-0" : "items-start justify-center p-4 sm:p-6",
      )}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 dark:bg-black/70"
        aria-label="Close preview"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 flex w-full flex-col overflow-visible rounded-lg border bg-background shadow-xl",
          fullPage
            ? "m-0 h-screen max-h-screen min-h-0 max-w-none rounded-none border-0"
            : "mt-[5vh] max-h-[92vh] max-w-5xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
          <h2
            id={titleId}
            className="flex min-w-0 items-center gap-2 text-base font-semibold leading-none"
          >
            {headerIcon}
            <span className="truncate">{fileName}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!signedUrl}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleOpenNewTab}
              disabled={!signedUrl}
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setFullPage((v) => !v)}
              aria-label={fullPage ? "Exit full page" : "Full page"}
              title={fullPage ? "Exit full page" : "Full page"}
            >
              {fullPage ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className={cn("flex w-full flex-col overflow-hidden bg-muted/30 p-2", viewerHeightClass)}>
          {renderBody()}
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}

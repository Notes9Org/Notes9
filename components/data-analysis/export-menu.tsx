"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { DownloadSimple, CaretDown, Copy, FloppyDisk, Check, CircleNotch } from "@phosphor-icons/react/ssr"
import type { ExportFormat } from "@/lib/data-analysis/chart-export"

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "png", label: "PNG", hint: "Raster · transparent background" },
  { id: "jpeg", label: "JPG", hint: "Raster · smaller file, white background" },
  { id: "tiff", label: "TIFF", hint: "Raster · lossless, print-ready" },
  { id: "svg", label: "SVG", hint: "Vector · infinitely scalable" },
]
const DPI_PRESETS = [150, 300, 600, 1200]
const DPI_MIN = 72
const DPI_MAX = 2400
const PANEL_W = 300
const PANEL_H = 380

/**
 * Advanced, modular chart-export popover. Lives in a portal so it's never
 * clipped by a card's overflow, and positions itself under its trigger.
 * DPI is free-typed (the backend renders at scale = dpi/96 and embeds the
 * physical resolution), with presets and a live output-pixel estimate.
 */
export function ExportMenu({
  disabled,
  defaultName,
  onExport,
  getPng,
  getCanvasSize,
  onSaveToLibrary,
  variant = "solid",
}: {
  disabled?: boolean
  defaultName: string
  onExport: (opts: { format: ExportFormat; dpi: number; filename: string }) => Promise<void>
  getPng?: () => Promise<string | null>
  getCanvasSize?: () => { width: number; height: number } | null
  onSaveToLibrary?: () => void
  /** "solid" = filled accent trigger (settings); "ghost" = bordered chip (chart header). */
  variant?: "solid" | "ghost"
}) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>("png")
  const [dpiText, setDpiText] = useState("600")
  const [fname, setFname] = useState("")
  const [busy, setBusy] = useState<null | "export" | "copy">(null)
  const [copied, setCopied] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const cleanBase = useMemo(
    () => (defaultName || "figure").trim().replace(/\s+/g, "-").toLowerCase().replace(/[^a-z0-9._-]/g, "") || "figure",
    [defaultName],
  )
  useEffect(() => {
    if (open) setFname(cleanBase)
  }, [open, cleanBase])

  const isVector = format === "svg"
  const ext = format === "jpeg" ? "jpg" : format
  const dpiNum = Number(dpiText)
  const dpiValid = Number.isFinite(dpiNum) && dpiNum >= DPI_MIN && dpiNum <= DPI_MAX
  const dpi = Math.max(DPI_MIN, Math.min(DPI_MAX, Math.round(dpiNum) || 0))

  const size = open ? getCanvasSize?.() ?? null : null
  const outW = size ? Math.round((size.width * dpi) / 96) : null
  const outH = size ? Math.round((size.height * dpi) / 96) : null

  const place = useCallback(() => {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.right - PANEL_W, window.innerWidth - PANEL_W - 8))
    let top = r.bottom + 6
    if (top + PANEL_H > window.innerHeight - 8) top = Math.max(8, r.top - PANEL_H - 6)
    setPos({ left, top })
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open, place])

  const doDownload = async () => {
    setBusy("export")
    try {
      await onExport({ format, dpi, filename: (fname || cleanBase).trim() || "figure" })
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setBusy(null)
    }
  }

  const doCopy = async () => {
    if (!getPng) return
    setBusy("copy")
    try {
      if (typeof ClipboardItem === "undefined") throw new Error("This browser can’t copy images")
      const url = await getPng()
      if (!url) throw new Error("Couldn’t render the chart")
      const blob = await (await fetch(url)).blob()
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
      toast.success("Chart copied to clipboard")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          variant === "solid"
            ? "w-full justify-center bg-[var(--n9-accent,#965034)] px-3 py-2 text-sm text-white hover:opacity-90"
            : cn(
                "border border-border bg-background px-2.5 py-1.5 text-foreground hover:border-[var(--n9-accent,#965034)]/40 hover:bg-[var(--n9-accent,#965034)]/[0.06]",
                open && "border-[var(--n9-accent,#965034)]/50 bg-[var(--n9-accent,#965034)]/[0.06]",
              ),
        )}
      >
        <DownloadSimple className="h-4 w-4" /> Export
        <CaretDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="fixed z-[200] w-[300px] rounded-xl border border-border bg-popover/95 p-3 text-sm shadow-2xl backdrop-blur-md"
                style={{ left: pos.left, top: pos.top }}
              >
                {/* Format */}
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Format</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormat(f.id)}
                      title={f.hint}
                      className={cn(
                        "rounded-lg border py-1.5 text-[11px] font-semibold transition-colors",
                        format === f.id
                          ? "border-[var(--n9-accent,#965034)] bg-[var(--n9-accent,#965034)] text-white"
                          : "border-input bg-background text-muted-foreground hover:border-[var(--n9-accent,#965034)]/40 hover:text-foreground",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Resolution */}
                <div className={cn("mt-3 transition-opacity", isVector && "pointer-events-none opacity-40")}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Resolution</span>
                    {!isVector && outW && outH && (
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">≈ {outW.toLocaleString()} × {outH.toLocaleString()} px</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={DPI_MIN}
                      max={DPI_MAX}
                      value={dpiText}
                      disabled={isVector}
                      onChange={(e) => setDpiText(e.target.value)}
                      className={cn(
                        "h-9 w-full rounded-lg border bg-background pl-3 pr-10 text-sm tabular-nums outline-none transition-colors focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/20",
                        dpiValid || isVector ? "border-input focus:border-[var(--n9-accent,#965034)]/50" : "border-red-400/70 focus:border-red-400",
                      )}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">dpi</span>
                  </div>
                  <div className="mt-1.5 flex gap-1">
                    {DPI_PRESETS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDpiText(String(d))}
                        className={cn(
                          "flex-1 rounded-md border px-1 py-1 text-[11px] font-medium tabular-nums transition-colors",
                          dpiNum === d
                            ? "border-[var(--n9-accent,#965034)]/50 bg-[var(--n9-accent,#965034)]/10 text-[var(--n9-accent,#965034)]"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  {isVector ? (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">SVG is a vector — resolution-independent.</p>
                  ) : dpiValid ? (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Physical DPI is embedded for print (journals check this).</p>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-red-500">Enter a DPI between {DPI_MIN} and {DPI_MAX}.</p>
                  )}
                </div>

                {/* File name */}
                <div className="mt-3">
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">File name</div>
                  <div className="relative">
                    <input
                      value={fname}
                      onChange={(e) => setFname(e.target.value)}
                      spellCheck={false}
                      className="h-9 w-full rounded-lg border border-input bg-background pl-3 pr-14 text-sm outline-none transition-colors focus:border-[var(--n9-accent,#965034)]/50 focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/20"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground">.{ext}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={doDownload}
                    disabled={busy !== null || (!isVector && !dpiValid)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--n9-accent,#965034)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === "export" ? <CircleNotch className="h-4 w-4 animate-spin" /> : <DownloadSimple className="h-4 w-4" />}
                    {busy === "export" ? "Rendering…" : "Download"}
                  </button>
                  {getPng && (
                    <button
                      type="button"
                      onClick={doCopy}
                      disabled={busy !== null}
                      title="Copy chart image to clipboard"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-[var(--n9-accent,#965034)]/40 hover:text-foreground disabled:opacity-50"
                    >
                      {busy === "copy" ? <CircleNotch className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4 text-[var(--n9-accent,#965034)]" weight="bold" /> : <Copy className="h-4 w-4" />}
                    </button>
                  )}
                  {onSaveToLibrary && (
                    <button
                      type="button"
                      onClick={() => {
                        onSaveToLibrary()
                        setOpen(false)
                      }}
                      title="Save to data files library"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-[var(--n9-accent,#965034)]/40 hover:text-foreground"
                    >
                      <FloppyDisk className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}

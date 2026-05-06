"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Camera,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
} from "lucide-react"
import { getFileExtension } from "@/lib/sample-molecular"

type SampleProteinViewerProps = {
  fileName: string
  fileUrl: string
}

type ViewerState = "idle" | "loading" | "ready" | "error"

const REPRESENTATION_PRESETS = [
  { value: "auto", label: "Auto" },
  { value: "polymer-cartoon", label: "Cartoon" },
  { value: "molecular-surface", label: "Surface" },
  { value: "atomic-detail", label: "Ball-and-stick" },
] as const

type RepresentationPreset = (typeof REPRESENTATION_PRESETS)[number]["value"]

function inferFormat(fileName: string): "pdb" | "mmcif" {
  const ext = getFileExtension(fileName)
  if (ext === "cif" || ext === "mmcif" || ext === "bcif") return "mmcif"
  return "pdb"
}

function readThemeColor(token: string, fallback: string): number {
  if (typeof window === "undefined") return parseInt(fallback.replace("#", ""), 16)
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  if (!value) return parseInt(fallback.replace("#", ""), 16)
  // Accept rgb(), rgba(), or hex.
  if (value.startsWith("#")) return parseInt(value.slice(1), 16)
  const match = value.match(/rgba?\(([^)]+)\)/)
  if (match) {
    const [r, g, b] = match[1]
      .split(",")
      .slice(0, 3)
      .map((s) => parseInt(s.trim(), 10))
    return (r << 16) + (g << 8) + b
  }
  return parseInt(fallback.replace("#", ""), 16)
}

export function SampleProteinViewer({ fileName, fileUrl }: SampleProteinViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<any>(null)
  const containerId = useId().replace(/[:]/g, "-")
  const [state, setState] = useState<ViewerState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [representation, setRepresentation] = useState<RepresentationPreset>("auto")
  const [isFullscreen, setIsFullscreen] = useState(false)

  const format = useMemo(() => inferFormat(fileName), [fileName])

  // Mount the molstar viewer once.
  useEffect(() => {
    let cancelled = false

    async function mount() {
      if (!containerRef.current) return
      setState("loading")
      setError(null)
      try {
        const [{ Viewer }] = await Promise.all([
          import("molstar/lib/apps/viewer/app"),
          import("molstar/build/viewer/molstar.css" as any).catch(() => null),
        ])
        if (cancelled || !containerRef.current) return
        const bgColor = readThemeColor("--card", "#fffdfa")
        const viewer = await Viewer.create(containerRef.current, {
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowRemoteState: false,
          layoutShowSequence: true,
          layoutShowLog: false,
          layoutShowLeftPanel: false,
          collapseLeftPanel: true,
          collapseRightPanel: true,
          viewportShowExpand: false,
          viewportShowSelectionMode: false,
          viewportShowAnimation: false,
          viewportShowControls: false,
          viewportShowSettings: false,
          viewportShowReset: false,
          viewportShowToggleFullscreen: false,
          viewportShowScreenshotControls: false,
          viewportShowTrajectoryControls: false,
          viewportBackgroundColor: `0x${bgColor.toString(16).padStart(6, "0")}`,
        } as any)
        if (cancelled) {
          try {
            viewer.plugin.dispose()
          } catch {}
          return
        }
        viewerRef.current = viewer
        await viewer.loadStructureFromUrl(fileUrl, format, false, { label: fileName })
        if (!cancelled) setState("ready")
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load this structure. Try downloading it instead."
          )
          setState("error")
        }
      }
    }

    mount()

    return () => {
      cancelled = true
      try {
        viewerRef.current?.plugin?.dispose?.()
      } catch {
        /* noop */
      }
      viewerRef.current = null
    }
    // We intentionally re-mount when fileUrl/format changes.
  }, [fileUrl, fileName, format])

  // Theme sync (background color follows --card).
  useEffect(() => {
    if (typeof window === "undefined") return
    const apply = () => {
      const viewer = viewerRef.current
      if (!viewer?.plugin?.canvas3d) return
      try {
        const color = readThemeColor("--card", "#fffdfa")
        viewer.plugin.canvas3d.setProps({
          renderer: { backgroundColor: color },
        })
      } catch {
        /* ignore */
      }
    }
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [state])

  // Fullscreen tracking.
  useEffect(() => {
    if (typeof document === "undefined") return
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const resetCamera = useCallback(() => {
    const viewer = viewerRef.current
    try {
      viewer?.plugin?.managers?.camera?.reset?.()
    } catch {}
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!wrapperRef.current) return
    if (document.fullscreenElement === wrapperRef.current) {
      await document.exitFullscreen()
    } else {
      await wrapperRef.current.requestFullscreen?.()
    }
  }, [])

  const downloadScreenshot = useCallback(async () => {
    const viewer = viewerRef.current
    if (!viewer?.plugin) return
    try {
      const helper = viewer.plugin.helpers?.viewportScreenshot
      if (!helper) return
      const blob: Blob = await helper.getImageDataUri().then(async (uri: string) => {
        const res = await fetch(uri)
        return res.blob()
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${fileName.replace(/\.[^.]+$/, "")}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("screenshot failed", err)
    }
  }, [fileName])

  const applyRepresentation = useCallback(
    async (preset: RepresentationPreset) => {
      setRepresentation(preset)
      const viewer = viewerRef.current
      if (!viewer?.plugin) return
      try {
        const structures = viewer.plugin.managers.structure.hierarchy.current.structures
        if (!structures || structures.length === 0) return
        for (const structure of structures) {
          const ref = structure.cell.transform.ref
          await viewer.plugin.builders.structure.representation.applyPreset(
            ref,
            preset === "auto" ? "auto" : preset
          )
        }
      } catch (err) {
        console.warn("Could not apply representation preset", err)
      }
    },
    []
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">{fileName}</p>
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wide">
            {format}
          </Badge>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Select value={representation} onValueChange={(value) => applyRepresentation(value as RepresentationPreset)}>
            <SelectTrigger size="sm" className="h-8 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPRESENTATION_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={resetCamera} disabled={state !== "ready"}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={downloadScreenshot} disabled={state !== "ready"}>
            <Camera className="mr-2 h-4 w-4" />
            Screenshot
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={fileUrl} download={fileName}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <Minimize2 className="mr-2 h-4 w-4" />
            ) : (
              <Maximize2 className="mr-2 h-4 w-4" />
            )}
            {isFullscreen ? "Exit" : "Fullscreen"}
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="overflow-hidden p-0">
        <div
          ref={wrapperRef}
          className="relative h-[560px] min-h-[360px] w-full overflow-hidden bg-card"
        >
          {state === "loading" ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading structure...
            </div>
          ) : null}
          <div
            id={`molstar-${containerId}`}
            ref={containerRef}
            className="h-full w-full"
            style={{ position: "relative" }}
          />
        </div>
      </Card>
    </div>
  )
}

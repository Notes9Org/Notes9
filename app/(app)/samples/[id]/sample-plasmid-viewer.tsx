"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Palette,
  Plus,
  Save,
  Search,
  Tag,
  Target,
  Trash2,
  X,
} from "lucide-react"
import {
  alignDnaSequencesAdvanced,
  cleanDnaSequence,
  findCrisprGuides,
  getFileExtension,
  molecularFileFormatLabel,
  parseSequenceText,
  shouldParseSequenceTextOnUpload,
  type AlignmentMode,
  type CrisprGuide,
  type ExtendedAlignmentResult,
} from "@/lib/sample-molecular"

const SeqVizComponent = dynamic(
  () => import("seqviz").then((mod) => mod.SeqViz),
  { ssr: false, loading: () => <ViewerLoadingState /> }
)

export type PlasmidAlignmentSource = {
  id: string
  fileName: string
  /** Pre-parsed sequence if already cached. */
  sequence?: string
}

type SamplePlasmidViewerProps = {
  fileName: string
  fileUrl: string
  parsedMetadata: Record<string, any>
  viewerState: Record<string, any>
  onSave: (payload: { parsedMetadata: Record<string, any>; viewerState: Record<string, any> }) => Promise<void>
  /** Other plasmid/sequence files attached to the same sample (excluding the current). */
  alignmentSources?: PlasmidAlignmentSource[]
  /** Resolves a source's sequence on demand (network/parse). */
  onResolveSourceSequence?: (sourceId: string) => Promise<string>
}

type ViewerMode = "circular" | "linear" | "both"
type BottomTab = "selection" | "annotate" | "align" | "crispr" | "json"

type SeqVizAnnotation = {
  id?: string
  name: string
  start: number
  end: number
  direction?: 1 | -1 | 0
  color?: string
  type?: string
}

type SeqVizPrimer = {
  id?: string
  name: string
  start: number
  end: number
  direction?: 1 | -1
}

type CustomAnnotation = {
  id: string
  name: string
  start: number
  end: number
  direction: 1 | -1 | 0
  color: string
}

type SeqVizSelection = {
  start: number
  end: number
  length: number
  clockwise?: boolean
  name?: string
}

type NormalizedSequence = {
  name: string
  circular: boolean
  sequence: string
  features: any[]
  primers: any[]
  parts?: any[]
  translations?: any[]
  orfs?: any[]
  parser?: string
  parse_deferred?: string
  parse_warning?: string
}

const COLOR_SCHEMES: Record<string, { label: string; colors: string[] }> = {
  default: {
    label: "Default",
    colors: ["#965034", "#7a8fa7", "#8f9f86", "#c5a46d", "#c07b5a", "#a0789c", "#5b8a8a", "#b7895a"],
  },
  pastel: {
    label: "Pastel",
    colors: ["#f4cfc4", "#cfe0ee", "#d6e8c9", "#f1e3c0", "#f1c9ad", "#e1cee0", "#bcd6d6", "#ead6bd"],
  },
  vivid: {
    label: "Vivid",
    colors: ["#e63946", "#1d3557", "#2a9d8f", "#f4a261", "#9b5de5", "#00bbf9", "#ffb703", "#fb5607"],
  },
  mono: {
    label: "Monochrome",
    colors: ["#3f3f46", "#52525b", "#71717a", "#a1a1aa", "#d4d4d8", "#e4e4e7", "#71717a", "#52525b"],
  },
  forest: {
    label: "Forest",
    colors: ["#2d6a4f", "#40916c", "#52b788", "#74c69d", "#95d5b2", "#b7e4c7", "#1b4332", "#081c15"],
  },
}

const ANNOTATION_COLOR_OPTIONS = [
  "#965034",
  "#7a8fa7",
  "#8f9f86",
  "#c5a46d",
  "#c07b5a",
  "#a0789c",
  "#5b8a8a",
  "#b7895a",
  "#e63946",
  "#1d3557",
  "#2a9d8f",
  "#9b5de5",
]

function ViewerLoadingState() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading plasmid viewer...
    </div>
  )
}

function pickColor(palette: string[], index: number): string {
  return palette[index % palette.length]
}

function coerceArray(value: any): any[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object") return Object.values(value)
  return []
}

function sanitizeSequence(raw: string): string {
  return (raw || "")
    .toUpperCase()
    .replace(/U/g, "T")
    .replace(/[^ACGTN]/g, "")
}

function normalizeFromBioParser(raw: any, fileName: string): NormalizedSequence {
  const first = Array.isArray(raw) ? raw[0] : raw
  const parsed = first?.parsedSequence ?? first?.sequenceData ?? first ?? {}
  const sequence = sanitizeSequence(parsed.sequence ?? "")
  return {
    name: parsed.name || fileName,
    circular: Boolean(parsed.circular ?? true),
    sequence,
    features: coerceArray(parsed.features),
    primers: coerceArray(parsed.primers),
    parts: coerceArray(parsed.parts),
    translations: coerceArray(parsed.translations),
    orfs: coerceArray(parsed.orfs),
  }
}

function clampToSequence(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0
  if (length <= 0) return 0
  return Math.max(0, Math.min(Math.floor(value), length))
}

function toSeqVizAnnotations(
  features: any,
  sequenceLength: number,
  palette: string[]
): SeqVizAnnotation[] {
  return coerceArray(features)
    .map((feature, index): SeqVizAnnotation | null => {
      if (!feature || typeof feature !== "object") return null
      const rawStart =
        typeof feature.start === "number" ? feature.start : feature.locations?.[0]?.start
      const rawEnd =
        typeof feature.end === "number" ? feature.end : feature.locations?.[0]?.end
      if (typeof rawStart !== "number" || typeof rawEnd !== "number") return null
      const start = clampToSequence(rawStart, sequenceLength)
      const end = clampToSequence(rawEnd, sequenceLength)
      if (start === end) return null
      const direction =
        feature.strand === 1 || feature.strand === "1" || feature.forward === true
          ? 1
          : feature.strand === -1 || feature.strand === "-1" || feature.forward === false
          ? -1
          : 0
      return {
        id: feature.id ?? `feature-${index}`,
        name: feature.name || feature.type || `feature-${index + 1}`,
        start,
        end,
        direction,
        color:
          typeof feature.color === "string" && feature.color.startsWith("#")
            ? feature.color
            : pickColor(palette, index),
        type: feature.type ?? undefined,
      }
    })
    .filter((value): value is SeqVizAnnotation => value !== null)
}

function toSeqVizPrimers(primers: any, sequenceLength: number): SeqVizPrimer[] {
  return coerceArray(primers)
    .map((primer, index): SeqVizPrimer | null => {
      if (!primer || typeof primer !== "object") return null
      const rawStart = typeof primer.start === "number" ? primer.start : null
      const rawEnd = typeof primer.end === "number" ? primer.end : null
      if (rawStart == null || rawEnd == null) return null
      const start = clampToSequence(rawStart, sequenceLength)
      const end = clampToSequence(rawEnd, sequenceLength)
      if (start === end) return null
      return {
        id: primer.id ?? `primer-${index}`,
        name: primer.name || `primer-${index + 1}`,
        start,
        end,
        direction: primer.strand === -1 || primer.forward === false ? -1 : 1,
      }
    })
    .filter((value): value is SeqVizPrimer => value !== null)
}

function selectionSequence(seq: string, sel: SeqVizSelection | null): string {
  if (!sel || !seq || sel.length <= 0) return ""
  const len = seq.length
  if (sel.start <= sel.end) return seq.slice(sel.start, sel.end)
  return seq.slice(sel.start, len) + seq.slice(0, sel.end)
}

function gcOf(seq: string): number | null {
  if (!seq) return null
  let gc = 0
  for (let i = 0; i < seq.length; i++) {
    const c = seq.charCodeAt(i)
    if (c === 71 || c === 67) gc++
  }
  return Math.round((gc / seq.length) * 1000) / 10
}

export function SamplePlasmidViewer({
  fileName,
  fileUrl,
  parsedMetadata,
  viewerState,
  onSave,
  alignmentSources = [],
  onResolveSourceSequence,
}: SamplePlasmidViewerProps) {
  const { toast } = useToast()
  const isBinarySnapGene = getFileExtension(fileName) === "dna"
  const [sequenceData, setSequenceData] = useState<NormalizedSequence | null>(
    parsedMetadata.sequenceData
      ? normalizeFromBioParser(parsedMetadata.sequenceData, fileName)
      : null
  )
  const [customAnnotations, setCustomAnnotations] = useState<CustomAnnotation[]>(
    Array.isArray(parsedMetadata.customAnnotations) ? parsedMetadata.customAnnotations : []
  )
  const [colorScheme, setColorScheme] = useState<string>(
    typeof viewerState?.colorScheme === "string" && COLOR_SCHEMES[viewerState.colorScheme]
      ? viewerState.colorScheme
      : "default"
  )
  const [jsonText, setJsonText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pastedSequence, setPastedSequence] = useState("")
  const [alignment, setAlignment] = useState<ExtendedAlignmentResult | null>(null)
  const [alignmentMode, setAlignmentMode] = useState<AlignmentMode>("semiglobal")
  const [tryReverseComplement, setTryReverseComplement] = useState(true)
  const [alignSourceId, setAlignSourceId] = useState<string>("paste")
  const [resolvingSource, setResolvingSource] = useState(false)
  const [crisprGuides, setCrisprGuides] = useState<CrisprGuide[]>([])
  const [viewerMode, setViewerMode] = useState<ViewerMode>(
    (viewerState?.viewer as ViewerMode) || "circular"
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<BottomTab>("selection")
  const [selection, setSelection] = useState<SeqVizSelection | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [annotationName, setAnnotationName] = useState("")
  const [annotationColor, setAnnotationColor] = useState(ANNOTATION_COLOR_OPTIONS[0])
  const [aligning, setAligning] = useState(false)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadSequence() {
      setLoading(true)
      setError(null)
      try {
        let next: NormalizedSequence | null = parsedMetadata.sequenceData
          ? normalizeFromBioParser(parsedMetadata.sequenceData, fileName)
          : null

        if (!next || !next.sequence) {
          const response = await fetch(fileUrl)
          if (!response.ok) throw new Error(`Could not download sequence file (${response.status})`)

          if (isBinarySnapGene) {
            const blob = await response.blob()
            const file = new File([blob], fileName, {
              type: blob.type || "application/octet-stream",
            })
            const { anyToJson } = await import("@teselagen/bio-parsers")
            const parsed = await anyToJson(file, {
              fileName,
              isProtein: false,
            } as any)
            next = normalizeFromBioParser(parsed, fileName)
            next.parser = "snapgene-dna"
          } else if (shouldParseSequenceTextOnUpload(fileName)) {
            const text = await response.text()
            try {
              const { anyToJson } = await import("@teselagen/bio-parsers")
              const parsed = await anyToJson(text, { fileName } as any)
              next = normalizeFromBioParser(parsed, fileName)
              next.parser = "bio-parsers"
            } catch {
              const fallback = parseSequenceText(fileName, text)
              next = normalizeFromBioParser(fallback, fileName)
              next.parser = "fallback"
            }
          } else {
            next = {
              name: fileName,
              circular: true,
              sequence: "",
              features: [],
              primers: [],
              parse_deferred: "Binary file format not supported in viewer.",
            }
          }
        }

        if (cancelled || !next) return
        setSequenceData(next)
        setJsonText(JSON.stringify(next, null, 2))
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not parse this sequence file.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSequence()
    return () => {
      cancelled = true
    }
  }, [fileName, fileUrl, isBinarySnapGene, parsedMetadata.sequenceData])

  const sequenceLength = sequenceData?.sequence.length ?? 0
  const palette = COLOR_SCHEMES[colorScheme].colors

  const annotations = useMemo(() => {
    if (!sequenceData) return [] as SeqVizAnnotation[]
    const fromFeatures = toSeqVizAnnotations(sequenceData.features, sequenceLength, palette)
    const fromCustom: SeqVizAnnotation[] = customAnnotations.map((a) => ({
      id: a.id,
      name: a.name,
      start: clampToSequence(a.start, sequenceLength),
      end: clampToSequence(a.end, sequenceLength),
      direction: a.direction,
      color: a.color,
      type: "custom",
    }))
    return [...fromFeatures, ...fromCustom]
  }, [sequenceData, sequenceLength, palette, customAnnotations])

  const primers = useMemo(
    () => (sequenceData ? toSeqVizPrimers(sequenceData.primers, sequenceLength) : []),
    [sequenceData, sequenceLength]
  )

  const currentSequence = cleanDnaSequence(sequenceData?.sequence ?? "")
  const pastedClean = cleanDnaSequence(pastedSequence)
  const gcPercent = useMemo(() => gcOf(sequenceData?.sequence ?? ""), [sequenceData?.sequence])
  const selectedSeq = useMemo(
    () => selectionSequence(sequenceData?.sequence ?? "", selection),
    [sequenceData?.sequence, selection]
  )
  const selectedGc = useMemo(() => gcOf(selectedSeq), [selectedSeq])

  const handleSelection = useCallback((sel: any) => {
    if (!sel || !sel.length) {
      setSelection(null)
      return
    }
    setSelection({
      start: sel.start ?? 0,
      end: sel.end ?? 0,
      length: sel.length ?? 0,
      clockwise: sel.clockwise,
      name: sel.name,
    })
  }, [])

  const resolveQuerySequence = useCallback(async (): Promise<string> => {
    if (alignSourceId === "paste") return pastedClean
    const source = alignmentSources.find((s) => s.id === alignSourceId)
    if (!source) return ""
    if (source.sequence) return cleanDnaSequence(source.sequence)
    if (!onResolveSourceSequence) return ""
    setResolvingSource(true)
    try {
      const seq = await onResolveSourceSequence(source.id)
      return cleanDnaSequence(seq)
    } finally {
      setResolvingSource(false)
    }
  }, [alignSourceId, pastedClean, alignmentSources, onResolveSourceSequence])

  const runAlignment = useCallback(async () => {
    if (!currentSequence) {
      setError("Load a construct before aligning.")
      return
    }
    setError(null)
    setAligning(true)
    setActiveTab("align")
    try {
      const query = await resolveQuerySequence()
      if (!query) {
        setError(
          alignSourceId === "paste"
            ? "Paste a DNA sequence to align."
            : "Could not resolve the selected source sequence."
        )
        return
      }
      const result = alignDnaSequencesAdvanced(query, currentSequence, {
        mode: alignmentMode,
        tryReverseComplement,
      })
      setAlignment(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alignment failed.")
    } finally {
      setAligning(false)
    }
  }, [currentSequence, resolveQuerySequence, alignmentMode, tryReverseComplement, alignSourceId])

  const runCrisprAnalysis = () => {
    const sequence = pastedClean || currentSequence
    if (!sequence) {
      setError("Paste a DNA sequence or load a construct sequence before running CRISPR analysis.")
      return
    }
    setError(null)
    setScanning(true)
    setActiveTab("crispr")
    requestAnimationFrame(() => {
      try {
        setCrisprGuides(findCrisprGuides(sequence, 30))
      } catch (err) {
        setError(err instanceof Error ? err.message : "CRISPR scan failed.")
      } finally {
        setScanning(false)
      }
    })
  }

  const addAnnotationFromSelection = () => {
    if (!selection || selection.length <= 0) {
      setError("Select a region in the map first, then add an annotation.")
      return
    }
    if (!annotationName.trim()) {
      setError("Give the annotation a name.")
      return
    }
    setError(null)
    const next: CustomAnnotation = {
      id: `custom-${Date.now()}`,
      name: annotationName.trim(),
      start: selection.start,
      end: selection.end,
      direction: selection.clockwise === false ? -1 : 1,
      color: annotationColor,
    }
    setCustomAnnotations((current) => [...current, next])
    setAnnotationName("")
  }

  const removeAnnotation = (id: string) => {
    setCustomAnnotations((current) => current.filter((a) => a.id !== id))
  }

  const copySelection = async () => {
    if (!selectedSeq) return
    try {
      await navigator.clipboard.writeText(selectedSeq)
      toast({ title: "Copied", description: `${selectedSeq.length.toLocaleString()} bp copied.` })
    } catch {
      setError("Could not copy selection.")
    }
  }

  const saveJson = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const parsed = JSON.parse(jsonText)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Sequence JSON must be an object.")
      }
      const next = normalizeFromBioParser(parsed, fileName)
      await onSave({
        parsedMetadata: {
          ...parsedMetadata,
          sequenceData: next,
          customAnnotations,
          parser: parsed.parser,
        },
        viewerState: { ...viewerState, viewer: viewerMode, colorScheme },
      })
      setSequenceData(next)
      setJsonText(JSON.stringify(next, null, 2))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sequence JSON.")
    } finally {
      setSaving(false)
    }
  }, [jsonText, fileName, onSave, parsedMetadata, viewerState, viewerMode, colorScheme, customAnnotations])

  const saveCurrent = useCallback(async () => {
    if (!sequenceData) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        parsedMetadata: {
          ...parsedMetadata,
          sequenceData,
          customAnnotations,
          parser: sequenceData.parser,
        },
        viewerState: { ...viewerState, viewer: viewerMode, colorScheme },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sequence.")
    } finally {
      setSaving(false)
    }
  }, [sequenceData, onSave, parsedMetadata, viewerState, viewerMode, colorScheme, customAnnotations])

  const downloadFasta = () => {
    if (!sequenceData?.sequence) return
    const fasta = `>${sequenceData.name || fileName}\n${
      sequenceData.sequence.match(/.{1,80}/g)?.join("\n") ?? sequenceData.sequence
    }`
    const blob = new Blob([fasta], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${(sequenceData.name || fileName).replace(/[^a-z0-9._-]+/gi, "_")}.fasta`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const containerClass = fullscreen
    ? "fixed inset-0 z-50 overflow-auto bg-background p-3 space-y-3"
    : "space-y-3"
  const mapHeight = fullscreen
    ? "h-[calc(100vh-360px)]"
    : "h-[calc(100vh-360px)] min-h-[440px]"

  return (
    <div className={containerClass}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 px-1">
          <span className="min-w-0 max-w-full truncate text-sm font-medium leading-tight text-foreground">
            {sequenceData?.name || fileName}
          </span>
          <Badge
            variant="outline"
            className="h-5 shrink-0 px-2 py-0 font-mono text-[10px] font-semibold uppercase leading-none tracking-wide"
          >
            {molecularFileFormatLabel(fileName)}
          </Badge>
          {sequenceLength ? (
            <Badge
              variant="outline"
              className="h-5 shrink-0 px-2 py-0 font-mono text-[10px] font-semibold leading-none tabular-nums"
            >
              {sequenceLength.toLocaleString()} bp
            </Badge>
          ) : null}
          {sequenceData?.circular === false ? (
            <Badge
              variant="outline"
              className="h-5 shrink-0 px-2 py-0 text-[10px] font-semibold uppercase leading-none tracking-wide"
            >
              linear
            </Badge>
          ) : null}
          {gcPercent != null ? (
            <Badge
              variant="outline"
              className="h-5 shrink-0 px-2 py-0 font-mono text-[10px] font-semibold leading-none tabular-nums"
            >
              {gcPercent}% GC
            </Badge>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border bg-background p-0.5">
            {(["circular", "linear", "both"] as ViewerMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewerMode(mode)}
                className={`rounded-sm px-2 py-1 text-xs capitalize transition-colors ${
                  viewerMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border bg-background px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Find sequence"
              className="h-7 w-44 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <Select value={colorScheme} onValueChange={setColorScheme}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <Palette className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(COLOR_SCHEMES).map(([key, scheme]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {scheme.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFullscreen((v) => !v)}
            aria-label="Toggle fullscreen"
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>

          <Button type="button" variant="outline" size="sm" asChild>
            <a href={fileUrl} download={fileName}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              File
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadFasta}
            disabled={!sequenceData?.sequence}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            FASTA
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={saveCurrent}
            disabled={saving || loading}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-start justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="h-3.5 w-3.5" />
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Plasmid map */}
      <Card className="min-w-0 overflow-hidden p-0">
        <div className={`n9-seqviz-theme relative ${mapHeight} w-full bg-card`}>
          {loading || !sequenceData ? (
            <ViewerLoadingState />
          ) : sequenceData.sequence ? (
            <SeqVizComponent
              name={sequenceData.name}
              seq={sequenceData.sequence}
              annotations={annotations}
              primers={primers}
              viewer={viewerMode}
              showComplement
              showIndex
              rotateOnScroll
              search={searchQuery ? { query: searchQuery, mismatch: 0 } : undefined}
              colors={palette}
              onSelection={handleSelection}
              style={{ height: "100%", width: "100%" }}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No sequence available. Download the file and re-upload, or paste a sequence below to stage one.
            </div>
          )}
        </div>
      </Card>

      {/* Bottom tabbed panel */}
      <Card className="overflow-hidden p-0">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BottomTab)}>
          <div className="border-b bg-muted/30 px-3 py-1.5">
            <TabsList className="h-8">
              <TabsTrigger value="selection" className="h-7 px-2.5 text-xs">
                Selection
                {selection && selection.length > 0 ? (
                  <Badge variant="secondary" className="ml-1.5 px-1 font-mono text-[10px] tabular-nums">
                    {selection.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="annotate" className="h-7 px-2.5 text-xs">
                <Tag className="mr-1 h-3 w-3" />
                Annotate
                {customAnnotations.length > 0 ? (
                  <Badge variant="secondary" className="ml-1.5 px-1 font-mono text-[10px] tabular-nums">
                    {customAnnotations.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="align" className="h-7 px-2.5 text-xs">
                <Search className="mr-1 h-3 w-3" />
                Align
              </TabsTrigger>
              <TabsTrigger value="crispr" className="h-7 px-2.5 text-xs">
                <Target className="mr-1 h-3 w-3" />
                CRISPR
              </TabsTrigger>
              <TabsTrigger value="json" className="h-7 px-2.5 text-xs">
                JSON
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-3">
            {activeTab === "selection" ? (
              <SelectionPanel
                selection={selection}
                selectedSeq={selectedSeq}
                selectedGc={selectedGc}
                onCopy={copySelection}
                onAnnotate={() => setActiveTab("annotate")}
              />
            ) : null}

            {activeTab === "annotate" ? (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Name</Label>
                    <Input
                      value={annotationName}
                      onChange={(event) => setAnnotationName(event.target.value)}
                      placeholder={selection ? "e.g. promoter" : "Select a region first"}
                      disabled={!selection}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Color</Label>
                    <div className="flex flex-wrap gap-1">
                      {ANNOTATION_COLOR_OPTIONS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setAnnotationColor(c)}
                          aria-label={`Pick color ${c}`}
                          style={{ background: c }}
                          className={`h-5 w-5 rounded-full border-2 ${
                            annotationColor === c ? "border-foreground" : "border-transparent"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={addAnnotationFromSelection}
                      disabled={!selection || !annotationName.trim()}
                      className="w-full"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                </div>
                {selection && selection.length > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Adding annotation at{" "}
                    <span className="font-mono">
                      {selection.start}-{selection.end}
                    </span>{" "}
                    ({selection.length.toLocaleString()} bp).
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Click and drag on the map to select a region, then add a named annotation.
                  </p>
                )}

                {customAnnotations.length > 0 ? (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Your annotations</Label>
                    <div className="space-y-1">
                      {customAnnotations.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-sm"
                            style={{ background: a.color }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {a.name}
                          </span>
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {a.start}-{a.end}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAnnotation(a.id)}
                            aria-label={`Delete ${a.name}`}
                            className="rounded-sm p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "align" ? (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Query source</Label>
                    <Select value={alignSourceId} onValueChange={setAlignSourceId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paste" className="text-xs">
                          Pasted sequence
                        </SelectItem>
                        {alignmentSources.map((source) => (
                          <SelectItem key={source.id} value={source.id} className="text-xs">
                            {source.fileName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Alignment type</Label>
                    <Select
                      value={alignmentMode}
                      onValueChange={(value) => setAlignmentMode(value as AlignmentMode)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global" className="text-xs">
                          Global (Needleman-Wunsch)
                        </SelectItem>
                        <SelectItem value="local" className="text-xs">
                          Local (Smith-Waterman)
                        </SelectItem>
                        <SelectItem value="semiglobal" className="text-xs">
                          Semi-global (free end gaps)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Strand</Label>
                    <button
                      type="button"
                      onClick={() => setTryReverseComplement((v) => !v)}
                      className={`flex h-8 w-full items-center justify-between rounded-md border px-2 text-xs transition-colors ${
                        tryReverseComplement
                          ? "border-primary bg-primary/10 text-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span>Try reverse complement</span>
                      <span className="font-mono text-[10px]">
                        {tryReverseComplement ? "ON" : "OFF"}
                      </span>
                    </button>
                  </div>
                </div>

                {alignSourceId === "paste" ? (
                  <Textarea
                    value={pastedSequence}
                    onChange={(event) => setPastedSequence(event.target.value)}
                    placeholder="Paste DNA or FASTA sequence to align against the construct..."
                    className="h-28 resize-y font-mono text-xs"
                    spellCheck={false}
                  />
                ) : (
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Aligning{" "}
                    <span className="font-medium text-foreground">
                      {alignmentSources.find((s) => s.id === alignSourceId)?.fileName ?? "selected file"}
                    </span>{" "}
                    against the current construct.
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
                    {(alignSourceId === "paste"
                      ? pastedClean.length
                      : alignmentSources.find((s) => s.id === alignSourceId)?.sequence?.length ?? 0
                    ).toLocaleString()}{" "}
                    bp query
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
                    {currentSequence.length.toLocaleString()} bp construct
                  </Badge>
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPastedSequence("")
                        setAlignment(null)
                      }}
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={runAlignment}
                      disabled={aligning || resolvingSource || !currentSequence}
                    >
                      {aligning || resolvingSource ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Run alignment
                    </Button>
                  </div>
                </div>
                {alignment ? <AlignmentResultPanel result={alignment} /> : null}
              </div>
            ) : null}

            {activeTab === "crispr" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    Scans the {pastedClean ? "pasted" : "construct"} sequence for SpCas9 NGG, 20 nt guides.
                  </p>
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={runCrisprAnalysis}
                      disabled={scanning || (!pastedClean && !currentSequence)}
                    >
                      {scanning ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Target className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Run CRISPR scan
                    </Button>
                  </div>
                </div>
                {crisprGuides.length > 0 ? (
                  <div className="max-h-96 space-y-2 overflow-auto pr-1">
                    {crisprGuides.map((guide) => (
                      <div key={guide.id} className="rounded-md border bg-muted/30 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-xs text-foreground">{guide.guide}</p>
                          <Badge variant="secondary">{guide.pam}</Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge variant="outline">{guide.strand} strand</Badge>
                          <Badge variant="outline">{guide.start}-{guide.end}</Badge>
                          <Badge variant="outline">{guide.gcPercent}% GC</Badge>
                          {guide.hasPolyT ? <Badge variant="destructive">poly-T</Badge> : null}
                          {guide.selfSeedMatches > 1 ? (
                            <Badge variant="outline">{guide.selfSeedMatches} seed hits</Badge>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !scanning ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Click <span className="font-medium">Run CRISPR scan</span> to find guide RNAs.
                  </p>
                ) : null}
              </div>
            ) : null}

            {activeTab === "json" ? (
              <div className="space-y-2">
                <Textarea
                  value={jsonText}
                  onChange={(event) => setJsonText(event.target.value)}
                  className="h-72 min-h-60 resize-y overflow-auto font-mono text-xs"
                  spellCheck={false}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveJson}
                    disabled={saving || loading}
                  >
                    {saving ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Save JSON
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </Tabs>
      </Card>
    </div>
  )
}

function SelectionPanel({
  selection,
  selectedSeq,
  selectedGc,
  onCopy,
  onAnnotate,
}: {
  selection: SeqVizSelection | null
  selectedSeq: string
  selectedGc: number | null
  onCopy: () => void
  onAnnotate: () => void
}) {
  if (!selection || selection.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Click and drag on the plasmid map to select a region. The selected sequence will appear here.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
          {selection.start}-{selection.end}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
          {selection.length.toLocaleString()} bp
        </Badge>
        {selectedGc != null ? (
          <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
            {selectedGc}% GC
          </Badge>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCopy} disabled={!selectedSeq}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onAnnotate}>
            <Tag className="mr-1.5 h-3.5 w-3.5" />
            Annotate
          </Button>
        </div>
      </div>
      <div className="max-h-44 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-[12px] leading-5 text-foreground">
        {formatSequence(selectedSeq)}
      </div>
    </div>
  )
}

function formatSequence(seq: string): string {
  if (!seq) return ""
  return seq.match(/.{1,60}/g)?.join("\n") ?? seq
}

function AlignmentResultPanel({ result }: { result: ExtendedAlignmentResult }) {
  const width = 60
  const blocks: { q: string; m: string; s: string; offset: number }[] = []
  for (let i = 0; i < result.query.length; i += width) {
    blocks.push({
      q: result.query.slice(i, i + width),
      m: result.matchLine.slice(i, i + width),
      s: result.subject.slice(i, i + width),
      offset: i,
    })
  }

  const totalAligned = result.alignedLength || 1
  const matchPct = Math.round((result.matches / totalAligned) * 100)
  const mismatchPct = Math.round((result.mismatches / totalAligned) * 100)
  const gapPct = 100 - matchPct - mismatchPct

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
          mode: {result.mode}
        </Badge>
        <Badge
          variant="outline"
          className={result.strand === "-" ? "border-amber-500 text-amber-600 dark:text-amber-400" : ""}
        >
          {result.strand} strand
        </Badge>
        <Badge variant="outline">Identity {result.identity}%</Badge>
        <Badge variant="outline">Score {result.score}</Badge>
        <Badge variant="outline">Length {result.alignedLength}</Badge>
        <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">
          {result.matches} match
        </Badge>
        <Badge variant="outline" className="text-rose-700 dark:text-rose-400">
          {result.mismatches} mismatch
        </Badge>
        <Badge variant="outline" className="text-rose-700 dark:text-rose-400">
          {result.insertions + result.deletions} gap
        </Badge>
        <Badge
          variant="outline"
          className={
            result.netFrameShift === 0
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400"
          }
          title={`net (insertions − deletions) mod 3`}
        >
          frame shift: {result.netFrameShift === 0 ? "none" : `+${result.netFrameShift}`}
        </Badge>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${matchPct}%` }} title={`Matches ${matchPct}%`} />
        <div className="bg-rose-500" style={{ width: `${mismatchPct}%` }} title={`Mismatches ${mismatchPct}%`} />
        <div className="bg-rose-300 dark:bg-rose-900" style={{ width: `${gapPct}%` }} title={`Gaps ${gapPct}%`} />
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> match
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-rose-500" /> mismatch
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-rose-300 dark:bg-rose-900" /> gap
        </span>
      </div>

      <div className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-5">
        {blocks.map((block, idx) => (
          <div key={idx} className="mb-2 last:mb-0">
            <div className="flex">
              <span className="w-16 shrink-0 text-muted-foreground">Query</span>
              <span>{renderColoredAlignment(block.q, block.m, "q")}</span>
            </div>
            <div className="flex">
              <span className="w-16 shrink-0 text-muted-foreground"></span>
              <span className="text-muted-foreground">{block.m}</span>
            </div>
            <div className="flex">
              <span className="w-16 shrink-0 text-muted-foreground">Subject</span>
              <span>{renderColoredAlignment(block.s, block.m, "s")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderColoredAlignment(seq: string, matchLine: string, _which: "q" | "s") {
  const out: React.ReactNode[] = []
  let buffer = ""
  let bufferKind: "match" | "mismatch" | "gap" | null = null
  const flush = (i: number) => {
    if (!buffer) return
    const cls =
      bufferKind === "match"
        ? "text-emerald-700 dark:text-emerald-400"
        : bufferKind === "gap"
        ? "bg-rose-200/50 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
        : "bg-rose-200/60 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300"
    out.push(
      <span key={`${i}-${out.length}`} className={cls}>
        {buffer}
      </span>
    )
    buffer = ""
    bufferKind = null
  }
  for (let i = 0; i < seq.length; i++) {
    const ch = seq[i]
    const m = matchLine[i] ?? " "
    const kind: "match" | "mismatch" | "gap" =
      ch === "-" ? "gap" : m === "|" ? "match" : "mismatch"
    if (bufferKind && bufferKind !== kind) flush(i)
    bufferKind = kind
    buffer += ch
  }
  flush(seq.length)
  return out
}

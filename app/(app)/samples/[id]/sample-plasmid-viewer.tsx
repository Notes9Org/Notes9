"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Save,
  Scissors,
  Search,
  Target,
} from "lucide-react"
import {
  alignDnaSequences,
  cleanDnaSequence,
  findCrisprGuides,
  getFileExtension,
  parseSequenceText,
  shouldParseSequenceTextOnUpload,
  type AlignmentResult,
  type CrisprGuide,
} from "@/lib/sample-molecular"

const SeqVizComponent = dynamic(
  () => import("seqviz").then((mod) => mod.SeqViz),
  { ssr: false, loading: () => <ViewerLoadingState /> }
)

type SamplePlasmidViewerProps = {
  fileName: string
  fileUrl: string
  parsedMetadata: Record<string, any>
  viewerState: Record<string, any>
  onSave: (payload: { parsedMetadata: Record<string, any>; viewerState: Record<string, any> }) => Promise<void>
}

type ViewerMode = "circular" | "linear" | "both"
type ToolTab = "paste" | "align" | "crispr" | "json"

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

const FEATURE_PALETTE = [
  "#965034",
  "#7a8fa7",
  "#8f9f86",
  "#c5a46d",
  "#c07b5a",
  "#a0789c",
  "#5b8a8a",
  "#b7895a",
]

function ViewerLoadingState() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading plasmid viewer...
    </div>
  )
}

function pickColor(index: number): string {
  return FEATURE_PALETTE[index % FEATURE_PALETTE.length]
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

function toSeqVizAnnotations(features: any, sequenceLength: number): SeqVizAnnotation[] {
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
        color: typeof feature.color === "string" && feature.color.startsWith("#") ? feature.color : pickColor(index),
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

export function SamplePlasmidViewer({
  fileName,
  fileUrl,
  parsedMetadata,
  viewerState,
  onSave,
}: SamplePlasmidViewerProps) {
  const isBinarySnapGene = getFileExtension(fileName) === "dna"
  const [sequenceData, setSequenceData] = useState<NormalizedSequence | null>(
    parsedMetadata.sequenceData
      ? normalizeFromBioParser(parsedMetadata.sequenceData, fileName)
      : null
  )
  const [jsonText, setJsonText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pastedSequence, setPastedSequence] = useState("")
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null)
  const [crisprGuides, setCrisprGuides] = useState<CrisprGuide[]>([])
  const [viewerMode, setViewerMode] = useState<ViewerMode>(
    (viewerState?.viewer as ViewerMode) || "circular"
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [toolsOpen, setToolsOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<ToolTab>("paste")

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
            const buffer = await response.arrayBuffer()
            const { anyToJson } = await import("@teselagen/bio-parsers")
            const parsed = await anyToJson(new Uint8Array(buffer), {
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
  const annotations = useMemo(
    () => (sequenceData ? toSeqVizAnnotations(sequenceData.features, sequenceLength) : []),
    [sequenceData, sequenceLength]
  )
  const primers = useMemo(
    () => (sequenceData ? toSeqVizPrimers(sequenceData.primers, sequenceLength) : []),
    [sequenceData, sequenceLength]
  )

  const currentSequence = cleanDnaSequence(sequenceData?.sequence ?? "")
  const pastedClean = cleanDnaSequence(pastedSequence)

  const gcPercent = useMemo(() => {
    if (!sequenceLength) return null
    const seq = sequenceData?.sequence ?? ""
    let gc = 0
    for (let i = 0; i < seq.length; i++) {
      const c = seq.charCodeAt(i)
      if (c === 71 || c === 67) gc++
    }
    return Math.round((gc / sequenceLength) * 1000) / 10
  }, [sequenceData?.sequence, sequenceLength])

  const runAlignment = () => {
    if (!pastedClean || !currentSequence) {
      setError("Paste a DNA sequence and load a construct before aligning.")
      return
    }
    setError(null)
    setAlignment(alignDnaSequences(pastedClean, currentSequence))
    setActiveTool("align")
    setToolsOpen(true)
  }

  const runCrisprAnalysis = () => {
    const sequence = pastedClean || currentSequence
    if (!sequence) {
      setError("Paste a DNA sequence or load a construct sequence before running CRISPR analysis.")
      return
    }
    setError(null)
    setCrisprGuides(findCrisprGuides(sequence, 20))
    setActiveTool("crispr")
    setToolsOpen(true)
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
        parsedMetadata: { ...parsedMetadata, sequenceData: next, parser: parsed.parser },
        viewerState: { ...viewerState, viewer: viewerMode },
      })
      setSequenceData(next)
      setJsonText(JSON.stringify(next, null, 2))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sequence JSON.")
    } finally {
      setSaving(false)
    }
  }, [jsonText, fileName, onSave, parsedMetadata, viewerState, viewerMode])

  const saveCurrent = useCallback(async () => {
    if (!sequenceData) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        parsedMetadata: { ...parsedMetadata, sequenceData, parser: sequenceData.parser },
        viewerState: { ...viewerState, viewer: viewerMode },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sequence.")
    } finally {
      setSaving(false)
    }
  }, [sequenceData, onSave, parsedMetadata, viewerState, viewerMode])

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

  return (
    <div className="space-y-3">
      {/* Compact toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">
            {sequenceData?.name || fileName}
          </p>
          {sequenceLength ? (
            <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
              {sequenceLength.toLocaleString()} bp
            </Badge>
          ) : null}
          {sequenceData?.circular === false ? (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">linear</Badge>
          ) : null}
          {gcPercent != null ? (
            <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
              {gcPercent}% GC
            </Badge>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Tabs value={viewerMode} onValueChange={(value) => setViewerMode(value as ViewerMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="circular" className="h-7 px-2 text-xs">Circular</TabsTrigger>
              <TabsTrigger value="linear" className="h-7 px-2 text-xs">Linear</TabsTrigger>
              <TabsTrigger value="both" className="h-7 px-2 text-xs">Both</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1 rounded-md border bg-background px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Find sequence"
              className="h-7 w-40 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

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
            variant="outline"
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
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Plasmid map */}
      <Card className="min-w-0 overflow-hidden p-0">
        <div className="relative h-[calc(100vh-260px)] min-h-[480px] w-full bg-card">
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
              colors={FEATURE_PALETTE}
              style={{ height: "100%", width: "100%" }}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No sequence available. Download the file and re-upload, or paste a sequence below to stage one.
            </div>
          )}
        </div>
      </Card>

      {/* Tools — collapsible */}
      <Card className="overflow-hidden p-0">
        <button
          type="button"
          onClick={() => setToolsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/50"
        >
          <span>Tools</span>
          {toolsOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {toolsOpen ? (
          <div className="space-y-3 p-3">
            <Tabs value={activeTool} onValueChange={(value) => setActiveTool(value as ToolTab)}>
              <TabsList className="h-8">
                <TabsTrigger value="paste" className="h-7 px-2 text-xs">Paste</TabsTrigger>
                <TabsTrigger value="align" className="h-7 px-2 text-xs">Align</TabsTrigger>
                <TabsTrigger value="crispr" className="h-7 px-2 text-xs">CRISPR</TabsTrigger>
                <TabsTrigger value="json" className="h-7 px-2 text-xs">JSON</TabsTrigger>
              </TabsList>
            </Tabs>

            {activeTool === "paste" ? (
              <div className="space-y-2">
                <Textarea
                  value={pastedSequence}
                  onChange={(event) => setPastedSequence(event.target.value)}
                  placeholder="Paste DNA or FASTA sequence..."
                  className="h-32 resize-y font-mono text-xs"
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
                    {pastedClean.length.toLocaleString()} bp pasted
                  </Badge>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={runAlignment}>
                      <Search className="mr-1.5 h-3.5 w-3.5" />
                      Align
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={runCrisprAnalysis}>
                      <Target className="mr-1.5 h-3.5 w-3.5" />
                      CRISPR scan
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTool === "align" ? (
              alignment ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Identity {alignment.identity}%</Badge>
                    <Badge variant="outline">Matches {alignment.matches}</Badge>
                    <Badge variant="outline">Score {alignment.score}</Badge>
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-3 text-[11px] leading-5 text-foreground">
                    {alignmentPreview(alignment)}
                  </pre>
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Paste a sequence, then run Align to validate inserts or sequencing reads.
                </p>
              )
            ) : null}

            {activeTool === "crispr" ? (
              crisprGuides.length > 0 ? (
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
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Paste a target sequence or use the construct, then run CRISPR scan.
                </p>
              )
            ) : null}

            {activeTool === "json" ? (
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
                    variant="default"
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

            {activeTool === "crispr" && crisprGuides.length === 0 ? null : null}
            <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Scissors className="h-3 w-3" />
                SpCas9 NGG, 20 nt guides
              </span>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
}

function alignmentPreview(result: AlignmentResult) {
  const width = 64
  const rows: string[] = []
  for (let i = 0; i < result.query.length; i += width) {
    rows.push(`Query   ${result.query.slice(i, i + width)}`)
    rows.push(`        ${result.matchLine.slice(i, i + width)}`)
    rows.push(`Subject ${result.subject.slice(i, i + width)}`)
    rows.push("")
  }
  return rows.join("\n")
}

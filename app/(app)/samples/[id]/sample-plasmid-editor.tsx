"use client"

import { useEffect, useMemo, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Braces,
  CheckCircle2,
  ClipboardPaste,
  Dna,
  Download,
  GitBranch,
  History,
  Layers3,
  Loader2,
  Microscope,
  Save,
  Scissors,
  Search,
  Sparkles,
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

type SamplePlasmidEditorProps = {
  fileName: string
  fileUrl: string
  parsedMetadata: Record<string, any>
  viewerState: Record<string, any>
  onSave: (payload: { parsedMetadata: Record<string, any>; viewerState: Record<string, any> }) => Promise<void>
}

type ParserStatus = "idle" | "loading" | "parsed" | "fallback" | "error"
type WorkbenchPanel = "analysis" | "crispr" | "json"

const capabilityRows = [
  {
    icon: Layers3,
    title: "Map layers",
    detail: "Features, primers, ORFs, translations, enzyme sites, parts and cutsites stay visible in the editor.",
  },
  {
    icon: Sparkles,
    title: "Annotation",
    detail: "Use the editor tools for feature creation and annotation, then save the curated sequence JSON.",
  },
  {
    icon: GitBranch,
    title: "Cloning reference",
    detail: "Keep uploaded vectors attached to the sample and download them for SnapGene or cloning workflows.",
  },
  {
    icon: History,
    title: "Edit record",
    detail: "Saved editor state is stored with the sample file for traceable construct review.",
  },
]

function normalizeSequenceData(value: any, fileName: string) {
  const first = Array.isArray(value) ? value[0] : value
  const sequenceData = first?.parsedSequence || first?.sequenceData || first
  const features = sequenceData?.features
  const primers = sequenceData?.primers
  const translations = sequenceData?.translations
  const orfs = sequenceData?.orfs

  return {
    name: fileName,
    circular: true,
    sequence: "",
    features: Array.isArray(features) ? features : features && typeof features === "object" ? Object.values(features) : [],
    primers: Array.isArray(primers) ? primers : primers && typeof primers === "object" ? Object.values(primers) : [],
    parts: [],
    translations: Array.isArray(translations)
      ? translations
      : translations && typeof translations === "object"
      ? Object.values(translations)
      : [],
    orfs: Array.isArray(orfs) ? orfs : orfs && typeof orfs === "object" ? Object.values(orfs) : [],
    ...(sequenceData && typeof sequenceData === "object" ? sequenceData : {}),
  }
}

function countAnnotations(sequenceData: any, key: string) {
  const value = sequenceData?.[key]
  if (Array.isArray(value)) return value.length
  if (value && typeof value === "object") return Object.keys(value).length
  return 0
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

function buildEditorFrame(sequenceData: Record<string, any>, fileName: string, fileUrl: string) {
  const data = JSON.stringify(sequenceData).replace(/</g, "\\u003c")
  const title = JSON.stringify(fileName).replace(/</g, "\\u003c")
  const sourceUrl = JSON.stringify(fileUrl).replace(/</g, "\\u003c")

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/@teselagen/ove/ove.css" />
  <style>
    :root {
      color-scheme: light;
      --surface: #fffdfa;
      --muted: #f3eadc;
      --text: #2c2418;
      --subtle: #7a6f60;
      --accent: #965034;
      --border: #e8ded3;
    }
    html, body, #editor { height: 100%; width: 100%; margin: 0; overflow: hidden; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--surface); color: var(--text); }
    .fallback { height: 100%; display: grid; place-items: center; color: var(--subtle); font-size: 13px; padding: 24px; text-align: center; }
    .fallback strong { color: var(--text); display: block; margin-bottom: 6px; }
    .tg-ove-container, .veEditor, .ve-editor { min-height: 100%; }
  </style>
</head>
<body>
  <div id="editor"><div class="fallback">Loading plasmid editor...</div></div>
  <script src="https://unpkg.com/@teselagen/bio-parsers/index.umd.cjs"></script>
  <script src="https://unpkg.com/@teselagen/ove/index.umd.js"></script>
  <script>
    const initialSequenceData = ${data};
    const fileName = ${title};
    const fileUrl = ${sourceUrl};
    const extension = (fileName.split(".").pop() || "").toLowerCase();

    function normalize(value) {
      const first = Array.isArray(value) ? value[0] : value;
      const sequenceData = first && (first.parsedSequence || first.sequenceData || first);
      return Object.assign({
        name: fileName,
        circular: true,
        sequence: "",
        features: [],
        primers: [],
        parts: [],
        translations: [],
        orfs: []
      }, sequenceData && typeof sequenceData === "object" ? sequenceData : {});
    }

    function post(type, payload) {
      window.parent.postMessage(Object.assign({ source: "notes9-sample-ove", type }, payload || {}), "*");
    }

    async function parseOriginalFile() {
      if (!window.bioParsers || !window.bioParsers.anyToJson) return initialSequenceData;
      const shouldParseOriginal = extension === "dna" || !initialSequenceData.sequence;
      if (!shouldParseOriginal) return initialSequenceData;
      post("status", { status: "loading", message: "Parsing original sequence file" });
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Could not fetch uploaded sequence file");
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
      const parsed = await window.bioParsers.anyToJson(file, { fileName });
      const normalized = normalize(parsed);
      post("parsed", { sequenceData: normalized, parser: extension === "dna" ? "snapgene-dna" : "bio-parsers" });
      return normalized;
    }

    async function mount() {
      try {
        if (!window.createVectorEditor) throw new Error("Open Vector Editor could not load");
        let sequenceData = normalize(initialSequenceData);
        try {
          sequenceData = normalize(await parseOriginalFile());
        } catch (parseError) {
          post("status", { status: "fallback", message: parseError.message || "Using stored sequence JSON fallback" });
        }

        window.notes9VectorEditor = window.createVectorEditor(document.getElementById("editor"), {
          editorName: "notes9-sample-" + fileName,
          sequenceData,
          shouldAutosave: false,
          showMenuBar: true,
          showReadOnly: false,
          disableSetReadOnly: true,
          annotationLabelVisibility: {
            features: true,
            parts: true,
            cutsites: true,
            primers: true,
            orfs: true,
            translations: true
          },
          onSave: function (_event, dataToSave, editorState, done) {
            post("save", { sequenceData: dataToSave, editorState });
            if (done) done();
          },
          onCopy: function (event, copiedSequenceData) {
            if (event.clipboardData) {
              event.clipboardData.setData("application/json", JSON.stringify(copiedSequenceData));
            }
          },
          onPaste: function (event) {
            const clipboardData = event.clipboardData;
            const json = clipboardData && clipboardData.getData("application/json");
            if (json) {
              try { return JSON.parse(json); } catch (_err) {}
            }
            return { sequence: clipboardData ? clipboardData.getData("text/plain") : "" };
          }
        });
        post("status", { status: "parsed", message: "Editor ready" });
      } catch (error) {
        document.getElementById("editor").innerHTML = '<div class="fallback"><div><strong>Plasmid editor unavailable</strong>Use the editable JSON panel beside this viewer, or download the file for SnapGene.</div></div>';
        post("status", { status: "error", message: error.message || "Could not load editor" });
      }
    }

    window.addEventListener("message", function(event) {
      if (!event.data || event.data.source !== "notes9-sample-control") return;
      if (event.data.type === "save-current") {
        try {
          const state = window.notes9VectorEditor && window.notes9VectorEditor.getState ? window.notes9VectorEditor.getState() : {};
          post("save", { sequenceData: state.sequenceData || initialSequenceData, editorState: state });
        } catch (error) {
          post("status", { status: "error", message: error.message || "Could not read editor state" });
        }
      }
    });

    mount();
  </script>
</body>
</html>`
}

function statusLabel(status: ParserStatus) {
  switch (status) {
    case "loading":
      return "Parsing file"
    case "parsed":
      return "Editor ready"
    case "fallback":
      return "Fallback active"
    case "error":
      return "Needs attention"
    default:
      return "Preparing"
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 px-2 py-2">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export function SamplePlasmidEditor({
  fileName,
  fileUrl,
  parsedMetadata,
  viewerState,
  onSave,
}: SamplePlasmidEditorProps) {
  const isBinarySnapGene = getFileExtension(fileName) === "dna"
  const [sequenceData, setSequenceData] = useState<any>(parsedMetadata.sequenceData ?? null)
  const [jsonText, setJsonText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parserStatus, setParserStatus] = useState<ParserStatus>("idle")
  const [parserMessage, setParserMessage] = useState("")
  const [activePanel, setActivePanel] = useState<WorkbenchPanel>("analysis")
  const [pastedSequence, setPastedSequence] = useState("")
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null)
  const [crisprGuides, setCrisprGuides] = useState<CrisprGuide[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadSequence() {
      setLoading(true)
      setError(null)
      setParserStatus(isBinarySnapGene ? "loading" : "idle")
      try {
        let nextSequenceData = parsedMetadata.sequenceData
        if (!nextSequenceData) {
          if (shouldParseSequenceTextOnUpload(fileName)) {
            const text = await fetch(fileUrl).then((res) => res.text())
            nextSequenceData = parseSequenceText(fileName, text)
          } else {
            nextSequenceData = {
              name: fileName,
              circular: true,
              sequence: "",
              features: [],
              primers: [],
              translations: [],
              orfs: [],
              parse_deferred: "Binary file will be parsed in the embedded plasmid editor.",
            }
          }
        }
        if (cancelled) return
        const normalized = normalizeSequenceData(nextSequenceData, fileName)
        setSequenceData(normalized)
        setJsonText(JSON.stringify(normalized, null, 2))
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not parse this sequence file.")
          setParserStatus("error")
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

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.source !== "notes9-sample-ove") return
      if (event.data.type === "status") {
        setParserStatus(event.data.status ?? "idle")
        setParserMessage(event.data.message ?? "")
        return
      }

      if (event.data.type === "parsed") {
        const next = normalizeSequenceData(event.data.sequenceData, fileName)
        setSequenceData(next)
        setJsonText(JSON.stringify(next, null, 2))
        setParserStatus("parsed")
        setParserMessage(event.data.parser === "snapgene-dna" ? "SnapGene .dna parsed in viewer" : "Sequence parsed in viewer")
        onSave({
          parsedMetadata: { ...parsedMetadata, sequenceData: next, parser: event.data.parser },
          viewerState,
        }).catch((err) => setError(err instanceof Error ? err.message : "Could not save parsed sequence."))
        return
      }

      if (event.data.type === "save") {
        const next = normalizeSequenceData(event.data.sequenceData, fileName)
        setSequenceData(next)
        setJsonText(JSON.stringify(next, null, 2))
        onSave({
          parsedMetadata: { ...parsedMetadata, sequenceData: next },
          viewerState: { ...viewerState, editorState: event.data.editorState ?? {} },
        }).catch((err) => setError(err instanceof Error ? err.message : "Could not save editor state."))
      }
    }
    window.addEventListener("message", receive)
    return () => window.removeEventListener("message", receive)
  }, [fileName, onSave, parsedMetadata, viewerState])

  const frame = useMemo(
    () => (sequenceData ? buildEditorFrame(sequenceData, fileName, fileUrl) : ""),
    [fileName, fileUrl, sequenceData]
  )

  const metrics = useMemo(
    () => [
      { label: "Length", value: `${(sequenceData?.sequence ?? "").length.toLocaleString()} bp` },
      { label: "Features", value: countAnnotations(sequenceData, "features").toString() },
      { label: "Primers", value: countAnnotations(sequenceData, "primers").toString() },
      { label: "ORFs", value: countAnnotations(sequenceData, "orfs").toString() },
      { label: "Translations", value: countAnnotations(sequenceData, "translations").toString() },
    ],
    [sequenceData]
  )

  const currentSequence = cleanDnaSequence(sequenceData?.sequence ?? "")
  const pastedClean = cleanDnaSequence(pastedSequence)

  const runAlignment = () => {
    if (!pastedClean || !currentSequence) {
      setError("Paste a DNA sequence and make sure the current construct has sequence data before aligning.")
      return
    }
    setError(null)
    setAlignment(alignDnaSequences(pastedClean, currentSequence))
    setActivePanel("analysis")
  }

  const runCrisprAnalysis = () => {
    const sequence = pastedClean || currentSequence
    if (!sequence) {
      setError("Paste a DNA sequence or load a construct sequence before running CRISPR analysis.")
      return
    }
    setError(null)
    setCrisprGuides(findCrisprGuides(sequence, 20))
    setActivePanel("crispr")
  }

  const replaceWithPastedSequence = () => {
    if (!pastedClean) {
      setError("Paste a DNA sequence before replacing the editable construct.")
      return
    }
    const next = normalizeSequenceData(
      {
        ...sequenceData,
        name: `${fileName} pasted sequence`,
        sequence: pastedClean,
        circular: false,
      },
      fileName
    )
    setSequenceData(next)
    setJsonText(JSON.stringify(next, null, 2))
    setParserMessage("Pasted sequence staged in editable JSON. Save JSON to persist it.")
    setActivePanel("json")
  }

  const saveJson = async () => {
    setSaving(true)
    setError(null)
    try {
      const next = normalizeSequenceData(JSON.parse(jsonText), fileName)
      await onSave({
        parsedMetadata: { ...parsedMetadata, sequenceData: next },
        viewerState,
      })
      setSequenceData(next)
      setJsonText(JSON.stringify(next, null, 2))
      setParserStatus("parsed")
      setParserMessage("Sequence JSON saved")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sequence JSON.")
    } finally {
      setSaving(false)
    }
  }

  const saveFromEditor = () => {
    const frameEl = document.getElementById("sample-plasmid-editor-frame") as HTMLIFrameElement | null
    frameEl?.contentWindow?.postMessage({ source: "notes9-sample-control", type: "save-current" }, "*")
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card">
        <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
              <Dna className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Construct workspace</p>
              <p className="truncate text-xs text-muted-foreground">Benchling-style plasmid editor and sequence analysis</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 rounded-md border bg-background p-1">
            {[
              ["analysis", "Analysis"],
              ["crispr", "CRISPR"],
              ["json", "JSON"],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={activePanel === value ? "secondary" : "ghost"}
                size="sm"
                className="h-8"
                onClick={() => setActivePanel(value as WorkbenchPanel)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 truncate text-sm font-semibold">{fileName}</p>
              {isBinarySnapGene ? <Badge variant="secondary">SnapGene .dna</Badge> : null}
              <Badge variant={parserStatus === "error" ? "destructive" : parserStatus === "fallback" ? "outline" : "default"}>
                {statusLabel(parserStatus)}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              View annotated plasmid maps, sequence detail, primers, ORFs, translations, enzyme/cutsite layers, and saved construct state in one sample record.
            </p>
            {parserMessage ? <p className="text-xs text-muted-foreground">{parserMessage}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={fileUrl} download={fileName}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={saveFromEditor} disabled={loading || !frame}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Capture editor
            </Button>
            <Button type="button" size="sm" onClick={saveJson} disabled={saving || loading}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? "Saving..." : "Save JSON"}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 rounded-md border bg-muted/25 px-3 py-2">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="truncate text-sm font-semibold tabular-nums">{metric.value}</p>
            </div>
          ))}
        </div>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <div className="h-[660px] min-h-[420px] min-w-0 overflow-hidden rounded-md border bg-background">
            {loading || !frame ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading plasmid editor...
              </div>
            ) : (
              <iframe
                id="sample-plasmid-editor-frame"
                title={`${fileName} plasmid editor`}
                srcDoc={frame}
                className="h-full w-full border-0"
              />
            )}
          </div>

          {activePanel === "json" ? (
            <div className="min-w-0 space-y-2 rounded-md border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Braces className="h-4 w-4 text-muted-foreground" />
                  <p className="truncate text-sm font-medium">Editable sequence JSON</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={saveJson} disabled={saving || loading}>
                  Save
                </Button>
              </div>
              <Textarea
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                className="h-72 min-h-60 resize-y overflow-auto font-mono text-xs"
                spellCheck={false}
              />
            </div>
          ) : null}
        </div>

        <aside className="space-y-3">
          <div className="rounded-md border bg-card p-4">
            <div className="flex items-center gap-2">
              <ClipboardPaste className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Paste sequence</h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Paste raw DNA or FASTA to compare against this construct, stage as a sequence, or scan CRISPR sites.
            </p>
            <Textarea
              value={pastedSequence}
              onChange={(event) => setPastedSequence(event.target.value)}
              placeholder="Paste DNA or FASTA sequence..."
              className="mt-3 h-36 resize-y font-mono text-xs"
              spellCheck={false}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{pastedClean.length.toLocaleString()} bp pasted</Badge>
              <Badge variant="outline">{currentSequence.length.toLocaleString()} bp construct</Badge>
            </div>
            <div className="mt-3 grid gap-2">
              <Button type="button" variant="outline" size="sm" onClick={runAlignment}>
                <Search className="mr-2 h-4 w-4" />
                Align to construct
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={runCrisprAnalysis}>
                <Target className="mr-2 h-4 w-4" />
                Run CRISPR scan
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={replaceWithPastedSequence}>
                <Dna className="mr-2 h-4 w-4" />
                Stage pasted sequence
              </Button>
            </div>
          </div>

          {activePanel === "analysis" ? (
            <div className="rounded-md border bg-card p-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Alignment analysis</h3>
              </div>
              {alignment ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Identity" value={`${alignment.identity}%`} />
                    <Metric label="Matches" value={`${alignment.matches}`} />
                    <Metric label="Score" value={`${alignment.score}`} />
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-md border bg-muted/20 p-3 text-[11px] leading-5 text-foreground">
                    {alignmentPreview(alignment)}
                  </pre>
                </div>
              ) : (
                <p className="mt-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Paste a sequence and choose Align to construct to validate inserts, sequencing reads, or cloned fragments.
                </p>
              )}
            </div>
          ) : null}

          {activePanel === "crispr" ? (
            <div className="rounded-md border bg-card p-4">
              <div className="flex items-center gap-2">
                <Scissors className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">CRISPR guide scan</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Finds SpCas9-style 20 nt guides next to NGG PAMs and ranks by GC balance, poly-T risk, and repeated seed matches.
              </p>
              {crisprGuides.length > 0 ? (
                <div className="mt-3 max-h-96 space-y-2 overflow-auto pr-1">
                  {crisprGuides.map((guide) => (
                    <div key={guide.id} className="rounded-md border bg-muted/15 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-xs">{guide.guide}</p>
                        <Badge variant="secondary">{guide.pam}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline">{guide.strand} strand</Badge>
                        <Badge variant="outline">{guide.start}-{guide.end}</Badge>
                        <Badge variant="outline">{guide.gcPercent}% GC</Badge>
                        {guide.hasPolyT ? <Badge variant="destructive">poly-T</Badge> : null}
                        {guide.selfSeedMatches > 1 ? <Badge variant="outline">{guide.selfSeedMatches} seed hits</Badge> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Paste a target sequence or use the current construct, then run CRISPR scan.
                </p>
              )}
            </div>
          ) : null}

          <div className="rounded-md border bg-card p-4">
            <div className="flex items-center gap-2">
              <Microscope className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Molecular biology tools</h3>
            </div>
            <div className="mt-3 space-y-3">
              {capabilityRows.map(({ icon: Icon, title, detail }) => (
                <div key={title} className="flex gap-3 rounded-md border bg-muted/20 p-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-card p-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">SnapGene workflow</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              `.dna` files are parsed from the original upload in the viewer. Download the source file to open it in SnapGene Viewer for sharing, map customization, or construct documentation.
            </p>
            <Button type="button" variant="outline" size="sm" asChild className="mt-3 w-full">
              <a href={fileUrl} download={fileName}>
                <Download className="mr-2 h-4 w-4" />
                Download for SnapGene
              </a>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}

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
  Focus,
  Layers3,
  Loader2,
  Maximize2,
  Minimize2,
  Palette,
  RotateCcw,
  Sparkles,
  Target,
  X,
} from "lucide-react"
import { getFileExtension, molecularFileFormatLabel } from "@/lib/sample-molecular"

export type ProteinSuperpositionSource = {
  id: string
  fileName: string
}

type SampleProteinViewerProps = {
  fileName: string
  fileUrl: string
  superpositionSources?: ProteinSuperpositionSource[]
  onResolveSourceUrl?: (sourceId: string) => Promise<{ url: string; fileName: string } | null>
}

type ViewerState = "idle" | "loading" | "ready" | "error"

const REPRESENTATION_PRESETS = [
  { value: "auto", label: "Auto" },
  { value: "polymer-cartoon", label: "Cartoon" },
  { value: "polymer-and-ligand", label: "Cartoon + ligand" },
  { value: "molecular-surface", label: "Surface" },
  { value: "atomic-detail", label: "Ball-and-stick" },
  { value: "illustrative", label: "Illustrative" },
  { value: "coarse-surface", label: "Coarse surface" },
] as const

type RepresentationPreset = (typeof REPRESENTATION_PRESETS)[number]["value"]

const COLOR_THEMES = [
  { value: "default", label: "Default" },
  { value: "chain-id", label: "By chain" },
  { value: "residue-name", label: "By residue" },
  { value: "secondary-structure", label: "Secondary structure" },
  { value: "hydrophobicity", label: "Hydrophobicity" },
  { value: "uniform", label: "Uniform" },
  { value: "element-symbol", label: "Atom (CPK)" },
  { value: "model-index", label: "Model index" },
  { value: "molecule-type", label: "Molecule type" },
] as const

type ColorTheme = (typeof COLOR_THEMES)[number]["value"]

type ChainSequence = {
  chainId: string
  kind: "protein" | "DNA" | "RNA" | "generic"
  code: string
  seqIds: number[]
  entityId: string
}

type ResidueSelection = {
  chainId: string
  startSeq: number
  endSeq: number
}

function inferFormat(fileName: string): "pdb" | "mmcif" {
  const ext = getFileExtension(fileName)
  if (ext === "cif" || ext === "mmcif" || ext === "bcif") return "mmcif"
  return "pdb"
}

function readThemeColor(token: string, fallback: string): number {
  if (typeof window === "undefined") return parseInt(fallback.replace("#", ""), 16)
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  if (!value) return parseInt(fallback.replace("#", ""), 16)
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

/** Walk the loaded structure and return one entry per polymer entity, with one-letter codes + auth_seq_ids. */
function extractChainSequences(plugin: any): ChainSequence[] {
  try {
    const structures = plugin?.managers?.structure?.hierarchy?.current?.structures
    const data = structures?.[0]?.cell?.obj?.data
    if (!data) return []
    const out: ChainSequence[] = []
    const seen = new Set<string>()
    for (const model of data.models ?? []) {
      const sequences = model?.sequence?.sequences ?? []
      // Collect entity → first chain (auth_asym_id) using atomicHierarchy
      const chainsHier = model?.atomicHierarchy?.chains
      const chainCount = chainsHier?._rowCount ?? 0
      const entityToChain = new Map<string, string>()
      for (let cI = 0; cI < chainCount; cI++) {
        const entityId = chainsHier?.label_entity_id?.value(cI)
        const authAsym = chainsHier?.auth_asym_id?.value(cI) ?? chainsHier?.label_asym_id?.value(cI)
        if (entityId && authAsym && !entityToChain.has(entityId)) {
          entityToChain.set(entityId, authAsym)
        }
      }
      for (const entry of sequences) {
        if (!entry) continue
        const seq = entry.sequence ?? entry
        const kind = seq.kind as ChainSequence["kind"]
        const length = seq.length ?? seq.code?.rowCount ?? 0
        if (length <= 0) continue
        const codeCol = seq.code
        const seqIdCol = seq.seqId
        let code = ""
        const seqIds: number[] = []
        for (let i = 0; i < length; i++) {
          code += codeCol?.value(i) ?? "X"
          seqIds.push(seqIdCol?.value(i) ?? i + 1)
        }
        const entityId = String(entry.entityId ?? "")
        const chainId = entityToChain.get(entityId) ?? "?"
        const dedupKey = `${chainId}:${entityId}`
        if (seen.has(dedupKey)) continue
        seen.add(dedupKey)
        out.push({ chainId, kind, code, seqIds, entityId })
      }
    }
    return out
  } catch (err) {
    console.warn("Could not extract sequences", err)
    return []
  }
}

async function buildResidueRangeLoci(
  plugin: any,
  chainId: string,
  startSeq: number,
  endSeq: number
) {
  const [{ MolScriptBuilder: MS }, { compile }, { QueryContext }, { StructureSelection }] =
    await Promise.all([
      import("molstar/lib/mol-script/language/builder"),
      import("molstar/lib/mol-script/runtime/query/compiler"),
      import("molstar/lib/mol-model/structure/query/context"),
      import("molstar/lib/mol-model/structure/query/selection"),
    ])
  const data = plugin?.managers?.structure?.hierarchy?.current?.structures?.[0]?.cell?.obj?.data
  if (!data) return null
  const expr = (MS as any).struct.generator.atomGroups({
    "chain-test": (MS as any).core.rel.eq([
      (MS as any).struct.atomProperty.macromolecular.auth_asym_id(),
      chainId,
    ]),
    "residue-test": (MS as any).core.rel.inRange([
      (MS as any).struct.atomProperty.macromolecular.auth_seq_id(),
      startSeq,
      endSeq,
    ]),
    "group-by": (MS as any).struct.atomProperty.macromolecular.residueKey(),
  })
  const query = compile<any>(expr)
  const sel = query(new QueryContext(data))
  return StructureSelection.toLociWithSourceUnits(sel)
}

async function buildPolymerCALoci(plugin: any, structureIndex: number) {
  const [{ QueryContext }, { StructureSelection }, { StructureSelectionQueries }] = await Promise.all([
    import("molstar/lib/mol-model/structure/query/context"),
    import("molstar/lib/mol-model/structure/query/selection"),
    import("molstar/lib/mol-plugin-state/helpers/structure-selection-query"),
  ])
  const structures = plugin?.managers?.structure?.hierarchy?.current?.structures ?? []
  const struct = structures[structureIndex]
  const data = struct?.cell?.obj?.data
  if (!data) return null
  const sel = StructureSelectionQueries.trace.query(new QueryContext(data))
  return { loci: StructureSelection.toLociWithSourceUnits(sel), cell: struct.cell }
}

export function SampleProteinViewer({
  fileName,
  fileUrl,
  superpositionSources = [],
  onResolveSourceUrl,
}: SampleProteinViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<any>(null)
  const containerId = useId().replace(/[:]/g, "-")
  const [state, setState] = useState<ViewerState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [representation, setRepresentation] = useState<RepresentationPreset>("auto")
  const [colorTheme, setColorTheme] = useState<ColorTheme>("default")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [working, setWorking] = useState(false)
  const [chainSequences, setChainSequences] = useState<ChainSequence[]>([])
  const [residueSel, setResidueSel] = useState<ResidueSelection | null>(null)
  const dragAnchor = useRef<{ chainId: string; seq: number } | null>(null)
  const [supSourceId, setSupSourceId] = useState<string>("")
  const [superposeBusy, setSuperposeBusy] = useState(false)
  const [rmsdInfo, setRmsdInfo] = useState<{ rmsd: number; n: number; label: string } | null>(null)

  const format = useMemo(() => inferFormat(fileName), [fileName])

  useEffect(() => {
    setSupSourceId("")
    setRmsdInfo(null)
  }, [fileUrl, fileName])

  useEffect(() => {
    let cancelled = false
    let localViewer: any = null
    const host = containerRef.current

    async function mount() {
      if (!host) return
      setState("loading")
      setError(null)
      try {
        const [{ Viewer }] = await Promise.all([
          import("molstar/lib/apps/viewer/app"),
          import("molstar/build/viewer/molstar.css" as any).catch(() => null),
        ])
        if (cancelled || !host.isConnected) return
        const bgColor = readThemeColor("--card", "#fffdfa")
        const viewer = await Viewer.create(host, {
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowRemoteState: false,
          layoutShowSequence: false,
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
        localViewer = viewer
        if (cancelled) {
          try {
            viewer.plugin?.dispose?.()
          } catch (err) {
            console.error('[protein-viewer] dispose on cancelled early exit:', err)
          }
          return
        }
        viewerRef.current = viewer
        await viewer.loadStructureFromUrl(fileUrl, format, false, { label: fileName })
        if (cancelled) return
        setState("ready")
        setChainSequences(extractChainSequences(viewer.plugin))
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
      const viewer = viewerRef.current ?? localViewer
      viewerRef.current = null
      try {
        viewer?.plugin?.canvas3d?.pause?.()
        viewer?.plugin?.dispose?.()
      } catch (err) {
        console.error('[protein-viewer] cleanup dispose/pause:', err)
      }
      // Mol* leaves its <canvas> child in the host even after dispose. Clearing
      // it lets the GPU release the WebGL context — browsers cap ~16 contexts
      // and we'd otherwise exhaust them after a few file switches.
      if (host) {
        try {
          while (host.firstChild) host.removeChild(host.firstChild)
        } catch (err) {
          console.error('[protein-viewer] DOM canvas child removal:', err)
        }
      }
    }
  }, [fileUrl, fileName, format])

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
      } catch (err) {
        console.error('[protein-viewer] setProps background color:', err)
      }
    }
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [state])

  useEffect(() => {
    if (typeof document === "undefined") return
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const resetCamera = useCallback(() => {
    try {
      viewerRef.current?.plugin?.managers?.camera?.reset?.()
    } catch (err) {
      console.error('[protein-viewer] resetCamera:', err)
    }
  }, [])

  const focusOnLoaded = useCallback(() => {
    try {
      const plugin = viewerRef.current?.plugin
      if (!plugin) return
      const data = plugin.managers.structure.hierarchy?.current?.structures?.[0]?.cell?.obj?.data
      const camera = plugin.managers.camera
      if (data && typeof camera?.focusLoci === "function") camera.focusLoci(data)
      else camera?.reset?.()
    } catch (err) {
      console.error('[protein-viewer] focusOnLoaded:', err)
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!wrapperRef.current) return
    if (document.fullscreenElement === wrapperRef.current) await document.exitFullscreen()
    else await wrapperRef.current.requestFullscreen?.()
  }, [])

  const toggleSpin = useCallback(() => {
    const canvas3d = viewerRef.current?.plugin?.canvas3d
    if (!canvas3d) return
    const next = !spinning
    setSpinning(next)
    try {
      canvas3d.setProps({
        trackball: {
          animate: next
            ? { name: "spin", params: { speed: 0.3, axis: [0, -1, 0] as unknown as any } }
            : { name: "off", params: {} },
        },
      })
      canvas3d.requestDraw?.(true)
    } catch (err) {
      console.warn("Could not toggle spin", err)
    }
  }, [spinning])

  const downloadScreenshot = useCallback(async () => {
    try {
      const helper = viewerRef.current?.plugin?.helpers?.viewportScreenshot
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

  const presetRunId = useRef(0)
  const applyRepresentation = useCallback(async (preset: RepresentationPreset) => {
    setRepresentation(preset)
    const plugin = viewerRef.current?.plugin
    if (!plugin) return
    const myRun = ++presetRunId.current
    setWorking(true)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    if (myRun !== presetRunId.current) return
    try {
      const structures = plugin.managers.structure.hierarchy?.current?.structures ?? []
      if (!Array.isArray(structures) || structures.length === 0) return
      const componentMgr = plugin.managers.structure.component
      if (typeof componentMgr?.applyPreset === "function") {
        await componentMgr.applyPreset(structures, preset)
      } else {
        for (const structure of structures) {
          const ref = structure?.cell?.transform?.ref
          if (!ref) continue
          await plugin.builders.structure.representation.applyPreset(ref, preset)
        }
      }
    } catch (err) {
      console.warn("Could not apply representation preset", err)
    } finally {
      if (myRun === presetRunId.current) setWorking(false)
    }
  }, [])

  const colorRunId = useRef(0)
  const applyColor = useCallback(async (theme: ColorTheme) => {
    setColorTheme(theme)
    const plugin = viewerRef.current?.plugin
    if (!plugin) return
    const myRun = ++colorRunId.current
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    if (myRun !== colorRunId.current) return
    try {
      const structures = plugin.managers.structure.hierarchy?.current?.structures ?? []
      const components: any[] = []
      for (const structure of structures) {
        const list = structure?.components
        if (!Array.isArray(list)) continue
        for (const c of list) {
          if (c && Array.isArray(c.representations) && c.representations.length > 0) {
            components.push(c)
          }
        }
      }
      if (components.length === 0) return
      const reprMgr = plugin.managers.structure.component
      if (typeof reprMgr?.updateRepresentationsTheme !== "function") return
      await reprMgr.updateRepresentationsTheme(components, {
        color: theme === "default" ? "default" : theme,
        colorParams: theme === "uniform" ? { value: 0xb5b5b5 } : undefined,
      })
    } catch (err) {
      console.warn("Could not apply color theme", err)
    }
  }, [])

  const highlightSelection = useCallback(async (sel: ResidueSelection | null) => {
    const plugin = viewerRef.current?.plugin
    if (!plugin) return
    if (!sel) {
      plugin.managers.interactivity?.lociHighlights?.clearHighlights?.()
      return
    }
    const start = Math.min(sel.startSeq, sel.endSeq)
    const end = Math.max(sel.startSeq, sel.endSeq)
    const loci = await buildResidueRangeLoci(plugin, sel.chainId, start, end)
    if (!loci) return
    plugin.managers.interactivity?.lociHighlights?.highlightOnly?.({ loci }, false)
  }, [])

  const focusSelection = useCallback(async (sel: ResidueSelection) => {
    const plugin = viewerRef.current?.plugin
    if (!plugin) return
    const start = Math.min(sel.startSeq, sel.endSeq)
    const end = Math.max(sel.startSeq, sel.endSeq)
    const loci = await buildResidueRangeLoci(plugin, sel.chainId, start, end)
    if (!loci) return
    try {
      plugin.managers.camera.focusLoci?.(loci)
    } catch (err) {
      console.error('[protein-viewer] focusSelection focusLoci:', err)
    }
  }, [])

  const selectionRef = useRef<ResidueSelection | null>(null)
  useEffect(() => {
    selectionRef.current = residueSel
  }, [residueSel])

  const onResidueMouseDown = (chain: ChainSequence, residueIndex: number) => {
    const seq = chain.seqIds[residueIndex] ?? residueIndex + 1
    dragAnchor.current = { chainId: chain.chainId, seq }
    const next: ResidueSelection = { chainId: chain.chainId, startSeq: seq, endSeq: seq }
    setResidueSel(next)
    void highlightSelection(next)
  }
  const onResidueMouseEnter = (chain: ChainSequence, residueIndex: number) => {
    if (!dragAnchor.current) return
    if (dragAnchor.current.chainId !== chain.chainId) return
    const seq = chain.seqIds[residueIndex] ?? residueIndex + 1
    const next: ResidueSelection = {
      chainId: chain.chainId,
      startSeq: dragAnchor.current.seq,
      endSeq: seq,
    }
    setResidueSel(next)
    void highlightSelection(next)
  }
  // Stable mouseup listener — read latest selection through a ref instead of
  // re-binding window every selection change. Re-binding on each drag tick
  // could miss the mouseup event and leave dragAnchor stuck.
  useEffect(() => {
    const onUp = () => {
      const sel = selectionRef.current
      if (dragAnchor.current && sel) {
        void focusSelection(sel)
      }
      dragAnchor.current = null
    }
    window.addEventListener("mouseup", onUp)
    return () => window.removeEventListener("mouseup", onUp)
  }, [focusSelection])

  const clearResidueSelection = () => {
    setResidueSel(null)
    void highlightSelection(null)
  }

  const runSuperposition = useCallback(async () => {
    if (!supSourceId || !onResolveSourceUrl) return
    const plugin = viewerRef.current?.plugin
    if (!plugin) return
    setSuperposeBusy(true)
    setRmsdInfo(null)
    setError(null)
    try {
      const resolved = await onResolveSourceUrl(supSourceId)
      if (!resolved) throw new Error("Could not resolve target structure file.")
      const targetFormat = inferFormat(resolved.fileName)

      // Track structure count before to find the new one.
      const before =
        plugin.managers.structure.hierarchy?.current?.structures?.length ?? 0

      const viewer = viewerRef.current
      await viewer.loadStructureFromUrl(resolved.url, targetFormat, false, {
        label: resolved.fileName,
      })

      const structures = plugin.managers.structure.hierarchy.current.structures ?? []
      // If MolStar didn't actually grow the hierarchy on this load, there's
      // no new index to point at — bail to surface the failure rather than
      // silently re-pivoting on the prior structure.
      const newIndex = structures.length > before ? structures.length - 1 : -1
      const pivotIndex = 0
      if (pivotIndex === newIndex || newIndex < 0) {
        throw new Error("Could not load the target structure.")
      }

      const pivot = await buildPolymerCALoci(plugin, pivotIndex)
      const target = await buildPolymerCALoci(plugin, newIndex)
      if (!pivot?.loci || !target?.loci) throw new Error("Could not build alignment selections.")

      const [{ alignAndSuperpose }, { StateTransforms }, { StateObjectRef }] = await Promise.all([
        import("molstar/lib/mol-model/structure/structure/util/superposition"),
        import("molstar/lib/mol-plugin-state/transforms"),
        import("molstar/lib/mol-state"),
      ])
      const transforms = (alignAndSuperpose as any)([pivot.loci, target.loci])
      const result = transforms?.[0]
      if (!result) throw new Error("Alignment did not produce a transform.")
      const { bTransform, rmsd, nAlignedElements } = result

      const r = StateObjectRef.resolveAndCheck(plugin.state.data, target.cell)
      if (!r) throw new Error("Could not resolve target cell.")
      const existing = plugin.state.data.selectQ((q: any) =>
        q.byRef(r.transform.ref).subtree().withTransformer(StateTransforms.Model.TransformStructureConformation)
      )[0]
      const params = { transform: { name: "matrix", params: { data: bTransform, transpose: false } } }
      const builder = existing
        ? plugin.state.data.build().to(existing).update(params)
        : plugin.state.data.build().to(target.cell).insert(StateTransforms.Model.TransformStructureConformation, params)
      await plugin.runTask(plugin.state.data.updateTree(builder))

      setRmsdInfo({
        rmsd,
        n: nAlignedElements,
        label: resolved.fileName,
      })
      // Re-fit camera to show both.
      try {
        plugin.managers.camera.reset?.()
      } catch (err) {
        console.error('[protein-viewer] camera reset after superposition:', err)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Superposition failed.")
    } finally {
      setSuperposeBusy(false)
    }
  }, [supSourceId, onResolveSourceUrl])

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2">
        <div className="flex min-h-8 min-w-0 items-center gap-2.5 px-1">
          <span className="min-w-0 flex-1 truncate text-sm font-medium leading-none text-foreground">
            {fileName}
          </span>
          <Badge
            variant="outline"
            className="inline-flex h-5 shrink-0 items-center justify-center border px-2 py-0 font-mono text-2xs font-semibold uppercase leading-none tracking-wide"
          >
            {molecularFileFormatLabel(fileName)}
          </Badge>
          {working ? (
            <span className="inline-flex items-center gap-1 text-micro text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              applying…
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Layers3 className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={representation} onValueChange={(v) => applyRepresentation(v as RepresentationPreset)}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPRESENTATION_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={colorTheme} onValueChange={(v) => applyColor(v as ColorTheme)}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_THEMES.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {superpositionSources.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={supSourceId} onValueChange={setSupSourceId}>
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <SelectValue placeholder="Superpose with…" />
                </SelectTrigger>
                <SelectContent>
                  {superpositionSources.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.fileName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                onClick={runSuperposition}
                disabled={!supSourceId || superposeBusy}
              >
                {superposeBusy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Target className="mr-1.5 h-3.5 w-3.5" />
                )}
                Run
              </Button>
            </div>
          ) : null}

          <Button
            type="button"
            variant={spinning ? "default" : "outline"}
            size="sm"
            onClick={toggleSpin}
            disabled={state !== "ready"}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Spin
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={focusOnLoaded} disabled={state !== "ready"}>
            <Focus className="mr-1.5 h-3.5 w-3.5" />
            Fit
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={resetCamera} disabled={state !== "ready"}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={downloadScreenshot} disabled={state !== "ready"}>
            <Camera className="mr-1.5 h-3.5 w-3.5" />
            Snapshot
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={fileUrl} download={fileName}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="mr-1.5 h-3.5 w-3.5" /> : <Maximize2 className="mr-1.5 h-3.5 w-3.5" />}
            {isFullscreen ? "Exit" : "Full"}
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

      {rmsdInfo ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <Target className="h-3.5 w-3.5" />
          <span>
            Superposed with <span className="font-medium">{rmsdInfo.label}</span>
          </span>
          <Badge variant="outline" className="font-mono">
            RMSD {rmsdInfo.rmsd.toFixed(2)} Å
          </Badge>
          <Badge variant="outline" className="font-mono">
            {rmsdInfo.n} CA aligned
          </Badge>
          <button
            type="button"
            onClick={() => setRmsdInfo(null)}
            className="ml-auto text-emerald-900/70 hover:text-emerald-900 dark:text-emerald-200/70 dark:hover:text-emerald-200"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Sequence strip */}
      {chainSequences.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Sequence — click and drag to highlight in 3D
            </p>
            <div className="flex items-center gap-2">
              {residueSel ? (
                <Badge variant="outline" className="font-mono text-2xs tabular-nums">
                  Chain {residueSel.chainId} · {Math.min(residueSel.startSeq, residueSel.endSeq)}-
                  {Math.max(residueSel.startSeq, residueSel.endSeq)}
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-micro"
                onClick={clearResidueSelection}
                disabled={!residueSel}
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="max-h-32 overflow-auto px-3 py-2">
            {chainSequences.map((chain) => (
              <SequenceChainRow
                key={`${chain.entityId}-${chain.chainId}`}
                chain={chain}
                selection={residueSel?.chainId === chain.chainId ? residueSel : null}
                onResidueMouseDown={(idx) => onResidueMouseDown(chain, idx)}
                onResidueMouseEnter={(idx) => onResidueMouseEnter(chain, idx)}
              />
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div
          ref={wrapperRef}
          className="relative h-[calc(100dvh-320px)] min-h-[440px] w-full overflow-hidden bg-card"
        >
          {state === "loading" ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-card/70 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading structure...
            </div>
          ) : null}
          {isFullscreen ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={toggleFullscreen}
              className="absolute right-3 top-3 z-20 shadow-md"
              aria-label="Exit fullscreen"
            >
              <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
              Exit fullscreen
              <kbd className="ml-2 rounded-sm border bg-muted/60 px-1 py-0.5 font-mono text-2xs text-muted-foreground">
                Esc
              </kbd>
            </Button>
          ) : null}
          <div
            id={`molstar-${containerId}`}
            ref={containerRef}
            className="h-full w-full"
            style={{ position: "relative" }}
          />
        </div>
      </Card>

      <div className="flex flex-wrap gap-3 px-1 text-micro text-muted-foreground">
        <Tip label="Drag" detail="rotate" />
        <Tip label="Scroll" detail="zoom" />
        <Tip label="Right-drag" detail="pan" />
        <Tip label="Double-click" detail="focus residue" />
      </div>
    </div>
  )
}

function SequenceChainRow({
  chain,
  selection,
  onResidueMouseDown,
  onResidueMouseEnter,
}: {
  chain: ChainSequence
  selection: ResidueSelection | null
  onResidueMouseDown: (residueIndex: number) => void
  onResidueMouseEnter: (residueIndex: number) => void
}) {
  const start = selection ? Math.min(selection.startSeq, selection.endSeq) : null
  const end = selection ? Math.max(selection.startSeq, selection.endSeq) : null
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-center gap-2">
        <Badge variant="outline" className="font-mono text-2xs uppercase">
          {chain.kind === "protein" ? "AA" : chain.kind} · {chain.chainId}
        </Badge>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground">
          {chain.code.length} residues
        </span>
      </div>
      <div className="flex flex-wrap font-mono text-mini leading-5 select-none">
        {chain.code.split("").map((aa, i) => {
          const seqId = chain.seqIds[i] ?? i + 1
          const selected = start != null && end != null && seqId >= start && seqId <= end
          return (
            <span
              key={i}
              onMouseDown={() => onResidueMouseDown(i)}
              onMouseEnter={() => onResidueMouseEnter(i)}
              className={`inline-block w-[10px] cursor-pointer text-center ${
                selected
                  ? "bg-amber-300/80 text-black dark:bg-amber-400/70"
                  : "hover:bg-muted/60"
              }`}
              title={`${aa} ${seqId}`}
            >
              {aa}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Tip({ label, detail }: { label: string; detail: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded-sm border bg-muted/40 px-1.5 py-0.5 font-mono text-2xs text-foreground">
        {label}
      </span>
      <span>{detail}</span>
    </span>
  )
}

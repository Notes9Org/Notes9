"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  Table as TableIcon,
  ChartBar,
  GridNine,
  SlidersHorizontal,
} from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import type { AppliedMutation } from "@/lib/data-analysis/spec/mutations"
import type { ReopenVerdict } from "@/lib/data-analysis/saved-analysis"

import { AnalysisHeader, type SaveState } from "./analysis-header"
import { Inspector, type InspectorTab } from "./inspector"
import { ProvenancePanel } from "./provenance-panel"
import { ReopenBanner } from "./reopen-banner"
import { ResultsCard } from "./results-card"
import { ComputeBar, EASE_OUT } from "./motion"
import { Dock, DockTab, useDockLayout } from "./docks"
import { WorkspaceToolbar, type ToolbarCounts } from "./workspace-toolbar"

/**
 * The analysis workspace shell.
 *
 * ONE canvas. The previous layout split an analysis across four sibling tabs
 * (Chart · Statistics · Standard curve · Plate), which meant reading the
 * statistics required losing sight of the figure they describe. The master
 * document is explicit that the mental model must be "one thing, three views,
 * not three tools", and every comparable product that gets this right, Mixpanel,
 * Hex, Elicit, keeps the result visible beside the thing it explains.
 *
 * So the figure holds the centre and the three supporting surfaces dock around
 * it: data to the left, chart and test settings to the right, statistics along
 * the bottom. Each dock closes to a labelled tab in place and reopens where it
 * was, which is what keeps them views rather than destinations. Collapsing a
 * dock is a layout change and never recomputes (Law 5).
 *
 * Standard curve is not a mode here; it is a chart kind plus a fit config, which
 * is how the spec already models it. Plate is a view of the data pane.
 */

export type DataPaneView = "table" | "plate"

export function AnalysisWorkspace({
  spec,
  result,
  computing,
  name,
  onRename,
  revisionNo,
  isFrozen,
  saveState,
  history,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onFreeze,
  reopenVerdict,
  onKeepStored,
  onRerun,
  rerunning,
  toolbar,
  counts,
  canvas,
  dataTable,
  plateView,
  inspectorData,
  inspectorStyle,
  className,
}: {
  spec: AnalysisSpec
  result: EngineResult | null
  computing?: boolean

  name: string
  onRename?: (name: string) => void
  revisionNo: number
  isFrozen?: boolean
  saveState: SaveState
  history: AppliedMutation[]
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSave?: () => void
  onFreeze?: () => void

  reopenVerdict?: ReopenVerdict | null
  onKeepStored?: () => void
  onRerun?: () => void
  rerunning?: boolean

  /** Import/save/template actions, carried over from the previous workspace. */
  toolbar?: React.ComponentProps<typeof WorkspaceToolbar>
  counts?: ToolbarCounts

  /** The chart itself. Supplied by the caller so the shell stays renderer-agnostic. */
  canvas: ReactNode
  dataTable: ReactNode
  plateView?: ReactNode
  inspectorData: ReactNode
  inspectorStyle: ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("data")
  const [dataView, setDataView] = useState<DataPaneView>("table")
  const [provenanceOpen, setProvenanceOpen] = useState(false)
  const { layout, toggle, setOpen, resize } = useDockLayout("n9.analysis.docks")

  return (
    <div className={cn("flex min-h-0 flex-col bg-[color:var(--background)]", className)}>
      <AnalysisHeader
        name={name}
        onRename={onRename}
        revisionNo={revisionNo}
        isFrozen={isFrozen}
        saveState={saveState}
        history={history}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onSave={onSave}
        onFreeze={onFreeze}
      />

      {toolbar && <WorkspaceToolbar {...toolbar} counts={counts ?? toolbar.counts} />}

      <div className="flex min-h-0 flex-1 items-stretch gap-1.5 px-4 pb-4 pt-3">
        {/* Data dock. The spreadsheet is the genuine editable surface, so it
            animates its width rather than unmounting: tearing down Univer on
            every collapse would lose the user's cursor and selection. */}
        {!layout.left.open && (
          <DockTab
            side="left"
            label="Data"
            icon={<TableIcon className="size-3.5" />}
            onOpen={() => setOpen("left", true)}
          />
        )}
        <Dock
          side="left"
          open={layout.left.open}
          size={layout.left.size}
          onToggle={() => toggle("left")}
          onResize={(s) => resize("left", s)}
          title="Data"
          icon={<TableIcon className="size-3.5 text-muted-foreground" />}
          bodyClassName="overflow-hidden"
          actions={
            plateView ? (
              <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
                {(["table", "plate"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDataView(v)}
                    aria-pressed={dataView === v}
                    className={cn(
                      "rounded-md px-2 py-1 text-[12.5px] capitalize transition-colors",
                      dataView === v
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {v === "plate" ? <GridNine className="size-3" /> : v}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        >
          <div className="h-full">{dataView === "plate" && plateView ? plateView : dataTable}</div>
        </Dock>

        {/* Centre column: the figure, with the statistics docked beneath it. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            <ComputeBar active={Boolean(computing)} />

            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {reopenVerdict && onKeepStored && onRerun && (
                <ReopenBanner
                  verdict={reopenVerdict}
                  onKeepStored={onKeepStored}
                  onRerun={onRerun}
                  rerunning={rerunning}
                />
              )}

              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduce ? { duration: 0.12 } : { duration: 0.28, ease: EASE_OUT }}
                className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border/50 bg-card p-4"
              >
                {canvas}
              </motion.div>
            </div>
          </div>

          {!layout.bottom.open && (
            <DockTab
              side="bottom"
              label="Statistics"
              icon={<ChartBar className="size-3.5" />}
              onOpen={() => setOpen("bottom", true)}
            />
          )}
          <Dock
            side="bottom"
            open={layout.bottom.open}
            size={layout.bottom.size}
            onToggle={() => toggle("bottom")}
            onResize={(s) => resize("bottom", s)}
            title="Statistics"
            icon={<ChartBar className="size-3.5 text-muted-foreground" />}
          >
            <ResultsCard
              spec={spec}
              result={result}
              computing={computing}
              onShowProvenance={() => setProvenanceOpen(true)}
              flush
            />
          </Dock>
        </div>

        {/* Settings dock: chart style on one tab, the test and its corrections
            on the other. */}
        <Dock
          side="right"
          open={layout.right.open}
          size={layout.right.size}
          onToggle={() => toggle("right")}
          onResize={(s) => resize("right", s)}
          title="Settings"
          icon={<SlidersHorizontal className="size-3.5 text-muted-foreground" />}
          bodyClassName="overflow-hidden"
        >
          <Inspector
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            computing={computing}
            dataChildren={inspectorData}
            styleChildren={inspectorStyle}
            className="h-full"
            flush
          />
        </Dock>
        {!layout.right.open && (
          <DockTab
            side="right"
            label="Settings"
            icon={<SlidersHorizontal className="size-3.5" />}
            onOpen={() => setOpen("right", true)}
          />
        )}
      </div>

      <ProvenancePanel
        open={provenanceOpen}
        onClose={() => setProvenanceOpen(false)}
        spec={spec}
        result={result}
        history={history}
        revisionNo={revisionNo}
        isFrozen={isFrozen}
        sourceDetached={reopenVerdict?.state === "detached"}
      />
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ChartLineUp, Database } from "@phosphor-icons/react/ssr"
import { cn } from "@/lib/utils"
import { DataAnalysisWorkspace } from "@/components/data-analysis/data-analysis-workspace"
import { DataFilesListClient, type DataFileRow } from "@/components/data-analysis/data-files-list"

type Section = "analysis" | "files"
const SECTION_KEY = "n9-data-active-section"
const INDICATOR_SPRING = { type: "spring", stiffness: 500, damping: 40, mass: 0.7 } as const

type Option = { id: string; name: string }
type ExperimentOption = Option & { project_id: string | null }

/**
 * Top-level Data hub: two sections behind one glass-pill toggle.
 *
 *   Analysis    the single analysis surface — charts, statistics, standard
 *               curve, plate map, and the spec-driven workspace with its
 *               multi-panel figure layouts, all over one spreadsheet;
 *   Data files  every file across the user's experiments.
 *
 * There is deliberately no second analysis section. Two surfaces over the same
 * data meant two places to keep in step, and the one you landed on decided
 * which half of the features you could see.
 */
export function DataHub({
  files,
  projects,
  experiments,
}: {
  files: DataFileRow[]
  projects: Option[]
  experiments: ExperimentOption[]
}) {
  const reduce = useReducedMotion()
  const [section, setSection] = useState<Section>("analysis")
  useEffect(() => {
    try {
      localStorage.setItem(SECTION_KEY, section)
    } catch {
      /* ignore */
    }
  }, [section])

  return (
    <div className="space-y-4">
      <div className="glass-panel inline-flex rounded-2xl p-1 shadow-sm">
        <SectionPill active={section === "analysis"} onClick={() => setSection("analysis")} Icon={ChartLineUp} label="Analysis" reduce={reduce} />
        <SectionPill active={section === "files"} onClick={() => setSection("files")} Icon={Database} label="Data files" reduce={reduce} count={files.length} />
      </div>

      {/* One analysis surface. The spec-driven workspace and the multi-panel
          figure layout live inside it as phases, sharing its sheet, so there is
          a single place data is analysed rather than two that must be kept in
          step. It stays mounted while the file browser shows, because it owns
          the spreadsheet and unmounting it would drop the user's edits. */}
      <div className={cn(section !== "analysis" && "hidden")}>
        <DataAnalysisWorkspace files={files} projects={projects} experiments={experiments} />
      </div>

      {section === "files" && (
        <div className="space-y-6">
          <DataFilesListClient files={files} projects={projects} experiments={experiments} />
        </div>
      )}
    </div>
  )
}

function SectionPill({
  active,
  onClick,
  Icon,
  label,
  reduce,
  count,
}: {
  active: boolean
  onClick: () => void
  Icon: React.ComponentType<{ className?: string; weight?: "regular" | "fill" }>
  label: string
  reduce: boolean | null
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-200",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active &&
        (reduce ? (
          <span className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-border/50" />
        ) : (
          <motion.span
            layoutId="data-section-pill"
            className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-border/50"
            transition={INDICATOR_SPRING}
          />
        ))}
      <span className="relative z-10 inline-flex items-center gap-2">
        <Icon className="h-4 w-4" weight={active ? "fill" : "regular"} />
        {label}
        {count != null && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{count}</span>
        )}
      </span>
    </button>
  )
}

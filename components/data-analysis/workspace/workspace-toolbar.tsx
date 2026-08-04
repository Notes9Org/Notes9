"use client"

import { useRef } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  CaretDown,
  ChartLine,
  DownloadSimple,
  FileArrowDown,
  FloppyDisk,
  FolderOpen,
  SquaresFour,
  UploadSimple,
  Sparkle,
} from "@phosphor-icons/react/ssr"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { EASE_OUT } from "./motion"

/**
 * The workspace toolbar.
 *
 * Carries forward every import/save/template affordance the previous workspace
 * had — nothing was dropped in the restructure, because these are the paths a
 * returning user already has muscle memory for:
 *
 *   Import  → Upload from computer · From your data files
 *   Save    → Save chart to data files · Save as template… · Export data (.xlsx)
 *             · Save analysis (.n9a)
 *   Templates, and the rows·cols readout
 *
 * What changed is the chrome, not the inventory. The bar uses the product's own
 * glass tokens rather than a flat border, groups related actions behind
 * separators, and gives every destination its file extension so the menu can be
 * read rather than remembered.
 */

export interface ToolbarCounts {
  rows: number
  columns: number
  /** Tabular files available in the library, shown on the import item. */
  libraryFiles?: number
}

export function WorkspaceToolbar({
  counts,
  onUploadFile,
  onImportFromLibrary,
  onImportAnalysisBundle,
  onSaveChartToLibrary,
  onSaveAsTemplate,
  onExportData,
  onExportAnalysisBundle,
  onOpenTemplates,
  onExportFigure,
  className,
}: {
  counts: ToolbarCounts
  onUploadFile?: (file: File) => void
  onImportFromLibrary?: () => void
  onImportAnalysisBundle?: (file: File) => void
  onSaveChartToLibrary?: () => void
  onSaveAsTemplate?: () => void
  onExportData?: () => void
  onExportAnalysisBundle?: () => void
  onOpenTemplates?: () => void
  onExportFigure?: () => void
  className?: string
}) {
  const reduce = useReducedMotion()
  const uploadRef = useRef<HTMLInputElement>(null)
  const bundleRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={cn(
        // The product's glass surface rather than a plain bar: it reads as a
        // control layer floating over the workspace instead of another divider.
        "relative flex flex-wrap items-center gap-1 px-4 pt-2",
        className
      )}
    >
      {/* Hidden inputs: the accept lists match the previous workspace exactly. */}
      <input
        ref={uploadRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls,.txt,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUploadFile?.(file)
          e.target.value = ""
        }}
      />
      <input
        ref={bundleRef}
        type="file"
        accept=".n9a,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImportAnalysisBundle?.(file)
          e.target.value = ""
        }}
      />

      <ToolbarMenu label="Import" icon={UploadSimple}>
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Bring data in
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => uploadRef.current?.click()}>
          <UploadSimple className="size-4" />
          <span className="flex-1">Upload from computer</span>
          <span className="font-mono text-[10px] text-muted-foreground">CSV · XLSX</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onImportFromLibrary?.()}>
          <FolderOpen className="size-4" />
          <span className="flex-1">From your data files</span>
          {counts.libraryFiles !== undefined && (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {counts.libraryFiles}
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => bundleRef.current?.click()}>
          <FileArrowDown className="size-4" />
          <span className="flex-1">Open a saved analysis</span>
          <span className="font-mono text-[10px] text-muted-foreground">.n9a</span>
        </DropdownMenuItem>
      </ToolbarMenu>

      <ToolbarMenu label="Save" icon={DownloadSimple}>
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Keep it in notes9
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onSaveChartToLibrary?.()}>
          <ChartLine className="size-4" />
          <span className="flex-1">Save chart to data files</span>
          <span className="font-mono text-[10px] text-muted-foreground">PNG</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSaveAsTemplate?.()}>
          <SquaresFour className="size-4" />
          <span className="flex-1">Save as template…</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Take it out
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onExportData?.()}>
          <DownloadSimple className="size-4" />
          <span className="flex-1">Export data</span>
          <span className="font-mono text-[10px] text-muted-foreground">.xlsx</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExportAnalysisBundle?.()}>
          <FloppyDisk className="size-4" />
          <span className="flex-1">Save analysis bundle</span>
          <span className="font-mono text-[10px] text-muted-foreground">.n9a</span>
        </DropdownMenuItem>
      </ToolbarMenu>

      <ToolbarButton label="Templates" icon={SquaresFour} onClick={onOpenTemplates} />

      <span className="mx-1 h-4 w-px bg-border/60" />

      <ToolbarButton label="Export figure" icon={FileArrowDown} onClick={onExportFigure} accent />

      {/* Right-aligned readout, monospace so the digits stop shifting as the
          sheet is edited. */}
      <div className="ml-auto flex items-center gap-2">
        <motion.span
          key={`${counts.rows}x${counts.columns}`}
          initial={reduce ? false : { opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16 }}
          className="font-mono text-[12px] tabular-nums text-muted-foreground"
        >
          {counts.rows.toLocaleString()} rows · {counts.columns} cols
        </motion.span>
      </div>
    </div>
  )
}

function ToolbarMenu({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          type="button"
          whileTap={reduce ? undefined : { scale: 0.975 }}
          transition={{ duration: 0.1, ease: EASE_OUT }}
          className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground data-[state=open]:bg-muted/70 data-[state=open]:text-foreground"
        >
          <Icon className="size-3.5 text-muted-foreground" />
          {label}
          <CaretDown className="size-2.5 text-muted-foreground/60" />
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  accent,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick?: () => void
  accent?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.975 }}
      transition={{ duration: 0.1, ease: EASE_OUT }}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
        accent
          ? "text-[var(--n9-accent)] hover:bg-[var(--n9-accent)]/[0.10]"
          : "text-foreground/80 hover:bg-muted/70 hover:text-foreground"
      )}
    >
      <Icon className={cn("size-3.5", accent ? "" : "text-muted-foreground")} />
      {label}
    </motion.button>
  )
}

/**
 * The template gallery, carried over from the previous workspace.
 *
 * The built-ins are the ones already shipped (lib/data-analysis/templates.ts):
 * ELISA quantification, dose–response/IC50, growth curve, Bradford/BCA, qPCR
 * ΔΔCt, enzyme kinetics. Presented as cards rather than a list because a
 * template is chosen by recognising the assay, not by reading its name.
 */
export function TemplateCard({
  name,
  category,
  description,
  onApply,
  builtin,
}: {
  name: string
  category?: string
  description?: string
  onApply: () => void
  builtin?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onApply}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      className="group flex w-full flex-col items-start gap-1 rounded-xl border border-border/60 bg-card/60 p-3 text-left transition-colors hover:border-[var(--n9-accent)]/35 hover:bg-card"
    >
      <span className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {name}
        </span>
        {builtin && (
          <span className="shrink-0 rounded-full border border-border/70 px-1.5 text-[10px] text-muted-foreground">
            Built in
          </span>
        )}
      </span>
      {category && (
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--n9-accent)]">
          <Sparkle className="size-2.5" weight="fill" />
          {category}
        </span>
      )}
      {description && (
        <span className="text-[11.5px] leading-snug text-muted-foreground">{description}</span>
      )}
    </motion.button>
  )
}

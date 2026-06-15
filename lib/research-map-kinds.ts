import {
  BookOpen,
  Box,
  ClipboardList,
  Database,
  FileBarChart,
  FlaskConical,
  FolderKanban,
  NotebookPen,
  PenLine,
  TestTube,
  type LucideIcon,
} from "lucide-react"
import type { ResearchMapNodeKind } from "@/lib/research-map-types"

/**
 * Pure presentation helpers for research-map node kinds — colors, tints, and
 * labels. Kept in a separate module from `research-map-layout` (which pulls in
 * the CommonJS `dagre` dependency) so the client-side node component can import
 * these without dragging `dagre` into its bundle.
 *
 * Color assignment (kindAccentClass / kindHexColor / edgeColorForKind agree):
 *   project    burnt sienna (brand) — warm brown
 *   experiment blue-600             — blue
 *   protocol   yellow-600           — gold
 *   literature green-600            — green
 *   lab_note   red-600              — red
 *   paper      purple-600           — purple
 *   report     cyan-600             — teal
 *   data_file  orange-600           — orange
 */

/** Border + text accent for a node. The background tint lives in
 * `kindTintClass` and is rendered as a separate overlay so the node itself can
 * keep an OPAQUE base (bg-card) — otherwise the translucent tint lets the edges
 * behind the node show through and cover its text. */
export function kindAccentClass(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "border-l-[6px] border-l-primary border-y border-r border-border text-foreground"
    case "experiment":
      return "border-l-[6px] border-l-blue-600 border-y border-r border-border text-foreground"
    case "protocol":
      return "border-l-[6px] border-l-yellow-600 border-y border-r border-border text-foreground"
    case "literature":
      return "border-l-[6px] border-l-green-600 border-y border-r border-border text-foreground"
    case "lab_note":
      return "border-l-[6px] border-l-red-600 border-y border-r border-border text-foreground"
    case "paper":
      return "border-l-[6px] border-l-purple-600 border-y border-r border-border text-foreground"
    case "report":
      return "border-l-[6px] border-l-cyan-600 border-y border-r border-border text-foreground"
    case "data_file":
      return "border-l-[6px] border-l-orange-600 border-y border-r border-border text-foreground"
    default:
      return "border border-border text-foreground"
  }
}

/** Translucent kind tint, painted as an overlay over the node's opaque base. */
export function kindTintClass(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "bg-primary/[0.06]"
    case "experiment":
      return "bg-blue-500/[0.07]"
    case "protocol":
      return "bg-yellow-500/[0.07]"
    case "literature":
      return "bg-green-500/[0.07]"
    case "lab_note":
      return "bg-red-500/[0.07]"
    case "paper":
      return "bg-purple-500/[0.07]"
    case "report":
      return "bg-cyan-500/[0.07]"
    case "data_file":
      return "bg-orange-500/[0.07]"
    default:
      return "bg-muted/40"
  }
}

export function kindDotClass(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "bg-primary"
    case "experiment":
      return "bg-blue-600"
    case "protocol":
      return "bg-yellow-600"
    case "literature":
      return "bg-green-600"
    case "lab_note":
      return "bg-red-600"
    case "paper":
      return "bg-purple-600"
    case "report":
      return "bg-cyan-600"
    case "data_file":
      return "bg-orange-600"
    default:
      return "bg-muted-foreground"
  }
}

/**
 * Hex stroke colors keyed by edge `kind`. ReactFlow's edge stroke is set via
 * inline style; CSS variables don't resolve there because the renderer paints
 * with raw SVG. Each edge takes the hue of its *target* node so a researcher
 * can trace "what connects to what" by color.
 */
export function edgeColorForKind(kind: string): string {
  switch (kind) {
    case "project_contains_experiment":
      return "#2563eb" // blue-600 → experiment
    case "experiment_uses_protocol":
    case "project_contains_protocol":
    case "lab_note_uses_protocol":
      return "#ca8a04" // yellow-600 → protocol
    case "project_linked_literature":
    case "experiment_linked_literature":
      return "#16a34a" // green-600 → literature
    case "experiment_has_lab_note":
    case "project_has_lab_note":
      return "#dc2626" // red-600 → lab note
    case "project_contains_paper":
      return "#9333ea" // purple-600 → writing
    case "project_contains_report":
    case "experiment_has_report":
      return "#0891b2" // cyan-600 → report
    case "experiment_has_data_file":
    case "project_has_data_file":
      return "#ea580c" // orange-600 → data file
    default:
      return "#9ca3af" // gray-400 fallback
  }
}

/** Minimap dot color — mirrors edge palette so the minimap reads as a legend. */
export function kindHexColor(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "#965034" // burnt-sienna primary
    case "experiment":
      return "#2563eb" // blue-600
    case "protocol":
      return "#ca8a04" // yellow-600
    case "literature":
      return "#16a34a" // green-600
    case "lab_note":
      return "#dc2626" // red-600
    case "paper":
      return "#9333ea" // purple-600
    case "report":
      return "#0891b2" // cyan-600
    case "data_file":
      return "#ea580c" // orange-600
    default:
      return "#9ca3af"
  }
}

/** Per-kind icon so nodes are distinguishable by logo, not just color. */
export function kindIcon(kind: ResearchMapNodeKind): LucideIcon {
  switch (kind) {
    case "project":
      return FolderKanban
    case "experiment":
      return FlaskConical
    case "protocol":
      return ClipboardList
    case "literature":
      return BookOpen
    case "lab_note":
      return NotebookPen
    case "paper":
      return PenLine
    case "report":
      return FileBarChart
    case "sample":
      return TestTube
    case "data_file":
      return Database
    default:
      return Box
  }
}

/** Icon tint — mirrors the kind accent hue. */
export function kindIconClass(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "text-primary"
    case "experiment":
      return "text-blue-600"
    case "protocol":
      return "text-yellow-600"
    case "literature":
      return "text-green-600"
    case "lab_note":
      return "text-red-600"
    case "paper":
      return "text-purple-600"
    case "report":
      return "text-cyan-600"
    case "sample":
      return "text-pink-600"
    case "data_file":
      return "text-orange-600"
    default:
      return "text-muted-foreground"
  }
}

export function kindLabel(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "Project"
    case "experiment":
      return "Experiment"
    case "protocol":
      return "Protocol"
    case "literature":
      return "Literature"
    case "lab_note":
      return "Lab note"
    case "paper":
      return "Writing"
    case "report":
      return "Report"
    case "sample":
      return "Sample"
    case "data_file":
      return "Data file"
    default:
      return kind
  }
}

import type { ComponentType } from "react"
import {
  BookOpen,
  ChartLine,
  Database,
  FileText,
  Flask as FlaskConical,
  Folder,
  Graph as Network,
  House as Home,
  NotePencil as NotebookPen,
  PenNib,
  TestTube,
} from "@phosphor-icons/react/ssr"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import { FlareIcon } from "@/components/ui/flare-icon"

/** Accepts Phosphor icons and our custom SVG-based wrapper icons. `weight`
 * lets the sidebar render the active item's icon filled. */
type NavIcon = ComponentType<{ className?: string; weight?: "regular" | "fill" }>

export type NavItem = {
  name: string
  href: string
  icon: NavIcon
  /** Rendered as indented sub-rows under the parent (flattened in the icon rail). */
  children?: NavItem[]
}

/**
 * Single source of truth: primary app nav (mirrors
 * [components/layout/app-sidebar](components/layout/app-sidebar)).
 *
 * One flat, minimal list ordered by the research loop our marketing tells
 * (read → method → run → materials → publish): Literature → Protocols →
 * Experiments (lab notes / data inside) → Samples → Writing → Reports, with
 * Catalyst reasoning over all of it. The only nesting is Lab notes / Data
 * under Experiments. The active project/experiment context lives in the
 * sidebar's dedicated context card (see app-sidebar), not in this list.
 *
 * Lab notes / Data nest strictly under Experiments (they only exist inside an
 * experiment): with an experiment open they land inside that experiment's
 * tab; otherwise they show the pick-a-context list. Protocols / Literature /
 * Samples are lab-wide libraries and always open unscoped from the sidebar;
 * `?project=` deep links still filter.
 *
 * Dashboard / Planner are deliberately separate after the 2026-05 split:
 *   - Dashboard = lab status overview (active experiments, recently edited, today).
 *   - Planner   = self-organized workspace (schedule, tasks, whiteboard).
 */
export const APP_PRIMARY_NAV: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Projects", href: "/projects", icon: Folder },
  { name: "Literature", href: "/literature-reviews", icon: BookOpen },
  { name: "Protocols", href: "/protocols", icon: ClipboardInfoIcon as unknown as NavIcon },
  {
    name: "Experiments",
    href: "/experiments",
    icon: FlaskConical,
    children: [
      { name: "Lab notes", href: "/lab-notes", icon: NotebookPen },
      { name: "Data", href: "/data", icon: Database },
    ],
  },
  // Analysis reads experiment data, so it sits right after Experiments.
  { name: "Analysis", href: "/analysis", icon: ChartLine },
  { name: "Samples", href: "/samples", icon: TestTube },
  { name: "Writing", href: "/papers", icon: PenNib },
  { name: "Reports", href: "/reports", icon: FileText },
  // Concave four-point flare (custom SVG) — Catalyst's glyph after ruling
  // out sparkles, brain/head-circuit, lightning, atom and galaxy: a single
  // sculpted spark, the current visual shorthand for AI, without the
  // multi-star sparkles cluster.
  { name: "Catalyst", href: "/catalyst", icon: FlareIcon as unknown as NavIcon },
  { name: "Research map", href: "/research-map", icon: Network },
]

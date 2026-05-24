import type { ComponentType } from "react"
import {
  CalendarClock,
  Folder,
  Home,
  Network,
  Sparkles,
} from "lucide-react"

/** Accepts both Lucide icons and our custom SVG-based wrapper icons. */
type NavIcon = ComponentType<{ className?: string }>

/** Single source of truth: primary app nav (mirrors [components/layout/app-sidebar](components/layout/app-sidebar)).
 *
 * Dashboard / Planner are deliberately separate after the 2026-05 split:
 *   - Dashboard = lab status overview (active experiments, recently edited, today).
 *   - Planner   = self-organized workspace (schedule, tasks, whiteboard).
 */
export const APP_PRIMARY_NAV: { name: string; href: string; icon: NavIcon }[] = [
  // Writing (/papers) and Reports (/reports) intentionally omitted from the
  // primary nav — they're surfaced as cards inside each project workspace.
  // The routes still exist and are reachable from those cards.
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Planner", href: "/planner", icon: CalendarClock },
  { name: "Projects", href: "/projects", icon: Folder },
  { name: "Catalyst", href: "/catalyst", icon: Sparkles },
  { name: "Research map", href: "/research-map", icon: Network },
]

import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  BookOpen,
  FlaskConical,
  Folder,
  Home,
  Microscope,
  Network,
  NotebookPen,
  ScrollText,
  TestTube,
} from "lucide-react"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"

/** Single source of truth: primary app nav (mirrors [components/layout/app-sidebar](components/layout/app-sidebar)). */
export const APP_PRIMARY_NAV: { name: string; href: string; icon: LucideIcon }[] = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Projects", href: "/projects", icon: Folder },
  { name: "Experiments", href: "/experiments", icon: FlaskConical },
  { name: "Lab Notes", href: "/lab-notes", icon: NotebookPen },
  { name: "Samples", href: "/samples", icon: TestTube },
  { name: "Equipment", href: "/equipment", icon: Microscope },
  { name: "Protocols", href: "/protocols", icon: ClipboardInfoIcon },
  { name: "Literature", href: "/literature-reviews", icon: BookOpen },
  { name: "Research map", href: "/research-map", icon: Network },
  { name: "Writing", href: "/papers", icon: ScrollText },
  { name: "Reports", href: "/reports", icon: BarChart3 },
]

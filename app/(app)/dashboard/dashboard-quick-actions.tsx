"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import {
  FileEdit,
  FileText,
  FlaskConical,
  FolderOpen,
  NotebookPen,
  TestTube,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useProjectScope } from "@/contexts/project-scope-context"
import { NewLabNoteDialog } from "@/app/(app)/lab-notes/new-lab-note-dialog"
import { ReportGeneratorDialog } from "@/app/(app)/reports/report-generator-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import { cn } from "@/lib/utils"
import { withFromDashboard } from "@/lib/from-dashboard"

type QuickAction = {
  id: string
  label: string
  // Both lucide icons and ClipboardInfoIcon accept className + aria-hidden.
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  href?: string
  dialog?: "lab_note" | "report"
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "project", label: "Project", icon: FolderOpen, href: "/projects/new" },
  {
    id: "experiment",
    label: "Experiment",
    icon: FlaskConical,
    href: "/experiments/new",
  },
  { id: "sample", label: "Sample", icon: TestTube, href: "/samples/new" },
  {
    id: "protocol",
    label: "Protocol",
    icon: ClipboardInfoIcon,
    href: "/protocols/new",
  },
  { id: "lab_note", label: "Lab note", icon: NotebookPen, dialog: "lab_note" },
  { id: "writing", label: "Writing", icon: FileEdit, href: "/papers/new" },
  { id: "report", label: "Report", icon: FileText, dialog: "report" },
]

const QUICK_ACTION_TRIGGER_CLASS = cn(
  "group min-w-[4.75rem] shrink-0 flex-1 basis-0 justify-center gap-1.5 rounded-md px-2 py-2 text-sm",
  "transition-[transform,background-color,box-shadow,color] duration-150 ease-out",
  "hover:bg-background/90 hover:text-foreground hover:shadow-sm hover:-translate-y-px",
  "active:translate-y-0 active:scale-[0.98] active:bg-background active:shadow-none",
  "data-[state=active]:bg-background data-[state=active]:shadow-sm",
  "sm:min-w-[5.25rem] sm:px-3",
)

export function DashboardQuickActions({ userId }: { userId: string }) {
  const router = useRouter()
  const scope = useProjectScope()
  const supabase = useMemo(() => createClient(), [])

  const [activeTab, setActiveTab] = useState("")
  const [labNoteOpen, setLabNoteOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [experiments, setExperiments] = useState<
    { id: string; name: string; project_id: string }[]
  >([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data: projectRows } = await supabase
        .from("projects")
        .select("id, name")
        .order("updated_at", { ascending: false })
        .limit(200)
      const { data: experimentRows } = await supabase
        .from("experiments")
        .select("id, name, project_id")
        .order("updated_at", { ascending: false })
        .limit(400)
      if (cancelled) return
      setProjects(projectRows ?? [])
      setExperiments(experimentRows ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const handleTabChange = (value: string) => {
    const action = QUICK_ACTIONS.find((a) => a.id === value)
    if (!action) return

    if (action.href) {
      if (action.id === "protocol" && scope.projectId) {
        router.push(withFromDashboard(`/protocols/new?project=${scope.projectId}`))
      } else {
        router.push(withFromDashboard(action.href))
      }
    } else if (action.dialog === "lab_note") {
      setLabNoteOpen(true)
    } else if (action.dialog === "report") {
      setReportOpen(true)
    }

    setActiveTab("")
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl justify-center px-4">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="flex w-full min-w-0 flex-nowrap items-center gap-2 rounded-lg border border-border/60 bg-muted/50 p-1.5 shadow-sm sm:gap-2.5">
            <span className="flex shrink-0 items-center rounded-lg bg-[#e4ecd9] px-3 py-2 text-sm font-semibold tracking-tight text-[#4f5f42] dark:bg-[#3d4a35] dark:text-[#e4ecd9] sm:px-4 sm:text-lg">
              Create new
            </span>
            <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList
              scrollable={false}
              className="flex h-auto w-max min-w-full flex-nowrap gap-1 border-0 bg-transparent p-0 shadow-none sm:gap-1.5"
            >
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <TabsTrigger
                    key={action.id}
                    value={action.id}
                    className={QUICK_ACTION_TRIGGER_CLASS}
                  >
                    <Icon
                      className="size-4 shrink-0 opacity-75 transition-opacity duration-150 group-hover:opacity-100"
                      aria-hidden
                    />
                    <span className="truncate">{action.label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
            </div>
          </div>
        </Tabs>
      </div>

      <NewLabNoteDialog
        open={labNoteOpen}
        onOpenChange={setLabNoteOpen}
        defaultProjectId={scope.projectId}
      />

      <ReportGeneratorDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        projects={projects}
        experiments={experiments}
        userId={userId}
      />
    </>
  )
}

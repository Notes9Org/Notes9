"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import { NotePencil as FileEdit, FileText, Flask as FlaskConical, FolderOpen, NotePencil as NotebookPen, TestTube } from "@phosphor-icons/react/ssr"
import { createClient } from "@/lib/supabase/client"
import { useProjectScope } from "@/contexts/project-scope-context"
import { NewLabNoteDialog } from "@/app/(app)/lab-notes/new-lab-note-dialog"
import { ReportGeneratorDialog } from "@/app/(app)/reports/report-generator-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import { cn } from "@/lib/utils"
import { withFromDashboard } from "@/lib/from-dashboard"
import {
  CREATE_ACTIONS,
  createActionHref,
  type CreateActionId,
} from "@/lib/app-create-actions"

// Labels, order and hrefs come from CREATE_ACTIONS so this list can't drift from
// the sidebar New menu or the `c` shortcuts. Icons stay here — the shared list is
// deliberately icon-free. Both phosphor icons and ClipboardInfoIcon take
// className + aria-hidden.
const QUICK_ACTION_ICONS: Record<
  CreateActionId,
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  project: FolderOpen,
  experiment: FlaskConical,
  sample: TestTube,
  protocol: ClipboardInfoIcon,
  labNote: NotebookPen,
  paper: FileEdit,
  report: FileText,
}

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
    const action = CREATE_ACTIONS.find((a) => a.id === value)
    if (!action) return

    if (action.id === "labNote") {
      setLabNoteOpen(true)
    } else if (action.id === "report") {
      // Local override, deliberately diverging from CREATE_ACTIONS: the sidebar
      // navigates to /reports?new=true, the dashboard opens the generator here.
      setReportOpen(true)
    } else {
      // ponytail: only protocol inherits project scope, which is what this
      // surface already did. Drop the ternary for createActionHref(action,
      // scope.projectId) if the dashboard should scope like the sidebar.
      const href =
        action.id === "protocol"
          ? createActionHref(action, scope.projectId)
          : action.href
      if (href) router.push(withFromDashboard(href))
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
              {CREATE_ACTIONS.map((action) => {
                const Icon = QUICK_ACTION_ICONS[action.id]
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

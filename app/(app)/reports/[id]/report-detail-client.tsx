"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useProjectScope } from "@/contexts/project-scope-context"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useSkeletonGate } from "@/hooks/use-skeleton-gate"
import { FileText, CaretLeft as ChevronLeft, List, CircleNotch as Loader2, DotsThreeVertical as MoreVertical, Plus, Trash as Trash2 } from "@phosphor-icons/react/ssr"
import { cn } from "@/lib/utils"
import {
  SideRail,
  SideRailBody,
  SideRailEmpty,
  SideRailHeader,
  SideRailList,
  SideRailRow,
  SideRailSkeleton,
} from "@/components/patterns/side-rail"
import { ReportDetailView } from "./report-detail-view"
import { ReportGeneratorDialog } from "../report-generator-dialog"
import type { ReportRow } from "../reports-page-client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

interface SidebarReport {
  id: string
  title: string
  project_id?: string | null
  created_at: string
  updated_at: string
}

export function ReportDetailClient({
  activeReport,
}: {
  activeReport: ReportRow & { content: string | null }
}) {
  const router = useRouter()
  const { projectId } = useProjectScope()
  const [reports, setReports] = useState<SidebarReport[]>([])
  const [loading, setLoading] = useState(true)
  const showSkeleton = useSkeletonGate(loading)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  // "+" in the rail header → the same AI generator dialog the list page uses.
  // Its data (projects/experiments/user) is fetched lazily on first open.
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [generatorLoading, setGeneratorLoading] = useState(false)
  const [generatorData, setGeneratorData] = useState<{
    projects: { id: string; name: string }[]
    experiments: { id: string; name: string; project_id: string }[]
    userId: string
  } | null>(null)

  const openGenerator = async () => {
    if (generatorData) {
      setGeneratorOpen(true)
      return
    }
    setGeneratorLoading(true)
    try {
      const supabase = createClient()
      const [{ data: userData }, { data: projects }, { data: experiments }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("experiments").select("id, name, project_id").order("name"),
      ])
      if (!userData?.user) throw new Error("Not signed in")
      setGeneratorData({
        projects: projects ?? [],
        experiments: (experiments ?? []) as { id: string; name: string; project_id: string }[],
        userId: userData.user.id,
      })
      setGeneratorOpen(true)
    } catch (err) {
      console.error("Failed to load report generator data", err)
      toast.error("Couldn't open the report generator. Please try again.")
    } finally {
      setGeneratorLoading(false)
    }
  }

  const isMobile = useMediaQuery("(max-width: 768px)")

  const fetchReports = useCallback(async () => {
    try {
      const supabase = createClient()
      let query = supabase
        .from("reports")
        .select("id, title, project_id, created_at, updated_at")
        .order("created_at", { ascending: false })

      if (projectId) {
        query = query.eq("project_id", projectId)
      }

      const { data, error } = await query
      if (error) throw error
      setReports(data || [])
    } catch (error) {
      console.error("Error fetching reports for sidebar:", error)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleSelectReport = (id: string) => {
    if (id === activeReport.id) return
    router.push(`/reports/${id}${projectId ? `?project=${projectId}` : ""}`)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("reports").delete().eq("id", deleteTarget)
      if (error) {
        toast.error(`Failed to delete report: ${error.message}`)
        return
      }
      toast.success("Report deleted")
      setReports((prev) => prev.filter((r) => r.id !== deleteTarget))
      if (deleteTarget === activeReport.id) {
        router.push(projectId ? `/reports?project=${projectId}` : "/reports")
      }
      setDeleteTarget(null)
    } catch (err: any) {
      toast.error(`Error: ${err.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const SidebarContent = () => (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <SideRailHeader label={projectId ? "Project Reports" : "All Reports"}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => void openGenerator()}
          disabled={generatorLoading}
          aria-label="Generate new report"
          title="Generate AI report"
        >
          {generatorLoading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </SideRailHeader>
      <SideRailBody>
        {showSkeleton ? (
          <SideRailSkeleton label="Loading reports" />
        ) : loading ? null : reports.length > 0 ? (
          <SideRailList>
            {reports.map((report) => {
              const isActive = activeReport.id === report.id
              const createdStr = new Date(report.created_at).toLocaleDateString()
              return (
                <SideRailRow
                  key={report.id}
                  active={isActive}
                  onSelect={() => handleSelectReport(report.id)}
                  icon={<FileText />}
                  title={`Created: ${createdStr}`}
                  actions={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Report options"
                        >
                          <MoreVertical className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(report.id)
                          }}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                >
                  {report.title || "Untitled Report"}
                </SideRailRow>
              )
            })}
          </SideRailList>
        ) : (
          <SideRailEmpty>No reports found.</SideRailEmpty>
        )}
      </SideRailBody>
    </div>
  )

  const toggleButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="shrink-0 text-muted-foreground hover:text-foreground"
      onClick={() => setSidebarOpen((prev) => !prev)}
      aria-label={sidebarOpen ? "Hide reports" : "Show reports"}
      title={sidebarOpen ? "Hide reports list" : "Show reports list"}
    >
      {sidebarOpen ? (
        <ChevronLeft className="h-4 w-4" />
      ) : (
        <List className="h-4 w-4" />
      )}
    </Button>
  )

  return (
    <ReportDetailView
      key={activeReport.id}
      report={activeReport}
      leftControls={toggleButton}
      sidebar={
        <>
          <ReportGeneratorDialog
            open={generatorOpen}
            onOpenChange={setGeneratorOpen}
            projects={generatorData?.projects ?? []}
            experiments={generatorData?.experiments ?? []}
            userId={generatorData?.userId ?? ""}
            scopedProjectId={projectId ?? null}
          />
          <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete report?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this report? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    confirmDelete()
                  }}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {/* Desktop Sidebar, glass rail (Catalyst history look). flex-1 so it
              fills the full workspace height instead of shrinking to the list. */}
          <SideRail open={sidebarOpen} className="hidden flex-1 sm:flex">
            <SidebarContent />
          </SideRail>

          {/* Mobile Sidebar (Sheet) */}
          {isMobile && (
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetContent side="left" className="w-64 p-2">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          )}
        </>
      }
    />
  )
}

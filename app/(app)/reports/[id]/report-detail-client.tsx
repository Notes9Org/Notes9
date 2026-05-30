"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useProjectScope } from "@/contexts/project-scope-context"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { FileText, PanelLeftClose, PanelLeftOpen, Loader2, MoreVertical, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ReportDetailView } from "./report-detail-view"
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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
    <div className="flex h-full min-h-0 w-52 min-w-[13rem] flex-col gap-0 p-2">
      <div className="flex h-9 shrink-0 items-center justify-between px-1">
        <span className="truncate text-xs font-medium text-muted-foreground">
          {projectId ? "Project Reports" : "All Reports"}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto mt-1">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length > 0 ? (
          <ul className="flex w-full min-w-0 flex-col gap-0.5">
            {reports.map((report) => {
              const isActive = activeReport.id === report.id
              const createdStr = new Date(report.created_at).toLocaleDateString()
              return (
                <li key={report.id} className="group/list-item relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectReport(report.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleSelectReport(report.id)
                      }
                    }}
                    title={`Created: ${createdStr}`}
                    className={cn(
                      "grid w-full min-h-8 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted/80",
                      isActive && "bg-muted font-medium"
                    )}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 truncate m-0 text-sm">
                      {report.title || "Untitled Report"}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 opacity-70 hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Report options"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
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
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground">
            No reports found.
          </div>
        )}
      </div>
    </div>
  )

  const toggleButton = (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 text-muted-foreground hover:text-foreground"
      onClick={() => setSidebarOpen((prev) => !prev)}
      title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
    >
      {sidebarOpen ? (
        <PanelLeftClose className="h-4 w-4" />
      ) : (
        <PanelLeftOpen className="h-4 w-4" />
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
          {/* Desktop Sidebar */}
          <aside
            className={cn(
              "hidden sm:flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-r border-border relative transition-[width]",
              sidebarOpen ? "w-52 min-w-[13rem] bg-muted/20" : "w-0 border-r-0"
            )}
            aria-hidden={!sidebarOpen}
          >
            {sidebarOpen && <SidebarContent />}
          </aside>

          {/* Mobile Sidebar (Sheet) */}
          {isMobile && (
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetContent side="left" className="w-64 p-0">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          )}
        </>
      }
    />
  )
}

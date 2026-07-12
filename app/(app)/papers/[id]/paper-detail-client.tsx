"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useProjectScope } from "@/contexts/project-scope-context"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useSkeletonGate } from "@/hooks/use-skeleton-gate"
import { FileText, CaretLeft as ChevronLeft, List, CircleNotch as Loader2, Plus, DotsThreeVertical as MoreVertical, Trash as Trash2, PencilSimple as Pencil } from "@phosphor-icons/react/ssr"
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
import { PaperWorkspace } from "../paper-workspace"
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

interface Paper {
  id: string
  title: string
  project_id?: string | null
  created_at: string
  updated_at: string
}

export function PaperDetailClient({ activePaperId }: { activePaperId: string }) {
  const router = useRouter()
  const { projectId } = useProjectScope()
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const showSkeleton = useSkeletonGate(loading)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Wraps the papers list + editor so editor fullscreen expands the whole
  // workspace, keeping the list visible (same pattern as lab notes / reports).
  const paperWorkspaceRef = useRef<HTMLDivElement>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const isMobile = useMediaQuery("(max-width: 768px)")

  const fetchPapers = useCallback(async () => {
    try {
      const supabase = createClient()
      let query = supabase
        .from("papers")
        .select("id, title, project_id, created_at, updated_at")
        .order("updated_at", { ascending: false })

      // Note: we can optionally filter by projectId. 
      // Based on the plan, we filter by the project scope if it's set.
      if (projectId) {
        query = query.eq("project_id", projectId)
      }

      const { data, error } = await query
      if (error) throw error
      setPapers(data || [])
    } catch (error) {
      console.error("Error fetching papers for sidebar:", error)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchPapers()
  }, [fetchPapers])

  const handleSelectPaper = (id: string) => {
    if (id === activePaperId) return
    router.push(`/papers/${id}${projectId ? `?project=${projectId}` : ""}`)
  }

  const handleTitleUpdated = (id: string, newTitle: string) => {
    setPapers(prev => prev.map(p => p.id === id ? { ...p, title: newTitle } : p))
  }

  const handlePaperMutated = () => {
    fetchPapers()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("papers").delete().eq("id", deleteTarget)
      if (error) {
        toast.error(`Failed to delete paper: ${error.message}`)
        return
      }
      toast.success("Paper deleted")
      setPapers(prev => prev.filter(p => p.id !== deleteTarget))
      if (deleteTarget === activePaperId) {
        router.push(projectId ? `/papers?project=${projectId}` : "/papers")
      }
      setDeleteTarget(null)
    } catch (err: unknown) {
      console.error("Failed to delete paper", err)
      toast.error(`Error: ${err instanceof Error ? err.message : "Failed to delete paper"}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const SidebarContent = () => (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <SideRailHeader label={projectId ? "Project Papers" : "All Papers"}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => {
            router.push(`/papers/new${projectId ? `?project=${projectId}` : ""}`)
          }}
          aria-label="Create new paper"
          title="Create new paper"
        >
          <Plus className="size-4" />
        </Button>
      </SideRailHeader>
      <SideRailBody>
        {showSkeleton ? (
          <SideRailSkeleton label="Loading papers" />
        ) : loading ? null : papers.length > 0 ? (
          <SideRailList>
            {papers.map((paper) => {
              const isActive = activePaperId === paper.id
              const updatedStr = new Date(paper.updated_at).toLocaleString()
              return (
                <SideRailRow
                  key={paper.id}
                  active={isActive}
                  onSelect={() => handleSelectPaper(paper.id)}
                  icon={<FileText />}
                  title={`Updated: ${updatedStr}`}
                  actions={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Paper options"
                        >
                          <MoreVertical className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(paper.id)
                          }}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                >
                  {paper.title || "Untitled Paper"}
                </SideRailRow>
              )
            })}
          </SideRailList>
        ) : (
          <SideRailEmpty>No papers found.</SideRailEmpty>
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
      onClick={() => setSidebarOpen(prev => !prev)}
      aria-label={sidebarOpen ? "Hide papers" : "Show papers"}
      title={sidebarOpen ? "Hide papers list" : "Show papers list"}
    >
      {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <List className="h-4 w-4" />}
    </Button>
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete paper?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this paper? This action cannot be undone.
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
      
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <Card className="flex h-full min-h-0 flex-col gap-0 py-0 border-0 shadow-none rounded-none sm:border sm:shadow-sm sm:rounded-xl">
          <div ref={paperWorkspaceRef} className="flex h-full min-h-0 min-w-0 flex-1 flex-row items-stretch overflow-hidden bg-background">
            {/* Desktop Sidebar — glass rail (Catalyst history look) */}
            <SideRail open={sidebarOpen} className="hidden sm:flex">
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

            {/* Editor Area */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col relative bg-card p-4">
              <PaperWorkspace
                key={activePaperId} // ensure it fully remounts/resets if paper changes
                paperId={activePaperId}
                fullscreenWorkspaceRef={paperWorkspaceRef}
                backLink={{ href: projectId ? `/papers?project=${projectId}` : "/papers" }}
                leftControls={toggleButton}
                onPaperTitleUpdated={handleTitleUpdated}
                onPaperMutated={handlePaperMutated}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

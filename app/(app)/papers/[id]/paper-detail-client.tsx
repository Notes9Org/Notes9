"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useProjectScope } from "@/contexts/project-scope-context"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { FileText, PanelLeftClose, PanelLeftOpen, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { PaperWorkspace } from "../paper-workspace"

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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  
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

  const SidebarContent = () => (
    <div className="flex h-full min-h-0 w-52 min-w-[13rem] flex-col gap-0 p-2">
      <div className="flex h-9 shrink-0 items-center justify-between px-1">
        <span className="truncate text-xs font-medium text-muted-foreground">
          {projectId ? "Project Papers" : "All Papers"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="m-0 shrink-0 text-muted-foreground hover:text-foreground h-6 w-6"
          onClick={() => {
            router.push(`/papers/new${projectId ? `?project=${projectId}` : ""}`)
          }}
          aria-label="Create new paper"
          title="Create new paper"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto mt-1">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : papers.length > 0 ? (
          <ul className="flex w-full min-w-0 flex-col gap-0.5">
            {papers.map((paper) => {
              const isActive = activePaperId === paper.id
              const updatedStr = new Date(paper.updated_at).toLocaleString()
              return (
                <li key={paper.id} className="group/list-item relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectPaper(paper.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleSelectPaper(paper.id)
                      }
                    }}
                    title={`Updated: ${updatedStr}`}
                    className={cn(
                      "grid w-full min-h-8 grid-cols-[auto_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted/80",
                      isActive && "bg-muted font-medium"
                    )}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 truncate m-0 text-sm">
                      {paper.title || "Untitled Paper"}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground">
            No papers found.
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
      onClick={() => setSidebarOpen(prev => !prev)}
      title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
    >
      {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
    </Button>
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <Card className="flex h-full min-h-0 flex-col gap-0 py-0 border-0 shadow-none rounded-none sm:border sm:shadow-sm sm:rounded-xl">
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row items-stretch overflow-hidden">
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

            {/* Editor Area */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col relative bg-card p-4">
              <PaperWorkspace
                key={activePaperId} // ensure it fully remounts/resets if paper changes
                paperId={activePaperId}
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

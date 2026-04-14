"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { LayoutList, Plus } from "lucide-react"
import { PaperList, type PaperListItem } from "./paper-list"
import { PaperWorkspace } from "./paper-workspace"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IS_PAPERS_MOCKED, getMockPapers } from "@/lib/papers-mock"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const LIBRARY_TAB = "__library__"

export function PapersPageInner() {
  const searchParams = useSearchParams()
  const openParam = searchParams.get("open")
  const [papers, setPapers] = useState<PaperListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>(LIBRARY_TAB)
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  const fetchPapers = useCallback(async () => {
    if (IS_PAPERS_MOCKED) {
      setPapers(getMockPapers() as PaperListItem[])
      setFetchError(null)
      setLoading(false)
      return
    }

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setPapers([])
      setFetchError(null)
      setLoading(false)
      return
    }

    const fullSelect = `
      *,
      project:projects(id, name),
      created_by_profile:profiles!papers_created_by_fkey(first_name, last_name)
    `

    let { data, error } = await supabase
      .from("papers")
      .select(fullSelect)
      .eq("created_by", user.id)
      .order("updated_at", { ascending: false })

    if (error) {
      console.warn("[papers] list query with joins failed, retrying without embeds:", error.message)
      const retry = await supabase
        .from("papers")
        .select("*")
        .eq("created_by", user.id)
        .order("updated_at", { ascending: false })
      data = retry.data
      error = retry.error
    }

    if (error) {
      setFetchError(error.message)
      setPapers([])
      setLoading(false)
      return
    }

    let list = (data as PaperListItem[]) || []

    if (openParam && !list.some((p) => p.id === openParam)) {
      const { data: one, error: oneErr } = await supabase
        .from("papers")
        .select("*")
        .eq("id", openParam)
        .eq("created_by", user.id)
        .maybeSingle()
      if (!oneErr && one) {
        list = [{ ...(one as PaperListItem) }, ...list]
      }
    }

    setFetchError(null)
    setPapers(list)
    setLoading(false)
  }, [openParam])

  useEffect(() => {
    void fetchPapers()
  }, [fetchPapers])

  useEffect(() => {
    const open = searchParams.get("open")
    if (open && papers.some((p) => p.id === open)) {
      setActiveTab(open)
    }
  }, [searchParams, papers])

  useEffect(() => {
    if (activeTab === LIBRARY_TAB) return
    if (papers.length > 0 && !papers.some((p) => p.id === activeTab)) {
      setActiveTab(LIBRARY_TAB)
    }
  }, [papers, activeTab])

  const handlePaperMutated = useCallback(() => {
    void fetchPapers()
    setActiveTab(LIBRARY_TAB)
  }, [fetchPapers])

  const handlePaperTitleUpdated = useCallback((paperId: string, nextTitle: string) => {
    setPapers((prev) => prev.map((p) => (p.id === paperId ? { ...p, title: nextTitle } : p)))
  }, [])

  return (
    <div className="space-y-6">
      <SetPageBreadcrumb segments={[]} />

      {fetchError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load writing documents</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{fetchError}</p>
            <p className="text-sm">
              The <code className="rounded bg-muted px-1 py-0.5 text-xs">papers</code> table may be missing. Run{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">scripts/030_papers_writing.sql</code> in the
              Supabase SQL editor, then refresh this page.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          Draft and export research papers—switch documents from the tabs below, like your other workspace lists.
        </p>
        <Button asChild className="shrink-0">
          <Link href="/papers/new">
            <Plus className="mr-2 h-4 w-4" />
            New Paper
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : papers.length === 0 ? (
        <PaperList papers={[]} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 w-full justify-start gap-1">
            <TabsTrigger value={LIBRARY_TAB} className="shrink-0 gap-1.5">
              <LayoutList className="h-3.5 w-3.5" />
              All papers
            </TabsTrigger>
            {papers.map((paper) => (
              <TabsTrigger
                key={paper.id}
                value={paper.id}
                className="max-w-[200px] shrink truncate sm:max-w-[240px]"
                title={paper.title}
              >
                <span className="truncate">{paper.title}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={LIBRARY_TAB} className="mt-0 focus-visible:outline-none">
            <PaperList
              papers={papers}
              viewMode={viewMode}
              setViewMode={setViewMode}
              onSelectPaper={(p) => setActiveTab(p.id)}
            />
          </TabsContent>

          {papers.map((paper) => (
            <TabsContent key={paper.id} value={paper.id} className="mt-0 focus-visible:outline-none">
              <PaperWorkspace
                paperId={paper.id}
                onPaperMutated={handlePaperMutated}
                onPaperTitleUpdated={handlePaperTitleUpdated}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}

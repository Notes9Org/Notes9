"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search as SearchIcon,
  Database,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react"
import {
  LiteratureSearchForm,
  SearchTab,
} from "@/components/literature-reviews/search-tab"
import { RepoTab } from "@/components/literature-reviews/repo-tab"
import { PaperSearchSortMode, SearchPaper } from "@/types/paper-search"
import { DEFAULT_AI_FILTERS, type AiResultFilters } from "@/lib/ai-search-filters"
import { normalizeDoi } from "@/lib/literature-pdf-storage"
import {
  removeStagingLiterature,
  savePaperToRepository,
  stagePaper,
} from "@/app/(app)/literature-reviews/actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { recordRumEvent } from "@/lib/rum"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLiteratureMentionRegister } from "@/contexts/literature-mention-context"
import {
  StagedPaperView,
  mapRowToListItem,
  type StagingLiteratureRow,
  type StagingListItem,
} from "@/components/literature-reviews/staged-paper-view"
import { cn } from "@/lib/utils"

const ACTIVE_TAB_KEY = "n9-litreview-active-tab"
const OPENED_STAGED_IDS_KEY = "n9-litreview-opened-staged-ids"

/** Project-scoping fields a staged row may carry (rows are loosely typed). */
type StagingRowProjectScope = {
  project_id?: string | null
  project?: { id?: string } | null
}

/** Resolve a staged row's owning project id from either flat or nested shape. */
function stagingRowProjectId(row: StagingLiteratureRow): string | null {
  const r = row as StagingRowProjectScope
  return r.project_id ?? r.project?.id ?? null
}

interface LiteratureReview {
  id: string
  title: string
  authors: string | null
  journal: string | null
  publication_year: number | null
  doi: string | null
  status: string
  relevance_rating: number | null
  catalog_placement?: string | null
  project: { id: string; name: string } | null
  experiment: { id: string; name: string } | null
  created_by_profile: { first_name: string; last_name: string } | null
}

interface LiteratureTabsProps {
  literatureReviews: LiteratureReview[] | null
  stagedLiterature: StagingLiteratureRow[]
  projects: { id: string; name: string }[]
  experiments: { id: string; name: string; project_id: string }[]
  initialProjectId?: string | null
  initialTab?: "search" | "repo"
}

/**
 * Module-level snapshot of the active search session, keyed by context (project
 * scope). Persists across SPA navigation — clicking a citation routes to the
 * cited page and unmounts this tree — so returning to Literature restores the
 * user's query and results instead of resetting to a blank search.
 */
type LiteratureSearchSession = {
  topSection: "search" | "repo"
  query: string
  submittedQuery: string
  searchSort: PaperSearchSortMode
  openAccessOnlySearch: boolean
  searchResults: SearchPaper[]
  hasSearched: boolean
  aiFilters: AiResultFilters
  activeInnerTab: string
}
const literatureSearchSessions = new Map<string, LiteratureSearchSession>()

export function LiteratureTabs({
  literatureReviews,
  stagedLiterature,
  projects,
  experiments,
  initialProjectId = null,
  initialTab = "search",
}: LiteratureTabsProps) {
  const router = useRouter()
  const sessionKey = initialProjectId ?? "global"
  const savedSession = literatureSearchSessions.get(sessionKey) ?? null

  const [topSection, setTopSection] = useState<"search" | "repo">(savedSession?.topSection ?? initialTab)

  const [query, setQuery] = useState(savedSession?.query ?? "")
  // The query the AI search actually ran on — updated only on submit, NOT on
  // every keystroke, so typing a new query doesn't re-trigger / flash the AI.
  const [submittedQuery, setSubmittedQuery] = useState(savedSession?.submittedQuery ?? "")
  const [searchSort, setSearchSort] = useState<PaperSearchSortMode>(savedSession?.searchSort ?? "relevance")
  const [openAccessOnlySearch, setOpenAccessOnlySearch] = useState(savedSession?.openAccessOnlySearch ?? false)
  const [searchResults, setSearchResults] = useState<SearchPaper[]>(savedSession?.searchResults ?? [])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(savedSession?.hasSearched ?? false)
  const [stagingPaperId, setStagingPaperId] = useState<string | null>(null)
  // AI result filters owned here so the main search bar controls them.
  const [aiFilters, setAiFilters] = useState<AiResultFilters>(savedSession?.aiFilters ?? DEFAULT_AI_FILTERS)

  const [activeInnerTab, setActiveInnerTab] = useState<string>(savedSession?.activeInnerTab ?? "search")
  /** Staged papers the user opened — used to focus Search results on a new search. */
  const [openedStagedIds, setOpenedStagedIds] = useState<string[]>([])
  const openedStagedIdsRef = useRef(openedStagedIds)
  openedStagedIdsRef.current = openedStagedIds
  const [tabsInitialized, setTabsInitialized] = useState(false)
  /** Tabs opened before server refresh includes the new staged row. */
  const [pendingOpenTabIds, setPendingOpenTabIds] = useState<string[]>([])
  const [pendingTabTitles, setPendingTabTitles] = useState<Record<string, string>>({})
  const pendingOpenTabIdsRef = useRef(pendingOpenTabIds)
  pendingOpenTabIdsRef.current = pendingOpenTabIds
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)
  const [isClosingTab, setIsClosingTab] = useState(false)

  const [pendingSavePaper, setPendingSavePaper] = useState<SearchPaper | null>(null)
  const [pendingLiteratureId, setPendingLiteratureId] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>("")
  const [isSavingPaper, setIsSavingPaper] = useState(false)
  const [savingStagingLiteratureId, setSavingStagingLiteratureId] = useState<string | null>(null)
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null)

  // Persist the search session so it survives navigating to a cited page + back.
  useEffect(() => {
    literatureSearchSessions.set(sessionKey, {
      topSection,
      query,
      submittedQuery,
      searchSort,
      openAccessOnlySearch,
      searchResults,
      hasSearched,
      aiFilters,
      activeInnerTab,
    })
  }, [
    sessionKey,
    topSection,
    query,
    submittedQuery,
    searchSort,
    openAccessOnlySearch,
    searchResults,
    hasSearched,
    aiFilters,
    activeInnerTab,
  ])

  const repositoryReviews = useMemo(
    () =>
      (literatureReviews ?? []).filter(
        (r) => (r.catalog_placement ?? "repository") !== "staging"
      ),
    [literatureReviews]
  )

  const lockedProjectId =
    initialProjectId && projects.some((p) => p.id === initialProjectId) ? initialProjectId : null
  const lockedProjectName = lockedProjectId
    ? projects.find((p) => p.id === lockedProjectId)?.name ?? null
    : null

  const stagedLiteratureScoped = useMemo(() => {
    if (!lockedProjectId) return stagedLiterature
    return stagedLiterature.filter((row) => stagingRowProjectId(row) === lockedProjectId)
  }, [stagedLiterature, lockedProjectId])

  const stagedItems = useMemo(
    () => stagedLiteratureScoped.map(mapRowToListItem),
    [stagedLiteratureScoped]
  )

  /**
   * Stable key so the tab-sync effect does not re-run on every parent refresh
   * that produces the same staged rows. We sort the ids and join them with the
   * NUL character (" ") — a delimiter that cannot appear inside an id — so
   * the key changes only when the *set* of staged ids changes, not when row
   * objects are re-created with identical ids. NUL (rather than e.g. ",") is an
   * unambiguous separator that two concatenated ids can never reproduce.
   */
  const stagedItemIdsKey = useMemo(
    () =>
      stagedItems
        .map((i) => i.id)
        .sort()
        .join("\u0000"),
    [stagedItems]
  )

  const stagedById = useMemo(() => {
    const m = new Map<string, StagingListItem>()
    for (const item of stagedItems) m.set(item.id, item)
    return m
  }, [stagedItems])

  /** All staged papers (+ pending) in the unified tab strip. */
  const stripPaperIds = useMemo(() => {
    const stagedIds = stagedItems.map((i) => i.id)
    const pending = pendingOpenTabIds.filter((id) => !stagedIds.includes(id))
    return [...stagedIds, ...pending]
  }, [stagedItems, pendingOpenTabIds])

  const showUnifiedTabStrip =
    hasSearched || stripPaperIds.length > 0 || pendingOpenTabIds.length > 0

  const resolvedActiveTab = useMemo(() => {
    if (activeInnerTab === "search") {
      if (hasSearched) return "search"
      if (stripPaperIds.length > 0) return stripPaperIds[0]
      return "search"
    }
    if (stripPaperIds.includes(activeInnerTab)) return activeInnerTab
    if (pendingOpenTabIds.includes(activeInnerTab)) return activeInnerTab
    if (hasSearched) return "search"
    return stripPaperIds[0] ?? "search"
  }, [activeInnerTab, hasSearched, stripPaperIds, pendingOpenTabIds])

  type StagedPdfPatch = Pick<
    StagingListItem,
    "pdf_import_status" | "pdf_storage_path" | "pdf_file_name"
  >

  const [stagedPdfPatches, setStagedPdfPatches] = useState<Record<string, StagedPdfPatch>>({})

  const stagedByIdMerged = useMemo(() => {
    const m = new Map<string, StagingListItem>()
    for (const item of stagedItems) {
      const patch = stagedPdfPatches[item.id]
      m.set(item.id, patch ? { ...item, ...patch } : item)
    }
    return m
  }, [stagedItems, stagedPdfPatches])

  const registerLiteratureMentions = useLiteratureMentionRegister()
  const literatureMentionCandidates = useMemo(() => {
    const stagedSource = lockedProjectId
      ? stagedLiterature.filter((row) => stagingRowProjectId(row) === lockedProjectId)
      : stagedLiterature
    const staged = stagedSource.map((row) => {
      const r = row as StagingLiteratureRow & {
        id?: string
        title?: string
        authors?: string | null
      }
      return {
        id: String(r.id ?? ""),
        title: String(r.title ?? ""),
        authors: r.authors ?? null,
        catalog_placement: "staging" as const,
      }
    })
    const repoSource = lockedProjectId
      ? repositoryReviews.filter((r) => r.project?.id === lockedProjectId)
      : repositoryReviews
    const repo = repoSource.map((r) => ({
      id: r.id,
      title: r.title,
      authors: r.authors,
      catalog_placement: r.catalog_placement ?? "repository",
    }))
    return [...staged, ...repo].filter((c) => c.id)
  }, [stagedLiterature, repositoryReviews, lockedProjectId])

  useEffect(() => {
    registerLiteratureMentions(literatureMentionCandidates)
    return () => registerLiteratureMentions([])
  }, [literatureMentionCandidates, registerLiteratureMentions])

  const projectIdForExperimentPicker = selectedProjectId || lockedProjectId || ""

  const filteredExperiments = useMemo(
    () =>
      projectIdForExperimentPicker
        ? experiments.filter((experiment) => experiment.project_id === projectIdForExperimentPicker)
        : [],
    [experiments, projectIdForExperimentPicker]
  )

  useEffect(() => {
    if (!projectIdForExperimentPicker) {
      setSelectedExperimentId("")
      return
    }
    if (!filteredExperiments.some((experiment) => experiment.id === selectedExperimentId)) {
      setSelectedExperimentId("")
    }
  }, [filteredExperiments, selectedExperimentId, projectIdForExperimentPicker])

  useEffect(() => {
    const savedActive = localStorage.getItem(ACTIVE_TAB_KEY)
    const savedOpened = localStorage.getItem(OPENED_STAGED_IDS_KEY)
    let opened: string[] = []
    if (savedOpened) {
      try {
        opened = JSON.parse(savedOpened) as string[]
      } catch {
        /* ignore */
      }
    }
    if (savedActive) setActiveInnerTab(savedActive)
    if (opened.length > 0) setOpenedStagedIds(opened)
    setTabsInitialized(true)
  }, [])

  useEffect(() => {
    if (!tabsInitialized) return
    localStorage.setItem(OPENED_STAGED_IDS_KEY, JSON.stringify(openedStagedIds))
  }, [openedStagedIds, tabsInitialized])

  useEffect(() => {
    if (!tabsInitialized) return
    if (showUnifiedTabStrip) {
      localStorage.setItem(ACTIVE_TAB_KEY, resolvedActiveTab)
    } else {
      localStorage.setItem(ACTIVE_TAB_KEY, "search")
    }
  }, [resolvedActiveTab, tabsInitialized, showUnifiedTabStrip])

  useEffect(() => {
    if (!tabsInitialized) return
    const validIds = new Set(stagedItems.map((i) => i.id))
    const pending = pendingOpenTabIdsRef.current

    setPendingOpenTabIds((prev) => {
      const next = prev.filter((id) => !validIds.has(id))
      return next.length === prev.length ? prev : next
    })

    setPendingTabTitles((prev) => {
      const toRemove = Object.keys(prev).filter((id) => validIds.has(id))
      if (toRemove.length === 0) return prev
      const next = { ...prev }
      for (const id of toRemove) delete next[id]
      return next
    })

    setActiveInnerTab((current) => {
      if (current === "search") return current
      if (validIds.has(current) || pending.includes(current)) return current
      if (stagedItems.length > 0) return stagedItems[0].id
      return "search"
    })
  // Sync open tabs when the staged-id set changes (not on every row object refresh).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedItemIdsKey, tabsInitialized])

  useEffect(() => {
    setStagedPdfPatches((prev) => {
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        const row = stagedById.get(id)
        if (row && row.pdf_import_status !== "pending") {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [stagedItemIdsKey, stagedById])

  const pendingPdfImportIds = useMemo(() => {
    const ids = new Set<string>()
    for (const id of stripPaperIds) {
      if (stagedByIdMerged.get(id)?.pdf_import_status === "pending") ids.add(id)
    }
    return [...ids]
  }, [stripPaperIds, stagedByIdMerged])

  const pollErrorCountRef = useRef(0)
  const importStartedAtRef = useRef<Record<string, number>>({})
  const pollWarningShownRef = useRef(false)
  const pollStoppedRef = useRef(false)

  useEffect(() => {
    if (topSection !== "search" || pendingPdfImportIds.length === 0) return

    let cancelled = false
    let didRefreshList = false

    const pollImportStatus = async () => {
      if (pollStoppedRef.current) return
      let anyError = false
      for (const id of pendingPdfImportIds) {
        if (cancelled) return
        try {
          const res = await fetch(`/api/literature/${id}/import-status`, { cache: "no-store" })
          const data = (await res.json()) as {
            pdf_import_status?: string
            pdf_storage_path?: string | null
            pdf_file_name?: string | null
          }
          // Treat a malformed/empty body (no string status) as an error so the
          // retry/backoff path below reports it instead of silently continuing.
          if (!res.ok || typeof data.pdf_import_status !== "string" || !data.pdf_import_status) {
            anyError = true
            continue
          }
          if (data.pdf_import_status === "pending") continue

          setStagedPdfPatches((prev) => ({
            ...prev,
            [id]: {
              pdf_import_status: data.pdf_import_status ?? "none",
              pdf_storage_path: data.pdf_storage_path ?? null,
              pdf_file_name: data.pdf_file_name ?? null,
            },
          }))

          if (data.pdf_import_status === "success") {
            const startedAt = importStartedAtRef.current[id]
            if (typeof startedAt === "number") {
              recordRumEvent("literature_pdf_import_completed", {
                literatureId: id,
                durationMs: Date.now() - startedAt,
              })
              delete importStartedAtRef.current[id]
            }
            if (!didRefreshList) {
              didRefreshList = true
              void router.refresh()
            }
          }
        } catch (err) {
          anyError = true
          console.error("Literature import-status poll failed", err)
        }
      }
      if (anyError) {
        pollErrorCountRef.current += 1
        if (pollErrorCountRef.current >= 3 && !pollWarningShownRef.current) {
          pollWarningShownRef.current = true
          toast.warning("PDF import status check failed — retrying")
        }
        if (pollErrorCountRef.current >= 10 && !pollStoppedRef.current) {
          pollStoppedRef.current = true
          toast.error("Import status unavailable, please refresh")
        }
      } else {
        pollErrorCountRef.current = 0
      }
    }

    void pollImportStatus()
    // Poll every 5s (was 2s): PDF imports take many seconds, so 5s stays
    // responsive while cutting request volume ~2.5x. Terminal items are
    // removed from pendingPdfImportIds (via setStagedPdfPatches above), so the
    // set empties and this effect re-runs / clears the interval automatically.
    const interval = window.setInterval(() => void pollImportStatus(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [topSection, pendingPdfImportIds, router])

  const scrollTabsRef = useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(false)

  const checkScroll = useCallback(() => {
    if (scrollTabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollTabsRef.current
      setShowLeftArrow(scrollLeft > 0)
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 2)
    }
  }, [])

  useEffect(() => {
    checkScroll()
    window.addEventListener("resize", checkScroll)
    return () => window.removeEventListener("resize", checkScroll)
  }, [stripPaperIds, checkScroll])

  const scrollTabs = (direction: "left" | "right") => {
    if (scrollTabsRef.current) {
      const scrollAmount = 250
      scrollTabsRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      })
    }
  }

  useEffect(() => {
    if (resolvedActiveTab !== "search" && scrollTabsRef.current) {
      const container = scrollTabsRef.current
      const activeElement = container.querySelector(
        `[data-value="${resolvedActiveTab}"]`
      ) as HTMLElement
      if (activeElement) {
        const containerRect = container.getBoundingClientRect()
        const activeRect = activeElement.getBoundingClientRect()
        if (activeRect.left < containerRect.left || activeRect.right > containerRect.right) {
          activeElement.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
        }
      }
    }
    checkScroll()
  }, [resolvedActiveTab, checkScroll])

  const markStagedPaperOpened = useCallback((literatureId: string) => {
    setOpenedStagedIds((prev) => (prev.includes(literatureId) ? prev : [...prev, literatureId]))
  }, [])

  const syncTabsForSearchSession = useCallback(() => {
    setActiveInnerTab("search")
  }, [])

  const openPaperTab = useCallback(
    (literatureId: string, title?: string) => {
      setPendingOpenTabIds((prev) =>
        prev.includes(literatureId) ? prev : [...prev, literatureId]
      )
      if (title) {
        setPendingTabTitles((prev) => ({ ...prev, [literatureId]: title }))
      }
      setTopSection("search")
      markStagedPaperOpened(literatureId)
      setActiveInnerTab(literatureId)
    },
    [markStagedPaperOpened]
  )

  const resolveStagedLiteratureId = useCallback(
    (paper: SearchPaper): string | null => {
      const nd = paper.doi ? normalizeDoi(paper.doi) : null
      const pool = lockedProjectId
        ? stagedLiterature.filter((row) => stagingRowProjectId(row) === lockedProjectId)
        : stagedLiterature
      const match = pool.find((row) => {
        if (paper.pmid && row.pmid === paper.pmid) return true
        if (nd && row.doi === nd) return true
        if (
          !paper.pmid &&
          !nd &&
          row.title === paper.title &&
          row.publication_year === paper.year
        )
          return true
        return false
      })
      return match ? String(match.id) : null
    },
    [stagedLiterature, lockedProjectId]
  )

  /**
   * Sorting (Best match / Newest first / Most cited) and the open-access filter
   * are derived from the metadata we already fetched — no new network search.
   * "Best match" preserves the relevance order the backend returned; recent and
   * cited sorts are stable, so ties keep that relevance order.
   */
  const displayedResults = useMemo(() => {
    let list: SearchPaper[] = searchResults
    if (openAccessOnlySearch) {
      list = list.filter((p) => p.isOpenAccess)
    }
    if (searchSort === "recent") {
      list = [...list].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    } else if (searchSort === "cited") {
      list = [...list].sort((a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0))
    }
    return list
  }, [searchResults, openAccessOnlySearch, searchSort])

  const executePaperSearch = async (q: string) => {
    setIsSearching(true)
    try {
      const params = new URLSearchParams()
      params.set("query", q)
      // Always fetch the broad, relevance-ranked pool with full metadata. The
      // Sort-by control and the open-access filter then operate on this set
      // client-side, so toggling them never triggers another search.
      params.set("sort", "relevance")
      const response = await fetch(`/api/search-papers?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setSearchResults(data.papers || [])
      } else {
        console.error("Search error:", data.error)
      }
    } catch (error) {
      console.error("Search failed:", error)
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearch = async (override?: string) => {
    const q = (override ?? query).trim()
    if (!q) return
    if (override !== undefined && override !== query) setQuery(override)
    // Always surface the results immediately: a search from anywhere (the
    // Repository page, or while reading a PDF in another tab) jumps straight to
    // the search-results view BEFORE the (awaited) fetch, not after it.
    setTopSection("search")
    setSubmittedQuery(q) // drives the AI search — only changes on submit
    setHasSearched(true)
    syncTabsForSearchSession()
    await executePaperSearch(q)
  }

  // Jump from the repository's search box straight into a fresh paper search.
  const handleSearchPapersFromRepo = (q: string) => {
    if (!q.trim()) return
    setTopSection("search")
    void handleSearch(q)
  }

  // Sort + open-access are pure client-side views over the fetched metadata.
  const handleSearchSortChange = (sort: PaperSearchSortMode) => {
    setSearchSort(sort)
  }

  const handleOpenAccessSearchChange = (openAccess: boolean) => {
    setOpenAccessOnlySearch(openAccess)
  }

  const isPaperStaged = (paperId: string) => {
    const paper = searchResults.find((p) => p.id === paperId)
    if (!paper) return false
    return resolveStagedLiteratureId(paper) !== null
  }

  const handleOpenStaged = (paper: SearchPaper) => {
    const id = resolveStagedLiteratureId(paper)
    if (id) openPaperTab(id, paper.title)
  }

  const handleStagePaper = async (paper: SearchPaper) => {
    setStagingPaperId(paper.id)
    try {
      const result = await stagePaper(paper, { projectId: lockedProjectId })
      if (result.success) {
        const rowId =
          result.data && typeof result.data === "object" && "id" in result.data
            ? String((result.data as { id: string }).id)
            : resolveStagedLiteratureId(paper)
        if (rowId) {
          importStartedAtRef.current[rowId] = Date.now()
          recordRumEvent("literature_pdf_import_started", { literatureId: rowId })
          openPaperTab(rowId, paper.title)
        }
        if (result.alreadyStaged) {
          toast.message("Already in staging")
        } else {
          toast.success("Paper staged — PDF import runs in the background")
        }
        if ("warning" in result && typeof result.warning === "string" && result.warning) {
          toast.message(result.warning)
        }
        void router.refresh()
      } else {
        toast.error("error" in result ? result.error : "Failed to stage")
      }
    } finally {
      setStagingPaperId(null)
    }
  }

  const closeTabOnly = (id: string) => {
    setOpenedStagedIds((prev) => prev.filter((t) => t !== id))
    setPendingOpenTabIds((p) => p.filter((t) => t !== id))
    setPendingTabTitles((titles) => {
      const next = { ...titles }
      delete next[id]
      return next
    })
    setActiveInnerTab((current) => {
      if (current !== id) return current
      if (hasSearched) return "search"
      const remaining = stagedItems.map((i) => i.id).filter((sid) => sid !== id)
      return remaining[0] ?? "search"
    })
    setPendingCloseId(null)
  }

  const closeTabAndRemove = async (id: string) => {
    setIsClosingTab(true)
    try {
      const result = await removeStagingLiterature(id)
      if (!result.success) {
        throw new Error("error" in result ? result.error : "Remove failed")
      }
      closeTabOnly(id)
      toast.success("Removed from staging")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove from staging")
    } finally {
      setIsClosingTab(false)
      setPendingCloseId(null)
    }
  }

  const handleCloseTabClick = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    setPendingCloseId(id)
  }

  const openSaveDialog = (paper: SearchPaper, literatureId?: string) => {
    setPendingSavePaper(paper)
    setPendingLiteratureId(literatureId ?? null)
    setSelectedProjectId(lockedProjectId ?? "")
    setSelectedExperimentId("")
    setSaveDialogOpen(true)
  }

  const handleSaveFromStaging = async (paper: SearchPaper, literatureId: string) => {
    if (lockedProjectId) {
      setSavingStagingLiteratureId(literatureId)
      try {
        const result = await savePaperToRepository(paper, {
          projectId: lockedProjectId,
          experimentId: null,
          literatureId,
        })
          if (result.success) {
          const pdfAttached = Boolean(result.data?.pdf_storage_path) && !result.warning
          toast.success(
            pdfAttached ? "Paper and PDF saved to repository" : "Paper saved to repository"
          )
          if (result.warning) {
            toast.message(result.warning)
          }
          if (activeInnerTab === literatureId) setActiveInnerTab("search")
          router.refresh()
        } else {
          toast.error(
            "error" in result && typeof result.error === "string"
              ? result.error
              : "Failed to save paper"
          )
        }
      } catch (error) {
        toast.error("Failed to save paper")
        console.error("Save error:", error)
      } finally {
        setSavingStagingLiteratureId(null)
      }
      return
    }
    openSaveDialog(paper, literatureId)
  }

  const handleSavePaper = async () => {
    if (!pendingSavePaper) return

    setIsSavingPaper(true)
    try {
      const result = await savePaperToRepository(pendingSavePaper, {
        projectId: (selectedProjectId || lockedProjectId) || null,
        experimentId: selectedExperimentId || null,
        literatureId: pendingLiteratureId || null,
      })

      if (result.success) {
        const pdfAttached = Boolean(result.data?.pdf_storage_path) && !result.warning
        toast.success(
          pdfAttached ? "Paper and PDF saved to repository" : "Paper saved to repository"
        )
        if (result.warning) {
          toast.message(result.warning)
        }
        if (pendingLiteratureId && activeInnerTab === pendingLiteratureId) {
          setActiveInnerTab("search")
        }
        setSaveDialogOpen(false)
        setPendingSavePaper(null)
        setPendingLiteratureId(null)
        router.refresh()
      } else {
        toast.error(result.error || "Failed to save paper")
      }
    } catch (error) {
      toast.error("Failed to save paper")
      console.error("Save error:", error)
    } finally {
      setIsSavingPaper(false)
    }
  }

  const pendingCloseItem = pendingCloseId ? stagedByIdMerged.get(pendingCloseId) : null

  const unifiedTabStrip = (
    <div className="flex items-center justify-between gap-4 border-b">
      <div className="relative group transition-all flex-1 overflow-hidden">
        {showLeftArrow && (
          <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center bg-gradient-to-r from-background via-background/80 to-transparent pr-10 pointer-events-none">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full shadow-lg bg-background border pointer-events-auto hover:bg-muted ml-0.5 transform translate-y-[1.5px]"
              onClick={() => scrollTabs("left")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div
          ref={scrollTabsRef}
          className="overflow-x-auto no-scrollbar scroll-smooth"
          onScroll={checkScroll}
        >
          <TabsList data-tour="lit-tabs" className="bg-transparent h-auto p-0 flex items-center justify-start border-none flex-nowrap w-max min-w-full relative">
            <div className="w-2 flex-shrink-0" />
            {hasSearched && (
              <TabsTrigger
                value="search"
                data-value="search"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[var(--n9-accent)] data-[state=active]:text-foreground rounded-none border-b-2 border-transparent px-4 py-2 bg-transparent text-muted-foreground transition-none shadow-none font-semibold shrink-0"
              >
                <SearchIcon className="h-4 w-4 mr-2" />
                Search results
              </TabsTrigger>
            )}
            {stripPaperIds.map((id) => {
              const lit = stagedByIdMerged.get(id)
              const tabTitle = lit?.title ?? pendingTabTitles[id]
              if (!tabTitle) return null
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  data-value={id}
                  className="group relative data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[var(--n9-accent)] data-[state=active]:text-foreground rounded-none border-b-2 border-transparent px-4 py-2 bg-transparent text-muted-foreground transition-none shadow-none max-w-[220px] flex items-center gap-1 shrink-0"
                >
                  <span className="truncate text-sm font-semibold">{tabTitle}</span>
                  {/* role=button span, NOT a <button>: TabsTrigger already
                      renders a <button>, and a nested button is invalid HTML
                      (React hydration error). Span keeps click + keyboard. */}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Close tab"
                    onClick={(e) => handleCloseTabClick(id, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleCloseTabClick(id, e)
                      }
                    }}
                    className="flex-shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground/60 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </TabsTrigger>
              )
            })}
            <div className="w-10 flex-shrink-0" />
          </TabsList>
        </div>

        {showRightArrow && (
          <div className="absolute right-0 top-0 bottom-0 z-20 flex items-center bg-gradient-to-l from-background via-background/80 to-transparent pl-10 pointer-events-none">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full shadow-lg bg-background border pointer-events-auto hover:bg-muted mr-0.5 transform translate-y-[1.5px]"
              onClick={() => scrollTabs("right")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="w-full space-y-4">
      <div className="inline-flex rounded-2xl border border-border/60 bg-muted/30 p-1 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setTopSection("search")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200",
            topSection === "search"
              ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <SearchIcon className="h-4 w-4" />
          Search & read
          {stagedItems.length > 0 && (
            <span
              className="ml-0.5 rounded-full bg-primary/12 px-1.5 py-0 text-xs font-semibold tabular-nums text-primary"
              title={`${stagedItems.length} paper${stagedItems.length === 1 ? "" : "s"} in staging`}
            >
              {stagedItems.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTopSection("repo")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200",
            topSection === "repo"
              ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Database className="h-4 w-4" />
          My Repository
        </button>
      </div>

      {topSection === "search" ? (
        <div className="space-y-6">
          {/* Filters live next to the results (see AiSearchView) so they're
              right where you read the papers — not buried in the search bar. */}
          <LiteratureSearchForm
            query={query}
            setQuery={setQuery}
            isSearching={isSearching}
            onSearch={handleSearch}
          />

          {resolvedActiveTab !== "search" && (
            <p className="text-sm text-muted-foreground text-center -mt-2">
              Looking for more? Use the search bar above{hasSearched ? " or return to the Search results tab" : ""}.
            </p>
          )}

          {showUnifiedTabStrip ? (
            <Tabs
              value={resolvedActiveTab}
              onValueChange={setActiveInnerTab}
              className="w-full"
            >
              {unifiedTabStrip}

              <div className="mt-6">
                {hasSearched && (
                  <TabsContent value="search" className="m-0 border-none p-0">
                    <SearchTab
                      query={query}
                      setQuery={setQuery}
                      searchResults={displayedResults}
                      isSearching={isSearching}
                      hasSearched={hasSearched}
                      onSearch={handleSearch}
                      resultsOnly
                      onStagePaper={handleStagePaper}
                      onOpenStaged={handleOpenStaged}
                      isPaperStaged={isPaperStaged}
                      isPaperStaging={(paperId) => stagingPaperId === paperId}
                      sortMode={searchSort}
                      onSortModeChange={handleSearchSortChange}
                      openAccessOnly={openAccessOnlySearch}
                      onOpenAccessOnlyChange={handleOpenAccessSearchChange}
                      filters={aiFilters}
                      onFiltersChange={setAiFilters}
                      aiQuery={submittedQuery}
                    />
                  </TabsContent>
                )}

                {stripPaperIds.map((id) => {
                  const lit = stagedByIdMerged.get(id)
                  return (
                    <TabsContent key={id} value={id} className="m-0 border-none p-0">
                      {lit ? (
                        <StagedPaperView
                          lit={lit}
                          onSavePaper={handleSaveFromStaging}
                          savingLiteratureId={savingStagingLiteratureId}
                          onRemove={() => setRemoveTargetId(lit.id)}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-[var(--n9-accent)]" />
                          <p className="text-sm text-muted-foreground">Loading staged paper…</p>
                        </div>
                      )}
                    </TabsContent>
                  )
                })}
              </div>
            </Tabs>
          ) : (
            <SearchTab
              query={query}
              setQuery={setQuery}
              searchResults={displayedResults}
              isSearching={isSearching}
              hasSearched={hasSearched}
              onSearch={handleSearch}
              resultsOnly
              onStagePaper={handleStagePaper}
              onOpenStaged={handleOpenStaged}
              isPaperStaged={isPaperStaged}
              isPaperStaging={(paperId) => stagingPaperId === paperId}
              sortMode={searchSort}
              onSortModeChange={handleSearchSortChange}
              openAccessOnly={openAccessOnlySearch}
              onOpenAccessOnlyChange={handleOpenAccessSearchChange}
              filters={aiFilters}
              onFiltersChange={setAiFilters}
              aiQuery={submittedQuery}
            />
          )}
        </div>
      ) : (
        <div className="mt-2">
          <RepoTab
            literatureReviews={repositoryReviews}
            projects={projects}
            experiments={experiments}
            initialProjectFilterId={initialProjectId ?? undefined}
            lockProjectFilter={Boolean(lockedProjectId)}
            onSearchPapers={handleSearchPapersFromRepo}
          />
        </div>
      )}

      <AlertDialog
        open={Boolean(pendingCloseId)}
        onOpenChange={(open) => {
          if (!open) setPendingCloseId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close staged paper tab?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCloseItem ? (
                <>
                  <strong>{pendingCloseItem.title}</strong> — close this tab only, or also remove
                  the paper from staging (and delete its PDF).
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={isClosingTab}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={isClosingTab}
              onClick={() => pendingCloseId && closeTabOnly(pendingCloseId)}
            >
              Close tab
            </Button>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (pendingCloseId) void closeTabAndRemove(pendingCloseId)
              }}
              disabled={isClosingTab}
              className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30"
            >
              {isClosingTab ? "Removing…" : "Close & remove from staging"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(removeTargetId)}
        onOpenChange={(open) => {
          if (!open) setRemoveTargetId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from staging?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTargetId && stagedByIdMerged.get(removeTargetId) ? (
                <>
                  This removes <strong>{stagedByIdMerged.get(removeTargetId)!.title}</strong> from staging
                  and deletes its stored PDF if any. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosingTab}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (removeTargetId) void closeTabAndRemove(removeTargetId)
              }}
              disabled={isClosingTab}
              className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30"
            >
              {isClosingTab ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          setSaveDialogOpen(open)
          if (!open) {
            setPendingSavePaper(null)
            setPendingLiteratureId(null)
            setSelectedProjectId("")
            setSelectedExperimentId("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link paper to your research</DialogTitle>
            <DialogDescription>
              Connect this paper to a project, and optionally to one of that project&apos;s
              experiments, before saving it to your repository.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{pendingSavePaper?.title}</p>
              <p className="text-xs text-muted-foreground">
                Choose a project to narrow the experiment options.
              </p>
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="link-project">Project</Label>
                {lockedProjectId && lockedProjectName ? (
                  <div
                    id="link-project"
                    className="flex h-10 min-w-0 items-center overflow-hidden rounded-md border border-input bg-muted/40 px-3 text-sm"
                  >
                    <span
                      className="min-w-0 truncate font-medium text-foreground"
                      title={lockedProjectName}
                    >
                      {lockedProjectName}
                    </span>
                  </div>
                ) : (
                  <Select
                    value={selectedProjectId || "none"}
                    onValueChange={(value) => setSelectedProjectId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger id="link-project">
                      <SelectValue placeholder="Select project (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="link-experiment">Experiment</Label>
                <Select
                  value={selectedExperimentId || "none"}
                  onValueChange={(value) => setSelectedExperimentId(value === "none" ? "" : value)}
                  disabled={!(selectedProjectId || lockedProjectId)}
                >
                  <SelectTrigger id="link-experiment">
                    <SelectValue
                      placeholder={
                        selectedProjectId || lockedProjectId
                          ? "Select experiment (optional)"
                          : "Select project first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No experiment</SelectItem>
                    {filteredExperiments.map((experiment) => (
                      <SelectItem key={experiment.id} value={experiment.id}>
                        {experiment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false)
                setPendingSavePaper(null)
                setPendingLiteratureId(null)
              }}
              disabled={isSavingPaper}
            >
              Cancel
            </Button>
            <Button onClick={handleSavePaper} disabled={isSavingPaper}>
              {isSavingPaper ? "Saving..." : "Save to Repository"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

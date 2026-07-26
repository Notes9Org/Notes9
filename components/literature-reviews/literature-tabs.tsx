"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MotionTabPanel, motion, useReducedMotion } from "@/components/literature-reviews/motion"
import { MagnifyingGlass as SearchIcon, Database, CircleNotch as Loader2, X } from "@phosphor-icons/react/ssr"
import {
  LiteratureSearchForm,
  SearchTab,
  type LiteratureHistoryEntry,
} from "@/components/literature-reviews/search-tab"
import { useChatSessions } from "@/hooks/use-chat-sessions"
import * as literatureSearchEngine from "@/lib/literature-search-engine"
import { RepoTab } from "@/components/literature-reviews/repo-tab"
import { PaperSearchSortMode, SearchPaper } from "@/types/paper-search"
import type { CitationsManifest } from "@/hooks/use-agent-stream"
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
import { useProjectScope } from "@/contexts/project-scope-context"
import {
  StagedPaperView,
  mapRowToListItem,
  type StagingLiteratureRow,
  type StagingListItem,
} from "@/components/literature-reviews/staged-paper-view"
import { cn } from "@/lib/utils"

const ACTIVE_TAB_KEY = "n9-litreview-active-tab"
const OPENED_STAGED_IDS_KEY = "n9-litreview-opened-staged-ids"

/** Snappy, no-bounce spring for shared-layout tab indicators. */
const INDICATOR_SPRING = { type: "spring", stiffness: 500, damping: 40, mass: 0.7 } as const

/**
 * Shared-layout active-tab underline. Only the active trigger renders it; framer's
 * `layoutId` glides the single underline between triggers on switch. Reduced-motion
 * users get a static span (no layout animation). Decorative — pointer-events-none.
 */
/** Pill active-indicator, mirrors My Library (RepoTab) so both tab strips match. */
function TabPill({ reduce }: { reduce: boolean | null }) {
  if (reduce) {
    return (
      <span className="pointer-events-none absolute inset-0 rounded-md border border-border/50 bg-background shadow-sm" />
    )
  }
  return (
    <motion.span
      layoutId="search-tab-pill"
      className="pointer-events-none absolute inset-0 rounded-md border border-border/50 bg-background shadow-sm"
      transition={INDICATOR_SPRING}
    />
  )
}

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
  /** When set (from ?openPaper=<id>), open that paper's read-mode tab on mount —
   * how a Catalyst citation lands here from another page. */
  openPaperId?: string | null
  /** Query to auto-fill (from the marketing hero → sign-up → here). */
  initialQuery?: string
  /** When true, run a live search for initialQuery once on mount. */
  autoRunSearch?: boolean
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
  openPaperId = null,
  initialQuery,
  autoRunSearch = false,
}: LiteratureTabsProps) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const sessionKey = initialProjectId ?? "global"
  const savedSession = literatureSearchSessions.get(sessionKey) ?? null

  const [topSection, setTopSection] = useState<"search" | "repo">(
    savedSession?.topSection ?? (autoRunSearch ? "search" : initialTab)
  )

  const [query, setQuery] = useState(savedSession?.query ?? initialQuery ?? "")
  // The query the AI search actually ran on — updated only on submit, NOT on
  // every keystroke, so typing a new query doesn't re-trigger / flash the AI.
  const [submittedQuery, setSubmittedQuery] = useState(savedSession?.submittedQuery ?? "")
  const [searchSort, setSearchSort] = useState<PaperSearchSortMode>(savedSession?.searchSort ?? "relevance")
  const [openAccessOnlySearch, setOpenAccessOnlySearch] = useState(savedSession?.openAccessOnlySearch ?? false)
  const [searchResults, setSearchResults] = useState<SearchPaper[]>(savedSession?.searchResults ?? [])
  const [isSearching, setIsSearching] = useState(false)
  // Bumped on every explicit search so an identical query still re-fires the run() effect.
  const [searchNonce, setSearchNonce] = useState(0)
  const [hasSearched, setHasSearched] = useState(savedSession?.hasSearched ?? false)
  const [stagingPaperId, setStagingPaperId] = useState<string | null>(null)
  // AI result filters owned here so the main search bar controls them.
  const [aiFilters, setAiFilters] = useState<AiResultFilters>(savedSession?.aiFilters ?? DEFAULT_AI_FILTERS)

  const [activeInnerTab, setActiveInnerTab] = useState<string>(savedSession?.activeInnerTab ?? "search")
  /** Staged papers the user opened — used to focus Search results on a new search. */
  const [openedStagedIds, setOpenedStagedIds] = useState<string[]>([])
  const openedStagedIdsRef = useRef(openedStagedIds)
  openedStagedIdsRef.current = openedStagedIds
  // Holds the AI-search `stop()` so the search bar's Stop button can abort it.
  const searchStopRef = useRef<(() => void) | null>(null)
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

  // Sidebar-pinned experiment: saves also link to it when it belongs to the
  // scoped project. Names feed the save toasts (req: toast states the links).
  const scope = useProjectScope()
  const pinnedExperimentForSave = useMemo(() => {
    const pin = scope.pinnedExperimentId
    if (!pin || !lockedProjectId) return null
    return experiments.find((e) => e.id === pin && e.project_id === lockedProjectId) ?? null
  }, [scope.pinnedExperimentId, lockedProjectId, experiments])
  const saveScopeLabel = lockedProjectName
    ? `${lockedProjectName}${pinnedExperimentForSave ? ` / ${pinnedExperimentForSave.name}` : ""}`
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
   * NUL character ("") — a delimiter that cannot appear inside an id — so
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

  /** Papers the user opened (+ pending before server refresh) in the tab strip. */
  const stripPaperIds = useMemo(() => {
    const knownIds = new Set([
      ...stagedItems.map((i) => i.id),
      ...repositoryReviews.map((r) => r.id),
    ])
    const seen = new Set<string>()
    const result: string[] = []
    for (const id of openedStagedIds) {
      if ((knownIds.has(id) || pendingOpenTabIds.includes(id)) && !seen.has(id)) {
        seen.add(id)
        result.push(id)
      }
    }
    for (const id of pendingOpenTabIds) {
      if (!seen.has(id)) {
        seen.add(id)
        result.push(id)
      }
    }
    return result
  }, [stagedItems, pendingOpenTabIds, openedStagedIds, repositoryReviews])

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

  // Track which reader tabs have actually been opened this session. Combined with
  // forceMount below, a visited paper's PDF stays mounted so re-selecting its tab
  // is instant (no re-download/re-parse). Restored-but-unvisited tabs stay cheap.
  const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (resolvedActiveTab === "search") return
    setMountedTabIds((prev) => {
      if (prev.has(resolvedActiveTab)) return prev
      const next = new Set(prev)
      next.add(resolvedActiveTab)
      return next
    })
  }, [resolvedActiveTab])

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

  // Repository papers, keyed by id and shaped like staged items, so the reader
  // tab can render a repo paper (its PDF, or the overview if none) just like a
  // staged one when opened from the results page.
  const repoById = useMemo(() => {
    const m = new Map<string, StagingListItem>()
    for (const r of repositoryReviews) {
      m.set(String(r.id), mapRowToListItem(r as unknown as StagingLiteratureRow))
    }
    return m
  }, [repositoryReviews])

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
      catalog_placement: r.catalog_placement ?? "library",
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
    // ponytail: only apply the global (un-namespaced) last-active-tab value on
    // a true first-ever mount for this session — otherwise it clobbers the
    // already-correct session-scoped `savedSession.activeInnerTab` (or the
    // "search" default) with a stale tab from a different project/session,
    // which is what left the panel stuck at opacity 0 on return.
    if (!savedSession && savedActive) setActiveInnerTab(savedActive)
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
            // NOTE: no router.refresh() here. The optimistic patch applied
            // above (setStagedPdfPatches) already transitions the reader from
            // the importing spinner to the PDF panel without a full server-tree
            // refetch. The earlier router.refresh() caused a second visible
            // reload of the paper right as it finished importing.
          } else if (data.pdf_import_status === "none" || data.pdf_import_status === "failed") {
            // Terminal failure: say so actively — the import runs server-side
            // after the staging action returns, so this poller is the only
            // place the outcome becomes known. Fires once per paper: the patch
            // above removes the id from pendingPdfImportIds.
            delete importStartedAtRef.current[id]
            const title = stagedByIdMerged.get(id)?.title?.trim()
            const paperLabel = title ? `"${title}"` : "this paper"
            toast.warning(
              data.pdf_import_status === "none"
                ? `No open-access PDF is available for ${paperLabel} — upload the PDF in its tab to read the full text.`
                : `The PDF for ${paperLabel} could not be downloaded — upload it in its tab to read the full text.`,
            )
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
  }, [topSection, pendingPdfImportIds, stagedByIdMerged, router])

  const scrollTabsRef = useRef<HTMLDivElement>(null)

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
  }, [resolvedActiveTab])

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

  // Catalyst citation entry: navigation lands on
  // /literature-reviews?openPaper=<id>; open that paper's read-mode tab once its
  // row is loaded. Runs once per id (guarded) so re-renders don't re-trigger.
  const openedParamRef = useRef<string | null>(null)
  useEffect(() => {
    if (!openPaperId || openedParamRef.current === openPaperId) return
    const lit = stagedByIdMerged.get(openPaperId) ?? repoById.get(openPaperId)
    if (!lit) return
    openedParamRef.current = openPaperId
    openPaperTab(openPaperId, lit.title)
  }, [openPaperId, openPaperTab, stagedByIdMerged, repoById])

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

  // Resolve a result paper to an existing literature row — staged first, then the
  // library — so "Read" opens the already-imported paper (PDF or overview)
  // instead of re-staging it.
  // Placement-aware membership: is this search paper already in the user's DB, and
  // where? Staging first (a staged read), then the repository (library). Returns the
  // matched row id + placement so cards can show "Open staged reader" vs "Open in
  // library" and route to the right target. Same pmid → doi → title+year match key.
  const resolvePaperMembership = useCallback(
    (paper: SearchPaper): { id: string; placement: 'staging' | 'repository' } | null => {
      const staged = resolveStagedLiteratureId(paper)
      if (staged) return { id: staged, placement: 'staging' }
      const nd = paper.doi ? normalizeDoi(paper.doi) : null
      const matches = (row: (typeof repositoryReviews)[number]) => {
        const rowPmid = (row as { pmid?: string | null }).pmid ?? null
        if (paper.pmid && rowPmid === paper.pmid) return true
        if (nd && row.doi === nd) return true
        if (!paper.pmid && !nd && row.title === paper.title && row.publication_year === paper.year)
          return true
        return false
      }
      // A paper already in your repo must read as saved regardless of which
      // project is active. Prefer a copy in the locked project (so "Open in
      // library" routes to the in-context row), but fall back to any project.
      const inProject = lockedProjectId
        ? repositoryReviews.filter((r) => r.project?.id === lockedProjectId)
        : repositoryReviews
      const match = inProject.find(matches) ?? repositoryReviews.find(matches)
      return match ? { id: String(match.id), placement: 'repository' } : null
    },
    [resolveStagedLiteratureId, repositoryReviews, lockedProjectId]
  )

  const resolveOpenableLiteratureId = useCallback(
    (paper: SearchPaper): string | null => resolvePaperMembership(paper)?.id ?? null,
    [resolvePaperMembership]
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

  // The dedicated AI-search endpoint (/api/literature/ai-search) is invoked by
  // AiSearchView from the submitted query — there's no separate
  // /api/search-papers call. AiSearchView lifts its papers (for staging
  // detection + count) via onResults and its loading via onLoadingChange.
  const handleSearch = (override?: string, { fresh = false }: { fresh?: boolean } = {}) => {
    const q = (override ?? query).trim()
    if (!q) return
    // fresh = explicit search (Enter / button / history re-run): force a live fetch by
    // clearing the cache + lastRunQuery guard, and show the spinner.
    // not fresh = history restore: instant, renders from the seeded cache — no spinner
    // (setting it here is what used to hang forever when the query was unchanged).
    if (fresh) literatureSearchEngine.forgetCache(q)
    if (override !== undefined && override !== query) setQuery(override)
    // Surface the results view immediately on submit (from anywhere).
    setTopSection("search")
    setSubmittedQuery(q)
    setSearchNonce((n) => n + 1) // re-fire the run() effect even if q is unchanged
    setHasSearched(true)
    if (fresh) {
      setIsSearching(true) // cleared by AiSearchView via onLoadingChange
      setSearchResults([]) // clear stale results until the new search streams in
    }
    // restore (not fresh): keep results — the seeded cache repopulates via onResults.
    syncTabsForSearchSession()
  }

  // One-shot auto-run when arriving from the marketing hero (query typed on the
  // home page → sign-up → here). Fires once, then clears the durable cookie so
  // a later manual visit to /literature-reviews doesn't re-trigger it.
  const autoRanRef = useRef(false)
  useEffect(() => {
    if (autoRanRef.current) return
    if (!autoRunSearch || !initialQuery?.trim()) return
    autoRanRef.current = true
    document.cookie = "n9_pending_lit_query=; path=/; max-age=0; samesite=lax"
    handleSearch(initialQuery, { fresh: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunSearch, initialQuery])

  // --- Search history (last 10 + see all) ---------------------------------
  // Sessions already load newest-first server-side; kind='literature' rows
  // are written authoritatively by the engine's onDone (see
  // lib/literature-search-engine.ts) so history doesn't depend on the
  // right-sidebar Catalyst bridge being mounted.
  const { sessions: chatSessions, loadSessions: loadChatSessions } = useChatSessions()
  useEffect(() => {
    void loadChatSessions()
  }, [loadChatSessions])
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const literatureHistory = useMemo(
    () => chatSessions.filter((s) => s.kind === "literature"),
    [chatSessions],
  )
  const historyEntries: LiteratureHistoryEntry[] = useMemo(
    () =>
      (historyExpanded ? literatureHistory : literatureHistory.slice(0, 10)).map((s) => ({
        id: s.id,
        query: s.title ?? "",
        updatedAt: s.updated_at,
      })),
    [literatureHistory, historyExpanded],
  )

  const handleSelectHistory = (q: string, opts: { refresh: boolean }) => {
    if (opts.refresh) {
      literatureSearchEngine.forgetCache(q)
    } else {
      // ponytail: DEFAULT behavior is instant restore from the saved answer
      // (no LLM call) — seed the engine cache so handleSearch's run() below
      // hits it immediately. Flip to "always refresh" by always taking the
      // opts.refresh branch above.
      const session = literatureHistory.find((s) => (s.title ?? "") === q)
      const saved = session?.metadata?.literature as
        | { summary?: string; papers?: SearchPaper[]; manifest?: unknown }
        | undefined
      if (saved?.papers?.length) {
        literatureSearchEngine.restore(q, {
          summary: saved.summary ?? "",
          papers: saved.papers,
          manifest: (saved.manifest as CitationsManifest | null | undefined) ?? null,
        })
      }
    }
    // refresh = live re-run (fresh); default = instant restore from the seeded cache.
    handleSearch(q, { fresh: opts.refresh })
  }

  const handleSeeAllHistory = () => setHistoryExpanded(true)

  // Jump from the library's search box straight into a fresh paper search.
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
    // Already in the library (staging OR library) → "Read" opens it directly.
    return resolveOpenableLiteratureId(paper) !== null
  }

  // 3-state membership for a search result: already in the library ('saved'), staged
  // for reading ('staged'), or neither (null). Drives the card's open-target + label.
  const getPaperMembership = (paperId: string): 'saved' | 'staged' | null => {
    const paper = searchResults.find((p) => p.id === paperId)
    if (!paper) return null
    const m = resolvePaperMembership(paper)
    if (!m) return null
    return m.placement === 'repository' ? 'saved' : 'staged'
  }

  // Ask Catalyst on a search result: papers already in the library attach as an
  // @-mention of their literature_reviews row (same as the opened-paper view)
  // instead of re-downloading the PDF via ephemeral-attach.
  const getPaperReviewId = (paper: SearchPaper) => resolvePaperMembership(paper)?.id ?? null

  const handleOpenStaged = (paper: SearchPaper) => {
    const id = resolveOpenableLiteratureId(paper)
    if (id) openPaperTab(id, paper.title)
  }

  // After a save-to-library, re-fetch the server-rendered library list so
  // `repositoryReviews` (the membership source of truth) includes the new row —
  // otherwise the card's "Saved" state reverts from the stale prop. Mirrors what
  // handleStagePaper already does for staging.
  const handlePaperSaved = () => {
    void router.refresh()
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
          toast.message("Already open")
        } else {
          toast.success("Opening paper — downloading the PDF…")
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
      const remainingOpened = openedStagedIdsRef.current.filter((sid) => sid !== id)
      const remainingPending = pendingOpenTabIdsRef.current.filter((sid) => sid !== id)
      return remainingOpened[0] ?? remainingPending[0] ?? "search"
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
      toast.success("Paper removed")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove paper")
    } finally {
      setIsClosingTab(false)
      setPendingCloseId(null)
    }
  }

  const handleCloseTabClick = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Closing a reader tab just closes the view — no prompt. The paper (and its
    // already-downloaded PDF) stays available to reopen or save to the library;
    // it clears itself after the 7-day TTL if never saved.
    closeTabOnly(id)
  }

  const openSaveDialog = (paper: SearchPaper, literatureId?: string) => {
    setPendingSavePaper(paper)
    setPendingLiteratureId(literatureId ?? null)
    setSelectedProjectId(lockedProjectId ?? "")
    setSelectedExperimentId("")
    setSaveDialogOpen(true)
  }

  const handleSaveFromStaging = async (paper: SearchPaper, literatureId: string) => {
    // Save directly from the reading view. Library papers REQUIRE a project:
    // with a locked project the save fires immediately (linking the pinned
    // experiment when one is set); without one, the link dialog opens so the
    // user picks the mandatory project first.
    if (!lockedProjectId) {
      openSaveDialog(paper, literatureId)
      return
    }
    setSavingStagingLiteratureId(literatureId)
    try {
      const result = await savePaperToRepository(paper, {
        projectId: lockedProjectId,
        experimentId: pinnedExperimentForSave?.id ?? null,
        literatureId,
      })
      if (result.success) {
        const pdfAttached = Boolean(result.data?.pdf_storage_path) && !result.warning
        const linkSuffix = saveScopeLabel ? ` — linked to ${saveScopeLabel}` : ""
        toast.success(
          (pdfAttached ? "Paper and PDF saved to library" : "Paper saved to library") +
            linkSuffix
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
  }

  const handleSavePaper = async () => {
    if (!pendingSavePaper) return
    const projectIdToSave = selectedProjectId || lockedProjectId
    // Library papers require a project; the dialog's Save button is disabled
    // until one is picked — this is just a defensive guard.
    if (!projectIdToSave) return

    setIsSavingPaper(true)
    try {
      const result = await savePaperToRepository(pendingSavePaper, {
        projectId: projectIdToSave,
        experimentId: selectedExperimentId || null,
        literatureId: pendingLiteratureId || null,
      })

      if (result.success) {
        const pdfAttached = Boolean(result.data?.pdf_storage_path) && !result.warning
        const projectName =
          projects.find((p) => p.id === projectIdToSave)?.name ?? lockedProjectName
        const experimentName = selectedExperimentId
          ? experiments.find((e) => e.id === selectedExperimentId)?.name ?? null
          : null
        const linkSuffix = projectName
          ? ` — linked to ${projectName}${experimentName ? ` / ${experimentName}` : ""}`
          : ""
        toast.success(
          (pdfAttached ? "Paper and PDF saved to library" : "Paper saved to library") +
            linkSuffix
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
    <div className="relative group transition-all">
      <div className="flex items-stretch bg-muted/15 rounded-lg overflow-hidden">
        {/* Pinned "Search results" — always visible; only the paper tabs scroll. */}
        <TabsList scrollable={false} className="bg-transparent h-auto border-none rounded-none flex items-center flex-shrink-0 px-1 pt-0 pb-1.5">
          {hasSearched && (
            <TabsTrigger
              value="search"
              data-value="search"
              className="relative data-[state=active]:bg-transparent data-[state=active]:text-[var(--n9-accent)] rounded-md border border-transparent px-4 py-2 bg-transparent text-muted-foreground transition-none shadow-none font-semibold shrink-0"
            >
              {resolvedActiveTab === "search" && <TabPill reduce={reduce} />}
              <span className="relative z-10 inline-flex items-center">
                <SearchIcon className="h-4 w-4 mr-2" />
                Search results
              </span>
            </TabsTrigger>
          )}
        </TabsList>
        <div className="relative flex-1 overflow-hidden">

        <div
          ref={scrollTabsRef}
          className="overflow-x-auto no-scrollbar scroll-smooth"
        >
          <TabsList data-tour="lit-tabs" scrollable={false} className="bg-transparent h-auto border-none rounded-none flex items-center justify-start flex-nowrap w-max min-w-full px-1 pt-0 pb-1.5 gap-1.5">
            {stripPaperIds.map((id) => {
              const lit = stagedByIdMerged.get(id) ?? repoById.get(id)
              const tabTitle = lit?.title ?? pendingTabTitles[id]
              if (!tabTitle) return null
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  data-value={id}
                  className="group relative data-[state=active]:bg-transparent data-[state=active]:text-[var(--n9-accent)] rounded-md border border-transparent px-4 py-2 bg-transparent text-muted-foreground transition-none shadow-none max-w-[220px] flex items-center gap-1 shrink-0"
                >
                  {resolvedActiveTab === id && <TabPill reduce={reduce} />}
                  <span className="relative z-10 truncate text-sm font-semibold">{tabTitle}</span>
                  {/* role=button span, NOT a nested <button> (invalid inside the
                      TabsTrigger button — causes hydration errors). */}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Close tab"
                    title="Close tab"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => handleCloseTabClick(id, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleCloseTabClick(id, e)
                      }
                    }}
                    className="relative z-10 flex-shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground/60 opacity-0 transition-all hover:bg-muted hover:text-rose-500 hover:scale-110 active:scale-90 focus:opacity-100 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        </div>
      </div>
    </div>
  )

  return (
    <div className="w-full space-y-4">
      <div className="glass-panel inline-flex rounded-2xl p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTopSection("search")}
          className={cn(
            "relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-200",
            topSection === "search"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {topSection === "search" &&
            (reduce ? (
              <span className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-border/50" />
            ) : (
              <motion.span
                layoutId="lit-topsection-pill"
                className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-border/50"
                transition={INDICATOR_SPRING}
              />
            ))}
          <span className="relative z-10 inline-flex items-center gap-2">
            <SearchIcon className="h-4 w-4" />
            Search & read
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTopSection("repo")}
          className={cn(
            "relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-200",
            topSection === "repo"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {topSection === "repo" &&
            (reduce ? (
              <span className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-border/50" />
            ) : (
              <motion.span
                layoutId="lit-topsection-pill"
                className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-border/50"
                transition={INDICATOR_SPRING}
              />
            ))}
          <span className="relative z-10 inline-flex items-center gap-2">
            <Database className="h-4 w-4" />
            My Library
          </span>
        </button>
      </div>

      <MotionTabPanel motionKey={topSection}>
      {topSection === "search" ? (
        <div className="space-y-6">
          {/* Filters live next to the results (see AiSearchView) so they're
              right where you read the papers — not buried in the search bar. */}
          <LiteratureSearchForm
            query={query}
            setQuery={setQuery}
            isSearching={isSearching}
            onSearch={() => handleSearch(undefined, { fresh: true })}
            onStop={() => {
              searchStopRef.current?.()
              setIsSearching(false)
            }}
            history={historyEntries}
            onSelectHistory={handleSelectHistory}
            onSeeAllHistory={handleSeeAllHistory}
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
                {/* forceMount keeps the results + live stream mounted across tab
                    switches, but Radix then renders it with hidden=false even when
                    inactive — so a staged paper tab would stack its reader below
                    the search list. Hide it ourselves when another tab is active. */}
                {hasSearched && (
                  <TabsContent
                    value="search"
                    forceMount
                    className={cn(
                      'm-0 border-none p-0',
                      resolvedActiveTab !== 'search' && 'hidden',
                    )}
                  >
                    {/* The persistent SearchTab is NEVER remounted (no key,
                        initial={false}) so the live SSE stream survives tab
                        switches. When the panel becomes active the parent's
                        `hidden` class is removed and this fades/lifts in; when
                        inactive the parent stays display:none so both panels can
                        never show at once (leak fix preserved). */}
                    <motion.div
                      initial={false}
                      animate={
                        reduce
                          ? { opacity: resolvedActiveTab === 'search' ? 1 : 0 }
                          : {
                              opacity: resolvedActiveTab === 'search' ? 1 : 0,
                              y: resolvedActiveTab === 'search' ? 0 : 6,
                            }
                      }
                      transition={{ duration: reduce ? 0 : 0.2, ease: 'easeOut' }}
                    >
                      <SearchTab
                        query={query}
                        setQuery={setQuery}
                        searchResults={displayedResults}
                        isSearching={isSearching}
                        hasSearched={hasSearched}
                        onSearch={() => handleSearch(undefined, { fresh: true })}
                        resultsOnly
                        projectId={lockedProjectId}
                        experimentId={pinnedExperimentForSave?.id ?? null}
                        scopeLabel={saveScopeLabel}
                        onRequestSave={openSaveDialog}
                        onStagePaper={handleStagePaper}
                        onOpenStaged={handleOpenStaged}
                        isPaperStaged={isPaperStaged}
                        getPaperMembership={getPaperMembership}
                        getPaperReviewId={getPaperReviewId}
                        isPaperStaging={(paperId) => stagingPaperId === paperId}
                        onPaperSaved={handlePaperSaved}
                        sortMode={searchSort}
                        onSortModeChange={handleSearchSortChange}
                        openAccessOnly={openAccessOnlySearch}
                        onOpenAccessOnlyChange={handleOpenAccessSearchChange}
                        filters={aiFilters}
                        onFiltersChange={setAiFilters}
                        aiQuery={submittedQuery}
                        searchNonce={searchNonce}
                        onResults={setSearchResults}
                        onLoadingChange={setIsSearching}
                        registerStop={(fn) => {
                          searchStopRef.current = fn
                        }}
                      />
                    </motion.div>
                  </TabsContent>
                )}

                {stripPaperIds.map((id) => {
                  const lit = stagedByIdMerged.get(id) ?? repoById.get(id)
                  const isActive = id === resolvedActiveTab
                  // Keep-mounted: build the heavy reader (which downloads + parses
                  // the full PDF and fetches annotations) only once the tab has
                  // actually been visited, then keep it mounted via forceMount so
                  // switching back is instant instead of a 5-6s remount + refetch.
                  // Tabs restored from localStorage but never clicked this session
                  // stay unmounted until first activated, so they cost nothing on load.
                  const shouldRender = isActive || mountedTabIds.has(id)
                  return (
                    <TabsContent
                      key={id}
                      value={id}
                      forceMount
                      className={cn("m-0 border-none p-0", !isActive && "hidden")}
                    >
                      {shouldRender ? (
                        <motion.div
                          initial={reduce ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: reduce ? 0 : 0.22, ease: 'easeOut' }}
                        >
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
                              <p className="text-sm text-muted-foreground">Loading paper…</p>
                            </div>
                          )}
                        </motion.div>
                      ) : null}
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
              onSearch={() => handleSearch(undefined, { fresh: true })}
              resultsOnly
              projectId={lockedProjectId}
              experimentId={pinnedExperimentForSave?.id ?? null}
              scopeLabel={saveScopeLabel}
              onRequestSave={openSaveDialog}
              onStagePaper={handleStagePaper}
              onOpenStaged={handleOpenStaged}
              isPaperStaged={isPaperStaged}
              getPaperReviewId={getPaperReviewId}
              isPaperStaging={(paperId) => stagingPaperId === paperId}
              onPaperSaved={handlePaperSaved}
              sortMode={searchSort}
              onSortModeChange={handleSearchSortChange}
              openAccessOnly={openAccessOnlySearch}
              onOpenAccessOnlyChange={handleOpenAccessSearchChange}
              filters={aiFilters}
              onFiltersChange={setAiFilters}
              aiQuery={submittedQuery}
              searchNonce={searchNonce}
              onResults={setSearchResults}
              onLoadingChange={setIsSearching}
              registerStop={(fn) => {
                searchStopRef.current = fn
              }}
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
      </MotionTabPanel>

      <AlertDialog
        open={Boolean(removeTargetId)}
        onOpenChange={(open) => {
          if (!open) setRemoveTargetId(null)
        }}
      >
        <AlertDialogContent className="glass-panel">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this paper?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTargetId && stagedByIdMerged.get(removeTargetId) ? (
                <>
                  This removes <strong>{stagedByIdMerged.get(removeTargetId)!.title}</strong> and
                  deletes its downloaded PDF. It stays in your library if you already saved it.
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
        <DialogContent className="glass-panel" overlayClassName="glass-overlay">
          <DialogHeader>
            <DialogTitle>Link paper to your research</DialogTitle>
            <DialogDescription>
              Library papers must belong to a project (required). Linking one of
              that project&apos;s experiments is optional.
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
                <Label htmlFor="link-project">Project (required)</Label>
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
                    value={selectedProjectId}
                    onValueChange={(value) => setSelectedProjectId(value)}
                  >
                    <SelectTrigger id="link-project">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
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
                <Label htmlFor="link-experiment">Experiment (optional)</Label>
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
            <Button
              onClick={handleSavePaper}
              disabled={isSavingPaper || !(selectedProjectId || lockedProjectId)}
            >
              {isSavingPaper ? "Saving..." : "Save to library"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import Link, { useLinkStatus } from "next/link"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import { motion } from "framer-motion"
import { CaretUp as ChevronUp, CaretUpDown, Check, Flask as FlaskConical, Folder, FolderOpen, NotePencil as NotebookPen, SidebarSimple as PanelLeft, Plus, MagnifyingGlass as Search, Gear as Settings, TestTube, FileText, NotePencil as FileEdit, CircleNotch as Loader2 } from "@phosphor-icons/react/ssr"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { cn } from "@/lib/utils"
import { Notes9Brand } from "@/components/brand/notes9-brand"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import { APP_PRIMARY_NAV } from "@/lib/app-primary-nav"
import { TOUR, navTourKey } from "@/lib/tour/anchors"
import { useProjectScope } from "@/contexts/project-scope-context"
import { sortByRecentProjectOrder } from "@/lib/recent-projects"
import { toast } from "sonner"
import { Button } from "../ui/button"
import { NewLabNoteDialog } from "@/app/(app)/lab-notes/new-lab-note-dialog"
import { withFromDashboard } from "@/lib/from-dashboard"

/**
 * Nav items that carry the active scope forward (`?project=` always; plus
 * `?experiment=` while the user is ON an experiment page — so Lab notes /
 * Data land inside the current experiment's context instead of a bare list).
 * Library items (Protocols, Samples) are deliberately absent — they're
 * lab-wide libraries and always open unscoped from the sidebar.
 */
const SCOPED_NAV_HREFS = new Set([
  "/experiments",
  "/lab-notes",
  "/data",
  "/literature-reviews",
  "/papers",
  "/reports",
])

/**
 * Shared row treatment for primary nav: quiet by default (muted icon, 13px
 * label); the sliding pill supplies the active background, the row only
 * switches type color/weight. Icons get a gentle scale-up on hover.
 */
type SwitcherExperiment = { id: string; name: string; project_id: string | null }

/** Same effect as TabsTrigger: its easing + press-scale, and while the menu is
 * open the row lifts as a solid raised tab (bg + shadow), like an active tab. */
const SWITCHER_TAB_EFFECT_CLASS =
  "duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] motion-reduce:active:scale-100 data-[state=open]:bg-background data-[state=open]:text-foreground data-[state=open]:shadow-sm"

/** Frosted switcher panel: thinner fill + stronger blur than the default menu
 * glass, with an inner top highlight so it reads as a lifted glass pane. */
const SWITCHER_MENU_CLASS =
  "w-60 rounded-xl p-1.5 bg-[color:color-mix(in_srgb,var(--glass-bg)_72%,transparent)] backdrop-blur-2xl backdrop-saturate-150 shadow-xl shadow-black/10 ring-1 ring-inset ring-white/25 dark:ring-white/[0.07] dark:shadow-black/40"

/** Switcher affordance: a soft raised ⇅ chip — shadow only, no outline — so
 * the row visibly reads as "opens a picker", lighting up primary on
 * hover/open. The whole row is the click target. */
function SwitcherKeycap() {
  return (
    <span
      aria-hidden
      className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-background shadow-sm transition-shadow duration-150 group-hover:shadow-md dark:bg-sidebar-accent"
    >
      <CaretUpDown
        weight="bold"
        className="size-3 !text-muted-foreground transition-colors group-hover:!text-primary group-data-[state=open]:!text-primary"
      />
    </span>
  )
}

const NAV_ROW_CLASS =
  "group relative z-[1] h-8 rounded-lg text-[13px] text-sidebar-foreground/75 transition-all duration-150 [&_svg]:text-sidebar-foreground/55 [&_svg]:transition-transform [&_svg]:duration-200 hover:bg-background/60 hover:text-sidebar-foreground hover:[&_svg]:scale-110 hover:[&_svg]:text-sidebar-foreground/80 active:scale-[0.985] active:bg-background/80 dark:hover:bg-background/40 dark:active:bg-background/60 data-[active=true]:bg-transparent data-[active=true]:font-medium data-[active=true]:text-sidebar-foreground data-[active=true]:[&_svg]:text-primary"

interface Project {
  id: string
  name: string
  status: string
  created_at?: string
}

interface User {
  id?: string
  email: string
  user_metadata: {
    first_name?: string
    last_name?: string
    full_name?: string
  }
}

interface UserProfile {
  first_name?: string | null
  last_name?: string | null
  organization_id?: string | null
}

type SearchResultItem = {
  id: string
  type: "project" | "experiment" | "lab_note" | "protocol" | "sample"
  title: string
  subtitle?: string
  href: string
}

// Spinner shown on a nav link while its navigation is pending (RSC fetch or
// dev-mode route compile in flight). Must be rendered INSIDE a <Link> —
// useLinkStatus reads the pending state of the enclosing link.
function NavLinkSpinner() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <Loader2
      className="ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground"
      aria-label="Loading page"
    />
  )
}

export function AppSidebar() {
  const authUser = useAuthUser();
  const pathname = usePathname()
  const router = useRouter()
  const { setOpenMobile, isMobile, state, openMobile, open, setOpen } = useSidebar()
  // Active-project context (URL `?project=` or `/projects/<id>` path). When set,
  // we render a project chip + scoped section nav so the sidebar reflects ONE
  // hierarchy instead of the two parallel ones the audit flagged.
  const scope = useProjectScope()
  const [searchQuery, setSearchQuery] = useState("")
  const [projects, setProjects] = useState<Project[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [labNoteOpen, setLabNoteOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const isIconMode = !open
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Experiment-switcher list, fetched lazily when the dropdown opens (the
  // sidebar shouldn't pay for it on every load). Scoped to the active project.
  const [experimentsForSwitcher, setExperimentsForSwitcher] = useState<SwitcherExperiment[]>([])
  const [experimentsLoading, setExperimentsLoading] = useState(false)
  const loadSwitcherExperiments = useCallback(async () => {
    setExperimentsLoading(true)
    try {
      let query = supabase
        .from("experiments")
        .select("id, name, project_id")
        .order("updated_at", { ascending: false })
        .limit(8)
      if (scope.projectId) query = query.eq("project_id", scope.projectId)
      const { data } = await query
      setExperimentsForSwitcher((data ?? []) as SwitcherExperiment[])
    } finally {
      setExperimentsLoading(false)
    }
  }, [supabase, scope.projectId])

  // Always include the experiment the user is standing in, even if it isn't
  // among the fetched most-recent (or the fetch is still in flight).
  const switcherExperiments = useMemo(() => {
    if (
      scope.liveExperimentId &&
      scope.experimentName &&
      !experimentsForSwitcher.some((e) => e.id === scope.liveExperimentId)
    ) {
      return [
        {
          id: scope.liveExperimentId,
          name: scope.experimentName,
          project_id: scope.projectId,
        },
        ...experimentsForSwitcher,
      ]
    }
    return experimentsForSwitcher
  }, [experimentsForSwitcher, scope.liveExperimentId, scope.experimentName, scope.projectId])

  // Project-switcher list: recently opened first; always includes the scoped
  // project even when it fell out of the fetched top-5.
  const switcherProjects = useMemo(() => {
    const list = sortByRecentProjectOrder(projects)
    if (
      scope.projectId &&
      scope.projectName &&
      !list.some((p) => p.id === scope.projectId)
    ) {
      return [{ id: scope.projectId, name: scope.projectName, status: "" }, ...list]
    }
    return list
  }, [projects, scope.projectId, scope.projectName])

  const toggleSidebarOpen = (e?: React.MouseEvent<HTMLButtonElement>) => {
    setOpen(!open)
    // Drop focus off the toggle button so the ghost-variant focus ring
    // doesn't linger on the chrome (visible as a highlighted icon at the
    // top of the sidebar after every click).
    if (e?.currentTarget) e.currentTarget.blur()
  }

  // Collapsed-rail affordance: clicking the search icon expands the sidebar and
  // lands the cursor in the (now-visible) search field.
  const openAndFocusSearch = () => {
    setOpen(true)
    // Wait for the expand transition to mount the full input before focusing.
    setTimeout(() => searchInputRef.current?.focus(), 120)
  }

  // Prevent hydration mismatch by only activating after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // ⌘K / Ctrl+K focuses the sidebar search from anywhere (expanding the
  // collapsed rail first). Skips when the user is typing in another field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      e.preventDefault()
      setOpen(true)
      setTimeout(() => searchInputRef.current?.focus(), open ? 0 : 120)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  // Debounced sidebar search (file/document level)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([])
      setSearchError(false)
      return
    }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(false)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`)
        const data = await res.json()
        if (res.ok) {
          setSearchResults(data.results ?? [])
        } else {
          setSearchResults([])
          setSearchError(true)
        }
      } catch (err) {
        console.error('Sidebar search failed', err)
        setSearchResults([])
        setSearchError(true)
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setFetchError(false)

      // Verify Supabase client is initialized
      if (!supabase) {
        console.error("Supabase client is not initialized")
        toast.error("Database connection error. Please check your configuration.")
        setLoading(false)
        return
      }

      // Get current user from the AuthProvider (already verified server-side
      // in app/(app)/layout.tsx); no extra /auth/v1/user round-trip.
      const currentUser = authUser
      if (!currentUser) {
        // Clear any previously-set user (e.g. on logout) and bail before any
        // code that dereferences user.user_metadata.
        setUser(null)
        setLoading(false)
        return
      }
      setUser(currentUser as User)

      // Profile + organization are guaranteed by the server-side
      // ensureUserProfile() call in app/(app)/layout.tsx. We just read here.
      const { data: userProfileData, error: profileCheckError } = await supabase
        .from("profiles")
        .select("id, organization_id, first_name, last_name")
        .eq("id", currentUser.id)
        .maybeSingle()

      if (profileCheckError) {
        console.error("Sidebar profile read failed:", profileCheckError)
        toast.error("Could not load your workspace. Try refreshing.")
        setFetchError(true)
        setLoading(false)
        return
      }

      if (!userProfileData?.organization_id) {
        // The layout's ensureUserProfile() reports its own failure to server
        // logs; here we just show an empty workspace.
        setProjects([])
        setLoading(false)
        return
      }

      setUserProfile({
        first_name: userProfileData.first_name ?? null,
        last_name: userProfileData.last_name ?? null,
        organization_id: userProfileData.organization_id ?? null,
      })

      // Fetch projects for this organization (all statuses)
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("id, name, status, created_at")
        .eq("organization_id", userProfileData.organization_id)
        .order("created_at", { ascending: false })
        .limit(5)

      if (projectsError) {
        console.error("Error fetching projects:", projectsError)
        toast.error(`Failed to load projects: ${projectsError.message || 'Unknown error'}`)
        setFetchError(true)
        setProjects([])
      } else {
        // Sidebar shows a flat list now — experiments + lab-note drill-down lives
        // on the project page, so we don't fetch or assemble that tree here.
        setProjects((projectsData ?? []) as Project[])
      }

    } catch (error) {
      console.error("Error loading sidebar data:", error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()

    // Debounce realtime refetches: bursts of project mutations would otherwise
    // fire `fetchData` many times in quick succession. Also: drop the `profiles`
    // subscription — profile edits in Settings should not trigger a full
    // sidebar reload (the sidebar derives projects/experiments, not profile).
    let pending: ReturnType<typeof setTimeout> | null = null
    const scheduleRefetch = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        pending = null
        fetchData()
      }, 250)
    }

    const channel = supabase
      .channel('sidebar-projects')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        scheduleRefetch,
      )
      .subscribe()

    return () => {
      if (pending) clearTimeout(pending)
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchData])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = "/"
  }

  const getUserInitials = () => {
    if (!user) return "U"
    const firstName = userProfile?.first_name || user.user_metadata?.first_name || ""
    const lastName = userProfile?.last_name || user.user_metadata?.last_name || ""
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase()
    }
    if (firstName) {
      return firstName[0].toUpperCase()
    }
    return user.email?.[0]?.toUpperCase() || "U"
  }

  const getUserDisplayName = () => {
    if (!user) return "User"
    if (userProfile?.first_name || userProfile?.last_name) {
      return [userProfile.first_name, userProfile.last_name].filter(Boolean).join(" ")
    }
    return user.user_metadata?.full_name ||
      (user.user_metadata?.first_name && user.user_metadata?.last_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
        : user.email?.split("@")[0] || "User")
  }

  return (
    <Sidebar
      // Standard docked variant. The "floated, not boxy" look comes from a soft
      // right-edge shadow on the wrapper (app-layout) + no hard border-r seam —
      // the shadcn `floating` variant's fixed-position internals conflict with
      // this custom resizable container (leftover gap element + odd collapsed).
      variant="sidebar"
      collapsible="icon"
      className="border-r-0 transition-all duration-200 ease-in-out [&_[data-slot=sidebar-container]]:border-r-0 [&_[data-sidebar=sidebar]]:bg-[color:color-mix(in_oklab,var(--sidebar)_86%,transparent)] [&_[data-sidebar=sidebar]]:backdrop-blur-xl [&_[data-sidebar=sidebar]]:backdrop-saturate-[1.3]"
    >
      {/* Ambient top glow — a soft warm radial wash that gives the panel depth.
          First child on purpose: everything after paints above it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_70%)]"
      />
      {/* Header with Workspace Dropdown */}
      <SidebarHeader
        className={cn(
          "p-2 shrink-0",
          isIconMode && "gap-1 pb-1 pt-1.5"
        )}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            {isIconMode ? (
              // Icon mode: logo + expand stacked, same width as nav icons (no horizontal gap)
              <div className="flex w-full flex-col items-center gap-1">
                <SidebarMenuButton asChild size="lg" className="h-9 w-9 p-0 [&>span]:hidden">
                  <Link href="/dashboard" aria-label="Notes9 — go to dashboard">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
                      <Image
                        src="/notes9-logo-mark-transparent.png"
                        alt="Notes9 Logo"
                        width={32}
                        height={32}
                        className="size-8 object-contain dark:invert dark:brightness-125"
                      />
                    </div>
                  </Link>
                </SidebarMenuButton>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground shrink-0"
                  onClick={(e) => toggleSidebarOpen(e)}
                  aria-label="Expand sidebar"
                >
                  <PanelLeft className="size-4" />
                </Button>
              </div>
            ) : (
              // Normal mode: Logo and text with collapse button on the right
              <div className="flex items-center gap-2">
                <SidebarMenuButton
                  asChild
                  size="lg"
                  className="h-auto min-h-12 flex-1 min-w-0 overflow-visible py-2"
                >
                  <Link href="/dashboard" aria-label="Notes9 — go to dashboard">
                    <Notes9Brand
                      showIcon
                      iconClassName="h-6 w-6"
                      textClassName="h-5 w-auto"
                      withTagline
                    />
                  </Link>
                </SidebarMenuButton>

                {/* Collapse Button - hidden on mobile where sidebar is a sheet overlay */}
                {!isMobile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 sm:size-9 text-muted-foreground shrink-0"
                    onClick={(e) => toggleSidebarOpen(e)}
                    aria-label="Collapse sidebar"
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent
        className={cn(
          isIconMode && "gap-0 overflow-y-auto overflow-x-hidden pt-0"
        )}
      >
        {/* Collapsed rail: a search icon stands in for the full field. Clicking
            it expands the sidebar and focuses the search input. Only in icon mode. */}
        {isIconMode && (
          <SidebarGroup className="flex flex-col items-center px-1.5 pb-1 pt-0">
            <SidebarGroupContent className="w-full flex flex-col items-center">
              <SidebarMenu className="flex w-full flex-col items-center gap-0.5">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Search"
                    aria-label="Search"
                    onClick={openAndFocusSearch}
                    className="group transition-all duration-150 hover:bg-[color:color-mix(in_oklab,var(--background)_78%,var(--primary)_22%)] hover:text-sidebar-foreground active:scale-[0.985] dark:hover:bg-sidebar-accent dark:hover:text-sidebar-accent-foreground"
                  >
                    <Search />
                    <span className="hidden">Search</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Search - Hidden in icon mode */}
        <SidebarGroup className={cn(isIconMode && "hidden")}>
          <SidebarGroupContent className="px-2">
            <Popover open={searchQuery.length >= 2}>
              <PopoverAnchor asChild>
                <div className="relative" id="tour-search" data-tour={TOUR.sidebarSearch}>
                  {/* Icon offset is tuned to sit ~9px inside the input's
                      visible left edge — `left-2.5` instead of the prior
                      `left-4` which left a noticeable dead-space gap. */}
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 select-none text-muted-foreground" />
                  <SidebarInput
                    ref={searchInputRef}
                    placeholder="Search"
                    className={cn(
                      "h-8 rounded-lg border-transparent bg-[color:color-mix(in_oklab,var(--sidebar)_72%,var(--sidebar-accent)_28%)] pl-9 pr-12 shadow-none transition-colors placeholder:text-muted-foreground/80 hover:bg-sidebar-accent/70 focus-visible:bg-sidebar focus-visible:ring-1",
                      searchQuery.length === 0 &&
                        "caret-transparent selection:bg-transparent",
                    )}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSearchQuery("")
                    }}
                  />
                  {searchQuery.length === 0 && (
                    <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center rounded-[5px] border border-sidebar-border/80 bg-sidebar px-1.5 font-sans text-[10px] font-medium tracking-wide text-muted-foreground sm:flex">
                      ⌘K
                    </kbd>
                  )}
                </div>
              </PopoverAnchor>
              <PopoverContent
                className="w-[var(--sidebar-width)] min-w-0 p-0 max-h-[min(60vh,400px)] overflow-auto"
                align="start"
                sideOffset={4}
                onOpenAutoFocus={(e) => e.preventDefault()}
                // The popover is controlled by `searchQuery.length >= 2`, so it
                // closes whenever the user clears the search or navigates via
                // a result. Without this, Radix's default close-focus runs on
                // every close and yanks the cursor BACK into the search input
                // — making "I clicked anywhere else" feel like "focus snapped
                // back to search again."
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                {searchLoading ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Searching...
                  </div>
                ) : searchError ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Search unavailable. Try again.
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No files or documents found.
                  </div>
                ) : (
                  <ul className="py-1">
                    {searchResults.map((item) => {
                      const Icon =
                        item.type === "project"
                          ? Folder
                          : item.type === "experiment"
                            ? FlaskConical
                            : item.type === "lab_note"
                              ? NotebookPen
                              : item.type === "protocol"
                                ? ClipboardInfoIcon
                                : TestTube
                      return (
                        <li key={`${item.type}-${item.id}`}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-sm mx-1 text-left"
                            onClick={() => {
                              setSearchQuery("")
                              setSearchResults([])
                              router.push(item.href)
                            }}
                          >
                            <Icon className="size-4 shrink-0 opacity-70" />
                            <span className="min-w-0 flex-1 truncate" title={item.title}>
                              {item.title}
                              {item.subtitle ? (
                                <span className="text-muted-foreground text-xs ml-1">
                                  · {item.subtitle}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </PopoverContent>
            </Popover>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Global Create Button - Hidden in icon mode */}
        <SidebarGroup className={cn(isIconMode && "hidden", "pt-0 pb-1")}>
          <SidebarGroupContent className="px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton data-tour={TOUR.createNew} className="h-8 w-full justify-start gap-2 rounded-lg bg-[#e4ecd9] text-[13px] font-medium text-[#4f5f42] shadow-none ring-1 ring-inset ring-black/[0.04] transition-all duration-150 hover:bg-[#d6e3c7] hover:text-[#3d4a35] active:scale-[0.985] dark:bg-[#3d4a35] dark:text-[#e4ecd9] dark:ring-white/[0.06] dark:hover:bg-[#4f5f42]">
                      <Plus className="size-4 shrink-0" />
                      <span>New</span>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 rounded-lg ml-2" side="right" align="start">
                    <DropdownMenuItem asChild>
                      <Link href={withFromDashboard("/projects/new")} className="cursor-pointer">
                        <FolderOpen className="mr-2 size-4" />
                        <span>Project</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={withFromDashboard("/experiments/new")} className="cursor-pointer">
                        <FlaskConical className="mr-2 size-4" />
                        <span>Experiment</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={withFromDashboard("/samples/new")} className="cursor-pointer">
                        <TestTube className="mr-2 size-4" />
                        <span>Sample</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={withFromDashboard(scope.projectId ? `/protocols/new?project=${scope.projectId}` : "/protocols/new")} className="cursor-pointer">
                        <ClipboardInfoIcon className="mr-2 size-4" />
                        <span>Protocol</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setLabNoteOpen(true)} className="cursor-pointer">
                      <NotebookPen className="mr-2 size-4" />
                      <span>Lab note</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={withFromDashboard("/papers/new")} className="cursor-pointer">
                        <FileEdit className="mr-2 size-4" />
                        <span>Writing</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={withFromDashboard(scope.projectId ? `/reports?project=${scope.projectId}&new=true` : "/reports?new=true")} className="cursor-pointer">
                        <FileText className="mr-2 size-4" />
                        <span>Report</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Context card: WHERE AM I. The active project + experiment switchers,
            pinned to the BOTTOM of the sidebar (order-last + mt-auto), just
            above the account footer — the nav list stays clean, and the
            current context sits in a stable, glanceable home. Same sandglass
            material as the nav strip; triggers behave like TabsTriggers
            (raised solid tab while open). */}
        {!isIconMode && mounted && scope.projectId && (
          <SidebarGroup className="order-last mt-auto pb-2">
            <SidebarGroupContent className="n9-grain rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] p-1 backdrop-blur-md">
              <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Context
              </div>
              <SidebarMenu className="gap-0.5">
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        className={cn(NAV_ROW_CLASS, SWITCHER_TAB_EFFECT_CLASS)}
                        aria-label={`Project: ${scope.projectName}. Open project switcher`}
                      >
                        <FolderOpen className="size-4 shrink-0" weight="fill" />
                        <span className="flex-1 flex items-center min-w-0">
                          <span className="truncate">{scope.projectName}</span>
                        </span>
                        <SwitcherKeycap />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      sideOffset={10}
                      className={SWITCHER_MENU_CLASS}
                    >
                      <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Switch project
                      </DropdownMenuLabel>
                      {switcherProjects.map((p) => {
                        const isCurrent = p.id === scope.projectId
                        return (
                          <DropdownMenuItem
                            key={p.id}
                            onSelect={() => router.push(`/projects/${p.id}`)}
                            className="cursor-pointer gap-2.5 rounded-lg py-2"
                          >
                            <Folder
                              className="size-4 shrink-0 text-muted-foreground"
                              weight={isCurrent ? "fill" : "regular"}
                            />
                            <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
                            {isCurrent && (
                              <Check className="size-4 shrink-0 text-primary" weight="bold" />
                            )}
                          </DropdownMenuItem>
                        )
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          scope.clearScope()
                          router.push("/projects")
                        }}
                        className="cursor-pointer gap-2.5 rounded-lg py-2 text-[13px]"
                      >
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                        All projects
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-lg py-2 text-[13px]">
                        <Link href={withFromDashboard("/projects/new")}>
                          <Plus className="size-4 shrink-0 text-muted-foreground" />
                          New project
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>

                {scope.liveExperimentId && scope.experimentName && (
                  <SidebarMenuItem>
                    <DropdownMenu
                      onOpenChange={(o) => {
                        if (o) loadSwitcherExperiments()
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                          className={cn(NAV_ROW_CLASS, SWITCHER_TAB_EFFECT_CLASS)}
                          aria-label={`Experiment: ${scope.experimentName}. Open experiment switcher`}
                        >
                          <FlaskConical className="size-4 shrink-0" weight="fill" />
                          <span className="flex-1 flex items-center min-w-0">
                            <span className="truncate">{scope.experimentName}</span>
                          </span>
                          <SwitcherKeycap />
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="right"
                        align="start"
                        sideOffset={10}
                        className={SWITCHER_MENU_CLASS}
                      >
                        <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Switch experiment
                        </DropdownMenuLabel>
                        {switcherExperiments.map((exp) => {
                          const isCurrent = exp.id === scope.liveExperimentId
                          return (
                            <DropdownMenuItem
                              key={exp.id}
                              onSelect={() =>
                                router.push(
                                  exp.project_id
                                    ? `/experiments/${exp.id}?project=${exp.project_id}`
                                    : `/experiments/${exp.id}`,
                                )
                              }
                              className="cursor-pointer gap-2.5 rounded-lg py-2"
                            >
                              <FlaskConical
                                className="size-4 shrink-0 text-muted-foreground"
                                weight={isCurrent ? "fill" : "regular"}
                              />
                              <span className="min-w-0 flex-1 truncate text-[13px]">{exp.name}</span>
                              {isCurrent && (
                                <Check className="size-4 shrink-0 text-primary" weight="bold" />
                              )}
                            </DropdownMenuItem>
                          )
                        })}
                        {experimentsLoading && switcherExperiments.length <= 1 && (
                          <div className="flex items-center gap-2 px-2 py-2 text-[13px] text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" />
                            Loading experiments…
                          </div>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() =>
                            router.push(
                              scope.projectId
                                ? `/experiments?project=${scope.projectId}`
                                : "/experiments",
                            )
                          }
                          className="cursor-pointer gap-2.5 rounded-lg py-2 text-[13px]"
                        >
                          <FlaskConical className="size-4 shrink-0 text-muted-foreground" />
                          All experiments
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-lg py-2 text-[13px]">
                          <Link
                            href={withFromDashboard(
                              scope.projectId
                                ? `/experiments/new?project=${scope.projectId}`
                                : "/experiments/new",
                            )}
                          >
                            <Plus className="size-4 shrink-0 text-muted-foreground" />
                            New experiment
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Main navigation: one flat, minimal list. Icons only when collapsed. */}
        <SidebarGroup
          className={cn(
            isIconMode && "flex flex-col items-center px-1.5 pb-1 pt-0 gap-0.5"
          )}
        >
          <SidebarGroupContent
            // Sandglass strip, same grammar as TabsList: translucent, blurred,
            // grained container; the sliding active pill is the solid raised
            // "tab" inside it.
            className={cn(
              "n9-grain rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] p-1 backdrop-blur-md",
              isIconMode && "w-full flex flex-col items-center",
            )}
          >
            <SidebarMenu
              className={cn("gap-0.5", isIconMode && "flex w-full flex-col items-center")}
              id="tour-main-nav"
              data-tour={TOUR.sidebarNav}
            >
              {/* In the collapsed rail, nested children (Lab notes / Data)
                  flatten into the icon stack so they stay one click away. */}
              {APP_PRIMARY_NAV.flatMap((item) =>
                isIconMode ? [item, ...(item.children ?? [])] : [item],
              ).map((item) => {
                    const Icon = item.icon
                    const pathMatches =
                      pathname === item.href || pathname.startsWith(item.href + "/")
                    const isActive = mounted && pathMatches
                    // `mounted` gate: `scope` is client-only (empty during SSR),
                    // so scoped hrefs appear only after hydration — server and
                    // first client render stay identical.
                    const carriesScope =
                      mounted && !!scope.projectId && SCOPED_NAV_HREFS.has(item.href)

                    return (
                      <SidebarMenuItem key={item.name} data-tour={navTourKey(item.href)}>
                        {/* Sliding active pill: one shared framer-motion layoutId,
                            so the highlight glides between rows on navigation. */}
                        {isActive && (
                          <motion.span
                            aria-hidden
                            layoutId="sidebar-active-pill"
                            transition={{ type: "spring", stiffness: 480, damping: 42 }}
                            className="absolute inset-0 rounded-lg bg-background shadow-sm ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]"
                          />
                        )}
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.name}
                          className={NAV_ROW_CLASS}
                        >
                          <Link
                            href={carriesScope ? `${item.href}${scope.scopedQueryString}` : item.href}
                            aria-label={isIconMode ? item.name : undefined}
                            // In the collapsed rail, navigating also expands the
                            // sidebar so the user lands on the page with the full
                            // nav open (per request: clicking an icon opens it).
                            onClick={() => { if (isIconMode) setOpen(true) }}
                            className="flex-1 flex items-center pr-6"
                          >
                            <Icon weight={isActive ? "fill" : "regular"} />
                            <span className={cn(isIconMode && "hidden", "flex-1 flex items-center")}>
                              <span className="truncate">{item.name}</span>
                              <NavLinkSpinner />
                            </span>
                          </Link>
                        </SidebarMenuButton>

                        {/* Strictly-nested children (Lab notes / Data live only
                            inside experiments): indented tree rows sharing the
                            same sliding pill as the top level. */}
                        {!isIconMode && item.children && item.children.length > 0 && (
                          <SidebarMenuSub className="mx-0 my-0.5 ml-[1.05rem] gap-0.5 border-l border-sidebar-border/70 py-0 pl-2 pr-0">
                            {item.children.map((child) => {
                              const ChildIcon = child.icon
                              const childActive =
                                mounted &&
                                (pathname === child.href || pathname.startsWith(child.href + "/"))
                              const childCarriesScope =
                                mounted && !!scope.projectId && SCOPED_NAV_HREFS.has(child.href)
                              return (
                                <SidebarMenuSubItem key={child.name}>
                                  {childActive && (
                                    <motion.span
                                      aria-hidden
                                      layoutId="sidebar-active-pill"
                                      transition={{ type: "spring", stiffness: 480, damping: 42 }}
                                      className="absolute inset-0 rounded-lg bg-background shadow-sm ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]"
                                    />
                                  )}
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={childActive}
                                    className="relative z-[1] h-7 rounded-lg text-[13px] text-sidebar-foreground/70 transition-all duration-150 [&_svg]:text-sidebar-foreground/50 [&_svg]:transition-transform [&_svg]:duration-200 hover:bg-background/60 hover:text-sidebar-foreground hover:[&_svg]:scale-110 dark:hover:bg-background/40 data-[active=true]:bg-transparent data-[active=true]:font-medium data-[active=true]:text-sidebar-foreground data-[active=true]:[&_svg]:text-primary"
                                  >
                                    <Link
                                      href={
                                        childCarriesScope
                                          ? `${child.href}${scope.scopedQueryString}`
                                          : child.href
                                      }
                                      className="flex items-center"
                                    >
                                      <ChildIcon weight={childActive ? "fill" : "regular"} />
                                      <span className="flex-1 flex items-center min-w-0">
                                        <span className="truncate">{child.name}</span>
                                        <NavLinkSpinner />
                                      </span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )
                            })}
                          </SidebarMenuSub>
                        )}
                      </SidebarMenuItem>
                    );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer with Catalyst and User Dropdown */}
      <SidebarFooter className={cn(isIconMode && "p-1.5 pt-0")}>
        <SidebarMenu className={cn(isIconMode && "gap-0.5")}>
          {/* Catalyst AI Button */}


          {/* User Dropdown - Only render after mount to prevent hydration mismatch */}
          <SidebarMenuItem>
            {mounted ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size={isIconMode ? "default" : "lg"}
                    tooltip={
                      isIconMode
                        ? `${getUserDisplayName()} — Account menu`
                        : undefined
                    }
                    className={cn(
                      "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                      isIconMode &&
                        "justify-center [&>span:not(:first-child)]:hidden"
                    )}
                  >
                    <div className="flex aspect-square size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[color:color-mix(in_oklab,var(--primary)_85%,white_15%)] to-[color:color-mix(in_oklab,var(--primary)_70%,black_10%)] text-primary-foreground shadow-sm">
                      <span className="text-[11px] font-semibold">{getUserInitials()}</span>
                    </div>
                    <span
                      className="min-w-0 flex-1 truncate text-left text-[13px] font-medium"
                      title={getUserDisplayName()}
                    >
                      {getUserDisplayName()}
                    </span>
                    <ChevronUp
                      className={cn(
                        "ml-auto size-4 shrink-0",
                        isIconMode && "hidden"
                      )}
                    />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side="top"
                  align="start"
                  sideOffset={4}
                >
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 size-4" />
                      <span>Account Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <SidebarMenuButton size={isIconMode ? "default" : "lg"} className={isIconMode ? "justify-center" : undefined}>
                <div className="flex aspect-square size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
                  <span className="text-[11px] font-semibold">...</span>
                </div>
                <span className={cn("min-w-0 flex-1 truncate text-left text-[13px] font-medium", isIconMode && "hidden")}>
                  Loading...
                </span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <NewLabNoteDialog
        open={labNoteOpen}
        onOpenChange={setLabNoteOpen}
        defaultProjectId={scope.projectId}
      />
    </Sidebar>
  );
}

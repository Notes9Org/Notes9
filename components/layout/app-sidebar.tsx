"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FlaskConical,
  Folder,
  FolderOpen,
  MoreHorizontal,
  NotebookPen,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  TestTube,
  User2,
  X as XIcon,
  Database,
  FileText,
  FileEdit,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { cn } from "@/lib/utils"
import { Notes9Brand } from "@/components/brand/notes9-brand"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import { APP_PRIMARY_NAV } from "@/lib/app-primary-nav"
import { TOUR, navTourKey } from "@/lib/tour/anchors"
import { colorFromId as projectDotColor, useProjectScope } from "@/contexts/project-scope-context"
import { toast } from "sonner"
import { Button } from "../ui/button"
import { NewLabNoteDialog } from "@/app/(app)/lab-notes/new-lab-note-dialog"
import { withFromDashboard } from "@/lib/from-dashboard"

const navigation = APP_PRIMARY_NAV

/**
 * Section nav rendered as nested children when a project is active in the URL
 * (`?project=<id>` or `/projects/<id>`). These are the previously-orphaned
 * "global" section pages that the IA #1 audit flagged — they exist as routes
 * but were not discoverable from the sidebar. When scoped, each link carries
 * `?project=<id>` forward so the project filter persists across navigations.
 */
type ProjectScopedNavItem = {
  name: string
  basePath: string
  icon: typeof Folder
  children?: { name: string; basePath: string; icon: typeof Folder }[]
}

// Lab notes / Protocols / Samples / Data are nested under Experiments.
// Literature is top-level nav (see APP_PRIMARY_NAV) — not project-scoped in the sidebar.
const PROJECT_SCOPED_NAV: ProjectScopedNavItem[] = [
  {
    name: "Experiments",
    basePath: "/experiments",
    icon: FlaskConical,
    children: [
      { name: "Lab notes", basePath: "/lab-notes", icon: NotebookPen },
      { name: "Protocols", basePath: "/protocols", icon: ClipboardInfoIcon as unknown as typeof Folder },
      { name: "Samples", basePath: "/samples", icon: TestTube },
      { name: "Data", basePath: "/data", icon: Database },
    ],
  },
  { name: "Reports", basePath: "/reports", icon: FileText },
  { name: "Writing", basePath: "/papers", icon: FileEdit },
]

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
  const [isProjectExpanded, setIsProjectExpanded] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const isIconMode = !open

  const toggleSidebarOpen = (e?: React.MouseEvent<HTMLButtonElement>) => {
    setOpen(!open)
    // Drop focus off the toggle button so the ghost-variant focus ring
    // doesn't linger on the chrome (visible as a highlighted icon at the
    // top of the sidebar after every click).
    if (e?.currentTarget) e.currentTarget.blur()
  }

  // Prevent hydration mismatch by only activating after mount
  useEffect(() => {
    setMounted(true)
  }, [])

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
      setUser(currentUser as User)

      if (!currentUser) {
        setLoading(false)
        return
      }

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
      variant="sidebar"
      collapsible="icon"
      // Border is drawn by the resize divider + main inset; skip the primitive's
      // `border-r` so we don't get a double seam / gap before the handle.
      className="border-r-0 transition-all duration-200 ease-in-out [&_[data-slot=sidebar-container]]:border-r-0"
    >
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
                  <PanelLeftOpen className="size-4" />
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
                    <PanelLeftClose className="h-4 w-4" />
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
                    placeholder="Search..."
                    className={cn(
                      "pl-9",
                      searchQuery.length === 0 &&
                        "caret-transparent selection:bg-transparent",
                    )}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSearchQuery("")
                    }}
                  />
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
                    <SidebarMenuButton data-tour={TOUR.createNew} className="w-full justify-start gap-2 bg-[#e4ecd9] text-[#4f5f42] hover:bg-[#d6e3c7] hover:text-[#3d4a35] dark:bg-[#3d4a35] dark:text-[#e4ecd9] dark:hover:bg-[#4f5f42] transition-colors font-semibold shadow-sm">
                      <Plus className="size-4 shrink-0" />
                      <span>Create new...</span>
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

        {/* Main Navigation - icons only when collapsed; align centered in icon mode */}
        <SidebarGroup
          className={cn(
            isIconMode && "flex flex-col items-center px-1.5 pb-1 pt-0 gap-0.5"
          )}
        >
          <SidebarGroupContent className={cn(isIconMode && "w-full flex flex-col items-center")}>
            <SidebarMenu className={cn(isIconMode && "flex w-full flex-col items-center gap-0.5")} id="tour-main-nav" data-tour={TOUR.sidebarNav}>
              {navigation.map((item) => {
                const Icon = item.icon
                const pathMatches =
                  pathname === item.href || pathname.startsWith(item.href + "/")
                const isActive = mounted && pathMatches
                // `scope` is a client-only store (empty during SSR), so gating on
                // `mounted` keeps the server and first client render identical —
                // both emit the plain Projects link — and the scoped row appears
                // only after hydration. Without this the branch flips <a>→<div>
                // and React throws a hydration mismatch.
                const isProjectItemWithScope = mounted && item.name === "Projects" && !!scope.projectId;
                const ActiveIcon = isProjectItemWithScope ? (isProjectExpanded ? FolderOpen : Folder) : Icon;

                    return (
                      <SidebarMenuItem key={item.name} data-tour={navTourKey(item.href)}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className="group transition-all duration-150 hover:bg-[color:color-mix(in_oklab,var(--background)_78%,var(--primary)_22%)] hover:text-sidebar-foreground active:scale-[0.985] active:bg-[color:color-mix(in_oklab,var(--background)_70%,var(--primary)_30%)] dark:hover:bg-sidebar-accent dark:hover:text-sidebar-accent-foreground dark:active:scale-[0.985] dark:active:bg-sidebar-accent/90 data-[active=true]:bg-transparent data-[active=true]:text-sidebar-foreground"
                        >
                          {isProjectItemWithScope && !isIconMode ? (
                            <div className="flex items-center w-full">
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setIsProjectExpanded(!isProjectExpanded);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsProjectExpanded(!isProjectExpanded);
                                  }
                                }}
                                className="shrink-0 rounded-sm hover:bg-sidebar-accent p-0.5 -ml-0.5 transition-colors cursor-pointer text-sidebar-foreground z-20"
                                aria-label={isProjectExpanded ? "Collapse project menu" : "Expand project menu"}
                              >
                                <ActiveIcon className="size-4" />
                              </div>
                              <Link
                                href={`/projects/${scope.projectId}`}
                                className="flex-1 flex items-center min-w-0 pr-6 h-full"
                              >
                                <span className={cn("truncate", isActive && "font-semibold")}>
                                  {item.name} / {scope.projectName}
                                </span>
                              </Link>
                            </div>
                          ) : (
                            <Link
                              href={(mounted && item.name === "Literature" && scope.projectId) ? `${item.href}${scope.scopedQueryString}` : item.href}
                              aria-label={isIconMode ? item.name : undefined}
                              className="flex-1 flex items-center pr-6"
                            >
                              <ActiveIcon />
                              <span className={cn(isIconMode && "hidden", "flex-1 flex items-center")}>
                                <span className={cn("truncate", isActive && "font-semibold")}>
                                  {item.name}
                                </span>
                              </span>
                            </Link>
                          )}
                        </SidebarMenuButton>

                        {isProjectItemWithScope && !isIconMode && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              scope.clearScope();
                              const url = new URL(window.location.href);
                              url.searchParams.delete("project");
                              url.searchParams.delete("experiment");
                              const target = pathname?.startsWith("/projects/") ? "/dashboard" : `${url.pathname}${url.search}`;
                              router.push(target);
                            }}
                            className="absolute right-2 top-1.5 z-10 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Clear project scope"
                            aria-label="Clear project scope"
                          >
                            <XIcon className="size-3.5" />
                          </button>
                        )}

                        {isProjectItemWithScope && !isIconMode && isProjectExpanded && (
                          <SidebarMenuSub>
                            {PROJECT_SCOPED_NAV.map((scopedItem) => {
                              const ScopedIcon = scopedItem.icon;
                              const scopedHref = `${scopedItem.basePath}${scope.scopedQueryString}`;
                              const isScopedActive = mounted && (pathname === scopedItem.basePath || pathname.startsWith(scopedItem.basePath + "/"));

                              return (
                                <SidebarMenuSubItem key={scopedItem.basePath}>
                                  <SidebarMenuSubButton asChild isActive={isScopedActive}>
                                    <Link href={scopedHref}>
                                      <ScopedIcon />
                                      <span className={cn("truncate", isScopedActive && "font-semibold")}>
                                        {scopedItem.name}
                                        {scopedItem.name === "Experiments" && scope.experimentName
                                          ? ` / ${scope.experimentName}`
                                          : ""}
                                      </span>
                                    </Link>
                                  </SidebarMenuSubButton>

                                  {scopedItem.children && scopedItem.children.length > 0 && (
                                    <SidebarMenuSub className="pl-4 pr-0 mr-0 mt-1 border-l border-border/40">
                                      {scopedItem.children.map((child) => {
                                        const ChildIcon = child.icon;
                                        const childHref = `${child.basePath}${scope.scopedQueryString}`;
                                        const childActive = mounted && (pathname === child.basePath || pathname.startsWith(child.basePath + "/"));
                                        return (
                                          <SidebarMenuSubItem key={child.basePath}>
                                            <SidebarMenuSubButton asChild isActive={childActive} size="sm">
                                              <Link href={childHref}>
                                                <ChildIcon />
                                                <span className={cn("truncate", childActive && "font-semibold")}>
                                                  {child.name}
                                                </span>
                                              </Link>
                                            </SidebarMenuSubButton>
                                          </SidebarMenuSubItem>
                                        );
                                      })}
                                    </SidebarMenuSub>
                                  )}
                                </SidebarMenuSubItem>
                              );
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
                    <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                      <span className="text-xs font-semibold">{getUserInitials()}</span>
                    </div>
                    <span
                      className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
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
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                  <span className="text-xs font-semibold">...</span>
                </div>
                <span className={cn("min-w-0 flex-1 truncate text-left text-sm font-semibold", isIconMode && "hidden")}>
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

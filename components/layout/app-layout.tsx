"use client"

import { ReactNode, Suspense, useState, useEffect, useRef, useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AppSidebar } from "./app-sidebar"
import { RightSidebar } from "./right-sidebar"
import { AppTour, requestPageHelp } from "@/components/tour/app-tour"
import { TOUR } from "@/lib/tour/anchors"
import { BreadcrumbProvider, useBreadcrumb } from "./breadcrumb-context"
import { PaperAIProvider } from "@/contexts/paper-ai-context"
import { LiteratureMentionProvider } from "@/contexts/literature-mention-context"
import { ProjectScopeProvider, useProjectScope } from "@/contexts/project-scope-context"
import { HeaderAiProvider, useHeaderAi } from "./header-ai-context"
import { Button } from "@/components/ui/button"
import { ResizeHandle } from "@/components/ui/resize-handle"
import { SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useResizable } from "@/hooks/use-resizable"
import { cn } from "@/lib/utils"
import { Menu, X, Sparkles, MessageSquare, ChevronRight, Sun, Moon, CircleHelp, Flag } from 'lucide-react'
import { PageTransition } from "./page-transition"
import { useTheme } from "next-themes"
import { useMediaQuery } from "@/hooks/use-media-query"
import { ReportIssueDialog } from "./report-issue-dialog"
import {
  CATALYST_OPEN_EVENT,
  type CatalystLaunchDetail,
} from "@/lib/catalyst-launch"
import { CatalystPanelStateProvider } from "@/contexts/catalyst-panel-state"
import {
  buildBreadcrumbsFromPathname,
  getHeaderTitleFromPath,
  resolveHeaderBreadcrumbs,
} from "@/lib/breadcrumb-from-path"

export const MOBILE_BREADCRUMB_MAX_LABEL_LENGTH = 18

export function shortenLabel(label: string, maxLen: number = MOBILE_BREADCRUMB_MAX_LABEL_LENGTH): string {
  if (label.length <= maxLen) return label
  return label.slice(0, maxLen - 1) + "…"
}

function HeaderTitle() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { segments } = useBreadcrumb()
  const { projectId, projectName, projectColor } = useProjectScope()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const scrollRef = useRef<HTMLElement>(null)
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false })

  const pageSegments = segments.filter(
    (s) => s.label !== "Dashboard" || s.href === "/dashboard",
  )
  const autoSegments = buildBreadcrumbsFromPathname(pathname ?? "", searchParams, {
    projectId,
    projectName,
  })
  const filtered = resolveHeaderBreadcrumbs(autoSegments, pageSegments)
  const fallbackTitle = getHeaderTitleFromPath(pathname ?? "")

  // When in project scope, render a small project-color dot before the breadcrumb.
  // Only show it if the first crumb is the project (avoids double-rendering).
  const showProjectDot =
    Boolean(projectId && projectColor) &&
    (filtered.length === 0 || filtered[0]?.label === projectName)
  const ProjectDot = showProjectDot ? (
    <span
      aria-hidden
      className="inline-block size-2 rounded-full shrink-0"
      style={{ background: projectColor ?? undefined }}
    />
  ) : null

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const canScrollLeft = scrollLeft > 2
    const canScrollRight = scrollLeft < scrollWidth - clientWidth - 2
    setScrollState((prev) =>
      prev.canScrollLeft !== canScrollLeft || prev.canScrollRight !== canScrollRight
        ? { canScrollLeft, canScrollRight }
        : prev
    )
  }, [])

  useEffect(() => {
    if (!isMobile || filtered.length === 0) return
    const el = scrollRef.current
    if (!el) return
    // Scroll to the right so current page (end) is visible; user can scroll left to see rest
    el.scrollLeft = el.scrollWidth - el.clientWidth
    updateScrollState()
  }, [isMobile, filtered, updateScrollState])

  useEffect(() => {
    if (!isMobile || filtered.length === 0) return
    const el = scrollRef.current
    if (!el) return
    el.addEventListener("scroll", updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollState)
      ro.disconnect()
    }
  }, [isMobile, filtered.length, updateScrollState])

  if (filtered.length === 0) {
    return (
      <h1 className="flex items-center gap-2 text-base sm:text-lg font-semibold truncate min-w-0">
        {ProjectDot}
        <span className="truncate">{fallbackTitle}</span>
      </h1>
    )
  }

  // Mobile: scrollable breadcrumb (hidden scrollbar), shortened labels, scrolled to the right by default, side gradients when scrollable
  if (isMobile) {
    const fullPathAria = filtered.map((s) => s.label).join(" › ")
    return (
      <div className="relative min-w-0 flex-1 flex">
        {scrollState.canScrollLeft && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 shrink-0 z-[1] bg-gradient-to-r from-background to-transparent"
          />
        )}
        {scrollState.canScrollRight && (
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 shrink-0 z-[1] bg-gradient-to-l from-background to-transparent"
          />
        )}
        <nav
          ref={scrollRef}
          aria-label={`Breadcrumb: ${fullPathAria}`}
          className="flex flex-nowrap items-center gap-1.5 text-sm text-muted-foreground min-w-0 flex-1 overflow-x-auto overflow-y-hidden scroll-smooth hide-scrollbar"
        >
          {ProjectDot && <span className="shrink-0">{ProjectDot}</span>}
          {filtered.map((seg, i) => (
            <span key={seg.href ?? `${seg.label}-${i}`} className="inline-flex items-center gap-1.5 shrink-0">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
              {seg.href ? (
                <Link
                  href={seg.href}
                  className="transition-colors hover:text-foreground whitespace-nowrap flex items-center gap-1.5"
                  title={seg.label}
                >
                  {seg.icon && <seg.icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />}
                  {shortenLabel(seg.label)}
                </Link>
              ) : (
                <span className="font-normal text-foreground whitespace-nowrap flex items-center gap-1.5" title={seg.label}>
                  {seg.icon && <seg.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  {shortenLabel(seg.label)}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>
    )
  }

  // Desktop: full breadcrumb path
  return (
    <nav aria-label="breadcrumb" className="flex flex-nowrap items-center gap-1.5 text-sm text-muted-foreground sm:gap-2.5 min-w-0 overflow-hidden">
      {ProjectDot}
      {filtered.map((seg, i) => (
        <span key={seg.href ?? `${seg.label}-${i}`} className="inline-flex items-center gap-1.5 shrink-0 min-w-0">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
          {seg.href ? (
            <Link href={seg.href} className="transition-colors hover:text-foreground truncate min-w-0 flex items-center gap-1.5 group">
              {seg.icon && <seg.icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />}
              <span className="truncate">{seg.label}</span>
            </Link>
          ) : (
            <span className="font-normal text-foreground truncate min-w-0 flex items-center gap-1.5">
              {seg.icon && <seg.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="truncate">{seg.label}</span>
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

interface AppLayoutProps {
  children: ReactNode
}

function MobileMenuButton() {
  const { setOpenMobile, isMobile } = useSidebar()
  if (!isMobile) return null
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      onClick={() => setOpenMobile(true)}
      aria-label="Open navigation"
    >
      <Menu className="size-4" />
    </Button>
  )
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <BreadcrumbProvider>
      <Suspense fallback={null}>
        <ProjectScopeProvider>
          <PaperAIProvider>
            <LiteratureMentionProvider>
              <HeaderAiProvider>
                <AppLayoutBody>{children}</AppLayoutBody>
              </HeaderAiProvider>
            </LiteratureMentionProvider>
          </PaperAIProvider>
        </ProjectScopeProvider>
      </Suspense>
    </BreadcrumbProvider>
  )
}

function AppLayoutBody({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { registration: headerAi } = useHeaderAi()
  const { setTheme, resolvedTheme } = useTheme()
  const [themeMounted, setThemeMounted] = useState(false)
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isTablet = useMediaQuery("(max-width: 1024px)")
  const isCatalystRoute = (pathname ?? "").startsWith("/catalyst")

  // Catalyst side-panel (right drawer). Default closed on app load; once the
  // user opens it, the state lives at the layout level so it persists across
  // route changes until they close it again.
  const [catalystOpen, setCatalystOpen] = useState(false)
  // Whether the Catalyst chat is in active use (conversation/streaming). Drives
  // the dynamic width: narrow when idle, wider once a conversation starts.
  const [catalystActive, setCatalystActive] = useState(false)
  const [catalystLaunch, setCatalystLaunch] = useState<CatalystLaunchDetail | null>(
    null,
  )

  // The right column is a single slot. When protocol-AI is registered AND open,
  // it wins; otherwise Catalyst takes the slot. Opening one closes the other.
  const protocolAiVisible = !!headerAi?.active && !!headerAi?.isOpen
  const catalystVisible = catalystOpen && !protocolAiVisible
  // Re-open compact: reset to idle width whenever the panel is hidden so it only
  // widens again once the user actually starts a conversation.
  useEffect(() => {
    if (!catalystVisible) setCatalystActive(false)
  }, [catalystVisible])

  // Smooth open/close for the (desktop) Catalyst panel — matches the left sidebar
  // and chat history: stay mounted and animate WIDTH 0 ↔ full, then unmount after
  // the close transition. `catalystRender` = in the DOM; `catalystExpanded` = the
  // animated open state.
  const [catalystRender, setCatalystRender] = useState(false)
  const [catalystExpanded, setCatalystExpanded] = useState(false)
  useEffect(() => {
    // The docked panel only ever shows off the /catalyst route. Gate the open
    // animation on the route too, so that minimising the full page lands on the
    // origin and the sidebar smoothly animates open (width 0 → full) there,
    // rather than appearing already-expanded.
    const shouldShow = catalystVisible && !isCatalystRoute
    if (shouldShow) {
      setCatalystRender(true)
      const r = requestAnimationFrame(() => setCatalystExpanded(true))
      return () => cancelAnimationFrame(r)
    }
    setCatalystExpanded(false)
    const t = setTimeout(() => setCatalystRender(false), 520)
    return () => clearTimeout(t)
  }, [catalystVisible, isCatalystRoute])

  const handleCatalystToggle = useCallback(() => {
    if (catalystVisible) {
      setCatalystOpen(false)
      return
    }
    if (headerAi?.active && headerAi.isOpen) {
      headerAi.onToggle()
    }
    setCatalystOpen(true)
  }, [catalystVisible, headerAi])

  const handleProtocolToggle = useCallback(() => {
    if (!headerAi) return
    // About to open protocol AI? Close Catalyst first so the slot is free.
    if (!headerAi.isOpen && catalystOpen) {
      setCatalystOpen(false)
    }
    headerAi.onToggle()
  }, [headerAi, catalystOpen])

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  useEffect(() => {
    setThemeMounted(true)
  }, [])

  useEffect(() => {
    const openCatalystFromEvent = (event: Event) => {
      const detail =
        (event as CustomEvent<CatalystLaunchDetail>).detail ?? ({} as CatalystLaunchDetail)

      // On /catalyst, opening normally just re-seeds the full page. But a "dock"
      // request (minimize → sidebar) must open the docked panel; we set state
      // here and let the caller navigate away from /catalyst so it appears.
      if ((pathname ?? "").startsWith("/catalyst") && !detail.dock) {
        const params = new URLSearchParams()
        if (detail.query) params.set("q", detail.query)
        if (detail.scope) params.set("scope", detail.scope)
        if (detail.projectId) params.set("project", detail.projectId)
        const qs = params.toString()
        router.push(qs ? `/catalyst?${qs}` : "/catalyst")
        return
      }

      if (headerAi?.active && headerAi.isOpen) {
        headerAi.onToggle()
      }
      setCatalystLaunch(detail)
      setCatalystOpen(true)
    }

    const openCatalystPanelOnly = () => {
      openCatalystFromEvent(new CustomEvent(CATALYST_OPEN_EVENT, { detail: {} }))
    }

    window.addEventListener(CATALYST_OPEN_EVENT, openCatalystFromEvent)
    window.addEventListener("notes9:tour-open-ai-sidebar", openCatalystPanelOnly)

    return () => {
      window.removeEventListener(CATALYST_OPEN_EVENT, openCatalystFromEvent)
      window.removeEventListener("notes9:tour-open-ai-sidebar", openCatalystPanelOnly)
    }
  }, [pathname, router, headerAi])

  // Left sidebar: open/collapsed drives column width; when open, width is resizable. Start open (expanded) so sidebar comes open when the app loads.
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // When switching to mobile, ensure the sidebar is in expanded (open) mode
  // so the Sheet overlay shows full content instead of the collapsed icon-only
  // view. Only fires on the isMobile transition — `sidebarOpen` deliberately
  // stays out of the deps so user-initiated closes aren't immediately undone.
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen((current) => (current ? current : true))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile])
  const leftSidebar = useResizable({
    initialWidth: isMobile ? 0 : isTablet ? 240 : 280,
    minWidth: 200,
    maxWidth: 400,
    direction: 'left',
  })
  /** Must match `--sidebar-width-icon` (3rem) so the icon rail fills the column with no dead space */
  const collapsedSidebarWidthPx = 48
  const leftColumnWidth = sidebarOpen ? leftSidebar.width : collapsedSidebarWidthPx
  const showLeftResizeHandle =
    sidebarOpen && leftSidebar.width > collapsedSidebarWidthPx

  const rightSidebar = useResizable({
    initialWidth: isTablet ? 400 : 460,
    minWidth: 260,
    maxWidth: 600,
    direction: 'right',
    // `:v2` discards any width auto-saved by the earlier (buggy) persistence
    // that pinned the sidebar to its old default.
    persistKey: 'notes9:catalyst-sidebar-width:v2',
  })

  // The Catalyst panel is freely resizable (drag handle) at all times; its width
  // is the persisted, user-set value.
  const catalystWidth = rightSidebar.width

  // Once a real conversation starts, widen the docked Catalyst sidebar for
  // comfortable reading — but only upward, and ephemerally (never persisted), so
  // it can't override a narrower width the user has deliberately dragged later.
  const chatActiveWidth = isTablet ? 460 : 540
  useEffect(() => {
    const onChatActive = (e: Event) => {
      const active = (e as CustomEvent<{ active: boolean }>).detail?.active
      if (!active) return
      rightSidebar.setWidth((prev) => (prev < chatActiveWidth ? chatActiveWidth : prev))
    }
    window.addEventListener('notes9:catalyst-chat-active', onChatActive as EventListener)
    return () =>
      window.removeEventListener('notes9:catalyst-chat-active', onChatActive as EventListener)
    // setWidth is a stable useState setter; chatActiveWidth covers the tablet flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActiveWidth])

  return (
    <>
      <SidebarProvider defaultOpen={!isMobile} open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppTour />
        <div
        className="flex h-screen w-full gap-0 overflow-hidden bg-background"
        style={{
          '--sidebar-width': `${leftColumnWidth}px`,
          '--sidebar-width-icon': '3rem',
        } as React.CSSProperties}
      >
        {/* Left Sidebar - Desktop: inline resizable panel, Mobile: uses Sidebar's built-in Sheet */}
        {!isMobile ? (
          <div className="flex h-full min-h-0 shrink-0">
            <div
              data-sidebar-container
              data-resizing={leftSidebar.isResizing ? 'true' : undefined}
              className={cn(
                // Soft right-edge shadow lifts the sidebar above the content for
                // a modern, layered separation.
                "relative z-10 h-full min-h-0 shrink-0 overflow-hidden shadow-[6px_0_24px_-16px_rgba(20,14,8,0.28)] dark:shadow-[6px_0_28px_-14px_rgba(0,0,0,0.55)]",
                "data-[resizing=true]:[&_[data-slot=sidebar-gap]]:!transition-none",
                "data-[resizing=true]:[&_[data-slot=sidebar-container]]:!transition-none"
              )}
              style={{
                '--sidebar-width': `${leftColumnWidth}px`,
                width: leftColumnWidth,
                // Slow, refined open/close (matches the inner sidebar animation);
                // 1:1 with the cursor mid-drag.
                transition: leftSidebar.isResizing ? 'none' : 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
              } as React.CSSProperties}
            >
              <AppSidebar />
            </div>
            {showLeftResizeHandle && (
              <ResizeHandle
                onMouseDown={leftSidebar.handleMouseDown}
                isResizing={leftSidebar.isResizing}
                position="right"
                className="z-[121]"
              />
            )}
          </div>
        ) : (
          /* On mobile, AppSidebar renders its own Sheet overlay via the Sidebar component */
          <AppSidebar />
        )}

          <SidebarInset
            className={cn(
              "flex min-w-0 flex-1 flex-col overflow-hidden",
              !isMobile && !showLeftResizeHandle && "border-l border-border",
            )}
          >
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
            >
              Skip to main content
            </a>
            {!isCatalystRoute && (
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-[color:var(--glass-border)] bg-[color:var(--n9-header-bg)]/70 px-3 backdrop-blur-xl saturate-[1.4] sm:h-14 sm:px-4">
              <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                <MobileMenuButton />
                <div className="min-w-0 flex-1 truncate">
                  <Suspense
                    fallback={
                      <h1 className="flex min-w-0 items-center gap-2 truncate text-base font-semibold sm:text-lg">
                        <span className="truncate">Notes9</span>
                      </h1>
                    }
                  >
                    <HeaderTitle />
                  </Suspense>
                </div>
              </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <ReportIssueDialog />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-tour={TOUR.help}
                className="size-8 sm:size-9 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  requestPageHelp(
                    (pathname ?? "/dashboard") +
                      (typeof window !== "undefined" ? window.location.search : ""),
                  )
                }
                aria-label="Help: tour this page"
                title="Help: take a quick tour of this page"
              >
                <CircleHelp className="size-4" />
              </Button>
              {/* Theme toggle: one click toggles dark ↔ light (client-only to avoid hydration mismatch) */}
              <Button
                id="tour-theme-toggle"
                data-tour={TOUR.themeToggle}
                variant="ghost"
                size="icon"
                className="size-8 sm:size-9"
                onClick={toggleTheme}
                aria-label={themeMounted && resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {!themeMounted ? (
                  <Moon className="size-4" />
                ) : resolvedTheme === "dark" ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </Button>
              {/* Divider: utility icons (report / help / theme) on the left,
                  the AI actions grouped separately on the right. */}
              <div className="mx-1 h-5 w-px shrink-0 self-center bg-border/50" aria-hidden />
              {headerAi?.active ? (
                  <Button
                    type="button"
                    variant={headerAi.isOpen ? "secondary" : "ghost"}
                    size="icon"
                    className="size-8 sm:size-9"
                    onClick={handleProtocolToggle}
                    aria-label={headerAi.ariaLabel ?? "Toggle protocol AI"}
                    title={headerAi.title ?? "Toggle protocol AI"}
                  >
                    <Sparkles className="size-4" />
                  </Button>
                ) : null}
              <Button
                id="tour-ai-toggle"
                data-tour={TOUR.aiToggle}
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 shrink-0 text-primary ring-1 ring-inset ring-[color:var(--primary)]/25 transition-colors hover:text-primary sm:size-9",
                  catalystVisible
                    ? "bg-[color:var(--primary)]/20 hover:bg-[color:var(--primary)]/24"
                    : "bg-[color:var(--primary)]/[0.08] hover:bg-[color:var(--primary)]/15",
                )}
                onClick={handleCatalystToggle}
                aria-label={catalystVisible ? "Close Catalyst" : "Ask Catalyst"}
                title={catalystVisible ? "Close Catalyst" : "Ask Catalyst"}
              >
                {/* MessageSquare (not Sparkles) so this stays visually distinct
                    when the protocol-AI Sparkles button also appears next to it. */}
                <MessageSquare className="size-4" />
              </Button>
            </div>
          </header>
            )}

          <main
            id="main"
            className={cn(
              "flex min-h-0 flex-1 flex-col min-w-0",
              isCatalystRoute
                ? "overflow-hidden p-0"
                : "overflow-auto p-3 sm:p-4 md:p-6"
            )}
          >
            {/* h-full lets nested routes use h-full / percentage heights reliably (e.g. protocol design mode) */}
            <CatalystPanelStateProvider isOpen={catalystVisible}>
              <PageTransition>{children}</PageTransition>
            </CatalystPanelStateProvider>
          </main>
        </SidebarInset>

        {/* Right Sidebar - Sheet on mobile, panel on desktop.
            One slot, two possible occupants: protocol-AI (when registered &
            open) takes priority; otherwise Catalyst when the user has opened
            it from the header.
            Suppressed entirely on /catalyst — the route already mounts the
            same RightSidebar as the page, so a second instance here would
            duplicate the chat. */}
        {isCatalystRoute ? null : protocolAiVisible ? (
          isMobile ? (
            <Sheet open={headerAi!.isOpen} onOpenChange={(open) => { if (!open && headerAi!.isOpen) headerAi!.onToggle() }}>
              <SheetContent
                side="right"
                showCloseButton={false}
                overlayClassName="z-[120]"
                className="z-[120] flex h-full max-h-dvh min-h-0 w-full max-w-full flex-col gap-0 overflow-hidden p-0 data-[state=open]:duration-300 data-[state=closed]:duration-200"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Protocol AI</SheetTitle>
                </SheetHeader>
                {headerAi!.panel}
              </SheetContent>
            </Sheet>
          ) : (
            <div className="relative z-[120] flex h-full min-h-0 shrink-0 animate-in fade-in slide-in-from-right-6 duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
              <ResizeHandle
                onMouseDown={rightSidebar.handleMouseDown}
                isResizing={rightSidebar.isResizing}
                position="left"
              />
              <div
                className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-border"
                style={{ width: rightSidebar.width, minWidth: 0 }}
              >
                {headerAi!.panel}
              </div>
            </div>
          )
        ) : isMobile ? (
          catalystVisible ? (
            <Sheet open onOpenChange={(open) => { if (!open) setCatalystOpen(false) }}>
              <SheetContent
                side="right"
                showCloseButton={false}
                overlayClassName="z-[120]"
                className="z-[120] flex h-full max-h-dvh min-h-0 w-full max-w-full flex-col gap-0 overflow-hidden p-0 data-[state=open]:duration-300 data-[state=closed]:duration-200"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Catalyst</SheetTitle>
                </SheetHeader>
                <RightSidebar
                  onClose={() => setCatalystOpen(false)}
                  pendingLaunch={catalystLaunch}
                  onPendingLaunchConsumed={() => setCatalystLaunch(null)}
                  onActiveChange={setCatalystActive}
                />
              </SheetContent>
            </Sheet>
          ) : null
        ) : catalystRender ? (
          // Desktop: stays mounted and animates WIDTH 0 ↔ full (same refined
          // curve as the other sidebars), so open/close is fluid, not a pop.
          <div className="relative z-[120] flex h-full min-h-0 shrink-0">
            {catalystExpanded && (
              <ResizeHandle
                onMouseDown={rightSidebar.handleMouseDown}
                isResizing={rightSidebar.isResizing}
                position="left"
              />
            )}
            <div
              className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border shadow-[-8px_0_28px_-16px_rgba(20,14,8,0.32)] dark:shadow-[-10px_0_32px_-14px_rgba(0,0,0,0.6)]"
              style={{
                width: catalystExpanded ? catalystWidth : 0,
                minWidth: 0,
                transition: rightSidebar.isResizing
                  ? 'none'
                  : 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {/* Fixed-width content so it's clipped (not reflowed) during the
                  width animation. */}
              <div
                className="flex h-full min-h-0 min-w-0 flex-col"
                style={{ width: catalystWidth }}
              >
                <RightSidebar
                  onClose={() => setCatalystOpen(false)}
                  pendingLaunch={catalystLaunch}
                  onPendingLaunchConsumed={() => setCatalystLaunch(null)}
                  onActiveChange={setCatalystActive}
                />
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </SidebarProvider>
    </>
  )
}

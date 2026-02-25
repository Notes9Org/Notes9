"use client"

import { ReactNode, useState, useEffect, useRef, useCallback } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { AppSidebar } from "./app-sidebar"
import { RightSidebar } from "./right-sidebar"
import { BreadcrumbProvider, useBreadcrumb } from "./breadcrumb-context"
import { Button } from "@/components/ui/button"
import { ResizeHandle } from "@/components/ui/resize-handle"
import { SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useResizable } from "@/hooks/use-resizable"
import { Menu, X, Sparkles, ChevronRight, Sun, Moon } from 'lucide-react'
import { useTheme } from "next-themes"
import { useMediaQuery } from "@/hooks/use-media-query"

const ROUTE_TITLES: { path: string; title: string }[] = [
  { path: "/dashboard", title: "Dashboard" },
  { path: "/projects", title: "Projects" },
  { path: "/experiments", title: "Experiments" },
  { path: "/lab-notes", title: "Lab Notes" },
  { path: "/samples", title: "Samples" },
  { path: "/equipment", title: "Equipment" },
  { path: "/protocols", title: "Protocols" },
  { path: "/literature-reviews", title: "Literature" },
  { path: "/settings", title: "Settings" },
  { path: "/", title: "Dashboard" },
]

function getHeaderTitle(pathname: string): string {
  if (!pathname) return "Notes9"
  for (const { path, title } of ROUTE_TITLES) {
    if (path === pathname || (path !== "/" && pathname.startsWith(path + "/"))) return title
  }
  return "Notes9"
}

const MOBILE_BREADCRUMB_MAX_LABEL_LENGTH = 18

function shortenLabel(label: string, maxLen: number = MOBILE_BREADCRUMB_MAX_LABEL_LENGTH): string {
  if (label.length <= maxLen) return label
  return label.slice(0, maxLen - 1) + "…"
}

function HeaderTitle() {
  const pathname = usePathname()
  const { segments } = useBreadcrumb()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const scrollRef = useRef<HTMLElement>(null)
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false })
  const fallbackTitle = getHeaderTitle(pathname ?? "")

  const filtered = segments.filter((s) => s.label !== "Dashboard")

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
      <h1 className="text-base sm:text-lg font-semibold truncate min-w-0">
        {fallbackTitle}
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
          {filtered.map((seg, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 shrink-0">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
              {seg.href ? (
                <Link
                  href={seg.href}
                  className="transition-colors hover:text-foreground whitespace-nowrap"
                  title={seg.label}
                >
                  {shortenLabel(seg.label)}
                </Link>
              ) : (
                <span className="font-normal text-foreground whitespace-nowrap" title={seg.label}>
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
      {filtered.map((seg, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 shrink-0 min-w-0">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
          {seg.href ? (
            <Link href={seg.href} className="transition-colors hover:text-foreground truncate min-w-0 block">
              {seg.label}
            </Link>
          ) : (
            <span className="font-normal text-foreground truncate min-w-0 block">{seg.label}</span>
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
  const { setTheme, resolvedTheme } = useTheme()
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [themeMounted, setThemeMounted] = useState(false)
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isTablet = useMediaQuery("(max-width: 1024px)")

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  useEffect(() => {
    setThemeMounted(true)
  }, [])

  // Close right sidebar on mobile by default
  useEffect(() => {
    if (isMobile) {
      setRightSidebarOpen(false)
    }
  }, [isMobile])

  // Left sidebar: open/collapsed drives column width; when open, width is resizable. Start open (expanded) so sidebar comes open when the app loads.
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // When switching to mobile, ensure the sidebar is in expanded (open) mode
  // so the Sheet overlay shows full content instead of the collapsed icon-only view
  useEffect(() => {
    if (isMobile && !sidebarOpen) {
      setSidebarOpen(true)
    }
  }, [isMobile, sidebarOpen])
  const leftSidebar = useResizable({
    initialWidth: isMobile ? 0 : isTablet ? 240 : 280,
    minWidth: 200,
    maxWidth: 400,
    direction: 'left',
  })
  const leftColumnWidth = sidebarOpen ? leftSidebar.width : 64

  // Right sidebar resizing
  const rightSidebar = useResizable({
    initialWidth: isTablet ? 280 : 320,
    minWidth: 240,
    maxWidth: 480,
    direction: 'right',
  })

  return (
    <BreadcrumbProvider>
      <SidebarProvider defaultOpen={!isMobile} open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <div
        className="flex h-screen w-full overflow-hidden bg-background"
        style={{
          '--sidebar-width': `${leftColumnWidth}px`,
          '--sidebar-width-icon': '3rem',
        } as React.CSSProperties}
      >
        {/* Left Sidebar - Desktop: inline resizable panel, Mobile: uses Sidebar's built-in Sheet */}
        {!isMobile ? (
          <div className="flex shrink-0 h-full min-h-0">
            <div
              data-sidebar-container
              data-resizing={leftSidebar.isResizing ? 'true' : undefined}
              className="h-full min-h-0 shrink-0 overflow-hidden"
              style={{
                '--sidebar-width': `${leftColumnWidth}px`,
                width: leftColumnWidth,
                transition: leftSidebar.isResizing ? 'none' : 'width 0.2s ease-out',
              } as React.CSSProperties}
            >
              <AppSidebar />
            </div>
            {sidebarOpen && leftSidebar.width > 64 && (
              <ResizeHandle
                onMouseDown={leftSidebar.handleMouseDown}
                isResizing={leftSidebar.isResizing}
                position="right"
                className="z-10 shrink-0"
              />
            )}
          </div>
        ) : (
          /* On mobile, AppSidebar renders its own Sheet overlay via the Sidebar component */
          <AppSidebar />
        )}

        {/* Main Content Area */}
        <SidebarInset className="flex flex-col overflow-hidden flex-1 min-w-0">
          {/* Top Bar */}
          <header className="h-12 sm:h-14 border-b border-border flex items-center justify-between px-3 sm:px-4 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
              {/* Hamburger menu for mobile - uses sidebar context */}
              <MobileMenuButton />
              <div className="min-w-0 flex-1 truncate">
                <HeaderTitle />
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Theme toggle: one click toggles dark ↔ light (client-only to avoid hydration mismatch) */}
              <Button
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
              {/* AI / Right sidebar toggle */}
                {!rightSidebarOpen && (
                  <Button
                    variant={rightSidebarOpen ? "default" : "ghost"}
                    size="icon"
                    className="size-8 sm:size-9"
                    onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
                  >
                    <Sparkles className="size-4" />
                  </Button>
                )}
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 min-w-0">
            <div className="w-full min-w-0">
              {children}
            </div>
          </main>
        </SidebarInset>

        {/* Right Sidebar - Sheet on mobile, panel on desktop */}
        {isMobile ? (
          <Sheet open={rightSidebarOpen} onOpenChange={setRightSidebarOpen}>
            <SheetContent
              side="right"
              className="w-full max-w-full p-0 data-[state=open]:duration-300 data-[state=closed]:duration-200"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>AI Assistant</SheetTitle>
              </SheetHeader>
              <RightSidebar onClose={() => setRightSidebarOpen(false)} />
            </SheetContent>
          </Sheet>
        ) : (
          rightSidebarOpen && (
            <div className="flex shrink-0 h-full min-h-0">
              <ResizeHandle
                onMouseDown={rightSidebar.handleMouseDown}
                isResizing={rightSidebar.isResizing}
                position="left"
              />
              <div
                className="border-l border-border overflow-hidden h-full min-h-0 flex flex-col"
                style={{ width: rightSidebar.width, minWidth: 0 }}
              >
                <RightSidebar onClose={() => setRightSidebarOpen(false)} />
              </div>
            </div>
          )
        )}
        </div>
      </SidebarProvider>
    </BreadcrumbProvider>
  )
}
"use client"

import { ReactNode, useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "./app-sidebar"
import { RightSidebar } from "./right-sidebar"
import { Button } from "@/components/ui/button"
import { ResizeHandle } from "@/components/ui/resize-handle"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useResizable } from "@/hooks/use-resizable"
import { Menu, X, Sparkles } from 'lucide-react'
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

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isTablet = useMediaQuery("(max-width: 1024px)")
  const headerTitle = getHeaderTitle(pathname ?? "")

  // Close right sidebar on mobile by default
  useEffect(() => {
    if (isMobile) {
      setRightSidebarOpen(false)
    }
  }, [isMobile])

  // Left sidebar resizing — same as right sidecar: user drags handle left/right to set width
  const leftSidebar = useResizable({
    initialWidth: isMobile ? 0 : isTablet ? 240 : 280,
    minWidth: 200,
    maxWidth: 400,
    direction: 'left', // handle on right edge: drag right = narrower, drag left = wider
  })
  useEffect(() => {
    const handler = (e: Event) => {
      const w = (e as CustomEvent<{ width: number }>).detail?.width
      if (typeof w === 'number') leftSidebar.setWidth(w)
    }
    window.addEventListener('sidebar-width-change', handler)
    return () => window.removeEventListener('sidebar-width-change', handler)
  }, [leftSidebar.setWidth])

  // Right sidebar resizing
  const rightSidebar = useResizable({
    initialWidth: isTablet ? 280 : 320,
    minWidth: 240,
    maxWidth: 480,
    direction: 'right',
  })

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div
        className="flex h-screen w-full overflow-hidden bg-background"
        style={{
          '--sidebar-width': `${leftSidebar.width}px`,
          '--sidebar-width-icon': '3rem',
        } as React.CSSProperties}
      >
        {/* Left Sidebar - resizable; width drives fixed panel and main content */}
        {!isMobile && (
          <div className="flex shrink-0 h-full min-h-0">
            <div
              data-sidebar-container
              data-resizing={leftSidebar.isResizing ? 'true' : undefined}
              className="h-full min-h-0 shrink-0 overflow-hidden"
              style={{
                '--sidebar-width': `${leftSidebar.width}px`,
                width: leftSidebar.width,
                transition: leftSidebar.isResizing ? 'none' : 'width 0.2s ease-out',
              } as React.CSSProperties}
            >
              <AppSidebar />
            </div>
            {leftSidebar.width > 64 && (
              <ResizeHandle
                onMouseDown={leftSidebar.handleMouseDown}
                isResizing={leftSidebar.isResizing}
                position="right"
                className="z-10 shrink-0"
              />
            )}
          </div>
        )}

        {/* Main Content Area */}
        <SidebarInset className="flex flex-col overflow-hidden flex-1 min-w-0">
          {/* Top Bar */}
          <header className="h-12 sm:h-14 border-b border-border flex items-center justify-between px-3 sm:px-4 shrink-0">
            <h1 className="text-base sm:text-lg font-semibold truncate min-w-0">{headerTitle}</h1>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Mobile: Show AI button with icon */}
              <Button
                variant={rightSidebarOpen ? "secondary" : "ghost"}
                size="icon"
                className="size-8 sm:size-9"
                onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              >
                {rightSidebarOpen ? (
                  <X className="size-4" />
                ) : (
                  <Sparkles className="size-4" />
                )}
              </Button>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
            <div className="w-full">
              {children}
            </div>
          </main>
        </SidebarInset>

        {/* Right Sidebar - Sheet on mobile, panel on desktop */}
        {isMobile ? (
          <Sheet open={rightSidebarOpen} onOpenChange={setRightSidebarOpen}>
            <SheetContent side="right" className="w-full sm:w-[340px] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>AI Assistant</SheetTitle>
              </SheetHeader>
              <RightSidebar />
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
                <RightSidebar />
              </div>
            </div>
          )
        )}
      </div>
    </SidebarProvider>
  )
}
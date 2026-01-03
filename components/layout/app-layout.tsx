"use client"

import { ReactNode, useState, useEffect } from "react"
import Image from "next/image"
import { AppSidebar } from "./app-sidebar"
import { RightSidebar } from "./right-sidebar"
import { Button } from "@/components/ui/button"
import { ResizeHandle } from "@/components/ui/resize-handle"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useResizable } from "@/hooks/use-resizable"
import { Menu, X, Sparkles } from 'lucide-react'
import { useMediaQuery } from "@/hooks/use-media-query"

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isTablet = useMediaQuery("(max-width: 1024px)")
  
  // Close right sidebar on mobile by default
  useEffect(() => {
    if (isMobile) {
      setRightSidebarOpen(false)
    }
  }, [isMobile])
  
  // Left sidebar resizing
  const leftSidebar = useResizable({
    initialWidth: isMobile ? 0 : isTablet ? 240 : 280,
    minWidth: 200,
    maxWidth: 400,
  })
  
  // Right sidebar resizing
  const rightSidebar = useResizable({
    initialWidth: isTablet ? 280 : 320,
    minWidth: 240,
    maxWidth: 480,
    direction: 'right',
  })

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        {/* Left Sidebar - Hidden on mobile, shown via SidebarProvider */}
        {!isMobile && (
          <div className="flex shrink-0">
            <div 
              style={{ 
                '--sidebar-width': `${leftSidebar.width}px`,
                width: leftSidebar.width 
              } as React.CSSProperties}
            >
              <AppSidebar />
            </div>
            <ResizeHandle
              onMouseDown={leftSidebar.handleMouseDown}
              isResizing={leftSidebar.isResizing}
              position="right"
            />
          </div>
        )}

        {/* Main Content Area */}
        <SidebarInset className="flex flex-col overflow-hidden flex-1 min-w-0">
          {/* Top Bar */}
          <header className="h-12 sm:h-14 border-b border-border flex items-center justify-between px-3 sm:px-4 shrink-0">
            <div className="flex items-center gap-2">
              <Image src="/notes9-logo.png" alt="Notes9" width={24} height={24} />
              <h1 className="text-base sm:text-lg font-semibold">Notes9</h1>
            </div>
          
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
            {children}
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
            <div className="flex shrink-0">
              <ResizeHandle
                onMouseDown={rightSidebar.handleMouseDown}
                isResizing={rightSidebar.isResizing}
                position="left"
              />
              <div
                className="border-l border-border overflow-hidden"
                style={{ width: rightSidebar.width }}
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

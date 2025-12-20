"use client"

import { ReactNode, useState } from "react"
import Image from "next/image"
import { AppSidebar } from "./app-sidebar"
import { RightSidebar } from "./right-sidebar"
import { Button } from "@/components/ui/button"
import { ResizeHandle } from "@/components/ui/resize-handle"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { useResizable } from "@/hooks/use-resizable"
import { Menu, X } from 'lucide-react'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  
  // Left sidebar resizing
  const leftSidebar = useResizable({
    initialWidth: 280, // Default sidebar width
    minWidth: 200,
    maxWidth: 400,
  })
  
  // Right sidebar resizing
  const rightSidebar = useResizable({
    initialWidth: 320, // 80 * 4 (w-80 in Tailwind)
    minWidth: 240,
    maxWidth: 480,
    direction: 'right', // Invert drag behavior for right sidebar
  })

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        {/* Left Sidebar - Projects/Navigation */}
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

      {/* Main Content Area */}
        <SidebarInset className="flex flex-col overflow-hidden">
        {/* Top Bar */}
          <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <Image src="/notes9-logo.png" alt="Notes9" width={24} height={24} />
              <h1 className="text-lg font-semibold">Notes9</h1>
            </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            >
              {rightSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
        </SidebarInset>

      {/* Right Sidebar - AI Assistant & Quick Actions */}
      {rightSidebarOpen && (
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
      )}
    </div>
    </SidebarProvider>
  )
}

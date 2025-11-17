"use client"

import { ReactNode, useState } from "react"
import { AppSidebar } from "./app-sidebar"
import { RightSidebar } from "./right-sidebar"
import { Button } from "@/components/ui/button"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Menu, X } from 'lucide-react'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left Sidebar - Projects/Navigation */}
        <AppSidebar />

      {/* Main Content Area */}
        <SidebarInset className="flex flex-col overflow-hidden">
        {/* Top Bar */}
          <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
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
      <div
        className={`${
          rightSidebarOpen ? "w-80" : "w-0"
          } transition-all duration-300 border-l border-border overflow-hidden shrink-0`}
      >
        <RightSidebar />
      </div>
    </div>
    </SidebarProvider>
  )
}

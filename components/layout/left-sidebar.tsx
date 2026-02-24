"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Home, Folder, FlaskConical, TestTube, Microscope, FileText, BarChart3, Settings, Search, Plus, ChevronRight, X } from 'lucide-react'
import { cn } from "@/lib/utils"

interface LeftSidebarProps {
  onClose: () => void
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Projects", href: "/projects", icon: Folder },
  { name: "Experiments", href: "/experiments", icon: FlaskConical },
  { name: "Lab Notes", href: "/lab-notes", icon: FileText },
  { name: "Samples", href: "/samples", icon: TestTube },
  { name: "Equipment", href: "/equipment", icon: Microscope },
  { name: "Protocols", href: "/protocols", icon: FileText },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
]

const dummyProjects = [
  { id: "1", name: "Cancer Drug Discovery Initiative", status: "active" },
  { id: "2", name: "Protein Structure Elucidation", status: "active" },
  { id: "3", name: "Gene Expression Analysis", status: "planning" },
]

export function LeftSidebar({ onClose }: LeftSidebarProps) {
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedProjects, setExpandedProjects] = useState(true)

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Sidebar Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4">
        <h2 className="font-semibold text-sm text-foreground">LIMS Workspace</h2>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-8 h-9 bg-background text-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {/* Main Navigation */}
        <div className="py-2">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link key={item.name} href={item.href}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-3 px-3 h-9 font-normal text-foreground",
                    isActive && "bg-secondary text-secondary-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Button>
              </Link>
            )
          })}
        </div>

        {/* Projects Section */}
        <div className="mt-4 border-t border-border">
          <div className="px-3 py-2">
            <Button
              variant="ghost"
              className="w-full justify-between h-8 px-2 font-semibold text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpandedProjects(!expandedProjects)}
            >
              <span>ACTIVE PROJECTS</span>
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform",
                  expandedProjects && "transform rotate-90"
                )}
              />
            </Button>
          </div>

          {expandedProjects && (
            <div className="space-y-0.5 px-2">
              {dummyProjects.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-8 px-2 font-normal text-sm text-foreground hover:text-foreground"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full",
                          project.status === "active" ? "bg-success" : "bg-warning"
                        )}
                      />
                      <span className="truncate">{project.name}</span>
                    </div>
                  </Button>
                </Link>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-border">
        <Button className="w-full gap-2" size="sm" asChild>
          <Link href="/projects/new">
            <Plus className="h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from 'next/navigation'
import Image from "next/image"
import {
  Home,
  Folder,
  FlaskConical,
  TestTube,
  Wrench,
  FileText,
  BarChart3,
  Settings,
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  User2,
  MoreHorizontal,
  Package,
  Users,
  BookOpen,
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarRail,
  SidebarMenuSkeleton,
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
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Projects", href: "/projects", icon: Folder },
  { name: "Experiments", href: "/experiments", icon: FlaskConical },
  { name: "Samples", href: "/samples", icon: TestTube },
  { name: "Equipment", href: "/equipment", icon: Wrench },
  { name: "Protocols", href: "/protocols", icon: FileText },
  { name: "Literature", href: "/literature-reviews", icon: BookOpen },
  { name: "Reports", href: "/reports", icon: BarChart3 },
]

interface Project {
  id: string
  name: string
  status: string
  experiment_count?: number
}

interface User {
  email: string
  user_metadata: {
    first_name?: string
    last_name?: string
    full_name?: string
  }
}

interface Counts {
  projects: number
  experiments: number
  samples: number
  literature: number
}

export function AppSidebar() {
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = useState("")
  const [projects, setProjects] = useState<Project[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [counts, setCounts] = useState<Counts>({ projects: 0, experiments: 0, samples: 0, literature: 0 })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        // Get current user
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        setUser(currentUser as User)

        if (!currentUser) {
          setLoading(false)
          return
        }

        // Fetch active projects with experiment counts
        const { data: projectsData, error: projectsError } = await supabase
          .from("projects")
          .select(`
            id,
            name,
            status,
            experiments:experiments(count)
          `)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(10)

        if (projectsError) {
          console.error("Error fetching projects:", projectsError)
          toast.error("Failed to load projects")
        } else {
          const formattedProjects = projectsData?.map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            experiment_count: Array.isArray(p.experiments) ? p.experiments.length : (p.experiments as any)?.count || 0
          })) || []
          setProjects(formattedProjects)
        }

        // Fetch counts for badges
        const [
          { count: projectCount },
          { count: experimentCount },
          { count: sampleCount },
          { count: literatureCount }
        ] = await Promise.all([
          supabase.from("projects").select("*", { count: "exact", head: true }),
          supabase.from("experiments").select("*", { count: "exact", head: true }),
          supabase.from("samples").select("*", { count: "exact", head: true }),
          supabase.from("literature_reviews").select("*", { count: "exact", head: true })
        ])

        setCounts({
          projects: projectCount || 0,
          experiments: experimentCount || 0,
          samples: sampleCount || 0,
          literature: literatureCount || 0
        })

      } catch (error) {
        console.error("Error loading sidebar data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Subscribe to real-time updates for projects
    const channel = supabase
      .channel('sidebar-projects')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = "/"
  }

  const getUserInitials = () => {
    if (!user) return "U"
    const firstName = user.user_metadata?.first_name || ""
    const lastName = user.user_metadata?.last_name || ""
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase()
    }
    return user.email?.[0]?.toUpperCase() || "U"
  }

  const getUserDisplayName = () => {
    if (!user) return "User"
    return user.user_metadata?.full_name || 
           (user.user_metadata?.first_name && user.user_metadata?.last_name 
             ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
             : user.email?.split("@")[0] || "User")
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      {/* Header with Workspace Dropdown */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-2">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg group-data-[collapsible=icon]:size-8">
                <Image
                  src="/notes9-logo.png"
                  alt="Notes9"
                  width={32}
                  height={32}
                  className="size-8"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">Notes9</span>
                <span className="truncate text-xs">Research Lab</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Search - Hidden in icon mode */}
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupContent className="relative px-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
            <SidebarInput
              placeholder="Search..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                
                // Only show badge for these items and only if count > 0
                let badge: number | null = null
                if (item.name === "Projects" && counts.projects > 0) {
                  badge = counts.projects
                } else if (item.name === "Experiments" && counts.experiments > 0) {
                  badge = counts.experiments
                } else if (item.name === "Samples" && counts.samples > 0) {
                  badge = counts.samples
                } else if (item.name === "Literature" && counts.literature > 0) {
                  badge = counts.literature
                }
                
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge !== null && (
                      <SidebarMenuBadge>{badge}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

        {/* Projects Section with Collapsible - Hidden in icon mode */}
        <Collapsible defaultOpen={true} className="group/collapsible group-data-[collapsible=icon]:hidden">
          <SidebarGroup>
            <div className="flex items-center justify-between px-2 py-1">
              <CollapsibleTrigger
                className="flex flex-1 items-center gap-2 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                <span>Active Projects</span>
                <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
              <button
                title="Add Project"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.location.href = "/projects/new"
                }}
                className="flex size-5 items-center justify-center rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Plus className="size-4" />
                <span className="sr-only">Add Project</span>
              </button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {loading ? (
                    // Loading skeleton
                    Array.from({ length: 3 }).map((_, index) => (
                      <SidebarMenuItem key={index}>
                        <SidebarMenuSkeleton showIcon />
                      </SidebarMenuItem>
                    ))
                  ) : projects.length === 0 ? (
                    <SidebarMenuItem>
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        No active projects
                      </div>
                    </SidebarMenuItem>
                  ) : (
                    projects.map((project) => (
                      <SidebarMenuItem key={project.id}>
                        <SidebarMenuButton asChild isActive={pathname === `/projects/${project.id}`} tooltip={project.name}>
                          <Link href={`/projects/${project.id}`}>
                            <div
                              className={cn(
                                "size-2 rounded-full shrink-0",
                                project.status === "active" ? "bg-green-500" : "bg-yellow-500"
                              )}
                            />
                            <span className="truncate">{project.name}</span>
                          </Link>
                        </SidebarMenuButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction showOnHover>
                              <MoreHorizontal />
                              <span className="sr-only">More</span>
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            className="w-48 rounded-lg"
                            side="right"
                            align="start"
                          >
                            <DropdownMenuItem onClick={() => window.location.href = `/projects/${project.id}`}>
                              View Project
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.location.href = `/experiments/new?project=${project.id}`}>
                              New Experiment
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={async (e) => {
                                e.preventDefault()
                                if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
                                  try {
                                    const { error } = await supabase
                                      .from("projects")
                                      .delete()
                                      .eq("id", project.id)
                                    
                                    if (error) {
                                      toast.error("Failed to delete project")
                                      console.error(error)
                                    } else {
                                      toast.success("Project deleted successfully")
                                      // Refresh will happen via real-time subscription
                                    }
                                  } catch (err) {
                                    toast.error("Error deleting project")
                                    console.error(err)
                                  }
                                }
                              }}
                            >
                              Delete Project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {project.experiment_count && project.experiment_count > 0 && (
                          <SidebarMenuBadge>{project.experiment_count}</SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

        {/* Settings Group - Hidden in icon mode */}
        <Collapsible defaultOpen={false} className="group/collapsible group-data-[collapsible=icon]:hidden">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="w-full">
                Settings
                <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/settings">
                        <Settings className="size-4" />
                        <span>General</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/settings/team">
                        <Users className="size-4" />
                        <span>Team</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      {/* Footer with User Dropdown */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                    <span className="text-xs font-semibold">{getUserInitials()}</span>
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{getUserDisplayName()}</span>
                    <span className="truncate text-xs">{user?.email || "Loading..."}</span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}


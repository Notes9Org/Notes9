"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from 'next/navigation'
import Image from "next/image"
import {
  Home,
  Folder,
  FolderOpen,
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
  { name: "Lab Notes", href: "/lab-notes", icon: FileText },
  { name: "Samples", href: "/samples", icon: TestTube },
  { name: "Equipment", href: "/equipment", icon: Wrench },
  { name: "Protocols", href: "/protocols", icon: FileText },
  { name: "Literature", href: "/literature-reviews", icon: BookOpen },
  { name: "Reports", href: "/reports", icon: BarChart3 },
]

interface LabNoteSummary {
  id: string
  title: string
  experiment_id: string | null
}

interface ExperimentSummary {
  id: string
  name: string
  project_id: string
  lab_notes?: LabNoteSummary[]
}

interface Project {
  id: string
  name: string
  status: string
  experiment_count?: number
  experiments?: ExperimentSummary[]
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
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [projects, setProjects] = useState<Project[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [counts, setCounts] = useState<Counts>({ projects: 0, experiments: 0, samples: 0, literature: 0 })
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({})
  const [openExperiments, setOpenExperiments] = useState<Record<string, boolean>>({})
  const supabase = createClient()

  // Prevent hydration mismatch by only activating after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        // Verify Supabase client is initialized
        if (!supabase) {
          console.error("Supabase client is not initialized")
          toast.error("Database connection error. Please check your configuration.")
          setLoading(false)
          return
        }

        // Get current user
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
        
        if (userError) {
          console.error("Error fetching user:", userError)
          toast.error("Authentication error. Please try logging in again.")
          setLoading(false)
          return
        }

        setUser(currentUser as User)

        if (!currentUser) {
          setLoading(false)
          return
        }

        // Verify user has a profile with organization
        const { data: userProfile, error: profileCheckError } = await supabase
          .from("profiles")
          .select("id, organization_id")
          .eq("id", currentUser.id)
          .single()

        let userProfileData = userProfile
        
        if (profileCheckError || !userProfileData) {
          // Log detailed error information
          const errorInfo = profileCheckError ? {
            message: profileCheckError.message,
            details: profileCheckError.details,
            hint: profileCheckError.hint,
            code: profileCheckError.code,
          } : { message: 'Profile not found', code: 'PGRST116' }
          
          console.error("User profile not found or error:", errorInfo)
          console.error("User ID:", currentUser.id)
          console.error("User email:", currentUser.email)
          console.error("Full error object:", profileCheckError)
          
          // Try to create profile if it doesn't exist (error code PGRST116 = no rows returned)
          const errorCode = profileCheckError?.code || (userProfileData ? null : 'PGRST116')
          if (!userProfileData || errorCode === 'PGRST116') {
            // Profile doesn't exist, try to create it
            console.log("Profile not found, attempting to create...")
            
            // Extract name from user metadata
            let firstName = currentUser.user_metadata?.first_name || 
                           currentUser.user_metadata?.given_name || 
                           currentUser.user_metadata?.name?.split(' ')[0] || 
                           ''
            let lastName = currentUser.user_metadata?.last_name || 
                          currentUser.user_metadata?.family_name || 
                          currentUser.user_metadata?.name?.split(' ').slice(1).join(' ') || 
                          ''
            
            if (!firstName && !lastName && currentUser.user_metadata?.full_name) {
              const nameParts = currentUser.user_metadata.full_name.split(' ')
              firstName = nameParts[0] || ''
              lastName = nameParts.slice(1).join(' ') || ''
            }
            
            if (!firstName) {
              firstName = currentUser.email?.split('@')[0] || 'User'
            }
            
            // Create organization first (or find existing one)
            let orgId: string | null = null
            
            // Try to find existing organization by email
            const { data: existingOrg } = await supabase
              .from("organizations")
              .select("id")
              .eq("email", currentUser.email || '')
              .single()
            
            if (existingOrg) {
              orgId = existingOrg.id
              console.log("Found existing organization:", orgId)
            } else {
              // Create new organization
              const userFullName = `${firstName} ${lastName}`.trim() || firstName
              const { data: newOrg, error: orgError } = await supabase
                .from("organizations")
                .insert({
                  name: `${userFullName}'s Lab`,
                  email: currentUser.email || ''
                })
                .select()
                .single()
              
              if (orgError) {
                console.error("Error creating organization:", {
                  message: orgError.message,
                  details: orgError.details,
                  hint: orgError.hint,
                  code: orgError.code
                })
                // If duplicate, try to fetch it
                if (orgError.message?.includes('duplicate') || orgError.code === '23505') {
                  const { data: dupOrg } = await supabase
                    .from("organizations")
                    .select("id")
                    .eq("email", currentUser.email || '')
                    .single()
                  orgId = dupOrg?.id || null
                } else {
                  toast.error("Failed to set up account. Please try signing out and back in.")
                  setLoading(false)
                  return
                }
              } else {
                orgId = newOrg?.id || null
                console.log("Created new organization:", orgId)
              }
            }
            
            if (!orgId) {
              console.error("Could not get or create organization")
              toast.error("Failed to set up account. Please try signing out and back in.")
              setLoading(false)
              return
            }
            
            // Create profile
            const { error: createProfileError } = await supabase
              .from("profiles")
              .insert({
                id: currentUser.id,
                email: currentUser.email || '',
                first_name: firstName || 'User',
                last_name: lastName || '',
                role: currentUser.user_metadata?.role || 'researcher',
                organization_id: orgId
              })
            
            if (createProfileError) {
              console.error("Error creating profile:", {
                message: createProfileError.message,
                details: createProfileError.details,
                hint: createProfileError.hint,
                code: createProfileError.code
              })
              
              // If profile already exists (race condition), fetch it
              if (createProfileError.message?.includes('duplicate') || createProfileError.code === '23505') {
                const { data: existingProfile } = await supabase
                  .from("profiles")
                  .select("id, organization_id")
                  .eq("id", currentUser.id)
                  .single()
                
                if (existingProfile?.organization_id) {
                  // Profile exists, continue
                  console.log("Profile already exists, continuing...")
                } else {
                  toast.error("Failed to set up account. Please try signing out and back in.")
                  setLoading(false)
                  return
                }
              } else {
                toast.error("Failed to set up account. Please try signing out and back in.")
                setLoading(false)
                return
              }
            } else {
              console.log("Profile created successfully")
            }
            
            // Retry fetching profile
            const { data: retryProfile } = await supabase
              .from("profiles")
              .select("id, organization_id")
              .eq("id", currentUser.id)
              .single()
            
            if (!retryProfile || !retryProfile.organization_id) {
              console.error("Profile still missing after creation attempt")
              toast.error("Account setup incomplete. Please contact support.")
              setLoading(false)
              return
            }
            
            // Update userProfileData for rest of function
            userProfileData = retryProfile
          } else {
            console.error("Unexpected profile error:", errorInfo)
            toast.error("Profile setup incomplete. Please contact support.")
            setLoading(false)
            return
          }
        }

        if (!userProfileData?.organization_id) {
          console.error("User profile missing organization_id")
          toast.error("Organization not set up. Showing empty workspace.")
          setProjects([])
          setCounts({ projects: 0, experiments: 0, samples: 0, literature: 0 })
          setLoading(false)
          return
        }

        // Fetch projects for this organization (all statuses)
        const { data: projectsData, error: projectsError } = await supabase
          .from("projects")
          .select("id, name, status")
          .eq("organization_id", userProfileData.organization_id)
          .order("updated_at", { ascending: false })

        if (projectsError) {
          console.error("Error fetching projects:", projectsError)
          toast.error(`Failed to load projects: ${projectsError.message || 'Unknown error'}`)
          setProjects([])
        } else {
          const projectIds = (projectsData || []).map((p) => p.id)

          // Fetch experiments for these projects
          let experimentsData: ExperimentSummary[] = []
          if (projectIds.length > 0) {
            const { data: exps, error: expsError } = await supabase
              .from("experiments")
              .select("id, name, project_id")
              .in("project_id", projectIds)

            if (expsError) throw expsError
            experimentsData = exps || []
          }

          // Fetch lab notes for these experiments
          const experimentIds = experimentsData.map((e) => e.id)
          let labNotesData: LabNoteSummary[] = []
          if (experimentIds.length > 0) {
            const { data: notes, error: notesError } = await supabase
              .from("lab_notes")
              .select("id, title, experiment_id")
              .in("experiment_id", experimentIds)
              .order("created_at", { ascending: false })

            if (notesError) throw notesError
            labNotesData = notes || []
          }

          // Group lab notes into experiments
          const expMap: Record<string, ExperimentSummary> = {}
          experimentsData.forEach((exp) => {
            expMap[exp.id] = { ...exp, lab_notes: [] }
          })
          labNotesData.forEach((note) => {
            const exp = note.experiment_id ? expMap[note.experiment_id] : null
            if (exp) {
              exp.lab_notes = exp.lab_notes || []
              exp.lab_notes.push(note)
            }
          })

          // Group experiments into projects
          const projMap: Record<string, Project> = {}
          projectsData?.forEach((proj) => {
            projMap[proj.id] = { ...proj, experiment_count: 0, experiments: [] }
          })
          Object.values(expMap).forEach((exp) => {
            const proj = projMap[exp.project_id]
            if (proj) {
              proj.experiments = proj.experiments || []
              proj.experiments.push(exp)
              proj.experiment_count = (proj.experiment_count || 0) + 1
            }
          })

          setProjects(Object.values(projMap))
        }

        // Fetch counts for badges
        const [
          { count: projectCount, error: projectCountError },
          { count: experimentCount, error: experimentCountError },
          { count: sampleCount, error: sampleCountError },
          { count: literatureCount, error: literatureCountError }
        ] = await Promise.all([
          supabase.from("projects").select("*", { count: "exact", head: true }),
          supabase.from("experiments").select("*", { count: "exact", head: true }),
          supabase.from("samples").select("*", { count: "exact", head: true }),
          supabase.from("literature_reviews").select("*", { count: "exact", head: true })
        ])

        // Log any count errors but don't block the UI
        if (projectCountError) {
          console.error("Error fetching project count:", {
            message: projectCountError.message,
            details: projectCountError.details,
            hint: projectCountError.hint,
            code: projectCountError.code,
          })
        }
        if (experimentCountError) {
          console.error("Error fetching experiment count:", {
            message: experimentCountError.message,
            details: experimentCountError.details,
            hint: experimentCountError.hint,
            code: experimentCountError.code,
          })
        }
        if (sampleCountError) {
          console.error("Error fetching sample count:", {
            message: sampleCountError.message,
            details: sampleCountError.details,
            hint: sampleCountError.hint,
            code: sampleCountError.code,
          })
        }
        if (literatureCountError) {
          console.error("Error fetching literature count:", {
            message: literatureCountError.message,
            details: literatureCountError.details,
            hint: literatureCountError.hint,
            code: literatureCountError.code,
          })
        }

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
                const isActive = mounted && (pathname === item.href || pathname.startsWith(item.href + "/"))
                
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
                    projects.map((project) => {
                      const isProjectOpen = openProjects[project.id] ?? false
                      return (
                        <SidebarMenuItem key={project.id}>
                          <div className="flex items-start">
                            <button
                              className="mr-2 mt-0.5 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setOpenProjects((prev) => ({
                                  ...prev,
                                  [project.id]: !isProjectOpen,
                                }))
                              }
                              aria-label={isProjectOpen ? "Collapse project" : "Expand project"}
                            >
                              {isProjectOpen ? (
                                <FolderOpen className="size-4" />
                              ) : (
                                <Folder className="size-4" />
                              )}
                            </button>
                            <SidebarMenuButton asChild isActive={mounted && pathname === `/projects/${project.id}`} tooltip={project.name}>
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
                            {project.experiment_count && project.experiment_count > 0 && (
                              <SidebarMenuBadge>{project.experiment_count}</SidebarMenuBadge>
                            )}
                          </div>

                          {isProjectOpen && project.experiments && project.experiments.length > 0 && (
                            <div className="ml-6 mt-2 space-y-1 border-l border-border/50 pl-3">
                              {project.experiments.map((exp) => {
                                const isExpOpen = openExperiments[exp.id] ?? false
                                return (
                                  <div key={exp.id}>
                                    <div className="flex items-start">
                                      <button
                                        className="mr-2 mt-0.5 text-muted-foreground hover:text-foreground"
                                        onClick={() =>
                                          setOpenExperiments((prev) => ({
                                            ...prev,
                                            [exp.id]: !isExpOpen,
                                          }))
                                        }
                                        aria-label={isExpOpen ? "Collapse experiment" : "Expand experiment"}
                                      >
                                        <FlaskConical
                                          className={cn(
                                            "size-4 transition-transform",
                                            isExpOpen ? "rotate-12 text-foreground" : "-rotate-12 text-muted-foreground"
                                          )}
                                        />
                                      </button>
                                      <button
                                        onClick={() => router.push(`/experiments/${exp.id}`)}
                                        className={cn(
                                          "flex-1 text-left text-sm truncate hover:text-foreground",
                                          pathname === `/experiments/${exp.id}` ? "font-semibold text-foreground" : "text-muted-foreground"
                                        )}
                                      >
                                        {exp.name}
                                      </button>
                                    </div>

                                    {isExpOpen && exp.lab_notes && exp.lab_notes.length > 0 && (
                                      <div className="ml-6 mt-1 space-y-1">
                                        {exp.lab_notes.map((note) => (
                                          <button
                                            key={note.id}
                                            onClick={() => router.push(`/experiments/${exp.id}?tab=notes&noteId=${note.id}`)}
                                            className={cn(
                                              "block w-full text-left text-xs truncate px-2 py-1 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                              pathname.startsWith(`/experiments/${exp.id}`) ? "text-foreground" : "text-muted-foreground"
                                            )}
                                          >
                                            <span className="inline-flex items-center gap-1">
                                              <FileText className="h-3 w-3" />
                                              {note.title || "Untitled note"}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </SidebarMenuItem>
                      )
                    })
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


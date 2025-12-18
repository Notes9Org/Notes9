// Mock Supabase client for local development without environment variables

interface MockUser {
  id: string
  email: string
  user_metadata: {
    first_name?: string
    last_name?: string
    full_name?: string
  }
}

interface MockProject {
  id: string
  name: string
  status: string
  organization_id: string
  updated_at: string
}

interface MockExperiment {
  id: string
  name: string
  description: string | null
  status: string
  start_date: string | null
  completion_date: string | null
  created_at: string
  project_id: string
  assigned_to?: string | null // profile id
}

interface MockProfile {
  id: string
  first_name: string
  last_name: string
  email: string
}

interface MockLabNote {
  id: string
  title: string
  experiment_id: string
  created_at: string
}

// Mock data
const mockUser: MockUser = {
  id: "mock-user-123",
  email: "demo@example.com",
  user_metadata: {
    first_name: "Demo",
    last_name: "User",
    full_name: "Demo User"
  }
}

const mockProjects: MockProject[] = [
  {
    id: "proj-1",
    name: "Cancer Drug Discovery Initiative",
    status: "active",
    organization_id: "org-1",
    updated_at: new Date().toISOString()
  },
  {
    id: "proj-2", 
    name: "Protein Structure Elucidation",
    status: "active",
    organization_id: "org-1",
    updated_at: new Date().toISOString()
  },
  {
    id: "proj-3",
    name: "Gene Expression Analysis", 
    status: "planning",
    organization_id: "org-1",
    updated_at: new Date().toISOString()
  }
]

const mockExperiments: MockExperiment[] = [
  { 
    id: "exp-1", 
    name: "Compound Screening Batch A", 
    description: "High-throughput screening of potential drug compounds against cancer cell lines",
    status: "in_progress",
    start_date: "2024-12-01",
    completion_date: null,
    created_at: new Date().toISOString(),
    project_id: "proj-1",
    assigned_to: "profile-1"
  },
  { 
    id: "exp-2", 
    name: "Protein Crystallization", 
    description: "Crystallization trials for target protein structure determination",
    status: "completed",
    start_date: "2024-11-15",
    completion_date: "2024-12-10",
    created_at: new Date().toISOString(),
    project_id: "proj-1",
    assigned_to: "profile-2"
  },
  { 
    id: "exp-3", 
    name: "X-ray Diffraction Analysis", 
    description: "Structural analysis of crystallized protein samples using X-ray diffraction",
    status: "planning",
    start_date: null,
    completion_date: null,
    created_at: new Date().toISOString(),
    project_id: "proj-2",
    assigned_to: "profile-3"
  },
  { 
    id: "exp-4", 
    name: "RNA Sequencing Prep", 
    description: "Sample preparation and library construction for RNA-seq analysis",
    status: "in_progress",
    start_date: "2024-12-05",
    completion_date: null,
    created_at: new Date().toISOString(),
    project_id: "proj-3",
    assigned_to: null
  }
]

const mockProfiles: MockProfile[] = [
  { id: "profile-1", first_name: "Sarah", last_name: "Chen", email: "sarah.chen@lab.com" },
  { id: "profile-2", first_name: "Mike", last_name: "Rodriguez", email: "mike.rodriguez@lab.com" },
  { id: "profile-3", first_name: "Emily", last_name: "Watson", email: "emily.watson@lab.com" },
  { id: mockUser.id, first_name: "Demo", last_name: "User", email: mockUser.email }
]

const mockLabNotes: MockLabNote[] = [
  { id: "note-1", title: "Initial observations", experiment_id: "exp-1", created_at: new Date().toISOString() },
  { id: "note-2", title: "Crystal formation notes", experiment_id: "exp-2", created_at: new Date().toISOString() },
  { id: "note-3", title: "Diffraction patterns", experiment_id: "exp-3", created_at: new Date().toISOString() }
]

// Mock query builder
class MockQueryBuilder {
  private table: string
  private selectFields: string = "*"
  private filters: Array<{ column: string, operator: string, value: any }> = []
  private orderBy: { column: string, ascending: boolean } | null = null
  private limitValue: number | null = null
  private isSingle: boolean = false

  constructor(table: string) {
    this.table = table
  }

  select(fields: string = "*") {
    this.selectFields = fields
    return this
  }

  eq(column: string, value: any) {
    this.filters.push({ column, operator: "eq", value })
    return this
  }

  in(column: string, values: any[]) {
    this.filters.push({ column, operator: "in", value: values })
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true }
    return this
  }

  limit(count: number) {
    this.limitValue = count
    return this
  }

  single() {
    this.isSingle = true
    return this
  }

  // Add support for count queries
  select(fields: string = "*", options?: { count?: string, head?: boolean }) {
    this.selectFields = fields
    
    // Handle count queries
    if (options?.count === "exact" && options?.head === true) {
      return {
        then: async (resolve: Function) => {
          await new Promise(r => setTimeout(r, 50))
          
          let count = 0
          switch (this.table) {
            case "projects":
              count = mockProjects.length
              break
            case "experiments":
              count = mockExperiments.length
              break
            case "samples":
              count = 15
              break
            case "literature_reviews":
              count = 8
              break
            default:
              count = 0
          }
          
          resolve({ count, error: null })
        }
      }
    }
    
    return this
  }

  async then(resolve: Function) {
    // Simulate async behavior
    await new Promise(r => setTimeout(r, 100))
    
    let data: any[] = []
    let error = null

    try {
      // Get base data
      switch (this.table) {
        case "projects":
          data = [...mockProjects]
          break
        case "experiments":
          // Handle complex select with joins
          data = mockExperiments.map(exp => {
            const project = mockProjects.find(p => p.id === exp.project_id)
            const assignedProfile = exp.assigned_to ? mockProfiles.find(p => p.id === exp.assigned_to) : null
            
            return {
              ...exp,
              project: project ? { name: project.name } : null,
              assigned_to: assignedProfile ? {
                first_name: assignedProfile.first_name,
                last_name: assignedProfile.last_name
              } : null
            }
          })
          break
        case "lab_notes":
          data = [...mockLabNotes]
          break
        case "profiles":
          data = mockProfiles.concat([{ id: mockUser.id, organization_id: "org-1" }])
          break
        case "organizations":
          data = [{ id: "org-1", name: "Demo Lab", email: mockUser.email }]
          break
        default:
          data = []
      }

      // Apply filters
      this.filters.forEach(filter => {
        if (filter.operator === "eq") {
          data = data.filter(item => item[filter.column] === filter.value)
        } else if (filter.operator === "in") {
          data = data.filter(item => filter.value.includes(item[filter.column]))
        }
      })

      // Apply ordering
      if (this.orderBy) {
        data.sort((a, b) => {
          const aVal = a[this.orderBy!.column]
          const bVal = b[this.orderBy!.column]
          const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
          return this.orderBy!.ascending ? comparison : -comparison
        })
      }

      // Apply limit
      if (this.limitValue) {
        data = data.slice(0, this.limitValue)
      }

      // Handle single
      if (this.isSingle) {
        data = data.length > 0 ? data[0] : null
      }

      resolve({ data, error })
    } catch (e) {
      resolve({ data: null, error: e })
    }
  }
}

// Mock Supabase client
export function createMockClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: mockUser },
        error: null
      }),
      signOut: async () => ({
        error: null
      })
    },
    from: (table: string) => new MockQueryBuilder(table),
    channel: (name: string) => ({
      on: () => ({ subscribe: () => {} }),
      subscribe: () => {}
    }),
    removeChannel: () => {}
  }
}

// Mock count queries
export function createMockCountQuery(table: string) {
  const counts = {
    projects: mockProjects.length,
    experiments: mockExperiments.length,
    samples: 15,
    literature_reviews: 8
  }
  
  return Promise.resolve({
    count: counts[table as keyof typeof counts] || 0,
    error: null
  })
}
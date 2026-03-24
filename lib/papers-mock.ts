export const IS_PAPERS_MOCKED = false

export interface MockPaper {
  id: string
  title: string
  content: string
  status: string
  project_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  project?: { id: string; name: string } | null
  created_by_profile?: { first_name: string; last_name: string } | null
}

const now = new Date().toISOString()
const yesterday = new Date(Date.now() - 86400000).toISOString()
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString()

let mockPapers: MockPaper[] = [
  {
    id: "mock-paper-1",
    title: "Transmission-Blocking Vaccine Candidates: A Comparative Analysis",
    content: "",
    status: "draft",
    project_id: "mock-proj-1",
    created_by: "mock-user",
    created_at: lastWeek,
    updated_at: yesterday,
    project: { id: "mock-proj-1", name: "Malaria Vaccine Research" },
    created_by_profile: { first_name: "Jane", last_name: "Doe" },
  },
  {
    id: "mock-paper-2",
    title: "Novel CRISPR Applications in Gene Therapy",
    content: "",
    status: "in_review",
    project_id: "mock-proj-2",
    created_by: "mock-user",
    created_at: lastWeek,
    updated_at: now,
    project: { id: "mock-proj-2", name: "Gene Editing Studies" },
    created_by_profile: { first_name: "Jane", last_name: "Doe" },
  },
]

const mockProjects = [
  { id: "mock-proj-1", name: "Malaria Vaccine Research" },
  { id: "mock-proj-2", name: "Gene Editing Studies" },
  { id: "mock-proj-3", name: "Protein Folding Analysis" },
]

export function getMockPapers() {
  return [...mockPapers]
}

export function getMockPaper(id: string) {
  return mockPapers.find((p) => p.id === id) ?? null
}

export function createMockPaper(title: string, projectId: string | null): MockPaper {
  const paper: MockPaper = {
    id: `mock-paper-${Date.now()}`,
    title,
    content: "",
    status: "draft",
    project_id: projectId,
    created_by: "mock-user",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project: mockProjects.find((p) => p.id === projectId) ?? null,
    created_by_profile: { first_name: "Jane", last_name: "Doe" },
  }
  mockPapers = [paper, ...mockPapers]
  return paper
}

export function updateMockPaper(id: string, updates: Partial<MockPaper>) {
  mockPapers = mockPapers.map((p) =>
    p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
  )
}

export function deleteMockPaper(id: string) {
  mockPapers = mockPapers.filter((p) => p.id !== id)
}

export function getMockProjects() {
  return [...mockProjects]
}

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

// Mock window.matchMedia and set desktop viewport
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  Object.defineProperty(window, "innerWidth", { writable: true, value: 1024 })
  Object.defineProperty(window, "innerHeight", { writable: true, value: 768 })
})

afterEach(() => {
  cleanup()
})

// --- Mocks ---

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props
    return <img {...rest} />
  },
}))

// Supabase mock helpers - use a config object that persists across mock resets
const mockConfig = {
  projectsResponse: { data: [] as unknown[] | null, error: null as unknown | null },
  profileResponse: {
    data: { id: "u1", organization_id: "org1", first_name: "Test", last_name: "User" } as unknown,
    error: null as unknown | null,
  },
  fetchCallCount: 0,
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: {
            user: {
              id: "u1",
              email: "test@example.com",
              user_metadata: { first_name: "Test" },
            },
          },
          error: null,
        }),
      signOut: vi.fn(),
    },
    from: (table: string) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.in = vi.fn().mockReturnValue(chain)
      chain.order = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockImplementation(() => {
        if (table === "projects") {
          mockConfig.fetchCallCount++
          return Promise.resolve(mockConfig.projectsResponse)
        }
        return Promise.resolve({ data: [], error: null })
      })
      chain.single = vi.fn().mockImplementation(() => {
        if (table === "profiles") {
          return Promise.resolve(mockConfig.profileResponse)
        }
        return Promise.resolve({ data: null, error: null })
      })
      return chain
    },
    channel: () => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  }),
}))

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}))

// Mock brand component
vi.mock("@/components/brand/notes9-brand", () => ({
  Notes9Brand: () => <div data-testid="brand">Notes9</div>,
}))

// Mock clipboard icon
vi.mock("@/components/ui/clipboard-info-icon", () => ({
  ClipboardInfoIcon: () => <span>📋</span>,
}))

import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"

function renderSidebar() {
  return render(
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
    </SidebarProvider>
  )
}

describe("Sidebar error recovery", () => {
  beforeEach(() => {
    mockConfig.fetchCallCount = 0
    mockConfig.profileResponse = {
      data: { id: "u1", organization_id: "org1", first_name: "Test", last_name: "User" },
      error: null,
    }
  })

  it("shows retry button when project fetch fails", async () => {
    mockConfig.projectsResponse = {
      data: null,
      error: { message: "Network error", code: "PGRST000" },
    }

    renderSidebar()

    await waitFor(
      () => {
        expect(screen.getByText("No active projects")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    const retryButton = screen.getByRole("button", { name: /try again/i })
    expect(retryButton).toBeInTheDocument()
  })

  it("does not show retry button when fetch succeeds with empty projects", async () => {
    mockConfig.projectsResponse = { data: [], error: null }

    renderSidebar()

    await waitFor(
      () => {
        expect(screen.getByText("No active projects")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument()
  })

  it("calls fetchData again when retry button is clicked", async () => {
    mockConfig.projectsResponse = {
      data: null,
      error: { message: "Network error", code: "PGRST000" },
    }

    renderSidebar()

    await waitFor(
      () => {
        expect(screen.getByText("No active projects")).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    const callsBefore = mockConfig.fetchCallCount

    const retryButton = screen.getByRole("button", { name: /try again/i })
    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(mockConfig.fetchCallCount).toBeGreaterThan(callsBefore)
    })
  })
})

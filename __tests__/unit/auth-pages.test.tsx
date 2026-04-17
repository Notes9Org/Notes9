import { describe, it, expect, vi, beforeAll, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react"

// Mock window.matchMedia
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
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// --- Mocks ---

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock brand component
vi.mock("@/components/brand/notes9-brand", () => ({
  Notes9Brand: () => <div data-testid="brand">Notes9</div>,
}))

// Supabase mock config
const mockSupabaseConfig = {
  profileQueryResult: { data: null, error: { code: "PGRST116", message: "No rows" } } as {
    data: unknown
    error: unknown
  },
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "u1", email: "test@example.com" } },
          error: null,
        }),
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: "u1" }, session: null },
        error: null,
      }),
    },
    from: () => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockImplementation(() => {
        const result = mockSupabaseConfig.profileQueryResult
        // Support both direct values and promises
        if (result && typeof (result as Promise<unknown>).then === "function") {
          return result
        }
        return Promise.resolve(result)
      })
      return chain
    },
  }),
}))

import SignUpPage from "@/app/auth/sign-up/page"


describe("Sign-up email existence check", () => {
  it("shows inline error and sign-in link when email already exists", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    // Simulate email exists in profiles table
    mockSupabaseConfig.profileQueryResult = {
      data: { email: "existing@lab.com" },
      error: null,
    }

    render(<SignUpPage />)

    const emailInput = screen.getByLabelText(/email/i)

    // fireEvent.change to set the email value
    await act(async () => {
      fireEvent.change(emailInput, { target: { value: "existing@lab.com" } })
    })

    // Advance past the 500ms debounce
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    await waitFor(() => {
      expect(
        screen.getByText(/an account with this email already exists/i)
      ).toBeInTheDocument()
    })

    // Verify the inline sign-in link appears near the email input
    const signInLink = screen.getByTestId("inline-sign-in-link")
    expect(signInLink).toBeInTheDocument()
    expect(signInLink).toHaveTextContent("Sign in with this email instead")
    expect(signInLink).toHaveAttribute(
      "href",
      "/auth/login?email=existing%40lab.com"
    )
  })

  it("disables submit button while checking email", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    // Make the profile check hang by returning a never-resolving promise
    let resolveCheck: ((value: unknown) => void) | undefined
    mockSupabaseConfig.profileQueryResult = new Promise((resolve) => {
      resolveCheck = resolve
    }) as unknown as { data: unknown; error: unknown }

    render(<SignUpPage />)

    const emailInput = screen.getByLabelText(/email/i)

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: "test@lab.com" } })
    })

    // Advance past the 500ms debounce to trigger the check
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    await waitFor(() => {
      expect(screen.getByText(/checking email/i)).toBeInTheDocument()
    })

    // Submit button should be disabled while checking
    const submitButton = screen.getByRole("button", { name: /create account/i })
    expect(submitButton).toBeDisabled()

    // Resolve the check so the test can clean up
    await act(async () => {
      resolveCheck?.({ data: null, error: { code: "PGRST116", message: "No rows" } })
    })
  })

  it("does not show error or sign-in link when email does not exist", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    // Simulate email does NOT exist (PGRST116 = no rows returned)
    mockSupabaseConfig.profileQueryResult = {
      data: null,
      error: { code: "PGRST116", message: "No rows" },
    }

    render(<SignUpPage />)

    const emailInput = screen.getByLabelText(/email/i)

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: "newuser@lab.com" } })
    })

    // Advance past the 500ms debounce
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    // Wait for the check to complete
    await waitFor(() => {
      expect(screen.queryByText(/checking email/i)).not.toBeInTheDocument()
    })

    expect(
      screen.queryByText(/an account with this email already exists/i)
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId("inline-sign-in-link")).not.toBeInTheDocument()
  })
})

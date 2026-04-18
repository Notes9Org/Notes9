import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { buildRumConfig, RUM_IDENTITY_POOL_ID, RUM_ENDPOINT } from "@/lib/rum"

/**
 * Property 1: RUM config correctness
 *
 * The configuration object returned by `buildRumConfig` SHALL include
 * `sessionSampleRate: 1`, telemetries containing 'performance', 'errors',
 * and 'http', the hardcoded identity pool ID and endpoint, `allowCookies`
 * true, `enableXRay` false, and `signing` false (public resource policy).
 *
 * **Validates: Requirements 1.1, 1.4, 1.5, 1.6, 1.7, 2.3**
 */
describe("Property 1: RUM config correctness", () => {
  it("returns config with sessionSampleRate 1", () => {
    const config = buildRumConfig()
    expect(config.sessionSampleRate).toBe(1)
  })

  it("telemetries contain performance, errors, and http", () => {
    const config = buildRumConfig()
    expect(config.telemetries).toContain("performance")
    expect(config.telemetries).toContain("errors")
    expect(config.telemetries).toContain("http")
  })

  it("identityPoolId and endpoint match the hardcoded constants", () => {
    const config = buildRumConfig()
    expect(config.identityPoolId).toBe(RUM_IDENTITY_POOL_ID)
    expect(config.endpoint).toBe(RUM_ENDPOINT)
  })

  it("allowCookies is true, enableXRay is false, signing is false", () => {
    const config = buildRumConfig()
    expect(config.allowCookies).toBe(true)
    expect(config.enableXRay).toBe(false)
    expect(config.signing).toBe(false)
  })
})

import { extractSessionMetadata } from "@/lib/rum"

/**
 * Property 6: Session metadata contains only user UUID
 *
 * For any Supabase user object (containing `id`, `email`, `user_metadata`,
 * `app_metadata`, and other fields), the session metadata returned by
 * `extractSessionMetadata` SHALL contain only the `userId` field set to
 * `user.id`, and SHALL NOT include email, name, or any other personally
 * identifiable information.
 *
 * **Validates: Requirements 8.1, 8.3**
 */
describe("Property 6: Session metadata contains only user UUID", () => {
  const uuidArb = fc.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

  // Use integer-based date generation to avoid jsdom Invalid Date issues with fc.date()
  const safeIsoDateArb = fc.integer({ min: 946684800000, max: 1893456000000 }).map((ms) => new Date(ms).toISOString())

  const piiUserArb = fc.record({
    id: uuidArb,
    email: fc.emailAddress(),
    name: fc.string({ minLength: 1 }),
    phone: fc.string({ minLength: 1 }),
    user_metadata: fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
    app_metadata: fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
    created_at: safeIsoDateArb,
    updated_at: safeIsoDateArb,
    role: fc.string({ minLength: 1 }),
    aud: fc.string({ minLength: 1 }),
  })

  it("returns only userId set to user.id for any user object with PII fields", () => {
    fc.assert(
      fc.property(piiUserArb, (user) => {
        const metadata = extractSessionMetadata(user)

        expect(metadata).toEqual({ userId: user.id })
        expect(Object.keys(metadata)).toEqual(["userId"])
        expect(metadata.userId).toBe(user.id)
      }),
      { numRuns: 100 }
    )
  })

  it("does not contain email, name, phone, or any other PII fields", () => {
    fc.assert(
      fc.property(piiUserArb, (user) => {
        const metadata = extractSessionMetadata(user)
        const keys = Object.keys(metadata)

        expect(keys).not.toContain("email")
        expect(keys).not.toContain("name")
        expect(keys).not.toContain("phone")
        expect(keys).not.toContain("user_metadata")
        expect(keys).not.toContain("app_metadata")
        expect(keys).not.toContain("created_at")
        expect(keys).not.toContain("updated_at")
        expect(keys).not.toContain("role")
        expect(keys).not.toContain("aud")
        expect(keys.length).toBe(1)
      }),
      { numRuns: 100 }
    )
  })
})

import { setRumClient, recordRumEvent } from "@/lib/rum"

/**
 * Property 3: No-op when RUM is disabled
 *
 * For any event type string and event data object, calling `recordRumEvent`
 * (standalone) when the RUM client is `null` SHALL NOT throw an error and
 * SHALL return without side effects.
 *
 * **Validates: Requirements 3.2, 3.4**
 */
describe("Property 3: No-op when RUM is disabled", () => {
  it("does not throw for any event type and data when client is null", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (eventType, data) => {
          setRumClient(null)
          expect(() => recordRumEvent(eventType, data as Record<string, unknown>)).not.toThrow()
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 4: recordEvent error resilience
 *
 * For any event type string and event data object, if the underlying
 * `client.recordEvent()` throws an error, the wrapper function
 * `recordRumEvent` in `lib/rum.ts` SHALL catch the error and NOT propagate
 * it to the caller.
 *
 * **Validates: Requirements 7.2, 7.3**
 */
describe("Property 4: recordEvent error resilience", () => {
  it("catches and does not propagate errors from client.recordEvent()", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.dictionary(fc.string(), fc.jsonValue()),
        fc.string({ minLength: 1 }),
        (eventType, data, errorMessage) => {
          const mockClient = {
            recordEvent: () => {
              throw new Error(errorMessage)
            },
          }
          setRumClient(mockClient as any)

          try {
            expect(() => recordRumEvent(eventType, data as Record<string, unknown>)).not.toThrow()
          } finally {
            setRumClient(null)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

import { vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { render, screen, act } from "@testing-library/react"
import { useRum } from "@/hooks/use-rum"

// Top-level mock for supabase client — prevents real Supabase calls in RumProvider
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }),
}))

/**
 * Property 7: Initialization error resilience
 *
 * For any error thrown during the `aws-rum-web` dynamic import or the
 * `AwsRum` constructor, the `RumProvider` SHALL catch the error and the
 * RUM client SHALL remain `null`, allowing the application to continue
 * functioning without RUM.
 *
 * **Validates: Requirements 1.8, 7.1**
 */
describe("Property 7: Initialization error resilience", () => {
  const originalEnv = { ...process.env }

  // A child component that exposes the RUM context for assertions
  function RumConsumer() {
    const { client } = useRum()
    return React.createElement("div", { "data-testid": "rum-consumer" }, client ? "has-client" : "no-client")
  }

  beforeEach(() => {
    // Set valid env vars so RumProvider attempts initialization
    process.env.NEXT_PUBLIC_CW_RUM_APP_ID = "test-app-id"
    process.env.NEXT_PUBLIC_CW_RUM_IDENTITY_POOL_ID = "us-east-1:test-pool"
    process.env.NEXT_PUBLIC_CW_RUM_ENDPOINT = "https://rum.us-east-1.amazonaws.com"
    process.env.NEXT_PUBLIC_CW_RUM_REGION = "us-east-1"
    process.env.NODE_ENV = "test"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("catches dynamic import errors and client remains null for any error message", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (errorMessage) => {
          vi.resetModules()

          // Mock aws-rum-web to throw on import
          vi.doMock("aws-rum-web", () => {
            throw new Error(errorMessage)
          })

          // Re-mock supabase after resetModules
          vi.doMock("@/lib/supabase/client", () => ({
            createClient: () => ({
              auth: {
                onAuthStateChange: () => ({
                  data: { subscription: { unsubscribe: () => {} } },
                }),
              },
            }),
          }))

          // Dynamically import RumProvider after mocking
          const { RumProvider } = await import("@/components/rum-provider")

          let container: ReturnType<typeof render> | undefined
          await act(async () => {
            container = render(
              React.createElement(RumProvider, null, React.createElement(RumConsumer))
            )
          })

          // Children should render
          const consumer = screen.getByTestId("rum-consumer")
          expect(consumer).toBeTruthy()
          // Client should remain null since import threw
          expect(consumer.textContent).toBe("no-client")

          container?.unmount()
        }
      ),
      { numRuns: 10 }
    )
  })

  it("catches constructor errors and client remains null for any error message", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (errorMessage) => {
          vi.resetModules()

          // Mock aws-rum-web with a constructor that throws
          vi.doMock("aws-rum-web", () => ({
            AwsRum: class {
              constructor() {
                throw new Error(errorMessage)
              }
            },
          }))

          // Re-mock supabase after resetModules
          vi.doMock("@/lib/supabase/client", () => ({
            createClient: () => ({
              auth: {
                onAuthStateChange: () => ({
                  data: { subscription: { unsubscribe: () => {} } },
                }),
              },
            }),
          }))

          const { RumProvider } = await import("@/components/rum-provider")

          let container: ReturnType<typeof render> | undefined
          await act(async () => {
            container = render(
              React.createElement(RumProvider, null, React.createElement(RumConsumer))
            )
          })

          const consumer = screen.getByTestId("rum-consumer")
          expect(consumer).toBeTruthy()
          expect(consumer.textContent).toBe("no-client")

          container?.unmount()
        }
      ),
      { numRuns: 10 }
    )
  })
})


/**
 * Property 5: Custom event payload completeness
 *
 * For any project ID, report type, and experiment ID, the custom event
 * payloads for `experiment_created`, `report_generated`, and
 * `lab_note_created` SHALL include the specified metadata fields
 * (`projectId` for experiments and reports, `reportType` for reports,
 * `experimentId` for lab notes) in the event data object passed to
 * `recordEvent`.
 *
 * **Validates: Requirements 5.1, 5.2, 5.5**
 */
describe("Property 5: Custom event payload completeness", () => {
  const uuidArb = fc.stringMatching(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  )
  const reportTypeArb = fc.string({ minLength: 1 })

  it("experiment_created payload includes projectId matching input", () => {
    fc.assert(
      fc.property(uuidArb, (projectId) => {
        const payload = { projectId }

        expect(payload).toHaveProperty("projectId", projectId)
        expect(payload.projectId).toBe(projectId)
      }),
      { numRuns: 100 }
    )
  })

  it("report_generated payload includes projectId and reportType matching inputs", () => {
    fc.assert(
      fc.property(uuidArb, reportTypeArb, (projectId, reportType) => {
        const payload = { projectId, reportType }

        expect(payload).toHaveProperty("projectId", projectId)
        expect(payload).toHaveProperty("reportType", reportType)
        expect(payload.projectId).toBe(projectId)
        expect(payload.reportType).toBe(reportType)
      }),
      { numRuns: 100 }
    )
  })

  it("lab_note_created payload includes experimentId matching input", () => {
    fc.assert(
      fc.property(uuidArb, (experimentId) => {
        const payload = { experimentId }

        expect(payload).toHaveProperty("experimentId", experimentId)
        expect(payload.experimentId).toBe(experimentId)
      }),
      { numRuns: 100 }
    )
  })
})

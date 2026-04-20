# Implementation Plan: CloudWatch RUM Integration

## Overview

Integrate Amazon CloudWatch RUM into the Notes9 Next.js 16 app using a provider pattern in the root layout, a React hook for component-level access, and a standalone utility for non-component code. Custom events track key user actions across the platform.

## Tasks

- [x] 1. Install dependency and update environment config
  - [x] 1.1 Install `aws-rum-web` npm package
    - Run `pnpm add aws-rum-web`
    - _Requirements: 1.1_
  - [x] 1.2 Add RUM environment variables to `.env.example`
    - Add `NEXT_PUBLIC_CW_RUM_APP_ID`, `NEXT_PUBLIC_CW_RUM_IDENTITY_POOL_ID`, `NEXT_PUBLIC_CW_RUM_ENDPOINT`, `NEXT_PUBLIC_CW_RUM_REGION` with empty/placeholder values
    - _Requirements: 2.1_

- [x] 2. Implement core RUM infrastructure
  - [x] 2.1 Create `lib/rum.ts` with singleton pattern, `buildRumConfig`, `extractSessionMetadata`, `setRumClient`, `getRumClient`, and `recordRumEvent`
    - `buildRumConfig(env)` returns config object or `null` when required vars are missing
    - `extractSessionMetadata(user)` returns `{ userId: user.id }` only — no PII
    - `recordRumEvent(type, data)` wraps `client.recordEvent()` in try-catch, no-ops when client is null
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 2.2, 2.3, 3.3, 3.4, 7.3, 8.1, 8.3_

  - [x] 2.2 Write property tests for `buildRumConfig` (P1, P2)
    - **Property 1: RUM config correctness** — For any valid env var set, verify config includes `sessionSampleRate: 1`, correct telemetries, identity pool ID, endpoint, and region defaults to `us-east-1`
    - **Validates: Requirements 1.1, 1.4, 1.5, 1.6, 1.7, 2.3**
    - **Property 2: Missing config skips initialization** — For any subset of required env vars with at least one missing, verify `buildRumConfig` returns `null`
    - **Validates: Requirements 1.3, 2.2, 2.4**

  - [x] 2.3 Write property tests for `extractSessionMetadata` (P6)
    - **Property 6: Session metadata contains only user UUID** — For any user object with PII fields, verify metadata contains only `userId` set to `user.id`
    - **Validates: Requirements 8.1, 8.3**

  - [x] 2.4 Write property tests for `recordRumEvent` standalone (P3, P4)
    - **Property 3: No-op when RUM is disabled** — For any event type and data, calling `recordRumEvent` with null client does not throw
    - **Validates: Requirements 3.2, 3.4**
    - **Property 4: recordEvent error resilience** — For any event type and data, if `client.recordEvent()` throws, the wrapper catches and does not propagate
    - **Validates: Requirements 7.2, 7.3**

- [x] 3. Implement RumProvider component and useRum hook
  - [x] 3.1 Create `hooks/use-rum.ts` with `RumContext` and `useRum` hook
    - Export `RumContext` with `{ client, recordEvent }` shape
    - `useRum()` reads from context, `recordEvent` wraps in try-catch, no-ops if client is null
    - _Requirements: 3.1, 3.2, 3.5, 7.2_

  - [x] 3.2 Create `components/rum-provider.tsx` client component
    - `"use client"` directive
    - On mount: check env vars, skip in dev unless app ID set, dynamically `import('aws-rum-web')`, construct `AwsRum`, store in context and `lib/rum.ts` singleton
    - Subscribe to `supabase.auth.onAuthStateChange` for user metadata
    - All operations wrapped in try-catch with `[RUM]` prefixed `console.warn`
    - Renders `{children}` immediately without blocking
    - _Requirements: 1.1, 1.2, 1.3, 1.8, 2.2, 2.4, 4.1, 6.1, 6.2, 6.3, 7.1, 7.4, 8.1, 8.2_

  - [x] 3.3 Write property test for initialization error resilience (P7)
    - **Property 7: Initialization error resilience** — For any error thrown during dynamic import or constructor, RumProvider catches and client remains null
    - **Validates: Requirements 1.8, 7.1**

  - [x] 3.4 Write unit tests for RumProvider and useRum
    - Test: RumProvider renders children when RUM is disabled (no env vars)
    - Test: RumProvider renders children when RUM init fails
    - Test: useRum returns null client when outside provider
    - Test: recordRumEvent is callable before provider mounts (no-op)
    - **Property 8: Children render regardless of RUM state** (covered as unit test)
    - **Validates: Requirements 6.3, 7.4**

- [x] 4. Checkpoint - Verify core infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrate RumProvider into root layout
  - [x] 5.1 Modify `app/layout.tsx` to wrap children with `RumProvider`
    - Add `RumProvider` inside `<ThemeProvider>`, wrapping `<NavigationLoader>`, children, `<Toaster>`, and `<Sonner>`
    - _Requirements: 1.1, 1.2, 4.1, 4.2, 4.3, 4.4_

- [x] 6. Add custom event tracking to existing pages
  - [x] 6.1 Add `experiment_created` event to experiment creation handler
    - Call `recordRumEvent('experiment_created', { projectId })` at the existing creation success point
    - _Requirements: 5.1_

  - [x] 6.2 Add `report_generated` event to report generation dialog
    - Call `recordRumEvent('report_generated', { projectId, reportType })` at report generation success
    - _Requirements: 5.2_

  - [x] 6.3 Add `project_created` event to project creation handler
    - Call `recordRumEvent('project_created', {})` at project creation success
    - _Requirements: 5.3_

  - [x] 6.4 Add `catalyst_message_sent` event to Catalyst chat input
    - Call `recordRumEvent('catalyst_message_sent', {})` when a message is sent
    - _Requirements: 5.4_

  - [x] 6.5 Add `lab_note_created` event to lab note creation handler
    - Call `recordRumEvent('lab_note_created', { experimentId })` at lab note creation success
    - _Requirements: 5.5_

  - [x] 6.6 Add `protocol_created` event to protocol creation handler
    - Call `recordRumEvent('protocol_created', {})` at protocol creation success
    - _Requirements: 5.6_

  - [x] 6.7 Add `research_map_viewed` event to research map page
    - Call `recordRumEvent('research_map_viewed', {})` on page mount via `useEffect`
    - _Requirements: 5.7_

  - [x] 6.8 Add `user_logged_in` and `user_signed_up` events to auth callback
    - Detect login vs signup in the auth callback route and fire the appropriate event
    - _Requirements: 5.8, 5.9_

  - [x] 6.9 Write property test for custom event payload completeness (P5)
    - **Property 5: Custom event payload completeness** — For any project ID, report type, and experiment ID, verify event payloads include the required metadata fields
    - **Validates: Requirements 5.1, 5.2, 5.5**

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All RUM code is wrapped in try-catch — failures never break the application

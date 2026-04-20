# Implementation Plan: Reports Data Analysis

## Overview

Extend the existing Reports page with AI-powered data analysis report generation using the Notes9 `/chat` API. Implementation follows the same pattern as `app/api/ai/paper-chat/route.ts` — a simple JSON request/response flow with no SSE streaming. New files include an API route, types, report generator dialog, detail view, and loading/error states. Existing reports page and client are modified to wire up the new functionality.

## Tasks

- [x] 1. Create TypeScript types and database migration
  - [x] 1.1 Create `lib/report-agent-types.ts` with `ReportGenerationRequest` and `ReportGenerationResponse` types
    - Define `ReportGenerationRequest` with `query`, `projectId`, `projectName`, optional `experimentIds` and `experimentNames`
    - Define `ReportGenerationResponse` with `content: string`
    - _Requirements: 3.5_

  - [x] 1.2 Add `content` column to the `reports` table in Supabase
    - Run `ALTER TABLE reports ADD COLUMN content text;` via Supabase migration or SQL editor
    - _Requirements: 6.1_

- [x] 2. Implement the API route for report generation
  - [x] 2.1 Create `app/api/reports/generate/route.ts` following the `paper-chat/route.ts` pattern
    - Validate Bearer token from Authorization header (401 if missing)
    - Validate `query` and `projectName` from request body (400 if missing)
    - Return 503 if neither `NEXT_PUBLIC_NOTES9_API_URL` nor `AI_SERVICE_URL` is configured
    - Build data analysis system prompt via `buildReportSystemPrompt()` embedding project name and optional experiment names
    - Enrich query: `${systemPrompt}\n\nUser request: ${query}`
    - Call `{NOTES9_API_BASE}/chat` (or fallback `AI_SERVICE_URL/chat`) with `{ content, history: [], session_id }`
    - Return `{ content: string }` on success, forward upstream errors
    - Set `maxDuration = 60`
    - _Requirements: 1.2, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.2 Write property test: API route constructs correct upstream request
    - **Property 1: API route constructs correct upstream request**
    - **Validates: Requirements 1.2, 3.5**

  - [x] 2.3 Write property test: Missing auth token returns 401
    - **Property 4: Missing auth token returns 401**
    - **Validates: Requirements 3.3**

  - [x] 2.4 Write property test: Missing API URL returns 503
    - **Property 5: Missing API URL returns 503**
    - **Validates: Requirements 3.4**

  - [x] 2.5 Write unit tests for API route
    - Test specific example request and expected upstream body construction
    - Test 401 when token missing
    - Test 503 when no AI service configured
    - Test 400 when query empty or projectName missing
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Checkpoint - Ensure API route tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement the report generator dialog and hook
  - [x] 4.1 Create `useReportGeneration` hook in `app/(app)/reports/report-generator-dialog.tsx` (or a separate hooks file)
    - Implement `generate(request, token)` that POSTs to `/api/reports/generate`
    - Manage `isGenerating`, `content`, `error` state
    - Implement `reset()` to clear state
    - _Requirements: 1.1, 1.3, 1.5_

  - [x] 4.2 Create `app/(app)/reports/report-generator-dialog.tsx` with `ReportGeneratorDialog` component
    - Accept `open`, `onOpenChange`, `projects`, `experiments`, `userId` props
    - Render project select (required), experiment multi-select (optional, filtered by project), query textarea (required)
    - Show loading indicator while AI is generating
    - Show error message with retry on failure
    - On success: insert report into Supabase `reports` table with `content`, `status: "draft"`, `report_type: "data_analysis"`, `project_id`, `experiment_id`, `generated_by`
    - Extract title from first heading in generated content or use a default
    - Navigate to `/reports/[id]` after successful save
    - If Supabase insert fails, retain generated content and show error
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 7.3, 7.4_

  - [x] 4.3 Write property test: Report persistence contains all required fields
    - **Property 2: Report persistence contains all required fields**
    - **Validates: Requirements 1.5, 6.1, 6.2, 6.3**

  - [x] 4.4 Write property test: API errors are surfaced to the user
    - **Property 3: API errors are surfaced to the user**
    - **Validates: Requirements 1.6**

  - [x] 4.5 Write property test: Persistence failure retains generated content
    - **Property 9: Persistence failure retains generated content**
    - **Validates: Requirements 6.4**

  - [x] 4.6 Write unit tests for report generator dialog
    - Test dialog opens with correct form fields on button click
    - Test loading indicator during generation
    - _Requirements: 1.1, 7.4_

- [x] 5. Checkpoint - Ensure dialog and hook tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement report detail view
  - [x] 6.1 Create `app/(app)/reports/[id]/page.tsx` as a server component
    - Authenticate user, redirect to login if not authenticated
    - Fetch report by ID from Supabase with project, experiment, and profile joins
    - Call `notFound()` if report doesn't exist
    - Render `ReportDetailView` client component with report data
    - Set breadcrumb segments
    - _Requirements: 4.1, 4.5_

  - [x] 6.2 Create `app/(app)/reports/[id]/report-detail-view.tsx` client component
    - Accept `report` prop with full report data including `content`
    - Display title, status badge, type badge, creation date, project name, experiment name, author
    - Render `content` as formatted markdown (reuse existing markdown renderer or `HtmlContent`)
    - _Requirements: 4.2, 4.3, 4.4_

  - [x] 6.3 Write property test: Report detail displays all metadata fields
    - **Property 6: Report detail displays all metadata fields**
    - **Validates: Requirements 4.2**

  - [x] 6.4 Write unit tests for report detail view
    - Test renders "not found" for non-existent report
    - Test renders markdown content
    - Test navigates to /reports/[id] on view click
    - _Requirements: 4.1, 4.3, 4.5_

- [x] 7. Implement loading and error states
  - [x] 7.1 Create `app/(app)/reports/loading.tsx` skeleton loading state
    - Follow existing patterns from `dashboard/loading.tsx` and `projects/loading.tsx`
    - Show skeleton for header, filter row, and report card list
    - _Requirements: 7.1_

  - [x] 7.2 Create `app/(app)/reports/error.tsx` error boundary with retry
    - Display error message and "Try again" button that calls `reset()`
    - _Requirements: 7.2_

  - [x] 7.3 Write unit test for error boundary
    - Test renders error message and retry button
    - _Requirements: 7.2_

- [x] 8. Wire existing pages to new components
  - [x] 8.1 Modify `app/(app)/reports/page.tsx` to wire "Generate Report" button to dialog
    - Fetch projects and experiments from Supabase (same pattern as literature-reviews page)
    - Pass projects, experiments, and userId to `ReportGeneratorDialog`
    - Pass `onGenerateClick` handler to open the dialog
    - _Requirements: 1.1_

  - [x] 8.2 Modify `app/(app)/reports/reports-page-client.tsx` to add navigation and dialog trigger
    - Add `onClick` handler on report cards to navigate to `/reports/[id]` using `useRouter`
    - Wire "View" button to navigate to `/reports/[id]`
    - Wire "Generate First Report" and "Generate Report" buttons to open the dialog
    - Accept and forward dialog-related props
    - _Requirements: 4.1, 5.1, 5.3, 5.4_

  - [x] 8.3 Write property test: Reports are listed in reverse chronological order
    - **Property 7: Reports are listed in reverse chronological order**
    - **Validates: Requirements 5.1**

  - [x] 8.4 Write property test: Multi-filter intersection
    - **Property 8: Multi-filter intersection**
    - **Validates: Requirements 5.2**

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The API route follows the exact pattern of `app/api/ai/paper-chat/route.ts`
- No SSE streaming or clarification flows in this phase
- Reports page is already in the sidebar navigation — no sidebar changes needed

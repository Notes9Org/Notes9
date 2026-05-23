# Implementation Plan: Collaborative Editing

## Overview

This plan implements real-time collaborative editing for the TipTap-based paper editor using Yjs CRDT, Hocuspocus WebSocket server, and the existing Supabase infrastructure. Tasks are ordered to build incrementally: database schema first, then the collaboration server, then client-side integration, then UI components, and finally tests and documentation.

## Tasks

- [x] 1. Database migration for Yjs document storage
  - Create Supabase migration file `supabase/migrations/<timestamp>_collaborative_editing.sql`
  - Create `paper_yjs_documents` table with columns: `paper_id` (UUID PK, FK to papers.id ON DELETE CASCADE), `yjs_state` (BYTEA NOT NULL), `created_at` (TIMESTAMPTZ DEFAULT NOW()), `updated_at` (TIMESTAMPTZ DEFAULT NOW())
  - Add index `idx_paper_yjs_documents_updated_at` on `updated_at`
  - _Requirements: 4.4_

- [x] 2. Collaboration server setup and core implementation
  - [x] 2.1 Initialize collaboration server package
    - Create `collaboration-server/` directory with `package.json`, `tsconfig.json`, `.env.example`
    - Add dependencies: `@hocuspocus/server`, `@hocuspocus/extension-database`, `@hocuspocus/extension-logger`, `pg`, `jsonwebtoken`, `@tiptap/pm`, `@tiptap/starter-kit`, `yjs`
    - Configure TypeScript for Node.js ESM output
    - _Requirements: 6.1, 6.2_

  - [x] 2.2 Implement JWT authentication hook (`collaboration-server/src/auth.ts`)
    - Create `onAuthenticate` hook that extracts JWT from the WebSocket handshake token
    - Validate JWT signature against `JWT_SECRET` environment variable
    - Check token expiration; reject expired tokens
    - Extract user ID, email, and name from token payload
    - Return user context on success; throw on failure (results in connection rejection)
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 2.3 Write property test for JWT authentication
    - **Property 1: JWT Authentication Correctness**
    - Generate random JWT payloads (valid signatures, invalid signatures, expired, malformed)
    - Assert: valid+unexpired tokens accepted, all others rejected
    - **Validates: Requirements 1.3, 1.4, 1.5**

  - [x] 2.4 Implement database extension (`collaboration-server/src/database.ts`)
    - Create PostgreSQL connection pool using `DATABASE_URL` environment variable
    - Implement `fetch` handler: load `yjs_state` from `paper_yjs_documents` by paper ID
    - If no Yjs state exists but `papers.content` has HTML, convert HTML to Yjs state using TipTap schema (first-time migration)
    - Implement `store` handler: upsert `yjs_state` into `paper_yjs_documents`, render Yjs doc to HTML and update `papers.content` and `papers.updated_at`
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 7.1_

  - [x] 2.5 Implement HTML renderer (`collaboration-server/src/html-renderer.ts`)
    - Create a headless TipTap editor instance with the same extensions as the client (StarterKit, tables, math, etc.)
    - Implement `yDocToHtml(ydoc: Y.Doc): string` — renders Yjs document to HTML
    - Implement `htmlToYDoc(html: string): Y.Doc` — creates a Yjs document from HTML content
    - _Requirements: 4.5, 7.1_

  - [x] 2.6 Write property test for HTML-to-Yjs round trip
    - **Property 4: HTML-to-Yjs Round Trip Preserves Content**
    - Generate random HTML structures (headings, paragraphs, lists, tables with text content)
    - Assert: `yDocToHtml(htmlToYDoc(html))` preserves text content and structural elements
    - **Validates: Requirements 7.1, 4.5**

  - [x] 2.7 Implement server entry point (`collaboration-server/src/index.ts`)
    - Configure Hocuspocus server with port from `PORT` env var (default 8080)
    - Register auth hook, database extension, and logger extension
    - Configure `allowedOrigins` from `ALLOWED_ORIGINS` env var (comma-separated)
    - Set document unload timeout to 30 seconds (persist before unloading idle docs)
    - Implement `onDisconnect` hook to clean up awareness state
    - _Requirements: 4.2, 6.2_

  - [x] 2.8 Implement health check endpoint (`collaboration-server/src/health.ts`)
    - Add HTTP GET `/health` endpoint that returns 200 with `{ status: "ok" }`
    - Verify database connectivity in health check (optional: return 503 if DB unreachable)
    - _Requirements: 6.3_

  - [x] 2.9 Create Dockerfile for collaboration server
    - Multi-stage build: build TypeScript in first stage, run compiled JS in production stage
    - Use `node:20-alpine` as base image
    - Expose port 8080
    - Set `NODE_ENV=production`
    - _Requirements: 6.1_

- [x] 3. Checkpoint - Verify collaboration server builds and starts
  - Ensure `collaboration-server/` builds with `tsc` without errors
  - Ensure Docker image builds successfully
  - Ask the user if questions arise.

- [x] 4. Client-side collaboration hook and utilities
  - [x] 4.1 Create color assignment utility (`lib/collaboration/colors.ts`)
    - Define `COLLABORATOR_COLORS` array (12 distinct colors)
    - Implement `getCollaboratorColor(userId: string): string` using a deterministic hash of the user ID
    - Ensure same user always gets same color across sessions
    - _Requirements: 3.5, 9.5_

  - [x] 4.2 Write property test for deterministic color assignment
    - **Property 3: Deterministic Color Assignment**
    - Generate random user ID strings
    - Assert: `getCollaboratorColor(id)` always returns the same color for the same ID, and the color is always within the predefined palette
    - **Validates: Requirements 3.5, 9.5**

  - [x] 4.3 Create collaboration hook (`lib/collaboration/use-collaboration.ts`)
    - Implement `useCollaboration({ paperId, enabled })` hook
    - Create `Y.Doc` instance when enabled
    - Create `HocuspocusProvider` with paper ID as document name, Supabase JWT as token
    - Track connection status: `connecting`, `connected`, `disconnected`
    - Track collaborators from awareness protocol (userId, name, color, cursor position)
    - Handle token refresh: get fresh Supabase session token on reconnect
    - Clean up provider and Y.Doc on unmount
    - Implement automatic reconnection with exponential backoff (handled by HocuspocusProvider)
    - _Requirements: 1.1, 1.2, 5.1, 5.2, 5.3_

  - [x] 4.4 Create collaboration configuration utility (`lib/collaboration/config.ts`)
    - Export `isCollaborationEnabled(): boolean` — checks if `NEXT_PUBLIC_COLLABORATION_URL` is set
    - Export `getCollaborationUrl(): string` — returns the WebSocket URL
    - _Requirements: 1.6, 7.3_

- [x] 5. Editor integration with collaboration extensions
  - [x] 5.1 Update `PaperEditor` to accept collaboration props
    - Add optional props: `ydoc`, `provider`, `collaborationEnabled`, `userName`, `userColor`
    - Pass these through to `TiptapEditor`
    - _Requirements: 8.1, 8.2_

  - [x] 5.2 Update `TiptapEditor` extension configuration for collaboration mode
    - When `collaborationEnabled` is true and `ydoc`/`provider` are provided:
      - Configure `StarterKit` with `history: false`
      - Add `Collaboration.configure({ document: ydoc, field: 'default' })`
      - Add `CollaborationCursor.configure({ provider, user: { name, color } })`
    - When collaboration is not active:
      - Keep existing configuration unchanged (history enabled)
    - Ensure all other extensions (tables, math, images, mentions, etc.) remain unchanged
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 5.3 Write property test for history extension toggle
    - **Property 5: History Extension Toggled by Collaboration State**
    - Generate boolean collaboration state
    - Assert: when collaboration is active, history extension is NOT in the extension list; when inactive, history IS present
    - **Validates: Requirements 8.3, 8.5**

  - [x] 5.4 Update `PaperWorkspace` to wire collaboration
    - Import and use `useCollaboration` hook with the paper ID
    - Pass `ydoc`, `provider`, status, and user info to `PaperEditor`
    - When collaboration is connected, disable client-side `debouncedSave` (server handles persistence)
    - When collaboration is disconnected or unavailable, re-enable client-side auto-save as fallback
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 6. Checkpoint - Verify editor loads with collaboration extensions
  - Ensure the app builds without TypeScript errors after editor integration changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. UI components for collaboration awareness
  - [x] 7.1 Create connection status indicator (`components/collaboration/connection-status.tsx`)
    - Accept `status: 'connecting' | 'connected' | 'disconnected'` prop
    - Render green dot (static) for connected, yellow dot (pulse animation) for connecting, red dot (static) for disconnected
    - Show tooltip on hover with descriptive text
    - _Requirements: 5.4_

  - [x] 7.2 Write property test for connection status indicator
    - **Property 6: Connection Status Indicator Correctness**
    - Generate connection status values from the set {connecting, connected, disconnected}
    - Assert: each status maps to exactly one visual state (yellow/pulse, green/static, red/static)
    - **Validates: Requirements 5.4**

  - [x] 7.3 Create collaborator avatars component (`components/collaboration/collaborator-avatars.tsx`)
    - Accept `collaborators: CollaboratorInfo[]` and `maxVisible?: number` (default 5)
    - Render avatar circles with user initials and colored border matching their cursor color
    - Show tooltip with user name on hover
    - Show "+N" overflow indicator when collaborators exceed `maxVisible`
    - _Requirements: 9.1, 9.4, 9.5_

  - [x] 7.4 Write property test for collaborator avatar rendering
    - **Property 7: Collaborator Avatar Rendering**
    - Generate random collaborator lists (0-20 items) with varying `maxVisible` values
    - Assert: renders exactly `min(N, maxVisible)` avatars, plus overflow indicator iff N > maxVisible
    - **Validates: Requirements 9.1**

  - [x] 7.5 Integrate UI components into `PaperWorkspace` header
    - Add `ConnectionStatus` indicator next to the existing `SaveStatusIndicator`
    - Add `CollaboratorAvatars` component in the paper header area (between title and action buttons)
    - Only render collaboration UI when `isCollaborationEnabled()` returns true
    - _Requirements: 5.4, 9.1, 9.2, 9.3_

- [x] 8. CRDT merge correctness test
  - [x] 8.1 Write property test for CRDT merge preserving all edits
    - **Property 2: CRDT Merge Preserves All Edits**
    - Generate two random sequences of text edits (inserts and deletes at random positions)
    - Apply each sequence independently to separate Y.Doc copies of the same initial state
    - Merge both update sets into a single document
    - Assert: all inserted characters from both sequences are present in the merged result (no data loss)
    - **Validates: Requirements 2.4, 2.5**

- [x] 9. Unit tests for collaboration components
  - [x] 9.1 Write unit tests for `use-collaboration` hook
    - Test provider creation with correct document name and token
    - Test cleanup on unmount (provider destroy, ydoc destroy)
    - Test status transitions (connecting → connected → disconnected)
    - Test collaborator list updates from awareness protocol
    - _Requirements: 1.1, 5.1, 9.2, 9.3_

  - [x] 9.2 Write unit tests for collaboration UI components
    - Test `ConnectionStatus` renders correct visual for each status
    - Test `CollaboratorAvatars` renders correct number of avatars and overflow
    - Test tooltip content for both components
    - _Requirements: 5.4, 9.1, 9.4_

  - [x] 9.3 Write unit tests for editor configuration
    - Test that collaboration mode disables history extension
    - Test that non-collaboration mode keeps history extension
    - Test that collaboration extensions are added only when ydoc/provider are provided
    - _Requirements: 8.3, 8.5_

- [x] 10. Final checkpoint - Full build and test verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Add environment variable to `.env.example` and deployment documentation
  - Add `NEXT_PUBLIC_COLLABORATION_URL=` to `.env.example` with a comment explaining its purpose
  - Ensure the design document's AWS Deployment Guide section is referenced from a `collaboration-server/DEPLOYMENT.md` file for easy developer access
  - _Requirements: 6.4, 6.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The collaboration server is a separate package (`collaboration-server/`) within this monorepo
- AWS infrastructure setup (ECS, ALB, Route 53) is manual — only the Dockerfile and server code are implementation tasks
- Changes to `tiptap-editor.tsx` should be minimal and surgical (conditional extension configuration only)
- The feature is gated by `NEXT_PUBLIC_COLLABORATION_URL` — when unset, the app behaves exactly as it does today

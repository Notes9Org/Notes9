# Requirements Document

## Introduction

Add real-time collaborative editing to the TipTap-based paper editor, enabling multiple users to simultaneously edit the same paper with Google Docs-style presence awareness (live cursors, selections, and edits). The solution uses Yjs as the CRDT layer, Hocuspocus as the WebSocket collaboration server, and integrates with the existing Supabase authentication and PostgreSQL persistence. The Hocuspocus server runs as a standalone service deployed on AWS (ECS/Fargate), separate from the Next.js application. The existing client-side auto-save mechanism will be replaced by server-side document persistence through the Hocuspocus database extension.

## Glossary

- **Collaboration_Server**: A standalone Hocuspocus WebSocket server that synchronizes Yjs document state between connected clients and persists documents to the database
- **Yjs_Document**: A Yjs `Y.Doc` instance representing the shared CRDT document state for a single paper
- **WebSocket_Provider**: The `@hocuspocus/provider` client-side instance (`HocuspocusProvider`) that connects the TipTap editor to the Collaboration_Server via WebSocket
- **Collaboration_Extension**: The `@tiptap/extension-collaboration` TipTap extension that binds the editor to a Yjs_Document fragment for conflict-free real-time editing
- **Cursor_Extension**: The `@tiptap/extension-collaboration-cursor` TipTap extension that broadcasts and renders remote user cursors and selections
- **Awareness_Protocol**: The Yjs awareness protocol that broadcasts ephemeral user presence data (cursor position, selection, user name, user color) to all connected peers
- **Database_Extension**: The `@hocuspocus/extension-database` server extension that loads and persists Yjs_Document binary state to the Supabase PostgreSQL database
- **Auth_Token**: A Supabase JWT access token sent during the WebSocket handshake to authenticate and authorize the connecting user
- **Paper_Workspace**: The `app/(app)/papers/paper-workspace.tsx` component that manages paper loading, title editing, and the editor lifecycle
- **Paper_Editor**: The `components/text-editor/paper-editor.tsx` wrapper component that configures TipTap for academic paper editing
- **Collaboration_Config**: Environment variables required to configure the WebSocket connection (`NEXT_PUBLIC_COLLABORATION_URL`)
- **User_Presence**: The visible representation of a remote collaborator including their cursor position, text selection highlight, name label, and assigned color

## Requirements

### Requirement 1: WebSocket Connection and Authentication

**User Story:** As a user, I want the paper editor to automatically connect to the collaboration server when I open a paper, so that my edits are synchronized with other collaborators in real-time.

#### Acceptance Criteria

1. WHEN a user opens a paper in the Paper_Workspace, THE WebSocket_Provider SHALL establish a WebSocket connection to the Collaboration_Server using the paper ID as the document name
2. THE WebSocket_Provider SHALL include the user's Supabase Auth_Token in the WebSocket handshake as an authentication credential
3. WHEN the Collaboration_Server receives a connection request, THE Collaboration_Server SHALL validate the Auth_Token by verifying the JWT signature against the Supabase JWT secret
4. IF the Auth_Token is invalid or expired, THEN THE Collaboration_Server SHALL reject the WebSocket connection with an appropriate error code
5. IF the Auth_Token is valid, THEN THE Collaboration_Server SHALL authorize the connection and allow the client to join the document room
6. WHEN the Collaboration_Config environment variable `NEXT_PUBLIC_COLLABORATION_URL` is not set, THE Paper_Editor SHALL fall back to single-user editing mode without collaboration features

### Requirement 2: Real-Time Document Synchronization

**User Story:** As a user, I want my edits to appear instantly for other collaborators and their edits to appear instantly for me, so that we can work together seamlessly on the same paper.

#### Acceptance Criteria

1. WHEN a user types, deletes, or formats text in the editor, THE Collaboration_Extension SHALL encode the change as a Yjs update and transmit it to the Collaboration_Server via the WebSocket_Provider
2. WHEN the Collaboration_Server receives a Yjs update from one client, THE Collaboration_Server SHALL broadcast the update to all other clients connected to the same document
3. WHEN the WebSocket_Provider receives a remote Yjs update, THE Collaboration_Extension SHALL apply the update to the local Yjs_Document and reflect the change in the TipTap editor
4. THE Collaboration_Extension SHALL resolve concurrent edits using Yjs CRDT conflict resolution without data loss
5. WHEN two users edit the same paragraph simultaneously, THE Collaboration_Extension SHALL merge both edits preserving all characters from both users

### Requirement 3: User Presence and Cursors

**User Story:** As a user, I want to see where other collaborators are editing (their cursors and selections), so that I can avoid conflicts and coordinate work on different sections.

#### Acceptance Criteria

1. WHEN a user moves their cursor or changes their text selection, THE Cursor_Extension SHALL broadcast the cursor position and selection range via the Awareness_Protocol
2. WHEN the WebSocket_Provider receives a remote user's awareness update, THE Cursor_Extension SHALL render a colored cursor indicator at the remote user's cursor position
3. THE Cursor_Extension SHALL display the remote user's name as a label above or beside their cursor indicator
4. WHEN a remote user selects text, THE Cursor_Extension SHALL render a colored highlight over the selected text range using the remote user's assigned color
5. THE Paper_Editor SHALL assign each collaborator a distinct color from a predefined palette based on their user ID
6. WHEN a remote user disconnects from the document, THE Cursor_Extension SHALL remove their cursor indicator and selection highlight within 5 seconds

### Requirement 4: Server-Side Document Persistence

**User Story:** As a user, I want my collaborative edits to be automatically saved on the server, so that no work is lost even if all collaborators close their browsers.

#### Acceptance Criteria

1. THE Collaboration_Server SHALL persist the Yjs_Document binary state to the Supabase PostgreSQL database using the Database_Extension
2. WHEN a document has no connected clients for more than 30 seconds, THE Collaboration_Server SHALL persist the final document state before unloading it from memory
3. WHEN a new client connects to a document that exists in the database, THE Collaboration_Server SHALL load the persisted Yjs_Document state and provide it to the connecting client
4. THE Collaboration_Server SHALL store the document state as a binary column (`bytea`) in a `paper_yjs_documents` table, keyed by paper ID
5. THE Collaboration_Server SHALL also store an HTML rendering of the document content in the existing `papers.content` column so that non-collaborative features (export, AI tools, search) continue to work
6. WHEN the Collaboration_Server persists a document, THE Collaboration_Server SHALL update the `papers.updated_at` timestamp

### Requirement 5: Connection Resilience and Offline Handling

**User Story:** As a user, I want the editor to handle network interruptions gracefully, so that I do not lose my work if my connection drops temporarily.

#### Acceptance Criteria

1. WHEN the WebSocket connection is lost, THE WebSocket_Provider SHALL attempt to reconnect automatically with exponential backoff
2. WHILE the WebSocket connection is disconnected, THE editor SHALL remain editable and buffer local changes in the Yjs_Document
3. WHEN the WebSocket connection is re-established, THE WebSocket_Provider SHALL synchronize all buffered local changes with the Collaboration_Server
4. THE Paper_Workspace SHALL display a connection status indicator showing whether the collaboration connection is active, reconnecting, or disconnected
5. IF the WebSocket_Provider fails to reconnect after 30 seconds, THEN THE Paper_Workspace SHALL display a warning notification to the user

### Requirement 6: Collaboration Server Deployment

**User Story:** As a developer, I want clear deployment instructions for the Hocuspocus collaboration server on AWS, so that I can set up the production infrastructure independently.

#### Acceptance Criteria

1. THE Collaboration_Server package SHALL include a Dockerfile that builds a production-ready container image
2. THE Collaboration_Server SHALL be configurable via environment variables for: database connection string, JWT secret, port, and allowed origins (CORS)
3. THE Collaboration_Server SHALL expose a health check endpoint at `/health` that returns HTTP 200 when the server is ready to accept WebSocket connections
4. THE project SHALL include detailed deployment documentation covering AWS ECS/Fargate setup, Application Load Balancer configuration with WebSocket support, security group rules, and environment variable configuration
5. THE deployment documentation SHALL include instructions for configuring TLS termination at the load balancer for secure WebSocket connections (wss://)

### Requirement 7: Migration from Client-Side Auto-Save

**User Story:** As a developer, I want the transition from client-side auto-save to server-side persistence to be seamless, so that existing papers are not lost and the editor continues to work for users who have not yet migrated.

#### Acceptance Criteria

1. WHEN a paper has existing HTML content in the `papers.content` column but no Yjs_Document state in `paper_yjs_documents`, THE Collaboration_Server SHALL create a new Yjs_Document from the HTML content on first connection
2. WHEN collaboration mode is active (WebSocket connected), THE Paper_Workspace SHALL disable the client-side debounced auto-save to avoid conflicts with server-side persistence
3. WHEN collaboration mode is not available (server unreachable or `NEXT_PUBLIC_COLLABORATION_URL` not set), THE Paper_Workspace SHALL use the existing client-side auto-save mechanism as a fallback
4. THE migration from HTML-only to Yjs-backed documents SHALL be transparent to the user with no manual action required

### Requirement 8: Collaboration-Aware Editor Configuration

**User Story:** As a developer, I want the TipTap editor to be properly configured for collaboration mode, so that all existing extensions work correctly alongside the collaboration extensions.

#### Acceptance Criteria

1. WHEN collaboration mode is active, THE Paper_Editor SHALL configure the TipTap editor with the Collaboration_Extension bound to the `default` fragment of the Yjs_Document
2. WHEN collaboration mode is active, THE Paper_Editor SHALL configure the TipTap editor with the Cursor_Extension using the Awareness_Protocol from the WebSocket_Provider
3. WHEN collaboration mode is active, THE Paper_Editor SHALL disable the TipTap `history` extension (undo/redo) from StarterKit and rely on the Yjs undo manager provided by the Collaboration_Extension
4. THE Collaboration_Extension SHALL work alongside all existing TipTap extensions (tables, math, images, mentions, highlights, task lists) without conflicts
5. WHEN collaboration mode is not active, THE Paper_Editor SHALL configure the TipTap editor in single-user mode with the standard history extension, preserving current behavior

### Requirement 9: Active Collaborators Display

**User Story:** As a user, I want to see who else is currently editing the same paper, so that I know my collaborators are present and active.

#### Acceptance Criteria

1. THE Paper_Workspace SHALL display a list of active collaborators (avatars or initials) in the paper header area
2. WHEN a new user connects to the document, THE collaborator list SHALL update within 2 seconds to include the new user
3. WHEN a user disconnects from the document, THE collaborator list SHALL remove them within 5 seconds
4. THE collaborator list SHALL show each user's name on hover (tooltip)
5. THE collaborator list SHALL use the same color assigned to each user's cursor for their avatar border or background


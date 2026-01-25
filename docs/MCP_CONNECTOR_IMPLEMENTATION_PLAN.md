# MCP Connector Implementation Plan for Catalyst AI

## Overview

This document outlines the implementation plan for adding Model Context Protocol (MCP) connector functionality to the Catalyst AI chatbot in Notes9. This will allow users to connect external MCP servers to extend Catalyst's capabilities with custom tools, resources, and prompts.

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [MCP Integration Architecture](#mcp-integration-architecture)
3. [Component Design](#component-design)
4. [Database Schema](#database-schema)
5. [Implementation Phases](#implementation-phases)
6. [API Routes](#api-routes)
7. [UI Components](#ui-components)
8. [Security Considerations](#security-considerations)

---

## Current Architecture

### Catalyst AI Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CATALYST AI CHATBOT                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐   │
│  │  catalyst-page   │────▶│   /api/chat      │────▶│  Google Gemini   │   │
│  │     .tsx         │     │    route.ts      │     │     API          │   │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘   │
│           │                        │                                       │
│           │                        │                                       │
│           ▼                        ▼                                       │
│  ┌──────────────────┐     ┌──────────────────┐                            │
│  │  useChat hook    │     │   streamText()   │                            │
│  │  @ai-sdk/react   │     │   Vercel AI SDK  │                            │
│  └──────────────────┘     └──────────────────┘                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Current File Structure

| File | Purpose |
|------|---------|
| `components/catalyst/catalyst-page.tsx` | Main chat component with useChat hook |
| `components/catalyst/catalyst-messages.tsx` | Message rendering |
| `components/catalyst/catalyst-input.tsx` | Input with attachments & model selector |
| `components/catalyst/catalyst-sidebar.tsx` | Chat history sidebar |
| `app/api/chat/route.ts` | Chat API with streamText |
| `hooks/use-chat-sessions.ts` | Session management |
| `lib/ai/models.ts` | Model configuration |

### Current Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| AI SDK | Vercel AI SDK v5.0.115 |
| React Hooks | @ai-sdk/react v2.0.117 |
| LLM Provider | @ai-sdk/google (Gemini) |
| Database | Supabase (PostgreSQL) |
| Streaming | smoothStream (word chunking) |

---

## MCP Integration Architecture

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CATALYST AI + MCP                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                      │
│  │   catalyst-page  │                                                      │
│  │      .tsx        │                                                      │
│  └────────┬─────────┘                                                      │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐     ┌──────────────────────────────────────────┐    │
│  │  catalyst-input  │     │           MCP CONNECTOR UI               │    │
│  │      .tsx        │     │  ┌────────────┐  ┌────────────────────┐  │    │
│  │                  │     │  │  Settings  │  │  Connected Servers │  │    │
│  │  [📎] [⏰] [🔌]◀─┼─────│  │   Modal    │  │      Status        │  │    │
│  │                  │     │  └────────────┘  └────────────────────┘  │    │
│  └────────┬─────────┘     └──────────────────────────────────────────┘    │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                      │
│  │   /api/chat      │◀─────────────────────────────────────────────┐      │
│  │    route.ts      │                                               │      │
│  └────────┬─────────┘                                               │      │
│           │                                                          │      │
│           ▼                                                          │      │
│  ┌──────────────────┐     ┌──────────────────────────────────────┐  │      │
│  │   streamText()   │     │         MCP CONNECTOR MODULE         │  │      │
│  │   with tools     │◀────│                                      │──┘      │
│  └────────┬─────────┘     │  ┌─────────────────────────────────┐ │        │
│           │               │  │   lib/mcp/connector.ts          │ │        │
│           │               │  │   - createMCPToolsFromServers() │ │        │
│           │               │  │   - getUserMCPServers()         │ │        │
│           │               │  │   - validateMCPServer()         │ │        │
│           │               │  └─────────────────────────────────┘ │        │
│           │               │                                      │        │
│           │               │  ┌─────────────────────────────────┐ │        │
│           │               │  │   lib/mcp/client-pool.ts        │ │        │
│           │               │  │   - MCPClientPool (singleton)   │ │        │
│           │               │  │   - Connection management       │ │        │
│           │               │  └─────────────────────────────────┘ │        │
│           │               └──────────────────────────────────────┘        │
│           │                                                                │
│           ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │                     EXTERNAL MCP SERVERS                          │     │
│  │                                                                    │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │     │
│  │  │  Notion  │  │  GitHub  │  │  Slack   │  │  Custom Server   │  │     │
│  │  │   MCP    │  │   MCP    │  │   MCP    │  │   (User's own)   │  │     │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │     │
│  │                                                                    │     │
│  └──────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Design

### MCP Connector Button (in catalyst-input.tsx)

```
┌─────────────────────────────────────────────────────────────────┐
│  Chat Input Area                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  How can I help you today?                                │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [📎 Attach] [⏰ History] [🔌 MCP]              [Model ▼] [➤]   │
│                              │                                   │
│                              │  Click opens MCP Settings Modal   │
│                              ▼                                   │
└─────────────────────────────────────────────────────────────────┘
```

### MCP Settings Modal

```
┌─────────────────────────────────────────────────────────────────┐
│  MCP Connections                                           [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Connected Servers                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  🟢 Notion MCP                              [Edit] [🗑️]   │  │
│  │     https://notion-mcp.vercel.app/mcp                     │  │
│  │     Tools: 5 | Resources: 3                               │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  🟢 GitHub MCP                              [Edit] [🗑️]   │  │
│  │     https://github-mcp.example.com/mcp                    │  │
│  │     Tools: 8 | Resources: 0                               │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  🔴 Custom Server (Offline)                 [Edit] [🗑️]   │  │
│  │     https://my-mcp.internal/mcp                           │  │
│  │     Connection failed                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [+ Add New MCP Server]                                         │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Add New Server                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Name:      [________________________]                    │  │
│  │  URL:       [________________________]                    │  │
│  │  Transport: [HTTP ▼]                                      │  │
│  │  Headers:   [+ Add Header]                                │  │
│  │             Authorization: [Bearer ___________]           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Test Connection]                    [Cancel] [Save Server]    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Tables

```sql
-- Table: mcp_servers
-- Stores user's MCP server configurations
CREATE TABLE mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  transport_type TEXT NOT NULL CHECK (transport_type IN ('http', 'sse')),
  url TEXT NOT NULL,
  headers JSONB DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT true,
  last_connected_at TIMESTAMPTZ,
  connection_status TEXT DEFAULT 'unknown' CHECK (connection_status IN ('connected', 'disconnected', 'error', 'unknown')),
  error_message TEXT,
  tools_count INTEGER DEFAULT 0,
  resources_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_mcp_servers_user_id ON mcp_servers(user_id);
CREATE INDEX idx_mcp_servers_enabled ON mcp_servers(user_id, is_enabled);

-- RLS Policies
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own MCP servers"
  ON mcp_servers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own MCP servers"
  ON mcp_servers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own MCP servers"
  ON mcp_servers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own MCP servers"
  ON mcp_servers FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_mcp_servers_updated_at
  BEFORE UPDATE ON mcp_servers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Schema Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        mcp_servers                               │
├─────────────────────────────────────────────────────────────────┤
│  id              UUID          PK                                │
│  user_id         UUID          FK → profiles.id                  │
│  name            TEXT          NOT NULL                          │
│  description     TEXT                                            │
│  transport_type  TEXT          'http' | 'sse'                    │
│  url             TEXT          NOT NULL                          │
│  headers         JSONB         { "Authorization": "Bearer..." }  │
│  is_enabled      BOOLEAN       DEFAULT true                      │
│  last_connected  TIMESTAMPTZ                                     │
│  status          TEXT          'connected' | 'error' | etc.      │
│  error_message   TEXT                                            │
│  tools_count     INTEGER                                         │
│  resources_count INTEGER                                         │
│  created_at      TIMESTAMPTZ                                     │
│  updated_at      TIMESTAMPTZ                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Infrastructure

| Task | File | Description |
|------|------|-------------|
| 1.1 | `package.json` | Add `@ai-sdk/mcp` dependency |
| 1.2 | `scripts/xxx_mcp_servers.sql` | Create database schema |
| 1.3 | `lib/mcp/types.ts` | Define TypeScript interfaces |
| 1.4 | `lib/mcp/connector.ts` | Core MCP client creation logic |
| 1.5 | `lib/mcp/client-pool.ts` | Connection pooling & management |

### Phase 2: API Routes

| Task | File | Description |
|------|------|-------------|
| 2.1 | `app/api/mcp/servers/route.ts` | CRUD for MCP servers |
| 2.2 | `app/api/mcp/test/route.ts` | Test server connection |
| 2.3 | `app/api/mcp/tools/route.ts` | List available tools |
| 2.4 | `app/api/chat/route.ts` | Integrate MCP tools into chat |

### Phase 3: UI Components

| Task | File | Description |
|------|------|-------------|
| 3.1 | `components/catalyst/mcp-button.tsx` | MCP button for input toolbar |
| 3.2 | `components/catalyst/mcp-settings-modal.tsx` | Main settings dialog |
| 3.3 | `components/catalyst/mcp-server-card.tsx` | Server display card |
| 3.4 | `components/catalyst/mcp-server-form.tsx` | Add/edit server form |
| 3.5 | `components/catalyst/catalyst-input.tsx` | Add MCP button to toolbar |

### Phase 4: Integration & Polish

| Task | File | Description |
|------|------|-------------|
| 4.1 | `hooks/use-mcp-servers.ts` | React hook for MCP state |
| 4.2 | `lib/mcp/presets.ts` | Popular MCP server presets |
| 4.3 | Tests | Unit & integration tests |
| 4.4 | Documentation | User guide & API docs |

---

## API Routes

### GET /api/mcp/servers

List user's MCP servers.

**Response:**
```json
{
  "servers": [
    {
      "id": "uuid",
      "name": "Notion MCP",
      "url": "https://notion-mcp.vercel.app/mcp",
      "transport_type": "http",
      "is_enabled": true,
      "connection_status": "connected",
      "tools_count": 5,
      "resources_count": 3
    }
  ]
}
```

### POST /api/mcp/servers

Add new MCP server.

**Request:**
```json
{
  "name": "My Server",
  "url": "https://my-server.com/mcp",
  "transport_type": "http",
  "headers": {
    "Authorization": "Bearer xxx"
  }
}
```

### POST /api/mcp/test

Test MCP server connection.

**Request:**
```json
{
  "url": "https://my-server.com/mcp",
  "transport_type": "http",
  "headers": {}
}
```

**Response:**
```json
{
  "success": true,
  "tools": ["tool1", "tool2"],
  "resources": ["resource1"],
  "latency_ms": 234
}
```

### Updated /api/chat

```typescript
// app/api/chat/route.ts
import { streamText, convertToCoreMessages, smoothStream } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMCPToolsFromServers } from '@/lib/mcp/connector';
import { getUserMCPServers } from '@/lib/mcp/config';

export async function POST(req: Request) {
  const { messages, modelId, userId } = await req.json();

  // Get user's enabled MCP servers
  const mcpServers = await getUserMCPServers(userId);
  
  // Create MCP tools from connected servers
  const { tools, clients } = await createMCPToolsFromServers(mcpServers);

  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
  
  const result = streamText({
    model: google(modelId),
    system: `You are Catalyst...`,
    messages: convertToCoreMessages(messages),
    tools,           // MCP tools injected
    maxSteps: 5,     // Allow multi-step tool usage
    experimental_transform: smoothStream({ chunking: 'word' }),
    onFinish: async () => {
      // Close all MCP clients when done
      await Promise.all(clients.map(c => c.close()));
    },
  });

  return result.toUIMessageStreamResponse();
}
```

---

## UI Components

### MCP Button Component

```typescript
// components/catalyst/mcp-button.tsx
'use client';

import { useState } from 'react';
import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MCPSettingsModal } from './mcp-settings-modal';
import { useMCPServers } from '@/hooks/use-mcp-servers';

export function MCPButton() {
  const [open, setOpen] = useState(false);
  const { servers, connectedCount } = useMCPServers();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-lg text-muted-foreground hover:text-foreground relative"
        onClick={() => setOpen(true)}
        title="MCP Connections"
      >
        <Plug className="size-4" />
        {connectedCount > 0 && (
          <Badge 
            variant="secondary" 
            className="absolute -top-1 -right-1 size-4 p-0 flex items-center justify-center text-[10px]"
          >
            {connectedCount}
          </Badge>
        )}
      </Button>
      
      <MCPSettingsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
```

### Integration in catalyst-input.tsx

```typescript
// In the toolbar section, add MCP button:
<div className="flex items-center gap-1">
  <Button /* Paperclip - Attach files */ />
  <Button /* Clock - History */ />
  <MCPButton />  {/* NEW: MCP Connections */}
</div>
```

---

## OAuth Authentication for MCP Servers

Some MCP servers (like BioMCP) require OAuth authentication. We've implemented full OAuth support.

### OAuth Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OAuth Flow for MCP                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐              │
│  │   User       │      │  Catalyst    │      │  MCP Server  │              │
│  │   Browser    │      │  Backend     │      │  (BioMCP)    │              │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘              │
│         │                     │                      │                      │
│         │  1. Test Connection │                      │                      │
│         │─────────────────────▶                      │                      │
│         │                     │  2. Attempt Connect  │                      │
│         │                     │─────────────────────▶│                      │
│         │                     │  3. 401 Unauthorized │                      │
│         │                     │◀─────────────────────│                      │
│         │  4. Auth Required   │                      │                      │
│         │◀─────────────────────                      │                      │
│         │                     │                      │                      │
│         │  5. Open OAuth Popup                       │                      │
│         │─────────────────────────────────────────▶ │                      │
│         │                     │                      │                      │
│         │  6. User Authenticates                     │                      │
│         │◀────────────────────────────────────────── │                      │
│         │                     │                      │                      │
│         │  7. Auth Code       │                      │                      │
│         │─────────────────────▶                      │                      │
│         │                     │  8. Exchange Code    │                      │
│         │                     │─────────────────────▶│                      │
│         │                     │  9. Access Token     │                      │
│         │                     │◀─────────────────────│                      │
│         │  10. Success        │                      │                      │
│         │◀─────────────────────                      │                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### OAuth API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/mcp/auth/connect` | POST | Initiate OAuth connection, returns authUrl if required |
| `/api/mcp/auth/callback` | GET | OAuth callback handler, displays success/error page |
| `/api/mcp/auth/finish` | POST | Complete OAuth flow with auth code |
| `/api/mcp/auth/disconnect` | POST | Disconnect and clear OAuth tokens |

### Database Schema (OAuth Fields)

```sql
-- Added to mcp_servers table
requires_auth BOOLEAN DEFAULT false,
oauth_client_id TEXT,
oauth_client_secret TEXT,
oauth_access_token TEXT,
oauth_refresh_token TEXT,
oauth_token_expires_at TIMESTAMPTZ,
oauth_scopes TEXT,
```

### Example: Connecting to BioMCP

```typescript
// 1. User clicks "Add Server" with URL: https://remote.biomcp.org/mcp
// 2. System detects OAuth requirement
const result = await connectWithOAuth('https://remote.biomcp.org/mcp');
// result.requiresAuth = true, result.authUrl = 'https://accounts.google.com/...'

// 3. Opens OAuth popup, user signs in with Google
window.open(result.authUrl, 'mcp-oauth-popup', 'width=600,height=700');

// 4. On success, callback sends auth code via postMessage
// 5. Complete OAuth
await finishOAuth(authCode, sessionId, serverId);
// Now connected with 34 biomedical tools!
```

### Supported OAuth Providers

| MCP Server | OAuth Provider | Scopes |
|------------|---------------|--------|
| BioMCP | Google | mcp:tools |
| GitHub MCP | GitHub | repo, issues |
| Notion MCP | Notion | read, write |

---

## Security Considerations

### Server-Side Validation

| Check | Description |
|-------|-------------|
| URL Validation | Only allow HTTPS URLs for remote servers |
| Rate Limiting | Limit MCP requests per user |
| Timeout | Set reasonable timeouts for MCP calls |
| Header Sanitization | Sanitize user-provided headers |

### OAuth Security

| Check | Description |
|-------|-------------|
| Token Encryption | OAuth tokens stored encrypted in database |
| Token Refresh | Automatic refresh before expiration |
| PKCE | Use PKCE flow for enhanced security |
| State Parameter | Validate state to prevent CSRF |

### Client-Side Security

| Check | Description |
|-------|-------------|
| Credential Storage | Never store API keys in localStorage |
| CORS | MCP servers must support CORS |
| CSP | Update Content Security Policy for MCP URLs |

### Data Privacy

| Consideration | Implementation |
|---------------|----------------|
| User Data | MCP servers may receive user queries |
| Audit Log | Log MCP tool invocations |
| Consent | Inform users before sending data to MCP servers |

---

## Dependencies

### Required Packages

```bash
# AI SDK MCP integration
pnpm add @ai-sdk/mcp

# Official MCP SDK for OAuth and advanced features
pnpm add @modelcontextprotocol/sdk
```

### Package Versions (Installed)

| Package | Version | Purpose |
|---------|---------|---------|
| `ai` | 5.0.115 | Core AI SDK |
| `@ai-sdk/mcp` | 1.0.13 | MCP client integration |
| `@modelcontextprotocol/sdk` | 1.25.3 | OAuth & transports |
| `@ai-sdk/react` | 2.0.117 | React hooks |
| `@ai-sdk/google` | 2.0.51 | Gemini provider |

---

## File Structure (Final)

```
notes9-prototype/
├── app/
│   └── api/
│       ├── chat/
│       │   └── route.ts            # Updated with MCP tools
│       └── mcp/
│           ├── servers/
│           │   └── route.ts        # CRUD for MCP servers
│           ├── test/
│           │   └── route.ts        # Test connection
│           └── auth/               # NEW: OAuth routes
│               ├── connect/
│               │   └── route.ts    # Initiate OAuth connection
│               ├── callback/
│               │   └── route.ts    # OAuth callback handler
│               ├── finish/
│               │   └── route.ts    # Complete OAuth flow
│               └── disconnect/
│                   └── route.ts    # Disconnect & clear tokens
├── components/
│   └── catalyst/
│       ├── catalyst-input.tsx      # Updated with MCP button
│       ├── mcp-button.tsx          # MCP toolbar button
│       └── mcp-settings-modal.tsx  # Settings dialog with OAuth support
├── hooks/
│   └── use-mcp-servers.ts          # MCP state hook with OAuth
├── lib/
│   └── mcp/
│       ├── index.ts                # Module exports
│       ├── types.ts                # TypeScript types (with OAuth fields)
│       ├── connector.ts            # MCP client logic
│       ├── config.ts               # Config helpers
│       └── oauth-client.ts         # NEW: OAuth client implementation
└── scripts/
    └── 021_mcp_servers.sql         # Database schema (with OAuth fields)
```

---

## Timeline Estimate

| Phase | Tasks | Dependencies |
|-------|-------|--------------|
| Phase 1 | Core Infrastructure | None |
| Phase 2 | API Routes | Phase 1 |
| Phase 3 | UI Components | Phase 1 |
| Phase 4 | Integration | Phase 2, 3 |

---

## References

| Resource | URL |
|----------|-----|
| Vercel AI SDK MCP Docs | https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools |
| createMCPClient API | https://sdk.vercel.ai/docs/reference/ai-sdk-core/create-mcp-client |
| MCP Protocol Spec | https://modelcontextprotocol.io/ |
| @ai-sdk/mcp NPM | https://www.npmjs.com/package/@ai-sdk/mcp |
| Vercel MCP Template | https://github.com/vercel-labs/mcp-on-vercel |

---

## Appendix: Example MCP Server Presets

| Name | URL | Description |
|------|-----|-------------|
| Notion | `https://notion-mcp.vercel.app/mcp` | Search & create Notion pages |
| GitHub | `https://github-mcp.vercel.app/mcp` | Manage repos, issues, PRs |
| Slack | `https://slack-mcp.vercel.app/mcp` | Send messages, search channels |
| Linear | `https://linear-mcp.vercel.app/mcp` | Create & manage issues |
| Figma | `https://figma-mcp.vercel.app/mcp` | Access design files |

---

*Document Version: 1.0*  
*Last Updated: January 2026*  
*Author: Notes9 Engineering*

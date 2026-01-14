# Notes9 AI Assistant Sidecar - Implementation Plan

## 📋 Executive Summary

This document outlines the comprehensive implementation plan for the AI Assistant Sidecar component within the Notes9 prototype. The implementation will leverage **Vercel AI SDK** for all AI-related functionality, utilizing its official hooks, components, and streaming capabilities.

---

## 🔬 Vercel AI SDK Research Findings

### Core Packages Required

| Package | Purpose |
|---------|---------|
| `ai` | Core SDK with `streamText`, `generateText`, `generateObject` |
| `@ai-sdk/react` | React hooks: `useChat`, `useCompletion`, `useObject` |
| `@ai-sdk/amazon-bedrock` | AWS Bedrock provider (for Claude models) |
| `@ai-sdk/openai` | OpenAI provider (alternative) |
| `@ai-sdk/google` | Google provider (already using Gemini) |

### Key Features Available in AI SDK

#### 1. **useChat Hook** (`@ai-sdk/react`)
- State management for chat conversations
- Real-time streaming responses
- Message history management
- Lifecycle callbacks: `onResponse`, `onFinish`, `onError`
- Attachments support (files, images)
- Custom API endpoint configuration
- Message metadata support

```typescript
import { useChat } from '@ai-sdk/react';

const { messages, input, handleSubmit, isLoading, error, append, setMessages } = useChat({
  api: '/api/chat',
  initialMessages: [],
  onFinish: (message) => { /* save to DB */ },
  onError: (error) => { /* handle error */ },
});
```

#### 2. **streamText Function** (Server-side)
- Native streaming from LLMs
- Tool/function calling support
- Multi-step agent loops with `maxSteps`
- `onFinish` callback with token usage
- Smooth streaming with `smoothStream`

```typescript
import { streamText } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';

const result = await streamText({
  model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
  messages,
  tools: { /* tool definitions */ },
  maxSteps: 5,
  onFinish: ({ usage }) => { /* log token usage */ },
});

return result.toDataStreamResponse();
```

#### 3. **useObject Hook** (Structured Data)
- Stream structured JSON objects
- Schema validation with Zod
- Real-time object generation
- Useful for generating structured responses

#### 4. **Message Persistence**
- Not built-in - requires custom database implementation
- `onFinish` callback for saving messages
- `initialMessages` for loading history
- Supabase integration pattern available

#### 5. **Stream Resumption** (Experimental)
- Resume interrupted streams
- Requires Redis for state management
- `resume: true` option in useChat
- Note: Incompatible with abort functionality

#### 6. **Tool Calling**
- Define tools with schemas
- Server-side execution
- Client-side execution (AI SDK 3.2+)
- Multi-step agent loops

#### 7. **MCP (Model Context Protocol)**
- Connect to external MCP servers
- `experimental_createMCPClient`
- Tool discovery and integration

#### 8. **Telemetry & Observability**
- OpenTelemetry integration
- Token usage tracking
- Performance monitoring
- `experimental_telemetry` option

#### 9. **Custom Transport**
- WebSocket support (custom implementation)
- Default: HTTP with SSE
- Pluggable architecture

#### 10. **AI SDK RSC** (React Server Components)
- `streamUI` function - **Development paused**
- Generative UI capabilities
- Recommendation: Use standard `useChat` instead

---

## 📊 Current State Analysis

### Existing Notes9 Prototype Structure

#### Layout Components
- `app-layout.tsx` - Main layout with left/right sidebars
- `right-sidebar.tsx` - Current placeholder for AI assistant
- `left-sidebar.tsx` - Navigation sidebar

#### Current Right Sidebar Implementation
```typescript
// Current: Simple textarea + button (non-functional)
<Card>
  <CardHeader>
    <CardTitle>AI Assistant</CardTitle>
  </CardHeader>
  <CardContent>
    <Textarea placeholder="Ask AI..." />
    <Button>Ask Assistant</Button>
  </CardContent>
</Card>
```

#### Available UI Components
- `Card`, `CardHeader`, `CardContent`, `CardTitle`, `CardDescription`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`
- `Sheet`, `SheetContent`, `SheetHeader` (slide-over panels)
- `Drawer` (vaul-based drawer)
- `ScrollArea`, `ScrollBar`
- `Avatar`, `AvatarImage`, `AvatarFallback`
- `Button`, `Textarea`, `Input`
- `Skeleton` (loading states)
- `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`
- `Tooltip`

#### Database
- Supabase (already configured)
- `createClient()` - Browser client
- `createClient()` - Server client (with cookies)

#### Current AI Implementation
- `/api/ai/gemini/route.ts` - Gemini API (non-streaming)
- Uses `@google/generative-ai` directly
- No AI SDK integration yet

---

## 🏗️ Architecture Design

### Component Hierarchy

```
AppLayout
├── AppSidebar (left)
├── SidebarInset (main content)
└── RightSidebar (AI Assistant) ─────────────────┐
    ├── AISidecar (collapsible card)             │
    │   ├── ChatHeader                           │
    │   │   ├── Title & Description              │
    │   │   ├── ExpandButton (opens full view)   │
    │   │   └── SettingsButton                   │
    │   ├── ChatMessages (scrollable)            │
    │   │   ├── MessageBubble (user)             │
    │   │   ├── MessageBubble (assistant)        │
    │   │   └── ToolCallIndicator                │
    │   ├── ChatInput                            │
    │   │   ├── Textarea (auto-resize)           │
    │   │   ├── AttachmentButton                 │
    │   │   └── SendButton                       │
    │   └── QuickActions                         │
    └── RecentActivity (existing)                │
                                                 │
FullChatDialog (maximized view) ◄────────────────┘
├── ChatSidebar (history list)
│   ├── NewChatButton
│   └── ChatSessionList
│       └── ChatSessionItem
├── ChatMain
│   ├── ChatHeader (with context info)
│   ├── ChatMessages (full-height)
│   └── ChatInput (enhanced)
└── ChatSettings (optional drawer)
```

### State Management

```typescript
// Chat Store (using Zustand or React Context)
interface ChatStore {
  // Current session
  currentSessionId: string | null;
  
  // Sessions list (for history)
  sessions: ChatSession[];
  
  // Current messages (managed by useChat)
  // Note: useChat manages its own message state
  
  // UI state
  isExpanded: boolean;
  isSidecarOpen: boolean;
  
  // Context
  currentContext: {
    experimentId?: string;
    projectId?: string;
    noteId?: string;
    selectedText?: string;
  };
  
  // Actions
  setCurrentSession: (id: string) => void;
  createNewSession: () => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  toggleExpanded: () => void;
  setContext: (context: Partial<ChatStore['currentContext']>) => void;
}
```

---

## 📦 Component Breakdown

### 1. AISidecar (Main Sidecar Component)

**Location:** `components/ai-assistant/ai-sidecar.tsx`

**Features:**
- Collapsible card in right sidebar
- Uses `useChat` hook from `@ai-sdk/react`
- Streams responses in real-time
- Expandable to full dialog view
- Context-aware (knows current experiment/project)

**Dependencies:**
- `useChat` from `@ai-sdk/react`
- Existing UI components: `Card`, `ScrollArea`, `Textarea`, `Button`
- New: `ChatMessage`, `ChatInput`, `ChatHeader`

```typescript
// Pseudocode structure
export function AISidecar({ context }: AISidecarProps) {
  const { messages, input, handleSubmit, isLoading, setInput, append } = useChat({
    api: '/api/ai/chat',
    id: sessionId, // Links to specific chat session
    initialMessages: initialMessages,
    body: { context }, // Pass context to API
    onFinish: async (message) => {
      await saveMessageToSupabase(sessionId, message);
    },
  });

  return (
    <Card>
      <ChatHeader onExpand={openFullDialog} />
      <ScrollArea>
        {messages.map(m => <ChatMessage key={m.id} message={m} />)}
      </ScrollArea>
      <ChatInput 
        input={input} 
        onInputChange={setInput} 
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </Card>
  );
}
```

### 2. ChatMessage Component

**Location:** `components/ai-assistant/chat-message.tsx`

**Features:**
- Renders user and assistant messages
- Markdown rendering for responses
- Tool call indicators
- Loading states (streaming)
- Attachments display
- Timestamps

```typescript
interface ChatMessageProps {
  message: Message; // from useChat
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  return (
    <div className={cn(
      "flex gap-3",
      message.role === "user" ? "justify-end" : "justify-start"
    )}>
      {message.role === "assistant" && (
        <Avatar>
          <AvatarFallback><Bot /></AvatarFallback>
        </Avatar>
      )}
      <div className={cn(
        "rounded-lg px-3 py-2 max-w-[80%]",
        message.role === "user" 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted"
      )}>
        {/* Render parts - supports multi-modal content */}
        {message.parts?.map((part, i) => (
          <MessagePart key={i} part={part} />
        ))}
        {isStreaming && <StreamingIndicator />}
      </div>
    </div>
  );
}
```

### 3. ChatInput Component

**Location:** `components/ai-assistant/chat-input.tsx`

**Features:**
- Auto-resizing textarea
- File attachment support
- Send button with loading state
- Keyboard shortcuts (Enter to send, Shift+Enter for newline)
- Quick action buttons

```typescript
interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onAttach?: (files: FileList) => void;
}

export function ChatInput({ input, onInputChange, onSubmit, isLoading, onAttach }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Auto-resize logic
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 p-3 border-t">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="Ask about your experiment..."
        disabled={isLoading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit(e);
          }
        }}
      />
      <div className="flex justify-between">
        <Button type="button" variant="ghost" size="icon" onClick={() => /* file input */}>
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </form>
  );
}
```

### 4. FullChatDialog (Maximized View)

**Location:** `components/ai-assistant/full-chat-dialog.tsx`

**Features:**
- Full-screen dialog using existing `Dialog` component
- Chat history sidebar
- Enhanced message area
- All features from sidecar, expanded
- Session management

```typescript
interface FullChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  context: ChatContext;
}

export function FullChatDialog({ open, onOpenChange, sessionId, context }: FullChatDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] p-0">
        <ResizablePanelGroup direction="horizontal">
          {/* History Sidebar */}
          <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
            <ChatHistorySidebar 
              currentSessionId={sessionId}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
            />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          {/* Main Chat Area */}
          <ResizablePanel defaultSize={75}>
            <div className="flex flex-col h-full">
              <FullChatHeader context={context} />
              <ScrollArea className="flex-1 p-4">
                {messages.map(m => <ChatMessage key={m.id} message={m} />)}
              </ScrollArea>
              <ChatInput {...chatInputProps} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </DialogContent>
    </Dialog>
  );
}
```

### 5. ChatHistorySidebar

**Location:** `components/ai-assistant/chat-history-sidebar.tsx`

**Features:**
- List of past chat sessions
- Search/filter functionality
- Delete session option
- New chat button
- Session timestamps

```typescript
interface ChatHistorySidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
}

export function ChatHistorySidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession
}: ChatHistorySidebarProps) {
  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-3 border-b">
        <Button onClick={onNewChat} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {sessions.map((session) => (
          <ChatSessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentSessionId}
            onSelect={() => onSelectSession(session.id)}
            onDelete={() => onDeleteSession(session.id)}
          />
        ))}
      </ScrollArea>
    </div>
  );
}
```

### 6. ChatContext Provider

**Location:** `components/ai-assistant/chat-provider.tsx`

**Features:**
- Global chat state management
- Session persistence
- Context sharing across components

```typescript
interface ChatContextValue {
  // Session management
  currentSessionId: string | null;
  sessions: ChatSession[];
  
  // Dialog state
  isFullDialogOpen: boolean;
  openFullDialog: () => void;
  closeFullDialog: () => void;
  
  // Context
  setContext: (context: Partial<ChatContext>) => void;
  
  // Actions
  createSession: () => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  loadSessions: () => Promise<void>;
}

export const ChatProvider: React.FC<PropsWithChildren> = ({ children }) => {
  // State management
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isFullDialogOpen, setIsFullDialogOpen] = useState(false);
  
  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);
  
  // ... implementation
  
  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};
```

### 7. MarkdownRenderer

**Location:** `components/ai-assistant/markdown-renderer.tsx`

**Features:**
- Parse and render markdown from AI responses
- Code syntax highlighting
- Chemistry/math formula support (KaTeX already installed)
- Safe HTML rendering

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ inline, className, children }) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <SyntaxHighlighter language={match[1]} PreTag="div">
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className={className}>{children}</code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

---

## 🗄️ Database Schema

### New Tables for Chat Persistence

```sql
-- Chat Sessions Table
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Context references (optional)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  
  -- Session metadata
  title TEXT, -- Auto-generated from first message or manual
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Session state
  is_archived BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb -- Store additional context
);

-- Chat Messages Table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
  
  -- Message content (follows AI SDK Message format)
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  
  -- Multi-modal support
  parts JSONB DEFAULT '[]'::jsonb, -- For multi-modal messages
  attachments JSONB DEFAULT '[]'::jsonb, -- File attachments
  
  -- Tool calls (if any)
  tool_calls JSONB DEFAULT '[]'::jsonb,
  tool_call_id TEXT, -- For tool response messages
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  token_usage JSONB, -- { inputTokens, outputTokens, totalTokens }
  model TEXT, -- Which model was used
  
  -- Ordering
  sequence INTEGER NOT NULL
);

-- Chat Attachments Table (for file uploads)
CREATE TABLE chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE NOT NULL,
  
  -- File info
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL, -- Supabase storage path
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_org ON chat_sessions(organization_id);
CREATE INDEX idx_chat_sessions_project ON chat_sessions(project_id);
CREATE INDEX idx_chat_sessions_experiment ON chat_sessions(experiment_id);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, sequence);

-- RLS Policies
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_attachments ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own chat sessions"
  ON chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat sessions"
  ON chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat sessions"
  ON chat_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Messages inherit access from sessions
CREATE POLICY "Users can view messages in own sessions"
  ON chat_messages FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in own sessions"
  ON chat_messages FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );
```

---

## 🔌 API Routes

### 1. Chat Stream Route

**Location:** `app/api/ai/chat/route.ts`

```typescript
import { streamText } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
// or use google provider for Gemini
import { google } from '@ai-sdk/google';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60; // Vercel function timeout

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages, sessionId, context } = await req.json();
  
  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(context);
  
  const result = await streamText({
    model: google('gemini-2.0-flash-exp'), // or bedrock('anthropic.claude-3-haiku-20240307-v1:0')
    system: systemPrompt,
    messages,
    tools: {
      // Define available tools
      searchProtocols: {
        description: 'Search for protocols in the lab database',
        parameters: z.object({
          query: z.string().describe('Search query'),
        }),
        execute: async ({ query }) => {
          // Implementation
        },
      },
      getExperimentData: {
        description: 'Get data for a specific experiment',
        parameters: z.object({
          experimentId: z.string(),
        }),
        execute: async ({ experimentId }) => {
          // Implementation
        },
      },
    },
    maxSteps: 5, // Allow multi-step tool calls
    onFinish: async ({ usage, text }) => {
      // Save message to database
      await saveAssistantMessage(supabase, sessionId, text, usage);
    },
  });

  return result.toDataStreamResponse();
}

function buildSystemPrompt(context: ChatContext): string {
  let prompt = `You are an AI research assistant for Notes9, a scientific lab documentation platform.
You help scientists with their experiments, protocols, and research documentation.

Your capabilities:
- Answer questions about experiments and protocols
- Help with chemistry and biochemistry calculations
- Assist with scientific writing and documentation
- Search and retrieve lab data

Guidelines:
- Use proper scientific terminology
- Format chemical formulas correctly (H₂O, CO₂, etc.)
- Be precise and accurate with scientific information
- When unsure, acknowledge limitations
`;

  if (context.experimentId) {
    prompt += `\nCurrent context: User is working on experiment ${context.experimentId}`;
  }
  
  if (context.projectId) {
    prompt += `\nProject context: ${context.projectId}`;
  }

  return prompt;
}
```

### 2. Sessions API Routes

**Location:** `app/api/ai/sessions/route.ts`

```typescript
// GET - List sessions
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return Response.json(sessions);
}

// POST - Create new session
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { context } = await req.json();

  const { data: session, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: user.id,
      project_id: context?.projectId,
      experiment_id: context?.experimentId,
      metadata: context,
    })
    .select()
    .single();

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return Response.json(session);
}
```

**Location:** `app/api/ai/sessions/[id]/route.ts`

```typescript
// GET - Get session with messages
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (sessionError) {
    return new Response('Session not found', { status: 404 });
  }

  const { data: messages, error: messagesError } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', params.id)
    .order('sequence', { ascending: true });

  return Response.json({
    session,
    messages: messages || [],
  });
}

// DELETE - Delete session
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
```

### 3. Messages API Route

**Location:** `app/api/ai/messages/route.ts`

```typescript
// POST - Save user message (called before streaming)
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { sessionId, role, content, parts, attachments } = await req.json();

  // Get next sequence number
  const { data: lastMessage } = await supabase
    .from('chat_messages')
    .select('sequence')
    .eq('session_id', sessionId)
    .order('sequence', { ascending: false })
    .limit(1)
    .single();

  const sequence = (lastMessage?.sequence || 0) + 1;

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      parts,
      attachments,
      sequence,
    })
    .select()
    .single();

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  // Update session's updated_at
  await supabase
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  return Response.json(message);
}
```

---

## 📦 Dependencies to Add

```json
{
  "dependencies": {
    // Vercel AI SDK - Core
    "ai": "^4.0.0",
    "@ai-sdk/react": "^1.0.0",
    
    // Provider (choose based on preference)
    "@ai-sdk/google": "^1.0.0",
    // OR
    "@ai-sdk/amazon-bedrock": "^1.0.0",
    // OR
    "@ai-sdk/openai": "^1.0.0",
    
    // Markdown rendering
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "remark-math": "^6.0.0",
    "rehype-katex": "^7.0.0",
    
    // Code highlighting (optional)
    "react-syntax-highlighter": "^15.5.0",
    "@types/react-syntax-highlighter": "^15.5.0"
  }
}
```

---

## 🎨 UI/UX Considerations

### Sidecar States

1. **Collapsed State**
   - Minimal header visible
   - One-click to expand

2. **Default State**
   - Shows last few messages
   - Input field visible
   - Expand button for full view

3. **Expanded State** (Full Dialog)
   - Full chat history
   - Session list sidebar
   - Enhanced input with all features

### Loading States

1. **Initial Load**
   - Skeleton UI while loading sessions
   
2. **Sending Message**
   - Input disabled
   - Spinner on send button
   
3. **Streaming Response**
   - Show partial response as it streams
   - Cursor/typing indicator
   - Smooth scrolling

4. **Error State**
   - Error message with retry option
   - Toast notification

### Responsive Design

- **Desktop**: Full sidecar visible
- **Tablet**: Collapsible sidecar
- **Mobile**: Bottom sheet or full screen dialog

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Escape` | Close expanded view |
| `Cmd/Ctrl+K` | Open quick chat |
| `Cmd/Ctrl+N` | New chat session |

### Accessibility

- Focus management in dialog
- Screen reader announcements for new messages
- Keyboard navigation
- High contrast support

---



## 📁 File Structure

```
components/
├── ai-assistant/
│   ├── index.ts                    # Exports
│   ├── ai-sidecar.tsx              # Main sidecar component
│   ├── chat-provider.tsx           # Context provider
│   ├── chat-message.tsx            # Message bubble
│   ├── chat-input.tsx              # Input with attachments
│   ├── chat-header.tsx             # Header with actions
│   ├── full-chat-dialog.tsx        # Maximized view
│   ├── chat-history-sidebar.tsx    # Session list
│   ├── chat-session-item.tsx       # Session list item
│   ├── markdown-renderer.tsx       # MD rendering
│   ├── streaming-indicator.tsx     # Loading dots
│   ├── tool-call-display.tsx       # Tool call UI
│   └── hooks/
│       ├── use-chat-sessions.ts    # Sessions hook
│       └── use-chat-context.ts     # Context hook

app/
├── api/
│   └── ai/
│       ├── chat/
│       │   └── route.ts            # Streaming chat
│       ├── sessions/
│       │   ├── route.ts            # List/create sessions
│       │   └── [id]/
│       │       └── route.ts        # Get/delete session
│       └── messages/
│           └── route.ts            # Save messages

lib/
├── ai/
│   ├── system-prompts.ts           # System prompt builders
│   ├── tools.ts                    # Tool definitions
│   └── utils.ts                    # AI utilities

types/
└── ai.ts                           # AI-related types

scripts/
└── 017_create_chat_tables.sql      # Database migration
```

---

## 🔐 Environment Variables

```env
# AI Provider (choose one or multiple)
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key

# OR for AWS Bedrock
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1

# OR for OpenAI
OPENAI_API_KEY=your_openai_api_key

# Existing
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 🎯 Success Metrics

1. **Performance**
   - Time to First Token (TTFT) < 1 second
   - Streaming latency < 50ms between chunks
   - UI responsiveness maintained during streaming

2. **Reliability**
   - Message persistence 100%
   - Error recovery working
   - Session state preserved

3. **User Experience**
   - Seamless expand/collapse
   - Smooth streaming animation
   - Intuitive keyboard shortcuts

---

## 📚 References

- [Vercel AI SDK Documentation](https://ai-sdk.dev/docs)
- [Vercel AI SDK GitHub](https://github.com/vercel/ai)
- [Chat SDK (Open Source Template)](https://chat-sdk.dev)
- [useChat Hook Documentation](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot)
- [Message Persistence Guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)
- [Stream Protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)

---

## ⚠️ Important Notes

1. **AI SDK RSC is Paused**: The `streamUI` function for React Server Components is no longer actively developed. Use standard `useChat` approach instead.

2. **AWS Bedrock Limitations**: Bedrock models are synchronous only - use `agent.run()` not `agent.arun()`.

3. **Stream Resumption Trade-off**: Enabling `resume: true` disables abort functionality.

4. **Token Usage Tracking**: Some providers may return `NaN` for token usage - implement fallback handling.

5. **Existing Gemini Integration**: The current `/api/ai/gemini/route.ts` uses `@google/generative-ai` directly. Consider migrating to `@ai-sdk/google` for consistency.

---

*Document Version: 1.0*  
*Created: December 14, 2025*  
*For: Notes9 Prototype AI Assistant Implementation*

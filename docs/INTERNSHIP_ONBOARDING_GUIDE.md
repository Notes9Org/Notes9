# Notes9 - Comprehensive Internship Onboarding Guide

Welcome! This document will help you understand the Notes9 application - a modern Laboratory Information Management System (LIMS) built for research scientists. This guide covers everything you need to know to contribute to the project.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack Deep Dive](#tech-stack-deep-dive)
3. [Project Architecture](#project-architecture)
4. [Database Schema](#database-schema)
5. [Authentication Flow](#authentication-flow)
6. [Key Features](#key-features)
7. [API Routes](#api-routes)
8. [Component Structure](#component-structure)
9. [AI Integration](#ai-integration)
10. [State Management](#state-management)
11. [Getting Started](#getting-started)
12. [Code Patterns & Best Practices](#code-patterns--best-practices)
13. [Key Files to Study](#key-files-to-study)
14. [Common Tasks](#common-tasks)

---

## 🎯 Project Overview

### What is Notes9?

Notes9 is a **full-stack web application** designed for research laboratories to manage their scientific workflows. Think of it as a digital lab notebook combined with project management tools and AI assistance.

### Who Uses It?

- **Principal Investigators (PIs)** - Create and manage research projects
- **Researchers** - Design and execute experiments
- **Lab Technicians** - Track samples and equipment
- **Data Analysts** - Generate reports and analyze results

### Core Use Cases

1. **Project Management** - Organize research initiatives with teams
2. **Experiment Tracking** - Design, execute, and document experiments
3. **Sample Inventory** - Track lab samples with metadata
4. **Equipment Management** - Monitor equipment status and maintenance
5. **Protocol Library** - Store Standard Operating Procedures (SOPs)
6. **Lab Notes** - Rich text documentation with AI assistance
7. **Literature Reviews** - Search and organize research papers
8. **AI Assistant (Catalyst)** - Get help with scientific writing

---

## 🛠 Tech Stack Deep Dive

### Frontend

| Technology | Purpose | Learn More |
|------------|---------|------------|
| **Next.js 16** | React framework with App Router | [nextjs.org/docs](https://nextjs.org/docs) |
| **React 19** | UI component library | [react.dev](https://react.dev) |
| **TypeScript** | Type-safe JavaScript | [typescriptlang.org](https://www.typescriptlang.org) |
| **Tailwind CSS v4** | Utility-first CSS | [tailwindcss.com](https://tailwindcss.com) |
| **shadcn/ui** | Pre-built UI components | [ui.shadcn.com](https://ui.shadcn.com) |
| **Radix UI** | Headless UI primitives | [radix-ui.com](https://www.radix-ui.com) |
| **Framer Motion** | Animation library | [framer.com/motion](https://www.framer.com/motion) |
| **TipTap** | Rich text editor | [tiptap.dev](https://tiptap.dev) |

### Backend

| Technology | Purpose | Learn More |
|------------|---------|------------|
| **Supabase** | Backend-as-a-Service (PostgreSQL) | [supabase.com/docs](https://supabase.com/docs) |
| **PostgreSQL** | Relational database | [postgresql.org](https://www.postgresql.org) |
| **Row Level Security (RLS)** | Data access control | [supabase.com/docs/guides/auth/row-level-security](https://supabase.com/docs/guides/auth/row-level-security) |

### AI/ML

| Technology | Purpose | Learn More |
|------------|---------|------------|
| **Google Gemini** | AI chat and text processing | [ai.google.dev](https://ai.google.dev) |
| **Vercel AI SDK** | Streaming AI responses | [sdk.vercel.ai](https://sdk.vercel.ai) |

### Key Dependencies (from `package.json`)

```javascript
// AI & LLM
"@ai-sdk/google"        // Google AI integration
"@ai-sdk/react"         // React hooks for AI
"ai"                    // Vercel AI SDK core

// Rich Text Editor
"@tiptap/react"         // TipTap editor for React
"@tiptap/starter-kit"   // Basic editor features
"@tiptap/extension-*"   // Extensions (tables, images, etc.)

// UI Components
"@radix-ui/react-*"     // Headless UI components
"lucide-react"          // Icon library
"cmdk"                  // Command palette
"sonner"                // Toast notifications

// Data Visualization
"recharts"              // Charts and graphs

// Forms & Validation
"react-hook-form"       // Form management
"zod"                   // Schema validation

// Document Processing
"jspdf"                 // PDF generation
"html-docx-js"          // Word document export
"mammoth"               // Word document import
```

---

## 🏗 Project Architecture

### Directory Structure

```
notes9-prototype/
├── app/                          # Next.js App Router
│   ├── (app)/                    # Authenticated routes (main app)
│   │   ├── dashboard/            # Dashboard page
│   │   ├── projects/             # Project management
│   │   ├── experiments/          # Experiment tracking
│   │   ├── samples/              # Sample inventory
│   │   ├── equipment/            # Equipment management
│   │   ├── protocols/            # Protocol library
│   │   ├── lab-notes/            # Lab notes
│   │   ├── literature-reviews/   # Literature search
│   │   ├── catalyst/             # AI assistant page
│   │   ├── settings/             # User settings
│   │   └── layout.tsx            # App layout with sidebar
│   │
│   ├── (marketing)/              # Public marketing pages
│   ├── api/                      # API routes
│   │   ├── chat/                 # AI chat endpoint
│   │   ├── ai/gemini/            # Gemini AI endpoint
│   │   ├── search-papers/        # Paper search API
│   │   ├── files/upload/         # File upload
│   │   └── ...
│   │
│   ├── auth/                     # Authentication pages
│   │   ├── login/
│   │   ├── sign-up/
│   │   ├── callback/             # OAuth callback
│   │   └── forgot-password/
│   │
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Global styles
│
├── components/                   # Reusable components
│   ├── ui/                       # shadcn/ui components
│   ├── layout/                   # Layout components
│   │   ├── app-layout.tsx        # Three-panel layout
│   │   ├── app-sidebar.tsx       # Left navigation
│   │   └── right-sidebar.tsx     # AI assistant panel
│   ├── catalyst/                 # AI assistant components
│   ├── literature-reviews/       # Paper search components
│   ├── text-editor/              # TipTap editor
│   └── marketing/                # Landing page components
│
├── hooks/                        # Custom React hooks
│   ├── use-auto-save.ts          # Auto-save functionality
│   ├── use-chat-sessions.ts      # Chat session management
│   ├── use-resizable.ts          # Resizable panels
│   └── ...
│
├── lib/                          # Utility functions
│   ├── supabase/                 # Supabase client setup
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   └── middleware.ts         # Auth middleware
│   ├── ai/                       # AI configuration
│   │   └── models.ts             # AI model definitions
│   ├── paper-search.ts           # PubMed/BioRxiv search
│   └── utils.ts                  # General utilities
│
├── scripts/                      # Database SQL scripts
├── types/                        # TypeScript type definitions
├── styles/                       # Additional CSS files
└── docs/                         # Documentation
```

### The Three-Panel Layout

Notes9 uses a **three-panel layout** similar to modern productivity apps:

```
┌─────────────┬──────────────────────────┬─────────────┐
│             │                          │             │
│   LEFT      │         CENTER           │    RIGHT    │
│  SIDEBAR    │         CONTENT          │   SIDEBAR   │
│             │                          │             │
│  - Nav      │    - Page content        │  - AI Chat  │
│  - Projects │    - Forms               │  - Activity │
│  - Search   │    - Tables              │             │
│             │                          │             │
└─────────────┴──────────────────────────┴─────────────┘
```

**Key Files:**
- `components/layout/app-layout.tsx` - Main layout container
- `components/layout/app-sidebar.tsx` - Left sidebar with navigation
- `components/layout/right-sidebar.tsx` - Right sidebar with AI

---

## 🗄 Database Schema

### Entity Relationship Overview

```
Organizations
    └── Profiles (Users)
    └── Projects
        └── Project Members
        └── Experiments
            └── Experiment Protocols (link)
            └── Samples
            └── Experiment Data
            └── Lab Notes
            └── Quality Control
        └── Reports
    └── Equipment
        └── Equipment Usage
        └── Equipment Maintenance
    └── Protocols (SOPs)
    └── Assays
```

### Key Tables

#### 1. Organizations
Multi-tenant support - each organization has isolated data.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### 2. Profiles (Users)
Extends Supabase Auth users with application-specific data.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL, -- 'admin', 'researcher', 'technician', 'analyst', 'viewer'
  is_active BOOLEAN DEFAULT true
);
```

#### 3. Projects
Research initiatives containing experiments.

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT, -- 'planning', 'active', 'on_hold', 'completed', 'cancelled'
  priority TEXT, -- 'low', 'medium', 'high', 'critical'
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES profiles(id)
);
```

#### 4. Experiments
Individual experiments within projects.

```sql
CREATE TABLE experiments (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL,
  description TEXT,
  hypothesis TEXT,
  status TEXT, -- 'planned', 'in_progress', 'data_ready', 'analyzed', 'completed'
  assigned_to UUID REFERENCES profiles(id)
);
```

#### 5. Samples
Laboratory samples tracked within experiments.

```sql
CREATE TABLE samples (
  id UUID PRIMARY KEY,
  experiment_id UUID REFERENCES experiments(id),
  sample_code TEXT NOT NULL UNIQUE,
  sample_type TEXT NOT NULL,
  storage_location TEXT,
  status TEXT -- 'available', 'in_use', 'depleted', 'disposed'
);
```

#### 6. Lab Notes
Rich text documentation for experiments.

```sql
CREATE TABLE lab_notes (
  id UUID PRIMARY KEY,
  experiment_id UUID REFERENCES experiments(id),
  project_id UUID REFERENCES projects(id),
  title TEXT NOT NULL,
  content TEXT,  -- HTML content from TipTap editor
  note_type TEXT, -- 'observation', 'analysis', 'conclusion', 'general'
  created_by UUID REFERENCES profiles(id)
);
```

### Row Level Security (RLS)

All tables have **RLS policies** to ensure users only see data from their organization:

```sql
-- Example RLS policy for projects
CREATE POLICY "Users can view projects in their organization"
ON projects FOR SELECT
USING (
  organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
);
```

**Important:** RLS is CRITICAL for security. Every table must have appropriate policies!

---

## 🔐 Authentication Flow

### Authentication Methods

1. **Email/Password** - Traditional sign-up/login
2. **Google OAuth** - "Continue with Google"
3. **Microsoft OAuth** - "Continue with Microsoft" (Azure AD)

### Flow Diagram

```
User visits /dashboard
        │
        ▼
   Middleware checks auth
        │
        ├─── No user ──────► Redirect to /auth/login
        │
        ▼
   User authenticated
        │
        ▼
   Check profile exists
        │
        ├─── No profile ──► Create profile + organization
        │
        ▼
   Load app with user context
```

### Key Files

- `middleware.ts` - Route protection
- `lib/supabase/middleware.ts` - Session management
- `app/auth/login/page.tsx` - Login page
- `app/auth/sign-up/page.tsx` - Sign-up page
- `app/auth/callback/route.ts` - OAuth callback handler

### Code Example: Checking Auth in Server Components

```typescript
// app/(app)/dashboard/page.tsx
import { createClient } from "@/lib/supabase/server"
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/auth/login")
  }
  
  // Fetch user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()
  
  return <div>Hello, {profile?.first_name}</div>
}
```

---

## ⭐ Key Features

### 1. Rich Text Editor (TipTap)

**Location:** `components/text-editor/tiptap-editor.tsx`

Features:
- **Text formatting** - Bold, italic, strikethrough, code
- **Headings** - H1, H2, H3
- **Lists** - Bullet, numbered, task lists
- **Tables** - Resizable tables with row/column management
- **Images** - Paste, drag-drop, or URL insertion
- **File import** - Import .docx, .txt, .md, .html files
- **Math formulas** - LaTeX support via KaTeX
- **Chemical formulas** - Auto-format H₂O, CO₂, etc.
- **AI tools** - Improve, continue, simplify, fix grammar

### 2. AI Assistant (Catalyst)

**Location:** `components/layout/right-sidebar.tsx`

The AI assistant uses Google Gemini for:
- Answering scientific questions
- Helping with experiment design
- Chemical calculations
- Scientific writing assistance

### 3. Paper Search (Literature Reviews)

**Location:** `lib/paper-search.ts`, `components/literature-reviews/`

Searches across:
- **PubMed** - Published research papers
- **BioRxiv/MedRxiv** - Preprints

### 4. Auto-Save

**Location:** `hooks/use-auto-save.ts`

Automatically saves content after 2 seconds of inactivity:

```typescript
const { status, debouncedSave } = useAutoSave({
  onSave: async (content) => {
    await supabase.from('lab_notes').update({ content }).eq('id', noteId)
  },
  delay: 2000
})
```

### 5. Chat Session Management

**Location:** `hooks/use-chat-sessions.ts`

Persists AI conversations to the database:
- Create/delete chat sessions
- Load message history
- Auto-generate session titles

---

## 🌐 API Routes

### Chat API (`/api/chat`)

Handles AI chat with streaming responses:

```typescript
// Uses Vercel AI SDK for streaming
export async function POST(req: Request) {
  const { messages, modelId } = await req.json()
  
  const result = streamText({
    model: google('gemini-2.5-flash-lite'),
    system: 'You are Catalyst, an AI research assistant...',
    messages: convertToCoreMessages(messages),
    experimental_transform: smoothStream({ chunking: 'word' }),
  })
  
  return result.toUIMessageStreamResponse()
}
```

### Gemini AI API (`/api/ai/gemini`)

Handles text manipulation (improve, shorten, etc.):

```typescript
export async function POST(request: NextRequest) {
  const { action, selectedText } = await request.json()
  
  // Different prompts based on action
  switch (action) {
    case 'improve':
      prompt = `Improve the following scientific text...`
    case 'grammar':
      prompt = `Fix grammar in this text...`
    // etc.
  }
  
  const result = await model.generateContent(prompt)
  return NextResponse.json({ text: result.response.text() })
}
```

### Paper Search API (`/api/search-papers`)

Searches PubMed and Europe PMC:

```typescript
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')
  const results = await searchPapers(query) // Parallel search
  return NextResponse.json({ papers: results })
}
```

### File Upload API (`/api/files/upload`)

Handles file uploads to Supabase Storage:

```typescript
export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File
  
  // Upload to Supabase Storage
  await supabase.storage
    .from('experiment-files')
    .upload(storagePath, file)
  
  return NextResponse.json({ url: publicUrl })
}
```

---

## 🧩 Component Structure

### UI Components (`/components/ui/`)

These are **shadcn/ui** components - pre-built, customizable UI primitives:

| Component | Usage |
|-----------|-------|
| `button.tsx` | Buttons with variants |
| `card.tsx` | Card containers |
| `dialog.tsx` | Modal dialogs |
| `dropdown-menu.tsx` | Dropdown menus |
| `form.tsx` | Form handling |
| `input.tsx` | Text inputs |
| `select.tsx` | Select dropdowns |
| `table.tsx` | Data tables |
| `tabs.tsx` | Tab navigation |
| `toast.tsx` | Toast notifications |
| `sidebar.tsx` | Sidebar component |

### Feature Components

```typescript
// Example: Paper Search Card
// components/literature-reviews/paper-search-card.tsx

interface PaperSearchCardProps {
  paper: SearchPaper
  onStage: (paper: SearchPaper) => void
  isStaged: boolean
}

export function PaperSearchCard({ paper, onStage, isStaged }: PaperSearchCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{paper.title}</CardTitle>
        <CardDescription>
          {paper.authors.join(', ')} • {paper.year}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>{paper.abstract}</p>
        <Button onClick={() => onStage(paper)}>
          {isStaged ? 'Staged' : 'Add to Library'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

---

## 🤖 AI Integration

### Models Configuration

**Location:** `lib/ai/models.ts`

```typescript
export const chatModels = [
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    description: 'Fast and efficient for most tasks',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Quick responses, good for simple queries',
  },
  // Add more models as needed
]
```

### Using the AI SDK

```typescript
// Client-side with useChat hook
import { useChat } from '@ai-sdk/react'

const { messages, sendMessage, status, stop } = useChat({
  id: 'my-chat',
  api: '/api/chat',
})

// Send a message
await sendMessage({ parts: [{ type: 'text', text: 'Hello!' }] })

// Stream responses are automatically handled
messages.map(msg => (
  <div key={msg.id}>
    {msg.role}: {msg.content}
  </div>
))
```

---

## 📊 State Management

Notes9 uses a **combination of approaches**:

### 1. React Server Components (Default)
Data is fetched on the server and passed to components:

```typescript
// Server Component
export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase.from('projects').select('*')
  
  return <ProjectList projects={projects} />
}
```

### 2. Client-Side State (useState/useReducer)
For interactive UI state:

```typescript
'use client'

export function FilterDropdown() {
  const [status, setStatus] = useState('all')
  return <Select value={status} onValueChange={setStatus} />
}
```

### 3. Custom Hooks for Complex State
Encapsulate stateful logic:

```typescript
// hooks/use-chat-sessions.ts
export function useChatSessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  
  const createSession = useCallback(async () => {
    // Create session logic
  }, [])
  
  return { sessions, loading, createSession }
}
```

### 4. URL State (Search Params)
For shareable/bookmarkable state:

```typescript
// ?tab=notes&noteId=123
export default async function ExperimentPage({ searchParams }) {
  const { tab, noteId } = await searchParams
  return <Tabs defaultValue={tab || 'overview'} />
}
```

---

## 🚀 Getting Started

### Prerequisites

1. **Node.js 18+** - [nodejs.org](https://nodejs.org)
2. **pnpm** - `npm install -g pnpm`
3. **Supabase Account** - [supabase.com](https://supabase.com)
4. **Google AI API Key** - [ai.google.dev](https://ai.google.dev)

### Environment Variables

Create `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google AI
GEMINI_API_KEY=your_gemini_api_key
```

### Database Setup

Run SQL scripts in order:

```bash
# In Supabase SQL Editor
1. scripts/001_create_tables.sql
2. scripts/002_enable_rls.sql
3. scripts/003_seed_data.sql
4. scripts/004_create_profile_trigger.sql
# ... and remaining scripts
```

### Run Development Server

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📝 Code Patterns & Best Practices

### 1. Server vs Client Components

```typescript
// Server Component (default) - Can access database directly
export default async function Page() {
  const data = await fetchData() // Direct DB call
  return <div>{data}</div>
}

// Client Component - Needs 'use client' directive
'use client'
export function InteractiveWidget() {
  const [state, setState] = useState()
  return <button onClick={() => setState(true)}>Click</button>
}
```

### 2. Error Handling

```typescript
// Always handle errors gracefully
const { data, error } = await supabase.from('projects').select('*')

if (error) {
  console.error('Error fetching projects:', error)
  return <ErrorState message="Failed to load projects" />
}
```

### 3. Loading States

```typescript
// Use Suspense for loading states
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AsyncComponent />
    </Suspense>
  )
}
```

### 4. Type Safety

```typescript
// Always define TypeScript interfaces
interface Project {
  id: string
  name: string
  status: 'planning' | 'active' | 'completed'
  created_at: string
}

// Use with Supabase
const { data } = await supabase
  .from('projects')
  .select('*')
  .returns<Project[]>()
```

### 5. Form Handling

```typescript
// Use react-hook-form with zod validation
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
})

const form = useForm({
  resolver: zodResolver(schema),
})
```

---

## 📚 Key Files to Study

### Start Here (In Order)

1. **`app/page.tsx`** - Landing page, auth redirect logic
2. **`app/(app)/layout.tsx`** - App layout with auth check
3. **`components/layout/app-layout.tsx`** - Three-panel layout
4. **`app/(app)/dashboard/page.tsx`** - Dashboard with data fetching
5. **`lib/supabase/server.ts`** - Server-side Supabase client
6. **`components/layout/right-sidebar.tsx`** - AI assistant implementation
7. **`app/api/chat/route.ts`** - AI streaming endpoint
8. **`components/text-editor/tiptap-editor.tsx`** - Rich text editor

### Database Understanding

1. **`scripts/001_create_tables.sql`** - Full schema
2. **`scripts/002_enable_rls.sql`** - Security policies

### Component Patterns

1. **`components/ui/button.tsx`** - shadcn/ui component example
2. **`components/literature-reviews/search-tab.tsx`** - Feature component example

---

## 🔧 Common Tasks

### Adding a New Page

```typescript
// 1. Create file: app/(app)/my-feature/page.tsx
import { createClient } from "@/lib/supabase/server"

export default async function MyFeaturePage() {
  const supabase = await createClient()
  // ... fetch data, render UI
}

// 2. Add to navigation: components/layout/app-sidebar.tsx
const navigation = [
  // ... existing items
  { name: "My Feature", href: "/my-feature", icon: MyIcon },
]
```

### Adding a New API Route

```typescript
// app/api/my-endpoint/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Your logic here
  return NextResponse.json({ data: 'success' })
}
```

### Creating a New Database Table

```sql
-- 1. Create table
CREATE TABLE my_table (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add RLS policy
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's data"
ON my_table FOR SELECT
USING (
  organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
);

-- 3. Create TypeScript types in types/ folder
```

---

## 📖 Learning Resources

### Next.js
- [Next.js Documentation](https://nextjs.org/docs)
- [App Router Tutorial](https://nextjs.org/learn)
- [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)

### Supabase
- [Supabase Documentation](https://supabase.com/docs)
- [Auth Guide](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

### React
- [React Documentation](https://react.dev)
- [Hooks Guide](https://react.dev/reference/react)

### TypeScript
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)

### UI Components
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [TipTap Editor Docs](https://tiptap.dev/docs)

---

## ❓ FAQ

### Q: Why Next.js App Router instead of Pages Router?
A: App Router provides better support for React Server Components, streaming, and layouts. It's the future of Next.js.

### Q: Why Supabase instead of a custom backend?
A: Supabase provides authentication, database, storage, and real-time subscriptions out of the box. It accelerates development significantly.

### Q: How does multi-tenancy work?
A: Each user belongs to an `organization`. RLS policies ensure users only see data from their organization.

### Q: How does the AI streaming work?
A: We use Vercel AI SDK with `streamText()` which returns a streaming response. The client uses `useChat()` hook which handles the stream automatically.

### Q: Can I add more AI models?
A: Yes! Add them to `lib/ai/models.ts` and ensure the corresponding API keys are configured.

---

## 🎯 Your First Week Goals

1. **Day 1-2:** Set up development environment, run the app locally
2. **Day 3:** Study the database schema and understand relationships
3. **Day 4:** Trace through the authentication flow
4. **Day 5:** Study a complete feature (e.g., experiments page)
5. **Weekend:** Build a small feature or fix a bug

---

## 🤝 Getting Help

- **Code Questions:** Search the codebase first, then ask
- **Architecture Questions:** Refer to this document
- **Supabase Questions:** [Supabase Discord](https://discord.supabase.com)
- **Next.js Questions:** [Next.js Discord](https://nextjs.org/discord)

---

**Welcome to the team! 🎉**

*Last updated: January 2026*

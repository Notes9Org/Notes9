# Collaborative Editor - Collaboration Server

This folder contains the **stateful WebSocket collaboration server** for real-time document editing using Yjs. It runs separately from your Next.js app on a VPS.

## Architecture Overview

```
┌─────────────────────┐         ┌──────────────────────────────┐
│   Next.js (Vercel)  │         │  collaboration/server (VPS)  │
│   ───────────────   │         │  ─────────────────────────   │
│   • REST API        │         │  • WebSocket Server          │
│   • Auth/Invites    │◄────────┤  • Yjs CRDT Sync             │
│   • Audit Logs      │  JWT    │  • Awareness (cursors)       │
│   • RLS Policies    │         │  • Permission Enforcement    │
└──────────┬──────────┘         │  • Postgres Persistence      │
           │                    └──────────────────────────────┘
           │                               │
           └───────────────────────────────┘
                      Supabase
               ┌─────────────────┐
               │  • lab_notes    │
               │  • lab_note_access
               │  • yjs_states   │
               │  • lab_note_invitations
               └─────────────────┘
```

## Folder Structure

```
collaboration/
├── server/                 # WebSocket server (VPS-deployed)
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── config.ts       # Environment config
│   │   ├── auth/
│   │   │   └── jwt.ts      # Supabase JWT validation
│   │   ├── permissions/
│   │   │   └── store.ts    # Permission checks + realtime
│   │   ├── documents/
│   │   │   └── manager.ts  # Yjs document lifecycle
│   │   ├── persistence/
│   │   │   └── postgres.ts # CRDT state persistence
│   │   └── websocket/
│   │       └── server.ts   # WebSocket protocol
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── shared/
│   └── types/              # TypeScript types (shared w/ Next.js)
│       ├── index.ts
│       ├── permissions.ts
│       ├── invitations.ts
│       └── audit.ts
│
└── README.md               # This file
```

## Prerequisites

1. **Node.js 20+** installed on your VPS
2. **Supabase project** with database schema (see below)
3. **pm2** (optional, for production process management)

## Database Schema

Add these tables to your Supabase database:

```sql
-- Lab notes table already exists (created by earlier migrations)
-- lab_notes: id, title, created_by, created_at, updated_at

-- Lab note access permissions (created by 022_lab_note_collaboration.sql)
CREATE TYPE permission_level AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE lab_note_access (
  id uuid primary key default gen_random_uuid(),
  lab_note_id uuid references lab_notes on delete cascade not null,
  user_id uuid references auth.users not null,
  permission_level permission_level not null,
  granted_by uuid references auth.users,
  granted_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(lab_note_id, user_id)
);

-- Yjs CRDT state storage (created by 033_yjs_states_and_rls_hardening.sql)
CREATE TABLE yjs_states (
  document_id uuid primary key references lab_notes on delete cascade,
  state text not null, -- base64 encoded Yjs update
  updated_at timestamptz default now()
);

-- Invitations (created by 022_lab_note_collaboration.sql)
CREATE TABLE lab_note_invitations (
  id uuid primary key default gen_random_uuid(),
  lab_note_id uuid references lab_notes on delete cascade not null,
  email text not null,
  invited_by uuid references auth.users,
  permission_level permission_level not null,
  token text unique not null,
  status text default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users
);

-- Enable RLS
ALTER TABLE lab_note_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_note_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE yjs_states ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lab_note_access
-- Users can view access for notes they own or have access to
CREATE POLICY "lab_note_access_select_policy" ON lab_note_access
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lab_notes
      WHERE lab_notes.id = lab_note_access.lab_note_id
      AND lab_notes.created_by = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Only owners can manage access (includes WITH CHECK for safe updates)
CREATE POLICY "lab_note_access_insert_policy" ON lab_note_access
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lab_notes
      WHERE lab_notes.id = lab_note_id
      AND lab_notes.created_by = auth.uid()
    )
  );

CREATE POLICY "lab_note_access_update_policy" ON lab_note_access
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM lab_notes
      WHERE lab_notes.id = lab_note_access.lab_note_id
      AND lab_notes.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lab_notes
      WHERE lab_notes.id = lab_note_access.lab_note_id
      AND lab_notes.created_by = auth.uid()
    )
  );

CREATE POLICY "lab_note_access_delete_policy" ON lab_note_access
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM lab_notes
      WHERE lab_notes.id = lab_note_access.lab_note_id
      AND lab_notes.created_by = auth.uid()
    )
  );

-- Realtime for permission changes
ALTER PUBLICATION supabase_realtime ADD TABLE lab_note_access;
```

## Deployment

### 1. Install Dependencies

```bash
cd collaboration/server
npm install
# or
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

Required variables:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3001
NODE_ENV=production
```

### 3. Build

```bash
npm run build
```

### 4. Run

**Development:**
```bash
npm run dev
```

**Production with pm2:**
```bash
npm install -g pm2
pm2 start dist/index.js --name collab-server
pm2 save
pm2 startup
```

**Production with systemd:**
```bash
# Create service file
sudo tee /etc/systemd/system/collab-server.service << EOF
[Unit]
Description=Collaboration Server
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/collab-server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable collab-server
sudo systemctl start collab-server
```

### 5. Configure Firewall

```bash
# Allow WebSocket port
sudo ufw allow 3001/tcp

# If using nginx as reverse proxy
sudo ufw allow 'Nginx Full'
```

### 6. Nginx Configuration (Recommended)

```nginx
# /etc/nginx/sites-available/collab
server {
    listen 80;
    server_name collab.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeout
        proxy_read_timeout 86400;
    }
}
```

Enable SSL with Let's Encrypt:
```bash
sudo certbot --nginx -d collab.yourdomain.com
```

## Integration with Next.js

### 1. Install Client Dependencies

In your Next.js app:
```bash
npm install yjs y-websocket @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
```

### 2. Create Collaboration Hook

```typescript
// hooks/useCollaboration.ts
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useSession } from '@/lib/auth'; // Your auth hook

const COLLAB_SERVER = process.env.NEXT_PUBLIC_COLLAB_SERVER || 'ws://localhost:3001';

export function useCollaboration(documentId: string) {
  const { session } = useSession();
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!session?.access_token || !documentId) return;

    const doc = new Y.Doc();
    
    // Custom provider that sends auth message
    const wsProvider = new WebsocketProvider(
      COLLAB_SERVER,
      documentId,
      doc,
      {
        params: { token: session.access_token },
      }
    );

    wsProvider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected');
    });

    setYdoc(doc);
    setProvider(wsProvider);

    return () => {
      wsProvider.destroy();
      doc.destroy();
    };
  }, [documentId, session?.access_token]);

  return { ydoc, provider, connected };
}
```

### 3. Add to Tiptap Editor

```typescript
// components/Editor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useCollaboration } from '@/hooks/useCollaboration';

export function Editor({ documentId }: { documentId: string }) {
  const { ydoc, connected } = useCollaboration(documentId);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }), // Disable history (Yjs handles it)
      ydoc && Collaboration.configure({ document: ydoc }),
      ydoc && CollaborationCursor.configure({
        provider: /* your provider */,
        user: {
          name: 'User Name',
          color: '#f97316',
        },
      }),
    ].filter(Boolean),
  }, [ydoc]);

  if (!connected) return <div>Connecting...</div>;

  return <EditorContent editor={editor} />;
}
```

## Security Model

1. **JWT Validation**: Every WebSocket connection must authenticate with a valid Supabase JWT
2. **Permission Checks**: Every operation checks document_access table
3. **Realtime Revocation**: Server subscribes to permission changes and force-disconnects revoked users
4. **Rate Limiting**: Max 10 concurrent connections per user
5. **No Direct DB Access**: Clients never access yjs_states directly

## Monitoring

The server exposes two HTTP endpoints:

- `GET /health` - Health check with connection stats
- `GET /metrics` - Memory usage and document stats

For production monitoring, integrate with:
- **PM2** for process management
- **Datadog/New Relic** for APM
- **Sentry** for error tracking

## Troubleshooting

**Connection refused:**
- Check firewall rules
- Verify PORT in .env matches what's exposed

**Auth failures:**
- Verify SUPABASE_SERVICE_ROLE_KEY is correct
- Check that JWT hasn't expired

**Permission denied:**
- Verify lab_note_access row exists
- Check that permission_level is not 'viewer' for edits

**High memory usage:**
- Documents auto-unload after 5 min of inactivity
- Adjust PERSIST_INTERVAL if needed

## License

Same as main project

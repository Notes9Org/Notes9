-- Invitations, collaborators, and audit log tables for email-based collaboration

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null,
  email text not null,
  role text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create table if not exists collaborators (
  doc_id uuid not null,
  user_id uuid not null,
  role text not null,
  unique (doc_id, user_id)
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create table public.chat_messages (
  id uuid not null default extensions.uuid_generate_v4 (),
  session_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamp with time zone not null default now(),
  constraint chat_messages_pkey primary key (id),
  constraint chat_messages_session_id_fkey foreign KEY (session_id) references chat_sessions (id) on delete CASCADE,
  constraint chat_messages_role_check check (
    (
      role = any (
        array['user'::text, 'assistant'::text, 'system'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_chat_messages_session on public.chat_messages using btree (session_id) TABLESPACE pg_default;

create index IF not exists idx_chat_messages_created on public.chat_messages using btree (created_at) TABLESPACE pg_default;








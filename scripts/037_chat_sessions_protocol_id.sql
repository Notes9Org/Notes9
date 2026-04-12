-- Scope chat sessions to a protocol (Protocol AI) vs general Catalyst chats (protocol_id IS NULL).
alter table public.chat_sessions
  add column if not exists protocol_id uuid null references public.protocols (id) on delete cascade;

create index if not exists idx_chat_sessions_user_protocol
  on public.chat_sessions using btree (user_id, protocol_id)
  tablespace pg_default;

comment on column public.chat_sessions.protocol_id is 'When set, this chat belongs to Protocol AI for that protocol; NULL = Catalyst / general chat.';

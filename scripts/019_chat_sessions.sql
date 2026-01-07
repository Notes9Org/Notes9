create table public.chat_sessions (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  title text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chat_sessions_pkey primary key (id),
  constraint chat_sessions_user_id_fkey foreign KEY (user_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_chat_sessions_user on public.chat_sessions using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_chat_sessions_updated on public.chat_sessions using btree (updated_at desc) TABLESPACE pg_default;

create trigger update_chat_sessions_updated_at BEFORE
update on chat_sessions for EACH row
execute FUNCTION update_updated_at_column ();







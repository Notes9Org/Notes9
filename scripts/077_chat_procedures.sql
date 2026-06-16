-- 077_chat_procedures.sql
--
-- PROCEDURAL MEMORY — the 5th memory layer.
--
-- The other four layers answer "what is true / where we've been / who the
-- researcher is":
--   chat_messages            — recent turns (short-term)
--   chat_episode_summaries   — per-session narrative (episodic)
--   chat_memories            — durable facts (long-term semantic)
--   chat_researcher_profiles — standing profile
--
-- Procedural memory answers a different question: "HOW does this researcher do
-- things?" — the reusable methods, analysis recipes, and standard operating
-- procedures they follow, plus the situation that should trigger each one. A
-- fact is "the KRAS CETSA Tm was 48°C"; a procedure is "when I run a CETSA
-- assay I always include a vehicle-only control and normalise to the 37°C
-- reference." Surfacing procedures lets the agent apply the researcher's own
-- method next time the same situation comes up, instead of re-deriving it.
--
-- Schema mirrors chat_memories (047 + 070 + 073) so the same reconcile-on-write,
-- HNSW recall, and soft-invalidation machinery applies:
--   * embedding extensions.vector(1536) — SAME model/dim as chat_memories
--   * content_hash (generated) + partial unique index — exact-duplicate backstop
--   * is_invalidated / invalidated_at / superseded_by — supersede-on-write
--   * HNSW cosine index — ANN recall
--   * match_chat_procedures RPC — SECURITY DEFINER, named args matching store.py
--
-- The embedded text is (title || trigger_context): we match procedures by WHEN
-- they apply, not by their full body, so a query that describes a situation
-- pulls the right method even when the body is long.
--
-- ACCESS MODEL: written by the agent backend with the service role (bypasses
-- RLS); recalled via the SECURITY DEFINER RPC. The browser never queries this
-- table directly. RLS is enabled with NO policies (deny-all to anon/authenticated)
-- — same rationale as 076: keep the table invisible to clients without adding
-- per-row auth.uid() calls (connection-exhaustion history).
--
-- Depends on 064 (pgcrypto digest resolvable as extensions.digest). Idempotent.

-- ---- table ----------------------------------------------------------------
create table if not exists public.chat_procedures (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null,                 -- short name: "CETSA quantification"
  content         text not null,                 -- the method / steps, researcher voice
  trigger_context text not null default '',      -- when this applies (embedded w/ title)
  embedding       extensions.vector(1536) not null,
  entities        text[] not null default '{}',
  importance      double precision not null default 0.5,
  use_count       integer not null default 0,
  is_invalidated  boolean not null default false,
  invalidated_at  timestamptz,
  superseded_by   uuid references public.chat_procedures(id) on delete set null,
  -- exact-duplicate backstop (semantic dedup is the LLM's job in reconcile).
  content_hash    text generated always as (
                    encode(extensions.digest(title || E'\n' || content, 'sha256'), 'hex')
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_used_at    timestamptz
);

-- ---- indexes --------------------------------------------------------------
-- ANN recall. Cosine ops to match the (1.0 - distance) similarity used below.
create index if not exists idx_chat_procedures_embedding_hnsw
  on public.chat_procedures
  using hnsw (embedding extensions.vector_cosine_ops);

-- One active row per (user, exact title+content). Invalidated rows excluded so a
-- restated procedure can supersede an old one without colliding.
create unique index if not exists uq_chat_procedures_user_content_active
  on public.chat_procedures (user_id, content_hash)
  where is_invalidated = false;

-- Active-row scan domain shrinks as procedures are invalidated.
create index if not exists idx_chat_procedures_active
  on public.chat_procedures (user_id, created_at desc)
  where is_invalidated = false;

-- ---- RLS: deny-all (service-role only), same as 076 -----------------------
alter table public.chat_procedures enable row level security;
-- Intentionally no policies: all access is service-role (bypasses RLS) or via
-- the SECURITY DEFINER RPC below. Deny-all for browser clients.

-- ---- match_chat_procedures — vector recall --------------------------------
-- Consumed by store.search_procedures: reads
--   id, title, content, trigger_context, entities, importance, created_at, similarity.
-- Named args (match_user_id, query_embedding, match_count, similarity_threshold)
-- must match the dict keys passed from store.py exactly.
create or replace function public.match_chat_procedures(
  match_user_id        uuid,
  query_embedding      extensions.vector,
  match_count          integer          default 3,
  similarity_threshold double precision default 0.70
)
returns table (
  id              uuid,
  title           text,
  content         text,
  trigger_context text,
  entities        text[],
  importance      double precision,
  created_at      timestamptz,
  similarity      double precision
)
language plpgsql
-- VOLATILE (not STABLE): the body runs `SET LOCAL hnsw.ef_search`, which
-- Postgres forbids in a non-volatile function (0A000). See migration 078.
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  set local hnsw.ef_search = 100;

  return query
  select
    cp.id,
    cp.title,
    cp.content,
    cp.trigger_context,
    cp.entities,
    cp.importance,
    cp.created_at,
    (1.0 - (cp.embedding <=> query_embedding))::double precision as similarity
  from public.chat_procedures cp
  where cp.user_id = match_user_id
    and cp.is_invalidated = false
    and (1.0 - (cp.embedding <=> query_embedding)) >= similarity_threshold
  order by cp.embedding <=> query_embedding   -- ascending distance = descending similarity
  limit match_count;
end;
$$;

revoke all on function public.match_chat_procedures(
  uuid, extensions.vector, integer, double precision
) from public;
grant execute on function public.match_chat_procedures(
  uuid, extensions.vector, integer, double precision
) to service_role;
grant execute on function public.match_chat_procedures(
  uuid, extensions.vector, integer, double precision
) to authenticated;

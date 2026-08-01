# Notes9 (ELN frontend)

Electronic lab notebook UI. Next.js 16 (App Router) · React 19 · TypeScript · Tailwind
v4 · Supabase (Postgres + RLS + Storage) · Streamdown for chat rendering. The AI backend
(Catalyst agent API + worker) lives in the sibling `../AI` repo — this app talks to it
over SSE (see `docs/AGENT_STREAM_API.md`, `lib/catalyst-client.ts`).

## Commands

Package manager is **pnpm**.

- `pnpm dev` — dev server (http://localhost:3000)
- `pnpm typecheck` — `tsc --noEmit` (also runs as `prebuild`, so `pnpm build` typechecks first)
- `pnpm test` — vitest run · `pnpm test:watch` — watch mode
- `pnpm vitest run path/to/file.test.ts` — one file · add `-t "test name"` for one test
- `pnpm lint` — eslint · `pnpm build` — production build

**After switching branches, `rm -rf .next` before trusting `pnpm typecheck`.** Next
generates route types into `.next/types/validator.ts`; they survive a checkout and then
fail on routes that only exist on the other branch. The errors name real-looking paths
and are pure noise — a stale-artifact false positive, not a source error.

Run `pnpm typecheck` **and** `pnpm test` before claiming a change is done. `tsc`/tests
passing ≠ runtime-correct — trace the data flow, or use `/browse` to verify UI behavior.

## Architecture invariants — do not break these

- **Never delete `proxy.ts`.** It is the Next 16 middleware entry (Supabase auth token
  refresh). A cleanup commit removed it once and caused app-wide 401s.
- **Chat/message surfaces scroll via `hooks/use-pinned-auto-scroll.ts`.** Never add
  unconditional scroll-to-bottom — it fights the pinned-scroll behavior.
- **The `user` storage bucket is PRIVATE.** Use signed URLs, persist `storagePath` and
  re-sign on read; never store or render public URLs.
- **Keep the "orphan" Catalyst files** (`catalyst-page` / `chat` / `messages` /
  `sidebar` / `greeting`) and the project-scoped sidebar nav exclusions — both are
  intentional, not dead code. Don't remove them in refactors/dead-code sweeps.
  The corollary matters when debugging: **the live chat is `components/layout/right-sidebar.tsx`**,
  which has its own inline implementation. `components/catalyst/chat.tsx` is imported
  nowhere, so editing it changes nothing a user sees — including the chat-history panel,
  which the live sidebar reimplements rather than sharing.
- **Skip `components/marketing/` and `app/(marketing)/`** in audits and refactors.

## Database

Baseline is `scripts/000_full_script.sql` plus `scripts/` and `supabase/migrations/`.
Read them before writing any DDL — numbering has duplicates, so never infer table/column
names. Route live DB work through the `supabase` subagent and stay additive/conservative:
RLS/auth-check-heavy patterns and repeated `auth.getUser()` (connection-slot exhaustion)
have crashed the DB before. See `docs/rls-quick-reference.md` and
`docs/row-level-security-policies.md`.

## Shipping

**`main` is PR-protected — a direct push is rejected** (`GH013: Changes must be made
through a pull request`), no matter how green the branch is. Land work by pushing a
branch and opening a PR; "push to main" is never a mechanical option.

`scripts/` migration numbers are not globally unique — long-lived branches have
independently claimed the same numbers, so a filename collision on merge is expected
and is resolved by renumbering the *incoming* branch's files, never migrations already
applied in production.

## Where to look (don't duplicate these here)

- `README.md` — setup + quickstart
- `docs/ARCHITECTURE.md` · `docs/UI_ARCHITECTURE.md` — app structure
- `docs/CONTEXT_MANAGEMENT.md` — AI context/retrieval architecture
- `docs/DATA_MODEL.md` · `docs/GLOSSARY.md` — schema & domain terms
- `docs/CATALYST_INTEGRATION.md` · `docs/AGENT_STREAM_API.md` — backend + SSE contracts
- `docs/ENVIRONMENT_VARIABLES.md` — config
- `.cursor/rules/*.mdc` + `.cursor/skills/` — marketing-campaign authoring only, all
  glob-scoped to `docs/marketing/**` with `alwaysApply: false`. They never apply to
  product code; ignore them unless the task is marketing copy.

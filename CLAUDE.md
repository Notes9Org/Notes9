# Notes9 (ELN frontend)

Electronic lab notebook UI. Next.js 16 (App Router) · React 19 · TypeScript · Tailwind
v4 · Supabase (Postgres + RLS + Storage) · Streamdown for chat rendering. The AI backend
(Catalyst agent API + worker) lives in the sibling `../AI` repo — this app talks to it
over SSE (see `docs/AGENT_STREAM_API.md`, `lib/catalyst-client.ts`).

## Commands

Package manager is **pnpm**.

- `pnpm dev` — dev server (http://localhost:3000)
- `pnpm typecheck` — `tsc --noEmit` (also runs as `prebuild`)
- `pnpm test` — vitest run · `pnpm test:watch` — watch mode
- `pnpm lint` — eslint · `pnpm build` — production build

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
- **Skip `components/marketing/` and `app/(marketing)/`** in audits and refactors.

## Database

Baseline is `scripts/000_full_script.sql` plus `scripts/` and `supabase/migrations/`.
Read them before writing any DDL — numbering has duplicates, so never infer table/column
names. Route live DB work through the `supabase` subagent and stay additive/conservative:
RLS/auth-check-heavy patterns and repeated `auth.getUser()` (connection-slot exhaustion)
have crashed the DB before. See `docs/rls-quick-reference.md` and
`docs/row-level-security-policies.md`.

## Where to look (don't duplicate these here)

- `README.md` — setup + quickstart
- `docs/ARCHITECTURE.md` · `docs/UI_ARCHITECTURE.md` — app structure
- `docs/CONTEXT_MANAGEMENT.md` — AI context/retrieval architecture
- `docs/DATA_MODEL.md` · `docs/GLOSSARY.md` — schema & domain terms
- `docs/CATALYST_INTEGRATION.md` · `docs/AGENT_STREAM_API.md` — backend + SSE contracts
- `docs/ENVIRONMENT_VARIABLES.md` — config

## Feature pipeline

The stages and modes live in `~/.claude/CLAUDE.md`. Repo specifics:

- Run from this repo root on `dev`. `/slice` records the current branch as the PR target,
  and `/fleet` hard-blocks on an uncommitted tree.
- Artifacts land in `docs/arch/<feature>/`: ARCHITECTURE.md, ADR-*.md, slices.json, briefs.
- Weak interfaces in ARCHITECTURE.md were the Tier 0 root cause here, showing up as
  rail-over-spec in four disguises. Every slice passed its own tests and the assembled
  feature was still broken. Read that section hardest.

## Skill routing

For one-off work that is not a whole feature. When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Documentation discipline (keep the tree clean)

**A PR contains code + tests only.** Do NOT commit agent-generated scaffolding or working documents — they pollute the codebase and make it harder to maintain.
- SDLC-skill artifacts (`docs/arch/<feature>/` — ARCHITECTURE.md, ADR-*/SEC-*, CONTRACTS.md, slices.json, briefs), pentest/security reports, `PENTEST.md`, and agent transcripts are **local scaffolding** — they are gitignored. Do not `git add -f` them into a feature PR.
- Do not create new top-level or per-change markdown to "explain" work. If a note has lasting value, promote it deliberately as ONE reviewed doc — never a pile of generated files.
- Fewest files. No generated markdown in commits. No scaffolding "for later."

**Write the logs. Just don't ship them.** A pipeline run legitimately produces a lot of
paper — architecture, ADRs, slice briefs, gate reports, review findings, per-slice runner
output. That is not waste; it is how the next run avoids repeating this one. But a reader
of the repo did not ask for the transcript of how the code was made, and a tree full of
`FINDINGS-03.md` and `runs/*/test_output.txt` reads as unfinished rather than thorough.
So the artifacts stay where they are useful and out of where they are noise:

| Artifact | Lives in |
|---|---|
| Code, tests, migrations | git, in the PR |
| Long-lived reference docs (`docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, …) | git, promoted deliberately |
| `docs/arch/<feature>/**` — ARCHITECTURE, ADRs, briefs, slices.json, GATE/REVIEW/FLEET, FINDINGS, runs/ | local disk + **gbrain** |
| Agent transcripts, pentest reports, `PENTEST.md` | local disk only |

A PR whose diff contains only code and tests is the goal, and it is checkable:
`git diff --name-only origin/dev...HEAD` should list no `docs/arch/**` path.

**Update gbrain before every PR.** The brain is the durable home for everything the repo
deliberately does not carry — it is why the artifacts can stay out of git without being
lost. Capturing after the PR is opened is too late: the reviewer's questions arrive first,
and the next `/arch` reads the brain, not the branch. Before running `/pr`:

```bash
A=docs/arch/<feature>
gbrain capture --file "$A/ARCHITECTURE.md" --slug "projects/<feature>" --type project --quiet
for f in "$A"/ADR-*.md; do
  gbrain capture --file "$f" --slug "analysis/$(basename "$f" .md)" --type analysis --quiet
  gbrain link "projects/<feature>" "analysis/$(basename "$f" .md)" --link-type decided_by
done
for f in FLEET GATE REVIEW; do
  [ -f "$A/$f.md" ] && gbrain capture --file "$A/$f.md" --slug "analysis/<feature>-$(echo $f | tr A-Z a-z)" --type analysis --quiet
done
gbrain timeline-add "projects/<feature>" "$(date +%F)" "PR #<n> opened: <one line>. <n> slices, <n> attempts, <what the gates caught>."
gbrain graph-query "projects/<feature>" --direction out --depth 1   # verify the edges landed
```

Record what the gates *caught*, not just that they passed. A timeline entry saying "3
slices, all green" teaches nothing; "slice 01 took 3 attempts — swallowed error at an
authorization-classification point" is what stops the next feature repeating it.

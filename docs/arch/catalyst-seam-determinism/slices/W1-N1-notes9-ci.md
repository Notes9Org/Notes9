# Slice W1-N1: notes9-ci

## Goal

Notes9 gets continuous integration. When this is done, every push and pull request runs
typecheck, lint and the full vitest suite, and a red test blocks a merge. Until this lands,
every fail-closed guard in the Data Analysis path is enforced by tests that nothing runs
automatically.

## Owns (you may write ONLY these)

- `.github/**`

That directory does not exist yet — this is a new-file slice. Touching anything outside it
is a bug. In particular you do **not** own `package.json`; if a script you need is missing,
stop and report it rather than adding one.

## Context

`.github/` does not exist in this repo. Verified: the path is absent.

This matters more than it sounds. The architecture for this feature asserts in several
places that "CI fails on mismatch" — for the `CONTRACT_HASH` parity test, for the seam
contract, for the Law 2 guards. **None of those assertions are currently true for Notes9**,
because there is no CI. The sibling repo has workflows; this one does not.

W1-N2 is landing a conformance test right now that is deliberately red on four assertions.
That test is the tripwire for a live production divergence. A tripwire nothing runs is
documentation with an assertion attached. Your slice is what converts it into a gate.

The existing scripts in `package.json` are the interface you build on:

```
typecheck : tsc --noEmit
lint      : eslint .
test      : vitest run
build     : next build
```

`build` is slow and is not the gate — do not put it in the PR workflow.

## Interfaces you must honor

### Produce: a PR workflow

Triggered on `pull_request` targeting `dev` and on `push` to `dev`. It must run, as separate
named steps so a failure is legible at a glance:

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
```

Node and pnpm versions must be pinned, not floating. A CI that resolves a different
toolchain than the developer is a CI that produces arguments rather than answers.

### Consume: nothing

This slice has no upstream. It is wave 1 and runs in parallel with W1-N2.

## Depends on

Nothing.

## Done when

- [ ] A PR against `dev` runs typecheck, lint and tests
- [ ] A deliberately failing test **blocks** the workflow — observed, not assumed
- [ ] Node and pnpm versions are pinned
- [ ] The workflow does not run `next build`
- [ ] Docs updated: a short note on what CI runs and how to reproduce a failure locally

## Edge cases to test

1. **The workflow actually fails on a red test.** This is the whole point of the slice and
   it is the one thing you must observe rather than assert. W1-N2's conformance test is red
   on four assertions on `dev` right now; if your workflow reports success while that test
   is failing, the workflow is wrong. Paste the run showing the failure.
2. **A lockfile drift fails rather than silently resolving.** `--frozen-lockfile` must be
   present. Without it CI installs a different dependency tree than the developer has, and
   the `rapidfuzz`-style environment-skew failure this feature exists to eliminate simply
   reappears in the pipeline itself.
3. **Two pre-existing suite-load failures do not mask real ones.** `agent-stream-contract.test.ts`
   (reads a fixture from the sibling `../AI` repo, absent in a fresh checkout) and
   `properties/collaborative-editing.property.test.ts` (missing `@tiptap/html`) currently fail
   to load. Decide explicitly: either fix them, or exclude them **by name with a comment
   giving the reason**. A blanket `continue-on-error` is not acceptable — it would hide
   every future failure too, which is the exact class of silent-pass bug this feature exists
   to remove.

## Out of scope

- Deploy or release workflows. This slice is the correctness gate only.
- Branch-protection rules on GitHub. That is a repo setting, not a file, and it is the
  operator's action. Note in your docs that the workflow does nothing until protection is
  enabled to require it.
- Adding or changing `package.json` scripts. Use what is there.
- Caching tuning beyond the standard setup-node pnpm cache. Make it correct first.

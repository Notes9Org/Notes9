# scripts/

## SQL migrations (`*.sql`)

These are Postgres/Supabase DDL migrations applied to the live database in ascending numeric order.

**`000_full_script.sql`** is a full-schema snapshot captured at a point in time. It exists for
reference and onboarding — it is NOT a migration step to replay; do not re-apply it.

All other files (`001_…` and above) are applied exactly once, in filename order, via the Supabase
SQL editor or `psql`.

### Filename-number collisions

Several numbers appear on more than one file. These are already applied to the live database and are
intentionally NOT renamed — renaming an applied migration is pointless and creates confusion about
what has run. When two files share a number, they were applied alphabetically:

| Number | Files (applied in this order) |
|--------|-------------------------------|
| 003 | `003_seed_data.sql`, `003_setup_storage.sql` |
| 004 | `004_create_literature_reviews.sql`, `004_create_profile_trigger.sql` |
| 012 | `012_complete_protocols_rls.sql`, `012_protocols_update_delete_rls.sql` |
| 019 | `019_chat_sessions.sql`, `019_experiment_protocols_rls.sql` |
| 025 | `025_avatars_bucket.sql`, `025_fix_samples_select_project_members.sql` |
| 027 | `027_literature_pdf_support.sql`, `027_literature_pdf_support_down.sql` |
| 030 | `030_papers_writing.sql`, `030_protocols_add_project_experiment.sql` |
| 046 | `046_chat_researcher_profiles.sql`, `046_sample_molecular_files_and_links.sql` |
| 047 | `047_chat_memories.sql`, `047_repair_sample_primary_experiment_function.sql` |
| 066 | `066_commit_lab_note.sql`, `066_profile_onboarding.sql` |

### Numbering gaps

The following numbers are absent from the directory: 006–008, 017, 022, 029, 031–035, 054–055.
These correspond to migrations that were deleted or superseded before being committed. The gaps are
intentional and acceptable — do not renumber existing files to fill them.

### Adding a new migration

1. Pick the next sequential number after the highest existing file (currently `090`).
2. Name the file `NNN_short_description.sql` (lowercase, underscores).
3. Start the file with a header comment:
   ```sql
   -- NNN: short description / YYYY-MM-DD
   ```
4. Write the migration. If the change is reversible, include a commented-out `-- DOWN:` block.
5. Apply in the Supabase SQL editor (or `psql`) on staging first, then production.

---

## Non-migration helper scripts (`scripts/utilities/`)

`scripts/utilities/` holds one-off developer tools that are not database migrations:

| File | Purpose |
|------|---------|
| `build-mascot-transparent.py` | Strips the opaque backdrop from `public/notes9-mascot.png` via edge flood-fill and writes `public/notes9-mascot-ui.png`. Requires Pillow (`pip install pillow`). |
| `capture-screenshots.ts` | Puppeteer script that logs in and captures marketing demo screenshots to `public/demo/`. Run via `pnpm capture:screenshots`. |
| `record-workflow.ts` | Puppeteer script that records a screencast workflow video to `public/demo/workflow.webm`. Run via `pnpm record:workflow`. Requires `ffmpeg`. |

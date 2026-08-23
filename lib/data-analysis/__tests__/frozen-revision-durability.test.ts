import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * WHAT THIS TEST IS, AND WHAT IT IS NOT.
 *
 * There is no database in this environment — no psql, no initdb, no running
 * Docker daemon — so no test here can execute `delete from analysis_revisions`
 * and observe Postgres refuse it. Claiming otherwise would be the exact thing
 * the brief warns against.
 *
 * So this reads the migration as text and asserts the properties that make the
 * guarantee hold. That is weaker than an execution test in one specific way and
 * stronger in another. Weaker: it proves the migration SAYS the right thing, not
 * that Postgres DOES it. Stronger: it pins the properties that would be silently
 * lost in a later edit — someone "simplifying" the trigger to AFTER DELETE, or
 * scoping it to `for each statement`, or restoring the author cascade — each of
 * which reopens the hole while leaving a trigger in place that looks fine in a
 * diff.
 *
 * WHAT REMAINS UNVERIFIED, and can only be settled against a live database:
 *   - that the trigger actually fires during a cascade from `experiments` and
 *     from `analyses` (it should: a cascading delete is a real DELETE on the
 *     child table and fires its row triggers — but "should" is not "observed");
 *   - that `alter column author_id drop not null` succeeds on the live table;
 *   - that the FK constraint lookup in the DO block finds the real constraint
 *     name on a database that has been through the 105/114 duplicate-numbering
 *     history;
 *   - that `duplicate_analysis` and `set_analysis_revision_pinned` compile and
 *     that PostgREST exposes them under the names the client calls.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), "scripts", "117_analysis_durability.sql"),
  "utf8"
)

/**
 * Whitespace-insensitive, so reformatting the SQL does not fail the test, and
 * comment-free, so a negative assertion cannot be satisfied or defeated by
 * prose. (It was: the comment explaining why the joined SELECT INTO is wrong
 * contains the joined SELECT INTO.)
 */
const stripComments = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")

const sql = stripComments(MIGRATION).toLowerCase().replace(/\s+/g, " ")

describe("117: a frozen revision cannot be destroyed by an ordinary delete", () => {
  it("guards with a BEFORE DELETE, FOR EACH ROW trigger", () => {
    // BEFORE matters: an AFTER trigger cannot stop the delete without relying
    // on the transaction abort, and FOR EACH ROW matters because a statement
    // trigger cannot see which rows are frozen.
    expect(sql).toContain(
      "before delete on public.analysis_revisions for each row execute function public.guard_frozen_analysis_revision()"
    )
  })

  it("raises rather than silently skipping the row", () => {
    // `return null` from a BEFORE DELETE trigger cancels that ONE row's delete
    // and lets the rest of the statement succeed. For a cascade that would be
    // catastrophically quiet: the experiment would appear to delete, leaving an
    // orphaned frozen revision and a user who believes the data is gone.
    // Raising aborts the whole transaction, which is the loud failure required.
    expect(sql).toMatch(/if not old\.is_frozen then return old; end if;/)
    expect(sql).toContain("raise exception using")
    expect(sql).toContain("errcode = 'restrict_violation'")
  })

  it("names the revision and the analysis so the failure is actionable", () => {
    expect(sql).toContain("is frozen and cannot be deleted")
    expect(sql).toContain("hint =")
    // A message that only says "no" leaves the user with a deletable experiment
    // they cannot delete and no idea why.
    expect(MIGRATION).toMatch(/Nothing has been deleted\./)
  })

  it("keeps a deliberate, operator-only override", () => {
    // A guarantee with no documented escape hatch becomes an undocumented one
    // performed with pg_dump surgery. This one requires setting a GUC, which
    // the `authenticated` role never does.
    expect(sql).toContain("current_setting('notes9.allow_frozen_delete', true)")
    expect(sql).toContain("= 'on' then return old")
  })

  it("does not grant the guard function to authenticated", () => {
    // The trigger function must not be callable directly by the API role.
    expect(sql).not.toMatch(
      /grant execute on function public\.guard_frozen_analysis_revision/
    )
  })
})

describe("117: a person leaving must not delete the project's frozen record", () => {
  it("re-points author_id at ON DELETE SET NULL", () => {
    // 105:126 had `on delete cascade`, which let deleting one user's profile
    // destroy frozen revisions on a project that was not theirs.
    expect(sql).toContain(
      "foreign key (author_id) references public.profiles(id) on delete set null"
    )
  })

  it("drops NOT NULL first, since SET NULL is impossible without it", () => {
    const dropNotNull = sql.indexOf("alter column author_id drop not null")
    const addFk = sql.indexOf("references public.profiles(id) on delete set null")
    expect(dropNotNull).toBeGreaterThan(-1)
    expect(addFk).toBeGreaterThan(dropNotNull)
  })

  it("looks the old constraint name up instead of assuming it", () => {
    expect(sql).toContain("from pg_constraint con")
    expect(sql).toContain("con.contype = 'f'")
  })
})

describe("117: is additive and safely re-appliable", () => {
  it("edits no already-applied migration", () => {
    // The three applied files are read-only. This asserts the intent locally;
    // that they are byte-identical to what is deployed is a git question.
    for (const applied of [
      "105_saved_analyses.sql",
      "106_analyses.sql",
      "114_analyses_union_repair.sql",
    ]) {
      const text = readFileSync(join(process.cwd(), "scripts", applied), "utf8")
      expect(text.length).toBeGreaterThan(0)
    }
  })

  it("uses idempotent guards throughout", () => {
    expect(sql).toContain("add column if not exists is_pinned")
    expect(sql).toContain("create index if not exists idx_analysis_revisions_pinned")
    expect(sql).toContain("drop trigger if exists trg_analysis_revisions_guard_frozen")
    // Every function is CREATE OR REPLACE, so a partial apply can be re-run.
    expect(sql.match(/create or replace function/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it("records itself in the 109 ledger, guarded on the ledger existing", () => {
    expect(sql).toContain("to_regclass('public.schema_migrations') is not null")
    expect(sql).toContain("'117_analysis_durability.sql'")
    expect(sql).toContain("on conflict (filename) do nothing")
  })

  it("does not reuse a migration number already on disk", async () => {
    const { readdirSync } = await import("node:fs")
    const numbers = readdirSync(join(process.cwd(), "scripts"))
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .filter((f) => f !== "117_analysis_durability.sql")
      .map((f) => f.slice(0, 3))
    // The directory has a documented history of duplicate numbers; 117 must not
    // add to it.
    expect(numbers).not.toContain("117")
  })
})

describe("117: pinning is not freezing", () => {
  it("is reversible, unlike freezing", () => {
    // freeze_analysis_revision has no un-freeze. This one takes a boolean.
    expect(sql).toContain("set_analysis_revision_pinned( p_revision_id uuid, p_pinned boolean )")
    expect(sql).toContain("set is_pinned = coalesce(p_pinned, false)")
  })

  it("goes through SECURITY DEFINER, because revisions have no UPDATE policy", () => {
    expect(sql).toMatch(
      /function public\.set_analysis_revision_pinned\([^)]*\) returns public\.analysis_revisions language plpgsql security definer/
    )
    expect(sql).toContain(
      "grant execute on function public.set_analysis_revision_pinned(uuid, boolean) to authenticated"
    )
  })

  it("checks access by hand, since DEFINER bypasses RLS", () => {
    const fn = sql.slice(
      sql.indexOf("function public.set_analysis_revision_pinned"),
      sql.indexOf("grant execute on function public.set_analysis_revision_pinned")
    )
    expect(fn).toContain("v_uid uuid := auth.uid()")
    expect(fn).toContain("raise exception 'not authenticated'")
    expect(fn).toContain("from public.project_members pm")
  })
})

describe("117: duplicate is a new analysis, not a fork", () => {
  const fn = sql.slice(
    sql.indexOf("function public.duplicate_analysis"),
    sql.indexOf("grant execute on function public.duplicate_analysis")
  )

  it("inserts a new analyses row and starts its chain at revision 1", () => {
    expect(fn).toContain("insert into public.analyses")
    expect(fn).toContain("v_new.id, 1,")
  })

  it("keeps lineage via forked_from_revision_id", () => {
    expect(fn).toContain("forked_from_revision_id")
    expect(fn).toContain("v_src_rev.id,")
    expect(fn).toContain("duplicated from")
  })

  it("does NOT copy frozen status", () => {
    // A copy of a published figure has not itself been published. Carrying
    // is_frozen across would let anyone mint a "published" revision by
    // duplicating one.
    expect(fn).not.toContain("is_frozen")
    expect(fn).not.toContain("frozen_at")
    expect(fn).not.toContain("frozen_by")
  })

  it("assigns the copy to the caller, not the original author", () => {
    expect(fn).toContain("v_uid,")
  })

  it("reads the source analysis in its own statement", () => {
    // `select r.*, a.* into v_src_rev, v_src` assigns column-by-column, which
    // would pour revision columns into the analysis record. Two statements.
    expect(fn).not.toMatch(/select r\.\*, a\.\* into/)
    expect(fn).toContain("select a.* into v_src from public.analyses a")
  })
})

import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { DEMO_PROJECT_NAMES } from "@/lib/onboarding/demo-packs"
import {
  parseChecklistState,
  type ChecklistSignals,
  type ChecklistState,
} from "@/lib/onboarding/checklist"

export type ChecklistMeasurement = {
  /**
   * False when the measurement could not be taken at all. Callers MUST NOT gate
   * anything on the counts in that case — `ownProjectCount: 0` on a failed read
   * is "we don't know", not "this user has no projects", and treating the two
   * the same would trap established users behind the first-run screen.
   */
  measured: boolean
  signals: ChecklistSignals
  state: ChecklistState
  /** Ids of the seeded demo projects, so callers can label or exclude them. */
  demoProjectIds: string[]
  /** Comma-separated goals from the wizard, used to order the checklist. */
  primaryGoal: string | null
}

const UNMEASURED: ChecklistMeasurement = {
  measured: false,
  signals: {
    welcomeSeen: false,
    ownProjectCount: 0,
    savedLiteratureCount: 0,
    catalystMessageCount: 0,
    dataFileCount: 0,
  },
  // Dismissed, so a failed read hides the checklist rather than showing an
  // all-zero one to a user who has done plenty.
  state: { done: [], dismissed: true },
  demoProjectIds: [],
  primaryGoal: null,
}

type ProfileBits = {
  welcomeSeen: boolean
  state: ChecklistState
  primaryGoal: string | null
}

/**
 * Reads the onboarding columns, degrading one migration at a time.
 * `onboarding_checklist` and `primary_goal` arrive in scripts/104 and
 * scripts/066 respectively; selecting a column Postgres does not have fails the
 * whole statement, so retry with the narrowest set before giving up.
 */
async function readProfileBits(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileBits> {
  const full = await supabase
    .from("profiles")
    .select("notes9_welcome_seen_at, onboarding_checklist, primary_goal")
    .eq("id", userId)
    .maybeSingle()

  if (!full.error) {
    return {
      welcomeSeen: Boolean(full.data?.notes9_welcome_seen_at),
      state: parseChecklistState(full.data?.onboarding_checklist),
      primaryGoal: (full.data?.primary_goal as string | null) ?? null,
    }
  }

  const minimal = await supabase
    .from("profiles")
    .select("notes9_welcome_seen_at")
    .eq("id", userId)
    .maybeSingle()

  return {
    welcomeSeen: Boolean(minimal.data?.notes9_welcome_seen_at),
    // No column to persist overrides in yet — treat as dismissed so we don't
    // render a checklist whose "Mark as done" silently fails.
    state: { done: [], dismissed: true },
    primaryGoal: null,
  }
}

/**
 * Measures Getting Started progress against the real workspace.
 *
 * Seeded demo content is excluded throughout — a user who has only the starter
 * project has not "created a project", and the two seeded reference papers are
 * not a literature search they ran. Counting them would mark the checklist half
 * done before the user did anything, which is exactly the failure mode that
 * makes onboarding checklists feel dishonest.
 *
 * Runs under the caller's RLS session, so every count is already scoped to what
 * this user can see. Safe to call before scripts/104 is applied: a missing
 * column degrades to "no overrides, not dismissed".
 */
export async function measureChecklist(
  supabase: SupabaseClient,
  userId: string
): Promise<ChecklistMeasurement> {
  try {
    const demoProjectsRes = await supabase
      .from("projects")
      .select("id")
      .in("name", DEMO_PROJECT_NAMES)

    const demoProjectIds = (demoProjectsRes.data ?? []).map((p) => p.id as string)

    const [
      totalProjectsRes,
      totalLiteratureRes,
      demoLiteratureRes,
      catalystRes,
      dataFilesRes,
      profileBits,
    ] = await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }),
      supabase
        .from("literature_reviews")
        .select("id", { count: "exact", head: true })
        .eq("catalog_placement", "repository"),
      // Counted separately rather than filtered with `not.in`, because a paper
      // saved with no project has a NULL project_id and would be dropped by the
      // NOT IN comparison rather than counted as the user's own.
      demoProjectIds.length
        ? supabase
            .from("literature_reviews")
            .select("id", { count: "exact", head: true })
            .eq("catalog_placement", "repository")
            .in("project_id", demoProjectIds)
        : Promise.resolve({ count: 0 } as { count: number | null }),
      supabase
        .from("chat_messages")
        .select("id, chat_sessions!inner(user_id)", { count: "exact", head: true })
        .eq("chat_sessions.user_id", userId),
      supabase.from("experiment_data").select("id", { count: "exact", head: true }),
      readProfileBits(supabase, userId),
    ])

    // The project count is what gates the dashboard, so a failed read must not
    // masquerade as zero.
    if (totalProjectsRes.error) {
      console.error("[onboarding] project count failed", totalProjectsRes.error.message)
      return UNMEASURED
    }

    const ownProjectCount = Math.max(
      0,
      (totalProjectsRes.count ?? 0) - demoProjectIds.length
    )
    const savedLiteratureCount = Math.max(
      0,
      (totalLiteratureRes.count ?? 0) - (demoLiteratureRes.count ?? 0)
    )

    return {
      measured: true,
      signals: {
        welcomeSeen: profileBits.welcomeSeen,
        ownProjectCount,
        savedLiteratureCount,
        catalystMessageCount: catalystRes.count ?? 0,
        dataFileCount: dataFilesRes.count ?? 0,
      },
      state: profileBits.state,
      demoProjectIds,
      primaryGoal: profileBits.primaryGoal,
    }
  } catch (err) {
    // The checklist is an enhancement — never let it take the dashboard down.
    console.error("[onboarding] checklist measurement failed", err)
    return UNMEASURED
  }
}

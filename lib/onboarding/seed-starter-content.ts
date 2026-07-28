import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { seedDemoProject } from "@/lib/seed-demo-project"
import { resolveDemoPack } from "@/lib/onboarding/demo-packs"

/**
 * How long to wait for welcome-wizard answers before giving up and seeding the
 * fallback pack. The wizard is non-dismissible, so the realistic way to land
 * here is closing the tab mid-wizard — we would rather such a user eventually
 * get generic starter content than an empty workspace forever.
 */
const ABANDONED_WIZARD_GRACE_MS = 10 * 60 * 1000

export type SeedOutcome =
  /** Content was created on this call. */
  | "seeded"
  /** A previous call already seeded this user. */
  | "already-seeded"
  /** Wizard is still in flight — hold off so the pack can be personalised. */
  | "waiting-for-answers"
  /** Guard columns unreadable (migration not applied) — skip quietly. */
  | "unavailable"

/**
 * Seeds field-matched starter content for a user exactly once.
 *
 * Ordering matters here and is the reason this function exists. The demo pack is
 * chosen from `profiles.research_field`, which the welcome wizard writes — so
 * seeding must not run before the wizard finishes, or every user gets the
 * fallback pack regardless of their field. Callers are:
 *
 *  - `seedStarterContentAction` (app/actions/onboarding.ts) — the common path,
 *    fired the moment the wizard completes so content is ready on the dashboard.
 *  - `ensureUserProfile` (lib/ensure-user-profile.ts) — the safety net, for
 *    users who never finished the wizard.
 *
 * Both paths are safe to call repeatedly and concurrently: the `demo_seeded_at`
 * guard covers the common case and the UNIQUE (organization_id, name) constraint
 * on `projects` covers the race.
 *
 * Requires a service-role client — the seeder writes rows across org- and
 * owner-scoped tables and bypasses RLS.
 */
export async function seedStarterContentOnce(
  admin: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<SeedOutcome> {
  const { data, error } = await admin
    .from("profiles")
    .select("demo_seeded_at, research_field, notes9_welcome_seen_at, created_at")
    .eq("id", userId)
    .maybeSingle()

  // Column missing / read error → skip silently so this is safe to ship ahead of
  // the scripts/066 + scripts/102 migrations.
  if (error || !data) return "unavailable"
  if (data.demo_seeded_at) return "already-seeded"

  // Wizard still in flight: wait, so the pack can match their field.
  if (!data.notes9_welcome_seen_at) {
    const createdAt = data.created_at ? Date.parse(String(data.created_at)) : Number.NaN
    const abandoned =
      Number.isFinite(createdAt) && Date.now() - createdAt > ABANDONED_WIZARD_GRACE_MS
    if (!abandoned) return "waiting-for-answers"
  }

  const pack = resolveDemoPack(data.research_field as string | null)
  await seedDemoProject(admin, userId, organizationId, pack)

  const stamped = await admin
    .from("profiles")
    .update({ demo_seeded_at: new Date().toISOString(), demo_pack: pack.id })
    .eq("id", userId)

  // `demo_pack` arrives in scripts/104 — if that migration has not been applied
  // yet, still record the seed so we never double-seed.
  if (stamped.error) {
    await admin
      .from("profiles")
      .update({ demo_seeded_at: new Date().toISOString() })
      .eq("id", userId)
  }

  return "seeded"
}

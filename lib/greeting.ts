/**
 * Single source of truth for the hour-of-day → label boundaries used across
 * the dashboard, projects page, and the Catalyst side panel.
 *
 * Boundaries (local time):
 *   05:00 – 11:59 → morning
 *   12:00 – 16:59 → afternoon
 *   17:00 – 20:59 → evening
 *   else          → night     (right-sidebar opts to say "Happy <day>" here)
 *
 * Previously each surface inlined its own cutoffs and they disagreed: the
 * dashboard would call 3am "Morning" while the side panel said "Happy Friday".
 */
export type PartOfDay = "morning" | "afternoon" | "evening" | "night"

export function partOfDay(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) return "morning"
  if (hour >= 12 && hour < 17) return "afternoon"
  if (hour >= 17 && hour < 21) return "evening"
  return "night"
}

const TITLE_CASE: Record<PartOfDay, "Morning" | "Afternoon" | "Evening"> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  // No "Night" surface label — the dashboard greeting collapses late hours
  // onto "Evening" so the heading stays a clean three-way choice.
  night: "Evening",
}

/** Title-cased word for "Morning, X" / "Afternoon, X" / "Evening, X" headings. */
export function timeOfDayLabel(hour: number): "Morning" | "Afternoon" | "Evening" {
  return TITLE_CASE[partOfDay(hour)]
}

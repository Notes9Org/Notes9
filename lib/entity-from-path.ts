// Single source of truth for URL → workspace-entity mapping.
// Consumed by:
//   - components/activity-beacon.tsx  (recency signal → recently_touched, Slice 3)
//   - the agent FocusEnvelope         (what's open on screen → request.focus, Slice 2)
// Keeping one table here stops the two copies from drifting when routes change.

export type EntityKind =
  | "project"
  | "experiment"
  | "lab_note"
  | "protocol"
  | "literature_review"
  | "sample"
  | "paper"
  | "report";

const ROUTE_TO_ENTITY: Array<[RegExp, EntityKind]> = [
  [/^\/projects\/([^/?#]+)/, "project"],
  [/^\/experiments\/([^/?#]+)/, "experiment"],
  [/^\/lab-notes\/([^/?#]+)/, "lab_note"],
  [/^\/protocols\/([^/?#]+)/, "protocol"],
  [/^\/literature-reviews\/([^/?#]+)/, "literature_review"],
  [/^\/samples\/([^/?#]+)/, "sample"],
  [/^\/papers\/([^/?#]+)/, "paper"],
  [/^\/reports\/([^/?#]+)/, "report"],
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PathEntity = { entity_kind: EntityKind; entity_id: string };

/** The workspace entity a pathname points at, or null (list pages, /dashboard,
 *  non-UUID ids). Only the first matching rule wins. */
export function entityFromPath(pathname: string | null | undefined): PathEntity | null {
  if (!pathname) return null;
  for (const [re, kind] of ROUTE_TO_ENTITY) {
    const m = pathname.match(re);
    if (m && UUID_RE.test(m[1])) return { entity_kind: kind, entity_id: m[1] };
  }
  return null;
}

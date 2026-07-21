// Org collaboration (invites / multi-user orgs) is hidden until ready to ship.
// Same style as NEXT_PUBLIC_ACTIVITY_BEACON: enabled only when exactly "true".
// NEXT_PUBLIC_ makes it readable both client- and server-side.
export const orgCollaborationEnabled = () =>
  process.env.NEXT_PUBLIC_ORG_COLLABORATION === "true"

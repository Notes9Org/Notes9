/**
 * The seven "New …" actions, shared by the sidebar New menu, the dashboard
 * quick actions and the `c` leader shortcuts, so the three can never drift.
 *
 * Ids match the `create.*` entries in lib/shortcuts/registry.ts.
 *
 * No React here on purpose — each consumer owns its own icons, and the
 * dispatcher has no business importing an icon set.
 *
 * Hrefs are stored RAW. The sidebar and the dashboard wrap them in
 * `withFromDashboard()` so the new page gets a "Dashboard ›" breadcrumb; a
 * global shortcut fired from an arbitrary page must not claim the user came
 * from the dashboard, so it pushes the raw href instead.
 */

export type CreateActionId =
  | 'labNote'
  | 'experiment'
  | 'project'
  | 'sample'
  | 'protocol'
  | 'paper'
  | 'report';

export type CreateAction = {
  id: CreateActionId;
  label: string;
  /** Destination route. Absent when the action opens a dialog instead. */
  href?: string;
  /** Handled by a dialog the consumer mounts, not by navigation. */
  opensDialog?: boolean;
};

/** Menu order — the order the sidebar and the dashboard already render. */
export const CREATE_ACTIONS: CreateAction[] = [
  { id: 'project', label: 'Project', href: '/projects/new' },
  { id: 'experiment', label: 'Experiment', href: '/experiments/new' },
  { id: 'sample', label: 'Sample', href: '/samples/new' },
  { id: 'protocol', label: 'Protocol', href: '/protocols/new' },
  // No route: <NewLabNoteDialog> is mounted by the consumer (app-sidebar).
  { id: 'labNote', label: 'Lab note', opensDialog: true },
  // The label users see is "Writing"; the route and the id say paper.
  { id: 'paper', label: 'Writing', href: '/papers/new' },
  // Reports have no /new route — the list page opens its generator on ?new=true.
  { id: 'report', label: 'Report', href: '/reports?new=true' },
];

/**
 * The action's href with the active project folded in, e.g.
 * `/protocols/new?project=<id>`. Returns undefined for dialog actions.
 *
 * Existing query params are preserved (`/reports?new=true` keeps `new`), though
 * the emitted param order may differ from a hand-built string.
 */
export function createActionHref(
  action: CreateAction,
  projectId?: string | null,
): string | undefined {
  if (!action.href) return undefined;
  // A brand-new project has no parent project to inherit scope from.
  if (!projectId || action.id === 'project') return action.href;

  const qIndex = action.href.indexOf('?');
  const pathname = qIndex === -1 ? action.href : action.href.slice(0, qIndex);
  const params = new URLSearchParams(
    qIndex === -1 ? '' : action.href.slice(qIndex + 1),
  );
  params.set('project', projectId);
  return `${pathname}?${params.toString()}`;
}

import type { ShortcutDef } from './types';

/**
 * The Notes9 shortcut catalog — one source of truth for key handling AND the
 * cheat sheet, so the two can never drift.
 *
 * Rules for adding an entry:
 *  - `handled: 'registry'` means the global dispatcher binds it. Give it an
 *    action with the same `id` in `contexts/shortcuts-context.tsx`.
 *  - `handled: 'external'` means something else already handles the key
 *    (Tiptap, a local component, the browser). Documented, never bound.
 *  - Deliberately EXCLUDED: self-evident formatting keys (Cmd+B bold,
 *    Cmd+I italic, Cmd+Z undo). Researchers already know those; listing them
 *    buries the shortcuts that actually save time.
 *  - Never use Cmd+N/T/W/Q or Cmd+Shift+N/T — Chrome and Safari do not let a
 *    page intercept them.
 */

export const GROUP = {
  essentials: 'Essentials',
  goTo: 'Go to',
  create: 'Create',
  writing: 'Writing & editing',
  ai: 'AI & Catalyst',
  inserts: 'Mentions & inserts',
  whiteboard: 'Whiteboard',
  analysis: 'Data analysis',
} as const;

/** Leader keys. Pressing one opens a short window for the follow-up key. */
export const LEADER_GO = 'g';
export const LEADER_CREATE = 'c';
/**
 * The editor toolbar's own leader, owned by tiptap-editor.tsx. Documented here
 * so the cheat sheet can teach it; never bound by the global dispatcher.
 */
export const LEADER_TOOLBAR = '\\';
/** How long a leader stays armed before it expires, in ms. */
export const LEADER_TIMEOUT_MS = 1200;

const essentials = [
  {
    id: 'palette.open',
    keys: ['mod+k'],
    label: 'Search everything, or run a command',
    hint: 'Find projects, experiments, notes, protocols and samples. Type > for commands, @ to jump to an entity, # for lab notes.',
    group: GROUP.essentials,
    scope: 'global',
    handled: 'registry',
    allowInInput: true,
  },
  {
    id: 'shortcuts.open',
    keys: ['mod+/'],
    label: 'Show keyboard shortcuts',
    hint: 'This panel. Also opens with ? when you are not typing.',
    group: GROUP.essentials,
    scope: 'global',
    handled: 'registry',
    allowInInput: true,
  },
  {
    id: 'shortcuts.openAlt',
    keys: ['?'],
    label: 'Show keyboard shortcuts',
    group: GROUP.essentials,
    scope: 'global',
    handled: 'registry',
  },
  {
    id: 'sidebar.toggle',
    keys: ['mod+b'],
    label: 'Show or hide the sidebar',
    hint: 'Still bolds text while you are writing in a note.',
    group: GROUP.essentials,
    scope: 'global',
    // Owned by components/ui/sidebar.tsx, which already guards editable targets.
    handled: 'external',
  },
  {
    id: 'save.now',
    keys: ['mod+s'],
    label: 'Save now',
    hint: 'Notes autosave every couple of seconds. This flushes immediately.',
    group: GROUP.essentials,
    scope: 'global',
    handled: 'registry',
    allowInInput: true,
  },
  {
    id: 'theme.toggle',
    keys: ['mod+shift+d'],
    label: 'Switch between light and dark',
    group: GROUP.essentials,
    scope: 'global',
    handled: 'registry',
  },
  {
    id: 'escape.close',
    keys: ['escape'],
    label: 'Close a dialog, menu, or fullscreen view',
    hint: 'Also stops Catalyst mid-response.',
    group: GROUP.essentials,
    scope: 'global',
    handled: 'external',
  },
] as const satisfies readonly ShortcutDef[];

/** `g` then a letter. Hrefs are asserted against APP_PRIMARY_NAV in tests. */
/**
 * The third column is the route slug, not the href — `href` and `id` are both
 * derived from it. Deriving the id with `href.replace(...)` instead widens it to
 * `string`, which silently collapses `ShortcutId` (see ADR-021) and disarms the
 * compile-time check that stops a renamed binding leaving a stale hint on screen.
 * A template literal over an `as const` union keeps both literal, with no cast.
 */
const goTo = (
  [
    ['d', 'Dashboard', 'dashboard'],
    ['p', 'Projects', 'projects'],
    ['e', 'Experiments', 'experiments'],
    ['n', 'Lab notes', 'lab-notes'],
    ['l', 'Literature', 'literature-reviews'],
    ['o', 'Protocols', 'protocols'],
    ['s', 'Samples', 'samples'],
    ['w', 'Writing', 'papers'],
    ['a', 'Data analysis', 'data-analysis'],
    ['r', 'Reports', 'reports'],
    ['c', 'Catalyst', 'catalyst'],
    ['m', 'Research map', 'research-map'],
  ] as const
).map(([key, label, slug]) => ({
  id: `goto.${slug}` as const,
  keys: [LEADER_GO, key],
  label: `Go to ${label}`,
  group: GROUP.goTo,
  scope: 'global' as const,
  handled: 'registry' as const,
  href: `/${slug}`,
})) satisfies readonly ShortcutDef[];

/**
 * `c` then a letter. Ids match keys in lib/app-create-actions.ts so the
 * dispatcher, the sidebar New menu and the palette all resolve the same action.
 */
const create = (
  [
    ['n', 'lab note', 'labNote'],
    ['e', 'experiment', 'experiment'],
    ['p', 'project', 'project'],
    ['s', 'sample', 'sample'],
    ['o', 'protocol', 'protocol'],
    ['w', 'paper', 'paper'],
    ['r', 'report', 'report'],
  ] as const
).map(([key, noun, slug]) => ({
  id: `create.${slug}` as const,
  keys: [LEADER_CREATE, key],
  label: `New ${noun}`,
  group: GROUP.create,
  scope: 'global' as const,
  handled: 'registry' as const,
})) satisfies readonly ShortcutDef[];

const ai = [
  {
    id: 'catalyst.toggle',
    keys: ['mod+j'],
    label: 'Open or close the Catalyst panel',
    group: GROUP.ai,
    scope: 'global',
    handled: 'registry',
    allowInInput: true,
  },
  {
    id: 'catalyst.askPage',
    keys: ['mod+shift+a'],
    label: 'Ask Catalyst about this page',
    hint: 'Opens the panel with the current experiment, note or protocol already in scope.',
    group: GROUP.ai,
    scope: 'global',
    handled: 'registry',
    allowInInput: true,
  },
  {
    id: 'composer.send',
    keys: ['enter'],
    label: 'Send your message',
    group: GROUP.ai,
    scope: 'composer',
    handled: 'external',
  },
  {
    id: 'composer.newline',
    keys: ['shift+enter'],
    label: 'Start a new line instead of sending',
    group: GROUP.ai,
    scope: 'composer',
    handled: 'external',
  },
] as const satisfies readonly ShortcutDef[];

const inserts = [
  {
    id: 'insert.slash',
    keys: [],
    display: ['/'],
    label: 'Insert a block',
    hint: 'On an empty line in a note: tables, images, spreadsheets, equations, page breaks, citations and more.',
    group: GROUP.inserts,
    scope: 'editor',
    handled: 'external',
  },
  {
    id: 'insert.mention',
    keys: [],
    display: ['@'],
    label: 'Mention a project, experiment, protocol or sample',
    hint: 'Works in notes and in the Catalyst composer.',
    group: GROUP.inserts,
    scope: 'editor',
    handled: 'external',
  },
  {
    id: 'insert.labNote',
    keys: [],
    display: ['#'],
    label: 'Reference a lab note',
    group: GROUP.inserts,
    scope: 'editor',
    handled: 'external',
  },
  {
    id: 'insert.citation',
    keys: [],
    display: ['[['],
    label: 'Insert a citation from your literature library',
    group: GROUP.inserts,
    scope: 'editor',
    handled: 'external',
  },
] as const satisfies readonly ShortcutDef[];

const writing = [
  {
    id: 'editor.indent',
    keys: ['tab'],
    label: 'Indent the current block',
    group: GROUP.writing,
    scope: 'editor',
    handled: 'external',
  },
  {
    id: 'editor.outdent',
    keys: ['shift+tab'],
    label: 'Outdent the current block',
    group: GROUP.writing,
    scope: 'editor',
    handled: 'external',
  },
  {
    id: 'editor.applyEquation',
    keys: ['mod+enter'],
    label: 'Apply an equation you are editing',
    group: GROUP.writing,
    scope: 'editor',
    handled: 'external',
  },
  // The backslash leader existed but only one of its twelve labels was ever
  // rendered, so nobody could find it. Documented here in full.
  ...(
    [
      ['b', 'Bold'],
      ['i', 'Italic'],
      ['u', 'Underline'],
      ['t', 'Open the text menu'],
      ['f', 'Choose a font'],
      ['s', 'Choose a font size'],
      ['c', 'Choose a text colour'],
      ['n', 'Open the insert menu'],
      ['l', 'Open the list menu'],
      ['a', 'Open the alignment menu'],
      ['m', 'Open the table menu'],
      ['e', 'Open the equation menu'],
    ] as const
  ).map(([key, label]) => ({
    // `as const` keeps this a literal union. Without it the template widens to
    // `string`, and because a union with `string` collapses to `string`, this
    // one line would silently disarm `ShortcutId` for the entire app (ADR-021).
    id: `editor.toolbar.${key}` as const,
    // A genuine sequence — press \, release, then the letter — so it must
    // render as "\ then B", not "\ B". Only `keys` gets the "then" treatment.
    keys: [LEADER_TOOLBAR, key],
    label,
    group: GROUP.writing,
    scope: 'editor' as const,
    handled: 'external' as const,
  })),
] as const satisfies readonly ShortcutDef[];

const whiteboard = [
  {
    id: 'canvas.selectAll',
    keys: ['mod+a'],
    label: 'Select every note',
    group: GROUP.whiteboard,
    scope: 'canvas',
    handled: 'external',
  },
  {
    id: 'canvas.duplicate',
    keys: ['mod+d'],
    label: 'Duplicate the selection',
    group: GROUP.whiteboard,
    scope: 'canvas',
    handled: 'external',
  },
  {
    id: 'canvas.delete',
    keys: ['delete'],
    label: 'Delete the selection',
    group: GROUP.whiteboard,
    scope: 'canvas',
    handled: 'external',
  },
  {
    id: 'canvas.nudge',
    keys: [],
    display: ['←', '↑', '↓', '→'],
    label: 'Nudge the selection by 8px',
    hint: 'Hold Shift to move 32px at a time.',
    group: GROUP.whiteboard,
    scope: 'canvas',
    handled: 'external',
  },
] as const satisfies readonly ShortcutDef[];

const analysis = [
  {
    id: 'analysis.undo',
    keys: ['mod+z'],
    label: 'Undo the last analysis step',
    group: GROUP.analysis,
    scope: 'analysis',
    handled: 'external',
  },
  {
    id: 'analysis.redo',
    keys: ['mod+shift+z'],
    label: 'Redo the last analysis step',
    group: GROUP.analysis,
    scope: 'analysis',
    handled: 'external',
  },
] as const satisfies readonly ShortcutDef[];

/**
 * Internal, deliberately un-annotated: keeping the precise union of every entry
 * is what makes `ShortcutId` a literal union. Do not export it — the narrow
 * union hides optional fields (`display`, `href`, `allowInInput`) on entries
 * that omit them, which is useless to consumers.
 */
const ALL_SHORTCUTS = [
  ...essentials,
  ...goTo,
  ...create,
  ...ai,
  ...inserts,
  ...writing,
  ...whiteboard,
  ...analysis,
];

/**
 * Every shortcut id that exists, as a literal union.
 *
 * This is the type that makes a stale on-screen hint impossible: hint call
 * sites take a `ShortcutId`, so renaming or removing a binding turns every
 * place that displays it into a compile error rather than a wrong keycap.
 * See ADR-021. It only stays a union while the group arrays above are declared
 * `as const satisfies readonly ShortcutDef[]` — annotating one of them
 * `: ShortcutDef[]` again silently collapses this to `string`, which the test
 * suite guards against.
 */
export type ShortcutId = (typeof ALL_SHORTCUTS)[number]['id'];

export const SHORTCUTS: readonly ShortcutDef[] = ALL_SHORTCUTS;

/** Cheat-sheet section order. */
export const GROUP_ORDER: string[] = [
  GROUP.essentials,
  GROUP.goTo,
  GROUP.create,
  GROUP.ai,
  GROUP.inserts,
  GROUP.writing,
  GROUP.whiteboard,
  GROUP.analysis,
];

/** Only these get a global listener. */
export const BOUND_SHORTCUTS = SHORTCUTS.filter((s) => s.handled === 'registry');

export function groupedShortcuts(): { group: string; items: ShortcutDef[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: SHORTCUTS.filter((s) => s.group === group),
  })).filter((section) => section.items.length > 0);
}

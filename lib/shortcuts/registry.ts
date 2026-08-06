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

const essentials: ShortcutDef[] = [
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
];

/** `g` then a letter. Hrefs are asserted against APP_PRIMARY_NAV in tests. */
const goTo: ShortcutDef[] = (
  [
    ['d', 'Dashboard', '/dashboard'],
    ['p', 'Projects', '/projects'],
    ['e', 'Experiments', '/experiments'],
    ['n', 'Lab notes', '/lab-notes'],
    ['l', 'Literature', '/literature-reviews'],
    ['o', 'Protocols', '/protocols'],
    ['s', 'Samples', '/samples'],
    ['w', 'Writing', '/papers'],
    ['a', 'Data files', '/data'],
    ['r', 'Reports', '/reports'],
    ['c', 'Catalyst', '/catalyst'],
    ['m', 'Research map', '/research-map'],
  ] as const
).map(([key, label, href]) => ({
  id: `goto${href.replace(/\//g, '.')}`,
  keys: [LEADER_GO, key],
  label: `Go to ${label}`,
  group: GROUP.goTo,
  scope: 'global' as const,
  handled: 'registry' as const,
  href,
}));

/**
 * `c` then a letter. Ids match keys in lib/app-create-actions.ts so the
 * dispatcher, the sidebar New menu and the palette all resolve the same action.
 */
const create: ShortcutDef[] = (
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
  id: `create.${slug}`,
  keys: [LEADER_CREATE, key],
  label: `New ${noun}`,
  group: GROUP.create,
  scope: 'global' as const,
  handled: 'registry' as const,
}));

const ai: ShortcutDef[] = [
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
];

const inserts: ShortcutDef[] = [
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
];

const writing: ShortcutDef[] = [
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
    id: `editor.toolbar.${key}`,
    // A genuine sequence — press \, release, then the letter — so it must
    // render as "\ then B", not "\ B". Only `keys` gets the "then" treatment.
    keys: [LEADER_TOOLBAR, key],
    label,
    group: GROUP.writing,
    scope: 'editor' as const,
    handled: 'external' as const,
  })),
];

const whiteboard: ShortcutDef[] = [
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
];

const analysis: ShortcutDef[] = [
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
];

export const SHORTCUTS: ShortcutDef[] = [
  ...essentials,
  ...goTo,
  ...create,
  ...ai,
  ...inserts,
  ...writing,
  ...whiteboard,
  ...analysis,
];

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

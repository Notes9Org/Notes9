import { describe, expect, it } from 'vitest';

import {
  BOUND_SHORTCUTS,
  GROUP_ORDER,
  LEADER_CREATE,
  LEADER_GO,
  LEADER_TOOLBAR,
  SHORTCUTS,
  groupedShortcuts,
} from './registry';
import {
  formatCombo,
  isSequence,
  isTypingTarget,
  matchesCombo,
  normalizeEventKey,
  parseCombo,
} from './match';

type EventLike = Parameters<typeof matchesCombo>[0];

function key(k: string, mods: Partial<Omit<EventLike, 'key'>> = {}): EventLike {
  return {
    key: k,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  };
}

describe('parseCombo', () => {
  it('splits modifiers from the trailing key', () => {
    expect(parseCombo('mod+shift+a')).toEqual({
      key: 'a',
      mod: true,
      shift: true,
      alt: false,
    });
  });

  it('handles a punctuation key', () => {
    expect(parseCombo('mod+/')).toMatchObject({ key: '/', mod: true });
  });
});

describe('normalizeEventKey', () => {
  it('maps the space character to a readable token', () => {
    expect(normalizeEventKey(' ')).toBe('space');
  });

  it('lowercases so Shift+A still matches "a"', () => {
    expect(normalizeEventKey('A')).toBe('a');
  });
});

describe('matchesCombo', () => {
  it('uses Cmd on macOS and Ctrl elsewhere', () => {
    expect(matchesCombo(key('k', { metaKey: true }), 'mod+k', true)).toBe(true);
    expect(matchesCombo(key('k', { ctrlKey: true }), 'mod+k', false)).toBe(true);
  });

  it('does not fire the Cmd binding for a Ctrl chord on macOS', () => {
    expect(matchesCombo(key('k', { ctrlKey: true }), 'mod+k', true)).toBe(false);
  });

  it('rejects when the opposite platform modifier is also held', () => {
    expect(
      matchesCombo(key('k', { metaKey: true, ctrlKey: true }), 'mod+k', true),
    ).toBe(false);
  });

  it('requires an exact modifier match, so mod+k ignores mod+shift+k', () => {
    expect(
      matchesCombo(key('k', { metaKey: true, shiftKey: true }), 'mod+k', true),
    ).toBe(false);
    expect(
      matchesCombo(key('a', { metaKey: true, shiftKey: true }), 'mod+shift+a', true),
    ).toBe(true);
  });

  it('treats Shift as implicit for punctuation, so bare ? matches', () => {
    // '?' is physically Shift+'/', so shiftKey is true on the event.
    expect(matchesCombo(key('?', { shiftKey: true }), '?', true)).toBe(true);
  });

  it('does not confuse mod+/ with mod+?', () => {
    expect(matchesCombo(key('?', { metaKey: true, shiftKey: true }), 'mod+/', true)).toBe(
      false,
    );
    expect(matchesCombo(key('/', { metaKey: true }), 'mod+/', true)).toBe(true);
  });

  it('rejects a bare key when the combo wants a modifier', () => {
    expect(matchesCombo(key('k'), 'mod+k', true)).toBe(false);
  });
});

describe('isTypingTarget', () => {
  function el(html: string): Element {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild as Element;
  }

  it('detects inputs, textareas and selects', () => {
    expect(isTypingTarget(el('<input />'))).toBe(true);
    expect(isTypingTarget(el('<textarea></textarea>'))).toBe(true);
    expect(isTypingTarget(el('<select></select>'))).toBe(true);
  });

  it('detects a contenteditable root', () => {
    expect(isTypingTarget(el('<div contenteditable="true"></div>'))).toBe(true);
  });

  it('detects a node NESTED inside a contenteditable', () => {
    // The pre-registry Cmd+K guard checked only the direct target's tagName,
    // so a shortcut could fire from a wrapper inside the editor.
    const root = el('<div contenteditable="true"><p><span>x</span></p></div>');
    const nested = root.querySelector('span');
    expect(isTypingTarget(nested)).toBe(true);
  });

  it('is false for ordinary elements and for null', () => {
    expect(isTypingTarget(el('<div></div>'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('formatCombo', () => {
  it('renders mac glyphs', () => {
    expect(formatCombo('mod+shift+a', true)).toEqual(['⌘', '⇧', 'A']);
  });

  it('renders spelled-out modifiers elsewhere', () => {
    expect(formatCombo('mod+shift+a', false)).toEqual(['Ctrl', 'Shift', 'A']);
  });

  it('maps named keys to glyphs', () => {
    expect(formatCombo('escape', true)).toEqual(['Esc']);
    expect(formatCombo('shift+enter', true)).toEqual(['⇧', '↵']);
  });
});

describe('isSequence', () => {
  it('is true only for multi-key leader sequences', () => {
    expect(isSequence(['g', 'd'])).toBe(true);
    expect(isSequence(['mod+k'])).toBe(false);
  });
});

describe('registry integrity', () => {
  it('has no duplicate ids', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never binds the same combo twice', () => {
    const combos = BOUND_SHORTCUTS.filter((s) => s.keys.length === 1).map(
      (s) => s.keys[0],
    );
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('keeps every leader sequence unique within its leader', () => {
    const sequences = BOUND_SHORTCUTS.filter((s) => s.keys.length > 1).map((s) =>
      s.keys.join(' '),
    );
    expect(new Set(sequences).size).toBe(sequences.length);
  });

  it('only binds the two global leaders', () => {
    const leaders = new Set(
      BOUND_SHORTCUTS.filter((s) => s.keys.length > 1).map((s) => s.keys[0]),
    );
    expect([...leaders].sort()).toEqual([LEADER_CREATE, LEADER_GO].sort());
  });

  it('documents the editor backslash leader without binding it', () => {
    const toolbar = SHORTCUTS.filter((s) => s.keys[0] === LEADER_TOOLBAR);
    expect(toolbar).toHaveLength(12);
    for (const s of toolbar) {
      // Two keys so the cheat sheet renders "\ then B" rather than "\ B".
      expect(s.keys).toHaveLength(2);
      expect(s.handled).toBe('external');
    }
    // tiptap-editor.tsx owns backslash; the dispatcher must never claim it.
    expect(BOUND_SHORTCUTS.some((s) => s.keys[0] === LEADER_TOOLBAR)).toBe(false);
  });

  it('gives every entry a group that the cheat sheet renders', () => {
    for (const s of SHORTCUTS) {
      expect(GROUP_ORDER).toContain(s.group);
    }
  });

  it('gives every entry something to render as a keycap', () => {
    for (const s of SHORTCUTS) {
      expect(s.keys.length > 0 || (s.display?.length ?? 0) > 0).toBe(true);
    }
  });

  it('never marks an external entry as bound', () => {
    for (const s of BOUND_SHORTCUTS) {
      expect(s.handled).toBe('registry');
    }
  });

  it('excludes self-evident formatting keys from the catalog', () => {
    // The brief was explicit: no Cmd+B-for-bold noise. Cmd+B appears only as
    // the sidebar toggle, and Cmd+I / Cmd+U must not appear at all.
    const bound = SHORTCUTS.filter((s) => s.keys.includes('mod+b'));
    expect(bound).toHaveLength(1);
    expect(bound[0].id).toBe('sidebar.toggle');
    expect(SHORTCUTS.some((s) => s.keys.includes('mod+i'))).toBe(false);
    expect(SHORTCUTS.some((s) => s.keys.includes('mod+u'))).toBe(false);
  });

  it('avoids combos the browser will not surrender', () => {
    const reserved = ['mod+n', 'mod+t', 'mod+w', 'mod+q', 'mod+shift+n', 'mod+shift+t'];
    for (const s of BOUND_SHORTCUTS) {
      for (const combo of s.keys) {
        expect(reserved).not.toContain(combo);
      }
    }
  });

  it('routes every go-to entry to a well-formed unique path', () => {
    // Contract with lib/app-primary-nav.tsx. If the nav changes, update both.
    const hrefs = SHORTCUTS.filter((s) => s.id.startsWith('goto.')).map((s) => s.href);
    expect(hrefs).toEqual([
      '/dashboard',
      '/projects',
      '/experiments',
      '/lab-notes',
      '/literature-reviews',
      '/protocols',
      '/samples',
      '/papers',
      '/data',
      '/reports',
      '/catalyst',
      '/research-map',
    ]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('groups without dropping any entry', () => {
    const total = groupedShortcuts().reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(SHORTCUTS.length);
  });
});

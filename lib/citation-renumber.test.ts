import { describe, it, expect } from 'vitest';
import {
  renumberCitations,
  collectAppearanceOrder,
  applyRemapToLabel,
  CITATION_GROUP_RE,
} from './citation-renumber';

describe('collectAppearanceOrder', () => {
  it('returns base labels in first-appearance order, de-duplicated', () => {
    const md = 'A [5] B [12] C [5] D [3]';
    expect(collectAppearanceOrder(md)).toEqual(['5', '12', '3']);
  });

  it('expands grouped citations in order', () => {
    expect(collectAppearanceOrder('x [4, 6, 5] y [6]')).toEqual(['4', '6', '5']);
  });

  it('uses the base of sub-labels', () => {
    expect(collectAppearanceOrder('p [6.2] q [6.1] r [7]')).toEqual(['6', '7']);
  });

  it('skips labels with no backing source when knownLabels is given', () => {
    const known = new Set(['5', '3']);
    expect(collectAppearanceOrder('a [5] b [99] c [3]', known)).toEqual(['5', '3']);
  });
});

describe('renumberCitations', () => {
  it('renumbers sparse arrival ids to contiguous appearance order', () => {
    const md = 'First [5]. Then [12]. Again [5]. New [3].';
    const { markdown, remap } = renumberCitations(md);
    expect(markdown).toBe('First [1]. Then [2]. Again [1]. New [3].');
    expect(remap.get('5')).toBe('1');
    expect(remap.get('12')).toBe('2');
    expect(remap.get('3')).toBe('3');
  });

  it('rewrites grouped citations and sorts the group ascending by new number', () => {
    // first appearance: 4→1, 5→2, 6→3, so [6, 4] becomes [1, 3]
    const md = 'intro [4, 5, 6] mid [6, 4]';
    const { markdown } = renumberCitations(md);
    expect(markdown).toBe('intro [1, 2, 3] mid [1, 3]');
  });

  it('preserves sub-labels through the remap', () => {
    const md = 'claim [6.2] and [6.1] and [7]';
    const { markdown } = renumberCitations(md);
    // 6→1, 7→2
    expect(markdown).toBe('claim [1.2] and [1.1] and [2]');
  });

  it('is idempotent on already-contiguous input', () => {
    const md = 'a [1] b [2] c [1] d [3]';
    expect(renumberCitations(md).markdown).toBe(md);
  });

  it('leaves unknown labels untouched and does not consume a number', () => {
    const known = new Set(['5', '3']);
    const { markdown } = renumberCitations('a [5] b [99] c [3]', known);
    // 5→1, 3→2; 99 has no source so it stays as-is
    expect(markdown).toBe('a [1] b [99] c [2]');
  });

  it('is prefix-stable as more text streams in', () => {
    const prefix = 'one [5] two [12]';
    const full = `${prefix} three [3] four [5]`;
    const r1 = renumberCitations(prefix);
    const r2 = renumberCitations(full);
    // labels seen in the prefix keep the same new number in the fuller text
    expect(r2.remap.get('5')).toBe(r1.remap.get('5'));
    expect(r2.remap.get('12')).toBe(r1.remap.get('12'));
  });

  it('returns an empty remap and unchanged text when there are no citations', () => {
    const { markdown, remap } = renumberCitations('plain prose, no cites');
    expect(markdown).toBe('plain prose, no cites');
    expect(remap.size).toBe(0);
  });

  it('handles empty / nullish input safely', () => {
    expect(renumberCitations('').markdown).toBe('');
  });
});

describe('applyRemapToLabel', () => {
  it('maps the base and preserves the sub-label', () => {
    const remap = new Map([['6', '1']]);
    expect(applyRemapToLabel('6.2', remap)).toBe('1.2');
    expect(applyRemapToLabel('6', remap)).toBe('1');
  });

  it('returns the label unchanged when the base is unknown', () => {
    expect(applyRemapToLabel('9', new Map())).toBe('9');
  });
});

describe('CITATION_GROUP_RE', () => {
  it('matches single, grouped and sub-label markers', () => {
    const text = '[5] [4, 5, 6] [6.2]';
    const found = text.match(CITATION_GROUP_RE);
    expect(found).toEqual(['[5]', '[4, 5, 6]', '[6.2]']);
  });
});

import { describe, expect, it } from 'vitest';

import { stripEmDashes } from '@/lib/notes9-chat-format';

describe('stripEmDashes', () => {
  it('turns a spaced prose dash into a comma', () => {
    expect(stripEmDashes('The assay failed — the buffer was stale.')).toBe(
      'The assay failed, the buffer was stale.',
    );
  });

  it('turns a bare dash into a hyphen', () => {
    expect(stripEmDashes('pH 7.2—7.4')).toBe('pH 7.2-7.4');
  });

  it('returns the input untouched when there is nothing to do', () => {
    const clean = 'No dashes here, just prose.';
    expect(stripEmDashes(clean)).toBe(clean);
  });

  it('leaves fenced code verbatim', () => {
    const md = 'Use this:\n\n```ts\nconst re = /[–—-]/g\n```\n\nDone — really.';
    expect(stripEmDashes(md)).toBe(
      'Use this:\n\n```ts\nconst re = /[–—-]/g\n```\n\nDone, really.',
    );
  });

  it('leaves inline code verbatim', () => {
    expect(stripEmDashes('Call `a — b` now — please.')).toBe('Call `a — b` now, please.');
  });

  it('preserves citation markers around a stripped dash', () => {
    expect(stripEmDashes('Growth slowed [1] — see Fig. 2 [2].')).toBe(
      'Growth slowed [1], see Fig. 2 [2].',
    );
  });
});

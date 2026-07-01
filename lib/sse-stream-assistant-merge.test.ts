import { describe, expect, it } from 'vitest';
import { maskCiteTokensForStream, createStreamCiteMasker } from './sse-stream-assistant-merge';

describe('maskCiteTokensForStream', () => {
  it('removes complete inline cite tokens', () => {
    const out = maskCiteTokensForStream('viability 82% [lab_969438] observed');
    expect(out).not.toContain('lab_');
    expect(out).toContain('viability 82%');
    expect(out).toContain('observed');
  });

  it('removes grouped multi-id tokens', () => {
    const out = maskCiteTokensForStream('See [lab_a1b2, lit_7c4f] for details.');
    expect(out).not.toContain('lab_');
    expect(out).not.toContain('lit_');
    expect(out).toContain('details');
  });

  it('replaces a no-space token with a space so words do not glue', () => {
    expect(maskCiteTokensForStream('studies[lab_a1b2]show')).toBe('studies show');
  });

  // Regression: the masker runs once per streamed delta, so it MUST preserve
  // whitespace. Trimming/collapsing per delta glued words ("read"+"all") and
  // destroyed the blank-line / "## " structure markdown needs.
  it('preserves leading and trailing whitespace on a delta', () => {
    expect(maskCiteTokensForStream(' read')).toBe(' read');
    expect(maskCiteTokensForStream('all ')).toBe('all ');
  });

  it('keeps spaces when masked deltas are concatenated', () => {
    const deltas = [' all', ' three', ' attached'];
    const joined = deltas.map(maskCiteTokensForStream).join('');
    expect(joined).toBe(' all three attached');
    expect(joined).not.toContain('allthree');
  });

  it('preserves markdown block structure (blank lines and heading marker)', () => {
    const src = '\n\n## Paper 1\n';
    expect(maskCiteTokensForStream(src)).toBe(src);
  });
});

describe('createStreamCiteMasker (split-delta aware)', () => {
  it('masks a cite token split across two deltas without leaking the fragment', () => {
    const mask = createStreamCiteMasker();
    const out = mask('studies[lab_a') + mask('1b2]show');
    expect(out).toBe('studies show');
    expect(out).not.toContain('[lab_a');
    expect(out).not.toContain('1b2]');
  });

  it('masks a whole cite token that arrives in one delta', () => {
    const mask = createStreamCiteMasker();
    expect(mask('studies[lab_a1b2]show')).toBe('studies show');
  });

  it('preserves a bracket that turns out NOT to be a cite token', () => {
    const mask = createStreamCiteMasker();
    const out = mask('see [') + mask(' the note');
    expect(out).toBe('see [ the note');
  });

  it('preserves numeric [1] citations (delayed at most one delta)', () => {
    const mask = createStreamCiteMasker();
    const out = mask('result[') + mask('1] here');
    expect(out).toBe('result[1] here');
  });
});

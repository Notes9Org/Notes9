import { describe, expect, it } from 'vitest';
import {
  catalystMentionPath,
  type CatalystMentionKind,
} from '@/lib/catalyst-mention-types';

// Snapshot of AI/catalyst/core/contracts/request.py ATTACHMENT_KINDS.
// If the backend allowlist changes, update this copy deliberately -- it is
// the guard against this app ever emitting a mention kind the backend 422s.
const BACKEND_ATTACHMENT_KINDS = [
  'lab_note',
  'literature_review',
  'protocol',
  'experiment',
  'project',
  'sample',
  'report',
  'data_file',
] as const;

// Exhaustive by construction: fails to compile if CatalystMentionKind gains a
// member that isn't listed here, so the parity assertion below can't go stale.
const ALL_MENTION_KINDS: Record<CatalystMentionKind, true> = {
  literature_review: true,
  lab_note: true,
  experiment: true,
  project: true,
  protocol: true,
  data_file: true,
};

describe('CatalystMentionKind <-> backend ATTACHMENT_KINDS parity', () => {
  it('every mention kind this app can emit is accepted by the backend', () => {
    for (const kind of Object.keys(ALL_MENTION_KINDS) as CatalystMentionKind[]) {
      expect(BACKEND_ATTACHMENT_KINDS).toContain(kind);
    }
  });
});

describe('catalystMentionPath', () => {
  it('routes data_file to the Data Analysis workspace', () => {
    expect(catalystMentionPath('data_file', 'abc123')).toBe('/data-analysis?file=abc123');
  });

  it('URL-encodes ids that need encoding', () => {
    expect(catalystMentionPath('data_file', 'a/b c')).toBe('/data-analysis?file=a%2Fb%20c');
    expect(catalystMentionPath('experiment', 'a/b c')).toBe('/experiments/a%2Fb%20c');
  });

  it('leaves every pre-existing kind routed exactly as before', () => {
    expect(catalystMentionPath('literature_review', 'id1')).toBe('/literature-reviews/id1');
    expect(catalystMentionPath('lab_note', 'id2')).toBe('/lab-notes/id2');
    expect(catalystMentionPath('experiment', 'id3')).toBe('/experiments/id3');
    expect(catalystMentionPath('project', 'id4')).toBe('/projects/id4');
    expect(catalystMentionPath('protocol', 'id5')).toBe('/protocols/id5');
  });
});

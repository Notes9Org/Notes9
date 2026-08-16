import { describe, expect, it } from 'vitest';
import {
  catalystMentionPath,
  type CatalystMentionKind,
} from '@/lib/catalyst-mention-types';
import type { Notes9AgentAttachment } from '@/lib/notes9-agent-request';
import type { AgentAttachment } from '@/hooks/use-agent-stream';

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

/**
 * The wire union, third of the three copies. Exhaustive by construction for the
 * same reason as ALL_MENTION_KINDS above: adding a member to
 * Notes9AgentAttachment['kind'] without adding it here fails to compile.
 */
const ALL_WIRE_KINDS: Record<Notes9AgentAttachment['kind'], true> = {
  lab_note: true,
  literature_review: true,
  protocol: true,
  experiment: true,
  project: true,
  sample: true,
  report: true,
  data_file: true,
};

/**
 * The stream union, fourth copy. This is the one `tagsToAttachments()` in
 * right-sidebar.tsx actually assigns into, which is why widening
 * CatalystMentionKind without it broke `tsc` in a file this slice does not own.
 */
const ALL_STREAM_KINDS: Record<AgentAttachment['kind'], true> = {
  lab_note: true,
  literature_review: true,
  protocol: true,
  experiment: true,
  project: true,
  sample: true,
  report: true,
  data_file: true,
};

/**
 * FOUR hand-written copies of the same set, in two repos, all of which must
 * agree:
 *
 *   CatalystMentionKind ─┬─> AgentAttachment['kind']        ─> ATTACHMENT_KINDS
 *    (what the UI tags)  └─> Notes9AgentAttachment['kind']  ─>  (backend allowlist)
 *
 * The arrows are assignment: `tagsToAttachments()` in right-sidebar.tsx puts
 * CatalystMentionKind-typed objects into the stream/request types, which are
 * serialized and validated against the backend allowlist. Each must be a subset
 * of the next.
 *
 * Every edge here has already bitten. The backend supported `data_file` end to
 * end (fetch_full_records, citations, scope enforcement) while ATTACHMENT_KINDS
 * omitted it, which is the entire reason the Data Analysis chat could never tag
 * a file. Then widening CatalystMentionKind alone broke `tsc` in
 * right-sidebar.tsx, twice, because copies 3 and 4 are separate literal unions
 * that nothing was keeping in step.
 *
 * A missing kind in the backend copy is not a dropped attachment: pydantic
 * raises and the ENTIRE agent request 422s, taking every other attachment with
 * it. That is why this test exists and why it checks every edge, not just the
 * end-to-end one.
 */
describe('attachment-kind parity across all four copies', () => {
  it('every mention kind the UI can emit fits the stream type', () => {
    for (const kind of Object.keys(ALL_MENTION_KINDS) as CatalystMentionKind[]) {
      expect(ALL_STREAM_KINDS).toHaveProperty(kind);
    }
  });

  it('every mention kind the UI can emit fits the request type', () => {
    for (const kind of Object.keys(ALL_MENTION_KINDS) as CatalystMentionKind[]) {
      expect(ALL_WIRE_KINDS).toHaveProperty(kind);
    }
  });

  it('the stream and request unions are identical', () => {
    expect(Object.keys(ALL_STREAM_KINDS).sort()).toEqual(
      Object.keys(ALL_WIRE_KINDS).sort()
    );
  });

  it('every wire kind is accepted by the backend allowlist', () => {
    for (const kind of Object.keys(ALL_WIRE_KINDS) as Notes9AgentAttachment['kind'][]) {
      expect(BACKEND_ATTACHMENT_KINDS).toContain(kind);
    }
  });

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

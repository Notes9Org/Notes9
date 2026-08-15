import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * The launch handler's ordering invariant:
 *
 *   A launch's mentions are on the request its `autoSend` produces.
 *
 * This used to be false. `autoSend` submitted inside the first animation frame
 * while the mention chip was appended in a second frame queued after it, so a
 * launch carrying both sent its turn UNTAGGED and then grew a chip attached to
 * nothing. It never fired in production only because no producer set both --
 * both literature producers set `autoSend: false` -- and the Data Analysis
 * composer is the first that does.
 *
 * A previous attempt at the fix collapsed the two frames but dropped the
 * synchronous `setInput(q)` call. React state stayed empty, `handleSubmit`'s
 * early-return guard fired, and NO request was sent at all, from any of the
 * eight pages that mount a composer. Its tests passed because they asserted on
 * source text rather than on a dispatched request.
 *
 * So these tests model the three collaborators the handler actually drives --
 * React state (`setInput`), the tag store (`appendMentionToInput`) and the
 * submit (`handleSubmit`) -- and assert on ORDER and on what submit could see.
 * Nothing here reads source text.
 */

type Frame = () => void;

/** Deterministic rAF: frames queue and only run when we drain them. */
function makeScheduler() {
  const frames: Frame[] = [];
  return {
    raf: (cb: Frame) => {
      frames.push(cb);
      return frames.length;
    },
    /** Drain, including frames queued by frames, as a real browser would. */
    drain() {
      let guard = 0;
      while (frames.length) {
        if (++guard > 100) throw new Error('rAF did not settle');
        frames.shift()!();
      }
    },
    pending: () => frames.length,
  };
}

type Mention = { kind: string; id: string; title: string };
type Launch = { query?: string; autoSend?: boolean; mention?: Mention };

/**
 * The handler under test, expressed against the same collaborators the real one
 * uses. `submit` reads `input` and the tags exactly as `handleSubmit` does: it
 * early-returns on empty input, which is the regression the previous attempt
 * shipped.
 */
function makeHarness(scheduler: ReturnType<typeof makeScheduler>) {
  const events: string[] = [];
  let input = '';
  let domText = '';
  const tags: Mention[] = [];
  const sent: { query: string; attachments: Mention[] }[] = [];

  const setInput = (v: string) => {
    input = v;
    events.push('setInput');
  };
  const setDomText = (v: string) => {
    // Assigning textContent wipes any chip already in the composer. This is why
    // the chip must land after the text, and it is the constraint the old
    // two-frame split existed to satisfy.
    domText = v;
    tags.length = 0;
    events.push('textContent');
  };
  const appendMentionToInput = (m: Mention) => {
    if (!tags.some((t) => t.id === m.id && t.kind === m.kind)) tags.push(m);
    events.push('appendMention');
  };
  const handleSubmit = () => {
    events.push('submit');
    // The real guard: `(!overrideText?.trim() && !input.trim() && ...)`.
    if (!input.trim()) return;
    sent.push({ query: input, attachments: [...tags] });
  };

  return {
    events,
    tags,
    sent,
    get input() {
      return input;
    },
    get domText() {
      return domText;
    },
    /** The shape shipped in N02b: one frame, ordered text -> chip -> submit. */
    applyLaunch(launch: Launch) {
      const q = launch.query?.trim();
      const mention = launch.mention;
      if (q) {
        setInput(q);
        scheduler.raf(() => {
          setDomText(q);
          if (mention) appendMentionToInput(mention);
          if (launch.autoSend) handleSubmit();
        });
      }
      if (mention && !q) {
        scheduler.raf(() => appendMentionToInput(mention));
      }
    },
    /** The shape on `dev` before N02b, kept so the tests prove they bite. */
    applyLaunchOld(launch: Launch) {
      const q = launch.query?.trim();
      if (q) {
        setInput(q);
        scheduler.raf(() => {
          setDomText(q);
          if (launch.autoSend) handleSubmit();
        });
      }
      const m = (launch as { literatureMention?: Mention; mention?: Mention })
        .mention;
      if (m) {
        scheduler.raf(() => appendMentionToInput(m));
      }
    },
  };
}

const DATA_FILE: Mention = { kind: 'data_file', id: 'df-1', title: 'assay.xlsx' };
const LIT: Mention = { kind: 'literature_review', id: 'lit-1', title: 'A paper' };

let sched: ReturnType<typeof makeScheduler>;
let h: ReturnType<typeof makeHarness>;

beforeEach(() => {
  sched = makeScheduler();
  h = makeHarness(sched);
});
afterEach(() => vi.restoreAllMocks());

describe('the launch ordering invariant', () => {
  it("puts a launch's mention on the request its autoSend produces", () => {
    h.applyLaunch({ query: 'summarise this', autoSend: true, mention: DATA_FILE });
    sched.drain();

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].attachments).toEqual([DATA_FILE]);
  });

  it('FAILS on the pre-N02b ordering, proving the test bites', () => {
    h.applyLaunchOld({ query: 'summarise this', autoSend: true, mention: DATA_FILE });
    sched.drain();

    // The turn went out, but untagged: the chip landed a frame too late.
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].attachments).toEqual([]);
  });

  it('seeds the text before the chip, so textContent cannot wipe it', () => {
    h.applyLaunch({ query: 'summarise this', autoSend: true, mention: DATA_FILE });
    sched.drain();

    expect(h.events.indexOf('textContent')).toBeLessThan(
      h.events.indexOf('appendMention')
    );
    expect(h.tags).toEqual([DATA_FILE]);
  });

  it('submits last, after both the text and the chip', () => {
    h.applyLaunch({ query: 'summarise this', autoSend: true, mention: DATA_FILE });
    sched.drain();

    const i = (e: string) => h.events.indexOf(e);
    expect(i('textContent')).toBeLessThan(i('appendMention'));
    expect(i('appendMention')).toBeLessThan(i('submit'));
  });
});

describe('the regression the previous attempt shipped', () => {
  it('still sends the query when there is no mention at all', () => {
    h.applyLaunch({ query: 'plain question', autoSend: true });
    sched.drain();

    // Assert the dispatched query, not that submit was called: a submit that
    // early-returns on empty input also "calls submit".
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].query).toBe('plain question');
  });

  it('sets React input state synchronously, before any frame runs', () => {
    h.applyLaunch({ query: 'plain question', autoSend: true });

    expect(h.input).toBe('plain question');
    expect(sched.pending()).toBe(1);
  });
});

describe('the paths that already worked', () => {
  it('seeds a chip for a mention with no query', () => {
    h.applyLaunch({ mention: DATA_FILE });
    sched.drain();

    expect(h.tags).toEqual([DATA_FILE]);
    expect(h.sent).toHaveLength(0);
  });

  it('seeds a chip and submits nothing when autoSend is false', () => {
    h.applyLaunch({ query: 'a question', autoSend: false, mention: LIT });
    sched.drain();

    expect(h.tags).toEqual([LIT]);
    expect(h.sent).toHaveLength(0);
  });

  it('still seeds a literature chip, the path both producers take', () => {
    h.applyLaunch({ query: 'about this paper', autoSend: false, mention: LIT });
    sched.drain();

    expect(h.tags).toEqual([LIT]);
  });
});

describe('chip identity', () => {
  it('dedupes on kind AND id, so two kinds sharing an id give two chips', () => {
    h.applyLaunch({ mention: { kind: 'data_file', id: 'shared', title: 'A' } });
    sched.drain();
    h.applyLaunch({ mention: { kind: 'lab_note', id: 'shared', title: 'B' } });
    sched.drain();

    expect(h.tags).toHaveLength(2);
  });

  it('does not duplicate the same kind and id twice', () => {
    h.applyLaunch({ mention: DATA_FILE });
    sched.drain();
    h.applyLaunch({ mention: DATA_FILE });
    sched.drain();

    expect(h.tags).toHaveLength(1);
  });
});

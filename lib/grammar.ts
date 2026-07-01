'use client'

// Offline grammar / usage / style checker. Runs entirely in the browser (no text
// leaves the device) on the retext (unified) ecosystem plus write-good:
//   • fixable grammar/mechanics — a/an, repeated words, contractions,
//     redundant acronyms, sentence spacing, diacritics
//   • structure/usage/style — passive voice, hard-to-read sentences, wordiness,
//     weak intensifiers, weasel words, clichés, adverbs
// Note: this is a large *rule set*, not a full parser — it won't catch every
// subject–verb/tense error the way a heavy language model would, but it enforces
// the common rules of proper written English. Results power the editor's
// right-click "Grammar" section.

export type GrammarIssue = {
  reason: string
  start: number // char offset within the analysed text
  end: number
  actual: string
  expected: string[] // concrete replacement(s), when the rule can offer one
  fixable: boolean
}

type Processor = { process: (text: string) => Promise<{ messages: unknown[] }> }

let processorPromise: Promise<Processor | null> | null = null

async function getProcessor(): Promise<Processor | null> {
  if (typeof window === 'undefined') return null
  if (!processorPromise) {
    processorPromise = (async () => {
      try {
        const [
          { unified },
          { default: retextEnglish },
          { default: retextStringify },
          { default: retextRepeatedWords },
          { default: retextIndefiniteArticle },
          { default: retextContractions },
          { default: retextRedundantAcronyms },
          { default: retextPassive },
          { default: retextSentenceSpacing },
          { default: retextReadability },
          { default: retextDiacritics },
          { default: retextSimplify },
          { default: retextIntensify },
        ] = await Promise.all([
          import('unified'),
          import('retext-english'),
          import('retext-stringify'),
          import('retext-repeated-words'),
          import('retext-indefinite-article'),
          import('retext-contractions'),
          import('retext-redundant-acronyms'),
          import('retext-passive'),
          import('retext-sentence-spacing'),
          import('retext-readability'),
          import('retext-diacritics'),
          import('retext-simplify'),
          import('retext-intensify'),
        ])
        return unified()
          .use(retextEnglish)
          .use(retextStringify)
          .use(retextRepeatedWords)
          .use(retextIndefiniteArticle)
          .use(retextContractions, { straight: true })
          .use(retextRedundantAcronyms)
          .use(retextPassive)
          .use(retextSentenceSpacing)
          // Only flag genuinely hard sentences so technical prose isn't buried.
          .use(retextReadability, { age: 20 })
          .use(retextDiacritics)
          .use(retextSimplify)
          .use(retextIntensify) as unknown as Processor
      } catch (e) {
        console.warn('Grammar checker (retext) failed to load:', e)
        return null
      }
    })()
  }
  return processorPromise
}

let writeGoodPromise: Promise<((text: string) => Array<{ index: number; offset: number; reason: string }>) | null> | null =
  null
async function getWriteGood() {
  if (typeof window === 'undefined') return null
  if (!writeGoodPromise) {
    writeGoodPromise = import('write-good')
      .then((m) => (m.default ?? m) as (text: string) => Array<{ index: number; offset: number; reason: string }>)
      .catch((e) => {
        console.warn('Grammar checker (write-good) failed to load:', e)
        return null
      })
  }
  return writeGoodPromise
}

/** Warm both engines so the first right-click is instant. */
export function warmGrammar(): void {
  void getProcessor()
  void getWriteGood()
}

/** Analyse a passage (typically the paragraph under the cursor). */
export async function checkGrammar(text: string): Promise<GrammarIssue[]> {
  if (typeof window === 'undefined' || !text.trim()) return []
  const issues: GrammarIssue[] = []

  const processor = await getProcessor()
  if (processor) {
    try {
      const file = await processor.process(text)
      for (const raw of file.messages as Array<Record<string, any>>) {
        const start: number | undefined = raw.place?.start?.offset ?? raw.position?.start?.offset
        const end: number | undefined = raw.place?.end?.offset ?? raw.position?.end?.offset
        if (start == null || end == null || end <= start) continue
        const expected: string[] = Array.isArray(raw.expected) ? raw.expected.filter((s: unknown) => typeof s === 'string') : []
        issues.push({
          reason: String(raw.reason || 'Grammar issue'),
          start,
          end,
          actual: typeof raw.actual === 'string' ? raw.actual : text.slice(start, end),
          expected,
          fixable: expected.length > 0,
        })
      }
    } catch (e) {
      console.warn('Grammar check failed:', e)
    }
  }

  const writeGood = await getWriteGood()
  if (writeGood) {
    try {
      for (const s of writeGood(text)) {
        if (s.offset <= 0) continue
        issues.push({
          reason: s.reason,
          start: s.index,
          end: s.index + s.offset,
          actual: text.slice(s.index, s.index + s.offset),
          expected: [],
          fixable: false,
        })
      }
    } catch (e) {
      console.warn('Grammar (write-good) check failed:', e)
    }
  }

  // De-dupe issues that share a span (different engines flagging the same thing),
  // preferring the fixable one, then order by position and fixable-first.
  const byKey = new Map<string, GrammarIssue>()
  for (const it of issues) {
    const key = `${it.start}:${it.end}`
    const existing = byKey.get(key)
    if (!existing || (it.fixable && !existing.fixable)) byKey.set(key, it)
  }
  return [...byKey.values()].sort((a, b) => Number(b.fixable) - Number(a.fixable) || a.start - b.start)
}

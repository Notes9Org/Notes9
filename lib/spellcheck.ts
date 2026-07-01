'use client'

// Offline spell-checker (Hunspell via nspell). The English dictionary (en.aff /
// en.dic, sourced from the `dictionary-en` npm package) is served as static
// assets from /public/dictionaries and loaded once, lazily, on first use so the
// ~540KB dictionary never blocks the initial render. Suggestions power the
// editor's right-click "Spelling" menu.
import nspell from 'nspell'

export type Speller = {
  correct: (word: string) => boolean
  suggest: (word: string) => string[]
}

let spellerPromise: Promise<Speller | null> | null = null

/** Lazily builds (and caches) the speller. Resolves null if unavailable. */
export function loadSpeller(): Promise<Speller | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!spellerPromise) {
    spellerPromise = (async () => {
      try {
        const [aff, dic] = await Promise.all([
          fetch('/dictionaries/en.aff').then((r) => r.text()),
          fetch('/dictionaries/en.dic').then((r) => r.text()),
        ])
        return nspell(aff, dic) as Speller
      } catch (e) {
        console.warn('Spell-checker failed to load:', e)
        return null
      }
    })()
  }
  return spellerPromise
}

// Words the user chose to ignore this session ("Ignore" in the menu).
const ignored = new Set<string>()
export function ignoreWord(word: string): void {
  ignored.add(word.toLowerCase())
}
export function isWordIgnored(word: string): boolean {
  return ignored.has(word.toLowerCase())
}

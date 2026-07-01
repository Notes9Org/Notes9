declare module 'nspell' {
  interface NSpell {
    /** True when the word is spelled correctly. */
    correct(word: string): boolean
    /** Ordered spelling suggestions for a (mis)spelled word. */
    suggest(word: string): string[]
    /** Add a word to the runtime dictionary. */
    add(word: string, model?: string): NSpell
    /** Remove a word from the runtime dictionary. */
    remove(word: string): NSpell
    /** Spelling + whether the word is known/forbidden/warned. */
    info(word: string): { correct: boolean; forbidden: boolean; warn: boolean }
    /** Load an additional dictionary. */
    dictionary(dic: string | Buffer): NSpell
    personal(dic: string | Buffer): NSpell
    wordCharacters(): string | undefined
  }

  type Dictionary = { aff: string | Buffer; dic: string | Buffer }

  function nspell(aff: string | Buffer | Dictionary, dic?: string | Buffer): NSpell

  export default nspell
}

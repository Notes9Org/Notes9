declare module "write-good" {
  interface WriteGoodSuggestion {
    /** Start index of the flagged span. */
    index: number
    /** Length of the flagged span. */
    offset: number
    /** Human-readable reason. */
    reason: string
  }
  /** Enable/disable individual checks (passive, weasel, illusion, so, thereIs, …). */
  type WriteGoodOptions = Record<string, boolean>
  function writeGood(text: string, options?: WriteGoodOptions): WriteGoodSuggestion[]
  export default writeGood
}

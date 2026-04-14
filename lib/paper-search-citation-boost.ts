/** Log-diminished citation contribution for relevance (`rerankByRelevance`). Capped ~22. */
export function citationBoostForSearchRank(citedByCount: number | undefined): number {
  const cites = Math.max(0, citedByCount ?? 0)
  return Math.min(22, (Math.log1p(cites) / Math.log1p(450)) * 22)
}

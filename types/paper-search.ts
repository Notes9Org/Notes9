/** How merged database results are ordered before returning to the client. */
export type PaperSearchSortMode = "relevance" | "recent" | "cited"

export interface PaperSearchOptions {
  sort?: PaperSearchSortMode
  /** For `sort: "recent"`: include papers from this many calendar years back (default 5, max 30). */
  recentYears?: number
  /** Restrict to rows flagged as open access (after enrichment). */
  openAccessOnly?: boolean
}

export interface SearchPaper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  abstract: string;
  isOpenAccess: boolean;
  doi?: string;
  pmid?: string;
  pdfUrl?: string;
  /** Stable publisher HTML page (e.g. ScienceDirect PII URL). Prefer for "view article" when DOI redirect is generic. */
  articlePageUrl?: string;
  /** Citation count when known (primarily from OpenAlex). Used for "Most cited" sort. */
  citedByCount?: number;
  source:
    | "PubMed"
    | "Europe PMC"
    | "BioRxiv"
    | "MedRxiv"
    | "Preprint"
    | "OpenAlex"
}

export interface SearchResult {
  papers: SearchPaper[];
  totalCount: number;
  source: string;
}




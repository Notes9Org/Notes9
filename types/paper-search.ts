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
  source: 'PubMed' | 'BioRxiv' | 'MedRxiv' | 'Preprint';
}

export interface SearchResult {
  papers: SearchPaper[];
  totalCount: number;
  source: string;
}




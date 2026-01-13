import { SearchPaper } from '@/types/paper-search';

// PubMed API Integration
export async function searchPubMed(query: string): Promise<SearchPaper[]> {
  try {
    // 1. Search for IDs
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
      query
    )}&retmode=json&retmax=10&sort=relevance`;
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    const ids = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return [];

    // 2. Fetch Details (Abstracts)
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(
      ','
    )}&retmode=xml`;
    
    const fetchRes = await fetch(fetchUrl);
    const textData = await fetchRes.text();

    // 3. Parse XML (simple text parsing for server-side)
    const papers: SearchPaper[] = [];
    
    // Simple XML parsing for server-side
    const articleMatches = textData.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
    
    for (let i = 0; i < articleMatches.length; i++) {
      const article = articleMatches[i];
      
      // Extract title
      const titleMatch = article.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '') : 'Untitled Paper';
      
      // Extract abstract
      const abstractMatch = article.match(/<AbstractText[^>]*>(.*?)<\/AbstractText>/);
      const abstract = abstractMatch ? abstractMatch[1].replace(/<[^>]*>/g, '') : 'No abstract available.';
      
      // Extract DOI
      const doiMatch = article.match(/<ArticleId IdType="doi">(.*?)<\/ArticleId>/);
      const doi = doiMatch ? doiMatch[1] : undefined;
      
      // Extract PMID
      const pmidMatch = article.match(/<PMID[^>]*>(.*?)<\/PMID>/);
      const pmid = pmidMatch ? pmidMatch[1] : undefined;
      
      // Extract authors
      const authors: string[] = [];
      const authorMatches = article.match(/<Author[^>]*>[\s\S]*?<\/Author>/g) || [];
      
      for (const authorXml of authorMatches.slice(0, 5)) {
        const lastNameMatch = authorXml.match(/<LastName>(.*?)<\/LastName>/);
        const initialsMatch = authorXml.match(/<Initials>(.*?)<\/Initials>/);
        
        if (lastNameMatch) {
          const lastName = lastNameMatch[1];
          const initials = initialsMatch ? initialsMatch[1] : '';
          authors.push(`${lastName} ${initials}`.trim());
        }
      }
      
      // Extract journal
      const journalMatch = article.match(/<Title>(.*?)<\/Title>/) || 
                          article.match(/<ISOAbbreviation>(.*?)<\/ISOAbbreviation>/);
      const journal = journalMatch ? journalMatch[1] : 'Unknown Journal';
      
      // Extract year
      const yearMatch = article.match(/<PubDate>[\s\S]*?<Year>(.*?)<\/Year>/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      
      papers.push({
        id: pmid || `pubmed-${i}`,
        title,
        abstract,
        authors: authors.length > 0 ? authors : ['Unknown Author'],
        year,
        journal,
        doi,
        pmid,
        isOpenAccess: false, // Will be determined by checking PMC
        source: 'PubMed',
      });
    }

    return papers;
  } catch (error) {
    console.error('PubMed API Error:', error);
    return [];
  }
}

// Europe PMC API (BioRxiv / MedRxiv) Integration
export async function searchPreprints(query: string): Promise<SearchPaper[]> {
  try {
    // Search for preprints (SRC:PPR covers BioRxiv, MedRxiv, etc.)
    const searchUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
      query + ' AND (SRC:PPR)'
    )}&format=json&pageSize=10`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();

    const papers: SearchPaper[] = [];
    const articles = data.resultList?.result || [];

    for (const art of articles) {
      const title = art.title || 'Untitled Preprint';
      const abstract = art.abstractText || 'No abstract available.';
      const doi = art.doi;
      const year = art.pubYear ? parseInt(art.pubYear) : new Date().getFullYear();
      const journal = art.bookOrReportDetails?.publisher || art.journalTitle || 'Preprint';
      const id = art.id;
      const authors = art.authorString
        ? art.authorString.split(', ').slice(0, 5)
        : ['Unknown Author'];

      // Detect specific preprint server
      let source: 'BioRxiv' | 'MedRxiv' | 'Preprint' = 'Preprint';
      if (journal.toLowerCase().includes('biorxiv')) source = 'BioRxiv';
      else if (journal.toLowerCase().includes('medrxiv')) source = 'MedRxiv';

      papers.push({
        id,
        title,
        abstract,
        authors,
        year,
        journal,
        doi,
        isOpenAccess: true, // Preprints are typically open access
        source,
      });
    }
    
    return papers;
  } catch (error) {
    console.error('Europe PMC API Error:', error);
    return [];
  }
}

// Combined search function
export async function searchPapers(query: string): Promise<SearchPaper[]> {
  try {
    // Execute searches in parallel
    const [pubMedResults, preprintResults] = await Promise.all([
      searchPubMed(query),
      searchPreprints(query),
    ]);

    // Combine and return results
    return [...pubMedResults, ...preprintResults];
  } catch (error) {
    console.error('Paper search error:', error);
    return [];
  }
}




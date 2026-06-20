/**
 * Best-effort extraction of bibliographic metadata (author, year) from a
 * citation's title/source name. The agent's citation wire format carries no
 * dedicated author/year/citation-count fields, so when a source name is
 * formatted like "Smith et al. (2023) - Title" we parse what we can. Returns
 * nulls when nothing reliable is found — callers should treat these as optional.
 */
export interface CitationMeta {
  author: string | null;
  year: string | null;
  /** Title with a leading "Author (Year) - " prefix stripped, when detected. */
  title: string;
}

// Known academic publishers / aggregators. A citation pointing at one of these
// is a paper even when the backend mislabels its source_type (it sometimes tags
// literature papers as lab notes).
const ACADEMIC_HOST_RE =
  /(pubmed|ncbi\.nlm\.nih\.gov|pmc|doi\.org|nature\.com|sciencedirect|springer|wiley|biorxiv|medrxiv|arxiv|cell\.com|nejm|lancet|frontiersin|mdpi|plos|oup\.com|tandfonline|sagepub|jamanetwork|bmj\.com|elifesciences|researchgate|semanticscholar)/i;

/** True when a URL points at a known academic publisher/aggregator. */
export function isAcademicUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return ACADEMIC_HOST_RE.test(new URL(url).hostname.replace(/^www\./, ''));
  } catch {
    return false;
  }
}

/** Correct an obviously-mislabeled citation type: a canonical type other than
 * `literature_review` that nonetheless points at an academic publisher is
 * treated as a paper. Leaves everything else untouched. */
export function correctAcademicType(
  canonical: string,
  url: string | null | undefined,
): string {
  if (canonical !== 'literature_review' && isAcademicUrl(url)) return 'literature_review';
  return canonical;
}

export function parseCitationMeta(raw: string | null | undefined): CitationMeta {
  const s = (raw ?? '').trim();
  if (!s) return { author: null, year: null, title: '' };

  // Year — prefer one in parentheses, else the first plausible 4-digit year.
  let year: string | null = null;
  const paren = s.match(/\((19|20)\d{2}\)/);
  if (paren) year = paren[0].replace(/[()]/g, '');
  else {
    const any = s.match(/\b(19|20)\d{2}\b/);
    if (any) year = any[0];
  }

  // Author — "Surname et al.", or a leading "Surname, I." author block.
  let author: string | null = null;
  const etal = s.match(/^([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+)*?)\s+et\s+al\.?/);
  if (etal) {
    author = `${etal[1].trim()} et al.`;
  } else {
    const lead = s.match(/^([A-Z][\w'-]+),\s*[A-Z]\.?/);
    if (lead) author = lead[1].trim();
  }

  // Clean title — strip a leading "Author (Year) - " / "Author, Year:" prefix.
  let title = s;
  const prefix = s.match(
    /^[A-Za-z.,'\s-]*?(?:et al\.?)?[,\s]*\(?(?:19|20)\d{2}\)?\s*[-:–]\s*(.+)$/,
  );
  if (prefix && prefix[1] && prefix[1].trim().length > 4) {
    title = prefix[1].trim();
  }

  return { author, year, title };
}

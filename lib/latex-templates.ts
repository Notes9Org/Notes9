/**
 * Journal-specific LaTeX templates for paper export.
 *
 * Each template defines the preamble, document class, packages,
 * and structural overrides needed for a specific journal format.
 */

export interface JournalTemplate {
  /** Unique key */
  id: string
  /** Display name */
  name: string
  /** Short description shown in the UI */
  description: string
  /** LaTeX document class (e.g. "article", "IEEEtran") */
  documentClass: string
  /** Class options (e.g. "12pt", "twocolumn") */
  classOptions: string[]
  /** Additional packages beyond the base set */
  extraPackages: string[]
  /** Extra preamble lines (commands, geometry, etc.) */
  extraPreamble: string[]
  /** Whether to use \maketitle */
  useMaketitle: boolean
  /** Custom abstract environment wrapper (null = default \begin{abstract}) */
  abstractEnv: string | null
  /** Heading command for top-level sections (some journals use \section* for unnumbered) */
  sectionCommand: string
  /** Notes for the user (shown as LaTeX comment at top of file) */
  notes: string
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

const GENERIC_ARTICLE: JournalTemplate = {
  id: "generic",
  name: "Generic Article",
  description: "Standard LaTeX article — works everywhere",
  documentClass: "article",
  classOptions: ["12pt"],
  extraPackages: [],
  extraPreamble: ["\\geometry{margin=1in}"],
  useMaketitle: true,
  abstractEnv: null,
  sectionCommand: "\\section",
  notes: "Generic article template. Compatible with any LaTeX compiler.",
}

const IEEE: JournalTemplate = {
  id: "ieee",
  name: "IEEE",
  description: "IEEE conference & journal format (two-column)",
  documentClass: "IEEEtran",
  classOptions: ["conference"],
  extraPackages: ["cite", "algorithmic", "array", "stfloats", "url"],
  extraPreamble: [],
  useMaketitle: true,
  abstractEnv: null,
  sectionCommand: "\\section",
  notes:
    "IEEE format. Requires IEEEtran.cls — available at https://www.ieee.org/conferences/publishing/templates.html",
}

const ACS: JournalTemplate = {
  id: "acs",
  name: "ACS (Chemistry)",
  description: "American Chemical Society journal style",
  documentClass: "article",
  classOptions: ["12pt"],
  extraPackages: ["chemformula", "siunitx", "natbib"],
  extraPreamble: [
    "\\geometry{margin=1in}",
    "\\bibliographystyle{achemso}",
  ],
  useMaketitle: true,
  abstractEnv: null,
  sectionCommand: "\\section",
  notes:
    "ACS-style article. For official submission use the achemso package: \\documentclass{achemso}",
}

const NATURE: JournalTemplate = {
  id: "nature",
  name: "Nature",
  description: "Nature-style single column with references",
  documentClass: "article",
  classOptions: ["11pt"],
  extraPackages: ["natbib", "lineno"],
  extraPreamble: [
    "\\geometry{margin=1in}",
    "\\linenumbers",
    "\\bibliographystyle{naturemag}",
  ],
  useMaketitle: true,
  abstractEnv: null,
  sectionCommand: "\\section",
  notes:
    "Nature-style layout with line numbers. For official submission see https://www.nature.com/nature/for-authors",
}

const APA: JournalTemplate = {
  id: "apa",
  name: "APA 7th Edition",
  description: "APA style for psychology & social sciences",
  documentClass: "article",
  classOptions: ["12pt"],
  extraPackages: ["natbib", "setspace", "titlesec"],
  extraPreamble: [
    "\\geometry{margin=1in}",
    "\\doublespacing",
    "\\bibliographystyle{apalike}",
    "\\titleformat{\\section}{\\normalfont\\large\\bfseries}{\\thesection.}{0.5em}{}",
  ],
  useMaketitle: true,
  abstractEnv: null,
  sectionCommand: "\\section",
  notes:
    "APA 7th edition style. For full compliance consider the apa7 document class.",
}

const SPRINGER: JournalTemplate = {
  id: "springer",
  name: "Springer",
  description: "Springer Nature journal format",
  documentClass: "article",
  classOptions: ["12pt"],
  extraPackages: ["natbib", "lineno"],
  extraPreamble: [
    "\\geometry{margin=1in}",
    "\\bibliographystyle{spbasic}",
  ],
  useMaketitle: true,
  abstractEnv: null,
  sectionCommand: "\\section",
  notes:
    "Springer-style article. For official submission use svjour3.cls from https://www.springer.com/gp/authors-editors/journal-author/journal-author-helpdesk/manuscript-preparation/1260",
}

const ELSEVIER: JournalTemplate = {
  id: "elsevier",
  name: "Elsevier",
  description: "Elsevier journal format",
  documentClass: "article",
  classOptions: ["12pt"],
  extraPackages: ["natbib", "lineno"],
  extraPreamble: [
    "\\geometry{margin=1in}",
    "\\linenumbers",
    "\\bibliographystyle{elsarticle-num}",
  ],
  useMaketitle: true,
  abstractEnv: null,
  sectionCommand: "\\section",
  notes:
    "Elsevier-style article. For official submission use elsarticle.cls from https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions",
}

const PLOS: JournalTemplate = {
  id: "plos",
  name: "PLOS ONE",
  description: "PLOS ONE open-access journal format",
  documentClass: "article",
  classOptions: ["10pt"],
  extraPackages: ["natbib", "lineno"],
  extraPreamble: [
    "\\geometry{margin=0.75in}",
    "\\linenumbers",
    "\\bibliographystyle{plos2015}",
  ],
  useMaketitle: true,
  abstractEnv: null,
  sectionCommand: "\\section*",
  notes:
    "PLOS ONE style with line numbers and unnumbered sections. See https://journals.plos.org/plosone/s/latex",
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const JOURNAL_TEMPLATES: JournalTemplate[] = [
  GENERIC_ARTICLE,
  IEEE,
  ACS,
  NATURE,
  APA,
  SPRINGER,
  ELSEVIER,
  PLOS,
]

export function getTemplate(id: string): JournalTemplate {
  return JOURNAL_TEMPLATES.find((t) => t.id === id) || GENERIC_ARTICLE
}

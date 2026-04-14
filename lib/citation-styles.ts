/**
 * Citation style definitions for academic papers.
 * Each style defines how inline citations and reference list entries should be formatted.
 */

export interface CitationStyle {
  id: string
  name: string
  description: string
  /** Example of inline citation format */
  inlineExample: string
  /** Prompt instructions for the AI to follow this style */
  promptInstructions: string
}

export const CITATION_STYLES: CitationStyle[] = [
  {
    id: "vancouver",
    name: "Vancouver",
    description: "Numbered citations [1], [2] — common in biomedical journals",
    inlineExample: "[1]",
    promptInstructions: `Use Vancouver citation style:
- Inline citations: sequential numbers in square brackets, e.g. [1], [2], [3]
- Multiple citations: [1,2] or [1-3] for ranges
- Reference list: numbered, authors (last name initials), title, journal abbreviated, year;volume(issue):pages. doi.
- Example: 1. Smith JA, Doe B. Title of article. J Abbrev. 2024;15(2):123-130. doi:10.1000/xyz`,
  },
  {
    id: "apa",
    name: "APA 7th",
    description: "(Author, Year) — psychology, social sciences",
    inlineExample: "(Smith, 2024)",
    promptInstructions: `Use APA 7th edition citation style:
- Inline citations: (Author, Year), e.g. (Smith, 2024), (Smith & Jones, 2024)
- 3+ authors: (Smith et al., 2024)
- Reference list: Author, A. A. (Year). Title of article. Journal Name, Volume(Issue), Pages. https://doi.org/xxx
- Hanging indent, alphabetical order by first author`,
  },
  {
    id: "nature",
    name: "Nature",
    description: "Superscript numbers¹ ² — Nature family journals",
    inlineExample: "¹",
    promptInstructions: `Use Nature citation style:
- Inline citations: superscript numbers in order of appearance, e.g. ¹, ², ³
- Reference list: numbered, Authors. Title. Journal Volume, Pages (Year).
- Example: 1. Smith, J. A. & Doe, B. Title of article. Nature 600, 123–130 (2024).`,
  },
]

export const MORE_CITATION_STYLES: CitationStyle[] = [
  {
    id: "ieee",
    name: "IEEE",
    description: "[1] numbered — engineering, computer science",
    inlineExample: "[1]",
    promptInstructions: `Use IEEE citation style:
- Inline citations: numbers in square brackets in order of appearance, e.g. [1], [2]
- Reference list: [1] A. Author, "Title," Journal, vol. X, no. Y, pp. Z, Month Year.`,
  },
  {
    id: "harvard",
    name: "Harvard",
    description: "(Author Year) — widely used in UK/Australia",
    inlineExample: "(Smith 2024)",
    promptInstructions: `Use Harvard citation style:
- Inline citations: (Author Year), e.g. (Smith 2024), no comma between author and year
- Reference list: Author, A.A. Year. Title. Journal, Volume(Issue), pp.Pages.
- Alphabetical order by first author`,
  },
  {
    id: "chicago-notes",
    name: "Chicago (Notes)",
    description: "Footnote numbers¹ — humanities, history",
    inlineExample: "¹",
    promptInstructions: `Use Chicago Notes-Bibliography citation style:
- Inline citations: superscript footnote numbers
- Footnotes: Author, "Title," Journal Volume, no. Issue (Year): Pages.
- Bibliography: Author. "Title." Journal Volume, no. Issue (Year): Pages.`,
  },
]

/** All available citation styles */
export const ALL_CITATION_STYLES = [...CITATION_STYLES, ...MORE_CITATION_STYLES]

/** Get a citation style by ID */
export function getCitationStyle(id: string): CitationStyle | undefined {
  return ALL_CITATION_STYLES.find(s => s.id === id)
}

/** Default citation style */
export const DEFAULT_CITATION_STYLE = "vancouver"

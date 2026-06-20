import {
  Atom,
  BarChart3,
  BookOpen,
  Calculator,
  Dna,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  FolderOpen,
  Image as ImageIcon,
  Microscope,
  Presentation,
  Sigma,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export interface ThinkingContext {
  /** Contextual progress label, e.g. "Reviewing the literature…". */
  title: string;
  /** Lucide icon matching the inferred task / artifact. */
  Icon: LucideIcon;
  /** Optional little science fact about AI in biotech (shown sometimes). */
  fact?: string;
}

interface Category {
  /** Lowercase keywords that route a query into this category. */
  keywords: string[];
  title: string;
  Icon: LucideIcon;
}

// Verbs that signal the user wants something *produced* (an artifact), as
// opposed to just discussed. Checked alongside an artifact noun.
const CREATE_VERBS = [
  'create', 'generate', 'make', 'draw', 'build', 'design', 'produce',
  'plot', 'render', 'compose', 'draft', 'visualize', 'visualise', 'export',
];

// Artifact categories — when a create verb pairs with one of these nouns, the
// thinking state shows the artifact's icon and says it's being made.
const ARTIFACT_CATEGORIES: Category[] = [
  {
    keywords: ['image', 'picture', 'photo', 'illustration', 'figure', 'drawing', 'logo', 'icon', 'artwork', 'visual'],
    title: 'Creating your image…',
    Icon: ImageIcon,
  },
  {
    keywords: ['chart', 'graph', 'plot', 'bar chart', 'line chart', 'scatter', 'histogram', 'visualization', 'visualisation'],
    title: 'Building your chart…',
    Icon: BarChart3,
  },
  {
    keywords: ['diagram', 'flowchart', 'flow chart', 'schematic', 'pathway', 'network', 'workflow'],
    title: 'Drawing your diagram…',
    Icon: Workflow,
  },
  {
    keywords: ['table', 'spreadsheet', 'excel', 'xlsx', 'csv'],
    title: 'Building your table…',
    Icon: FileSpreadsheet,
  },
  {
    keywords: ['slide', 'slides', 'presentation', 'deck', 'powerpoint', 'pptx'],
    title: 'Designing your slides…',
    Icon: Presentation,
  },
  {
    keywords: ['document', 'report', 'pdf', 'docx', 'word doc', 'manuscript', 'write-up', 'write up'],
    title: 'Drafting your document…',
    Icon: FileText,
  },
];

// Topic categories (no artifact produced) — ordered most-specific → general.
const CATEGORIES: Category[] = [
  {
    keywords: ['literature', 'paper', 'papers', 'pubmed', 'pmc', 'citation', 'cite', 'reference', 'doi', 'journal', 'publication'],
    title: 'Reviewing the literature…',
    Icon: BookOpen,
  },
  {
    keywords: ['protocol', 'procedure', 'sop', 'step-by-step', 'method'],
    title: 'Drafting your protocol…',
    Icon: FlaskConical,
  },
  {
    keywords: ['sequence', 'dna', 'rna', 'primer', 'plasmid', 'pcr', 'gene', 'genome', 'codon', 'protein', 'amino acid', 'crispr', 'guide rna'],
    title: 'Working through the sequence…',
    Icon: Dna,
  },
  {
    keywords: ['molarity', 'molar', 'concentration', 'dilution', 'buffer', 'ph ', 'calculate', 'calculation', 'convert', 'how much', 'volume', 'mass'],
    title: 'Running the calculation…',
    Icon: Calculator,
  },
  {
    keywords: ['experiment', 'assay', 'result', 'results', 'data', 'measurement', 'observation', 'analyze', 'analysis'],
    title: 'Analyzing your experiment…',
    Icon: Microscope,
  },
  {
    keywords: ['sample', 'samples', 'aliquot', 'stock', 'inventory'],
    title: 'Checking your samples…',
    Icon: FlaskConical,
  },
  {
    keywords: ['project', 'projects'],
    title: 'Pulling your project together…',
    Icon: FolderOpen,
  },
  {
    keywords: ['summary', 'summarize', 'summarise'],
    title: 'Putting it together…',
    Icon: FileText,
  },
  {
    keywords: ['statistic', 'statistics', 'p-value', 'p value', 'significance', 'regression', 'correlation', 'distribution'],
    title: 'Crunching the numbers…',
    Icon: Sigma,
  },
];

/** Short, encouraging facts about AI in biotech — shown occasionally beneath the
 * thinking label so a wait feels informative rather than idle. */
const FACTS: string[] = [
  'AlphaFold has predicted the 3D structure of over 200 million proteins.',
  'AI can screen millions of candidate molecules in the time a lab tests a few.',
  'Protein language models learn the “grammar” of life from millions of sequences.',
  'Machine learning helps design CRISPR guides with fewer off-target effects.',
  'Generative models are now proposing enzymes that don’t exist in nature.',
  'AI can flag patterns across thousands of lab notes in seconds.',
  'ML models can predict antibiotic resistance straight from a genome.',
  'AI is helping shrink drug discovery timelines from years toward months.',
  'Foundation models can suggest the next experiment, not just summarize the last.',
  'Computer vision now scores cell assays faster and more consistently than by eye.',
];

const DEFAULT: Category = {
  keywords: [],
  title: 'Thinking…',
  Icon: Atom,
};

/** Stable, non-random hash so the chosen fact doesn't flicker between re-renders
 * of the same query. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickFact(q: string): string | undefined {
  const h = hashString(q || 'notes9');
  // Show a fact ~half the time so it feels like a nice surprise, not noise.
  return h % 2 === 0 ? FACTS[h % FACTS.length] : undefined;
}

/**
 * Infer a context-aware loading state from the user's query. Artifact-creation
 * requests ("create an image", "build a chart") win first — showing that
 * artifact's icon and a "Creating…" label — then topic categories, then a
 * sensible default. A little AI-in-biotech fact appears about half the time.
 * Deterministic for a given query so it stays stable while the answer streams.
 * Presentational only; never changes what the agent actually does.
 */
export function getThinkingContext(query: string): ThinkingContext {
  const q = (query || '').toLowerCase();

  // 1. Artifact creation intent (highest priority).
  const wantsCreate = CREATE_VERBS.some((v) => q.includes(v));
  if (wantsCreate) {
    const artifact = ARTIFACT_CATEGORIES.find((c) => c.keywords.some((k) => q.includes(k)));
    if (artifact) {
      return { title: artifact.title, Icon: artifact.Icon, fact: pickFact(q) };
    }
  }

  // 2. Topic categories, else default.
  const category = CATEGORIES.find((c) => c.keywords.some((k) => q.includes(k))) ?? DEFAULT;
  return { title: category.title, Icon: category.Icon, fact: pickFact(q) };
}

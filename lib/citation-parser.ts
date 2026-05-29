/**
 * Parse inline citation numbers from markdown text.
 * Matches patterns like [1], [2], [10] etc.
 */

export interface CitationMatch {
  number: number;
  startIndex: number;
  endIndex: number;
  originalText: string;
}

// Matches `[1]`, `[10]`, and hierarchical sub-citations `[3.2]` (ADR-0006).
// `number` carries the BASE (3 for `3.2`); `originalText` preserves the full
// label for display.
const CITATION_PATTERN = /\[(\d+(?:\.\d+)?)\]/g;

/**
 * Extract all citation numbers from markdown text.
 * Returns array of matches with positions for replacement.
 */
export function parseCitationNumbers(text: string): CitationMatch[] {
  const matches: CitationMatch[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  CITATION_PATTERN.lastIndex = 0;

  while ((match = CITATION_PATTERN.exec(text)) !== null) {
    const number = parseInt(match[1], 10);

    // Only consider valid citation numbers (1-999)
    if (number > 0 && number < 1000) {
      matches.push({
        number,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        originalText: match[0],
      });
    }
  }

  return matches;
}

/**
 * Check if a citation number exists in the text.
 */
export function hasCitationNumber(text: string, number: number): boolean {
  const pattern = new RegExp(`\\[${number}\\]`, 'g');
  return pattern.test(text);
}

/**
 * Get unique citation numbers from text, sorted.
 */
export function getUniqueCitationNumbers(text: string): number[] {
  const matches = parseCitationNumbers(text);
  const numbers = new Set(matches.map((m) => m.number));
  return Array.from(numbers).sort((a, b) => a - b);
}

/**
 * Split text into segments with citation markers preserved.
 * Returns alternating text and citation segments for rendering.
 */
export interface TextSegment {
  type: 'text' | 'citation';
  content: string;
  citationNumber?: number;
}

export function splitTextWithCitations(text: string): TextSegment[] {
  const matches = parseCitationNumbers(text);

  if (matches.length === 0) {
    return [{ type: 'text', content: text }];
  }

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    // Add text before citation
    if (match.startIndex > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.startIndex),
      });
    }

    // Add citation marker
    segments.push({
      type: 'citation',
      content: match.originalText,
      citationNumber: match.number,
    });

    lastIndex = match.endIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

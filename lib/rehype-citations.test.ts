import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeCitations from './rehype-citations';
import type { CitationsManifest } from '@/hooks/use-agent-stream';

function render(markdown: string, manifest?: CitationsManifest | null): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeCitations, { manifest })
    .use(rehypeStringify)
    .processSync(markdown);
  return String(file);
}

const manifest: CitationsManifest = {
  manifest: {
    '1': {
      source_type: 'literature_review',
      source_id: 'lit-1',
      source_name: 'A Paper About Something Important',
      excerpt: 'This is the excerpt for source one.',
    },
    '2': {
      source_type: 'literature_review',
      source_id: 'lit-2',
      source_name: 'Another Paper Entirely',
      source_url: 'https://example.com/paper-2',
    },
    '3': {
      source_type: 'literature_review',
      source_id: 'lit-3',
      source_name: 'A Third Paper',
    },
  },
};

describe('rehypeCitations', () => {
  it('wraps a single [N] marker in one notes9-cite chip', () => {
    const html = render('See the results [1] for details.', manifest);
    const matches = html.match(/class="notes9-cite"/g) ?? [];
    expect(matches.length).toBe(1);
    expect(html).toContain('data-cite-n="1"');
    expect(html).toContain('data-cite-label="1"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
  });

  it('wraps a grouped [2, 3] marker in two separate chips', () => {
    const html = render('As shown previously [2, 3].', manifest);
    const supMatches = html.match(/<sup class="notes9-cite"/g) ?? [];
    // Label 2 has a source_url, so it renders as an <a>, not a <sup>; label 3
    // has no URL, so it renders as a <sup>. One chip each, two total.
    const anchorMatches = html.match(/class="notes9-cite notes9-cite--link"/g) ?? [];
    expect(supMatches.length).toBe(1);
    expect(anchorMatches.length).toBe(1);
    expect(html).toContain('data-cite-n="2"');
    expect(html).toContain('data-cite-n="3"');
  });

  it('renders a URL-backed source as an anchor with target=_blank', () => {
    const html = render('Reported elsewhere [2].', manifest);
    expect(html).toContain('<a class="notes9-cite notes9-cite--link"');
    expect(html).toContain('href="https://example.com/paper-2"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('leaves [N] as plain text when there is no manifest', () => {
    const html = render('Nothing to cite here [1].', null);
    expect(html).not.toContain('notes9-cite');
    expect(html).toContain('[1]');
  });

  it('remaps cross-provider duplicate papers to the canonical (lowest) label', () => {
    const dupManifest: CitationsManifest = {
      manifest: {
        '1': {
          source_type: 'literature_review',
          source_name: 'The Exact Same Paper Title Across Providers',
        },
        '4': {
          source_type: 'literature_review',
          source_name: 'The Exact Same Paper Title Across Providers',
        },
      },
    };
    const html = render('First mention [1] and duplicate mention [4].', dupManifest);
    // Both chips should display/lookup as canonical label "1".
    const occurrences = html.match(/data-cite-n="1"/g) ?? [];
    expect(occurrences.length).toBe(2);
    expect(html).not.toContain('data-cite-n="4"');
  });
});

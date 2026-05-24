'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { markdownToHtml } from '@/lib/markdown-to-html';
import { sanitizeHtml } from '@/lib/sanitize-html';
import type { CitationsManifest } from '@/hooks/use-agent-stream';
import '@/styles/html-content.css';

const PROSE_CSS_VARS = {
  '--tw-prose-body': 'var(--foreground)',
  '--tw-prose-headings': 'var(--foreground)',
  '--tw-prose-links': 'var(--primary)',
  '--tw-prose-bold': 'var(--foreground)',
  '--tw-prose-counters': 'var(--muted-foreground)',
  '--tw-prose-bullets': 'var(--muted-foreground)',
  '--tw-prose-hr': 'var(--border)',
  '--tw-prose-quotes': 'var(--muted-foreground)',
  '--tw-prose-quote-borders': 'var(--border)',
  '--tw-prose-captions': 'var(--muted-foreground)',
  '--tw-prose-code': 'var(--foreground)',
  '--tw-prose-pre-code': 'var(--foreground)',
  '--tw-prose-pre-bg': 'var(--muted)',
  '--tw-prose-th-borders': 'var(--border)',
  '--tw-prose-td-borders': 'var(--border)',
} as React.CSSProperties;

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** @deprecated Citations render via AgentCitationsPanel */
  citations?: Array<{ number: number; data: unknown }>;
  /** @deprecated */
  enableInlineCitations?: boolean;
  /** When true, shows a blinking cursor after the last line via CSS ::after */
  showCursor?: boolean;
  /** Citations manifest from the agent stream. When present, `[N]` markers
   * in the answer are wrapped as clickable superscript chips with source
   * metadata in data-* attributes (`data-cite-n`, `data-cite-token`,
   * `data-cite-name`). When absent, `[N]` renders as plain text. */
  citationsManifest?: CitationsManifest | null;
}

// `[N]` matcher used by the citation chip post-processor. Limited to 1-3 digit
// numerics so it does not eat bracketed text like [optional] or [Note].
const CITATION_BRACKET_RE = /\[(\d{1,3})\]/g;

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Post-process rendered HTML:
 * - Add target="_blank" rel="noopener noreferrer" to all <a> tags
 * - Wrap <table> elements in a scrollable container
 * - Wrap `[N]` markers as `<sup class="notes9-cite" data-cite-...>` chips so
 *   the AgentCitationsPanel can scroll-into-view / highlight on click and
 *   show source metadata on hover.
 */
function postProcessHtml(html: string, manifest?: CitationsManifest | null): string {
  // Links: open in new tab
  let processed = html.replace(
    /<a\s/g,
    '<a target="_blank" rel="noopener noreferrer" '
  );
  // Tables are already wrapped in a scrollable container by
  // ``markdownToHtml`` (``wrapTablesForScroll`` in lib/markdown-to-html.ts).
  // Don't double-wrap here — the previous duplicate replacement injected a
  // second <div> around each table, breaking direct-child CSS selectors
  // and adding spurious DOM nodes.
  // Citations: wrap [N] in a styleable chip. Only match brackets that sit
  // in TEXT nodes — never inside an HTML attribute value or a tag itself.
  // The earlier naive global replace could rewrite a `title="See [1]"` into
  // `title="See <sup ...>[1]</sup>"`, breaking the attribute. Splitting on
  // tag boundaries and only transforming text segments is the safe move.
  const segments = processed.split(/(<[^>]+>)/g);
  for (let i = 0; i < segments.length; i++) {
    // Even indices are text between tags; odd indices are the tags themselves.
    if (i % 2 !== 0) continue;
    segments[i] = segments[i].replace(CITATION_BRACKET_RE, (_full, nStr: string) => {
      const n = nStr;
      const entry = manifest && manifest.manifest ? manifest.manifest[n] : undefined;
      const name = entry?.source_name || '';
      const token = (entry as { token?: string } | undefined)?.token || '';
      const sType = entry?.source_type || '';
      const url = entry?.source_url || '';
      // Show the URL in the tooltip when present so the user can preview
      // where the chip points without opening it. Falls back to the source
      // name / type if there's no URL (workspace records).
      const tip = url || name || sType || '';
      // External URL → render as a real anchor so clicking the chip opens
      // the source in a new tab. No URL → keep the original styleable
      // <sup> chip (workspace records get their click handler from the
      // citations panel below the message).
      if (url && /^https?:\/\//i.test(url)) {
        return (
          `<a class="notes9-cite notes9-cite--link" `
          + `href="${escapeHtmlAttr(url)}" `
          + `target="_blank" rel="noopener noreferrer" `
          + `data-cite-n="${n}" `
          + (token ? `data-cite-token="${escapeHtmlAttr(token)}" ` : '')
          + (sType ? `data-cite-type="${escapeHtmlAttr(sType)}" ` : '')
          + (name ? `data-cite-name="${escapeHtmlAttr(name)}" ` : '')
          + `data-cite-url="${escapeHtmlAttr(url)}" `
          + `title="${escapeHtmlAttr(tip)}"`
          + `>[${n}]</a>`
        );
      }
      return (
        `<sup class="notes9-cite" `
        + `data-cite-n="${n}" `
        + (token ? `data-cite-token="${escapeHtmlAttr(token)}" ` : '')
        + (sType ? `data-cite-type="${escapeHtmlAttr(sType)}" ` : '')
        + (name ? `data-cite-name="${escapeHtmlAttr(name)}" ` : '')
        + (tip ? `title="${escapeHtmlAttr(tip)}"` : '')
        + `>[${n}]</sup>`
      );
    });
  }
  processed = segments.join('');
  return processed;
}

export function MarkdownRenderer({
  content,
  className,
  showCursor = false,
  citationsManifest,
}: MarkdownRendererProps) {
  const html = useMemo(() => {
    const raw = markdownToHtml(content);
    if (!raw) return '';
    // `marked` v15+ ships without a built-in sanitizer, so raw HTML inside the
    // model's markdown response (e.g. <script>, <iframe>, onerror handlers
    // smuggled in via a malicious literature abstract or RAG chunk) would
    // execute verbatim under the user's session. Run DOMPurify before the
    // dangerouslySetInnerHTML sink. sanitizeHtml is a no-op on SSR; the
    // client useMemo re-runs on hydration so the live render is always safe.
    const processed = postProcessHtml(raw, citationsManifest);
    return sanitizeHtml(processed);
  }, [content, citationsManifest]);

  if (!html) return null;

  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none html-content text-sm text-foreground',
        '[&_h1]:!text-lg [&_h1]:!font-semibold [&_h1]:!leading-snug [&_h1]:!mt-0 [&_h1]:!mb-2',
        '[&_h2]:!text-base [&_h2]:!font-semibold [&_h2]:!leading-snug [&_h2]:!mt-4 [&_h2]:!mb-1.5 first:[&_h2]:!mt-0',
        '[&_h3]:!text-sm [&_h3]:!font-semibold [&_h3]:!leading-snug [&_h3]:!mt-3 [&_h3]:!mb-1',
        '[&_h4]:!text-sm [&_h4]:!font-medium [&_h4]:!text-muted-foreground',
        '[&_pre]:overflow-x-auto [&_pre]:max-w-full',
        '[&_a]:break-words [&_a]:overflow-wrap-anywhere',
        showCursor && 'notes9-md--streaming',
        className
      )}
      style={PROSE_CSS_VARS}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

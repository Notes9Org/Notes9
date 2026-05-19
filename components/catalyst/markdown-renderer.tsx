'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { markdownToHtml } from '@/lib/markdown-to-html';
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
}

/**
 * Post-process rendered HTML:
 * - Add target="_blank" rel="noopener noreferrer" to all <a> tags
 * - Wrap <table> elements in a scrollable container
 */
function postProcessHtml(html: string): string {
  // Links: open in new tab
  let processed = html.replace(
    /<a\s/g,
    '<a target="_blank" rel="noopener noreferrer" '
  );
  // Tables: wrap in scrollable div
  processed = processed
    .replace(/<table/g, '<div class="notes9-md-table-scroll overflow-x-auto my-2"><table')
    .replace(/<\/table>/g, '</table></div>');
  return processed;
}

export function MarkdownRenderer({
  content,
  className,
  showCursor = false,
}: MarkdownRendererProps) {
  const html = useMemo(() => {
    const raw = markdownToHtml(content);
    if (!raw) return '';
    return postProcessHtml(raw);
  }, [content]);

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

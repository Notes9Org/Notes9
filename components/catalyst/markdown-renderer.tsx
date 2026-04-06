'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import Link from 'next/link';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';

function mdFlattenText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(mdFlattenText).join('');
  if (React.isValidElement(node)) {
    return mdFlattenText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

type MdastLike = {
  type: string;
  spread?: boolean;
  children?: MdastLike[];
};

/**
 * After remark-gfm, force `spread: false` on every list / listItem so items are not
 * wrapped in `<p>` (avoids loose-list gaps regardless of blank lines in source).
 */
function remarkTightLists() {
  return (tree: MdastLike) => {
    const visit = (node: MdastLike) => {
      if (node.type === 'list' || node.type === 'listItem') {
        node.spread = false;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/**
 * Collapse excessive blank lines from LLM output (3+ newlines → 2) and trim
 * trailing whitespace on each line. Skips fenced ``` blocks so code is unchanged.
 */
export function tightenChatMarkdown(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return '';

  const segments = trimmed.split(/(```[\s\S]*?```)/g);
  return segments
    .map((segment, i) => {
      if (i % 2 === 1) return segment;
      return segment
        .replace(/[ \t]+$/gm, '')
        .replace(/\n[ \t]+\n/g, '\n\n')
        .replace(/\n{3,}/g, '\n\n');
    })
    .join('');
}

/** Distinct reference so `li` can unwrap `p` from GFM loose lists. */
function MarkdownParagraph({ ...props }: React.ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      className={cn(
        'leading-[1.55] text-foreground m-0',
        '[&:has(>strong:only-child)]:mb-0',
        '[&:has(>strong:only-child)]:mt-0',
        'first:[&:has(>strong:only-child)]:mt-0'
      )}
      {...props}
    />
  );
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const md = tightenChatMarkdown(content);

  return (
    <div
      className={cn(
        'notes9-md whitespace-normal prose prose-sm dark:prose-invert max-w-none',
        'text-foreground prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground',
        '[&_.katex]:text-inherit [&_.katex-display]:my-1',
        'prose-p:my-0 leading-[1.55]',
        'prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-hr:my-0',
        '[&_li>p]:!my-0 [&_li>p]:leading-[1.55]',
        '[&_ol>li]:!my-0 [&_ol>li]:!py-0 [&_ul>li]:!my-0 [&_ul>li]:!py-0',
        '[&_ol>li+li]:!mt-0 [&_ul>li+li]:!mt-0',
        '[&_ol>li>p]:!my-0 [&_ul>li>p]:!my-0',
        '[&>p+p]:mt-2 [&_p+p]:mt-2',
        '[&>h1]:mt-4 [&>h1]:mb-1 [&_h1]:mt-4 [&_h1]:mb-1',
        '[&>h2]:mt-3 [&>h2]:mb-0.5 [&_h2]:mt-3 [&_h2]:mb-0.5',
        '[&>h3]:mt-2 [&>h3]:mb-0 [&_h3]:mt-2 [&_h3]:mb-0',
        '[&>h1+p]:mt-1 [&>h2+p]:mt-1 [&>h3+p]:mt-0.5',
        '[&_h1+p]:mt-1 [&_h2+p]:mt-1 [&_h3+p]:mt-0.5',
        '[&>p+h1]:mt-4 [&>p+h2]:mt-3 [&>p+h3]:mt-2',
        '[&_p+h1]:mt-4 [&_p+h2]:mt-3 [&_p+h3]:mt-2',
        '[&>ul+h2]:mt-3 [&>ol+h2]:mt-3 [&_ul+h2]:mt-3 [&_ol+h2]:mt-3',
        '[&>hr]:my-2 [&_hr]:my-2',
        '[&>hr+h1]:mt-2 [&>hr+h2]:mt-2 [&_hr+h1]:mt-2 [&_hr+h2]:mt-2',
        '[&>p+ul]:mt-1 [&>p+ol]:mt-1 [&_p+ul]:mt-1 [&_p+ol]:mt-1',
        '[&>ul+p]:mt-2 [&>ol+p]:mt-2 [&_ul+p]:mt-2 [&_ol+p]:mt-2',
        '[&>blockquote]:my-2 [&_blockquote]:my-2',
        '[&_p:empty]:hidden [&_p:empty]:m-0',
        '[&_p:has(>strong:only-child)+ul]:!mt-0 [&_p:has(>strong:only-child)+ol]:!mt-0',
        '[&>h1+ul]:mt-1 [&>h2+ul]:mt-1 [&>h1+ol]:mt-1 [&>h2+ol]:mt-1',
        '[&_h1+ul]:mt-1 [&_h2+ul]:mt-1 [&_h1+ol]:mt-1 [&_h2+ol]:mt-1',
        '[&>blockquote+p]:mt-2 [&>p+blockquote]:mt-2',
        '[&_blockquote+p]:mt-2 [&_p+blockquote]:mt-2',
        '[&>p+hr]:mt-2 [&>h2+hr]:mt-2 [&_p+hr]:mt-2 [&_h2+hr]:mt-2',
        className
      )}
    >
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkTightLists]}
      rehypePlugins={[rehypeHighlight, rehypeKatex]}
      components={{
        // Custom code block rendering
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match;
          
          return isInline ? (
            <code
              className="bg-muted px-1.5 py-0.5 rounded text-[0.9em] font-mono"
              {...props}
            >
              {children}
            </code>
          ) : (
            <code className={cn(className, 'block')} {...props}>
              {children}
            </code>
          );
        },
        // Custom pre block for code blocks
        pre({ children, ...props }) {
          return (
            <pre
              className="bg-muted/50 border rounded-lg p-3 overflow-x-auto text-sm my-1"
              {...props}
            >
              {children}
            </pre>
          );
        },
        // Custom link styling - use Next.js Link for internal routes
        a({ href, children, ...props }) {
          const url = href ?? '#';
          const isInternal = url.startsWith('/');
          const isLiteratureRecord =
            isInternal && url.startsWith('/literature-reviews/');
          const linkText = mdFlattenText(children).trim();
          const isLiteratureIdChip =
            isLiteratureRecord &&
            linkText.length > 0 &&
            linkText.length <= 48 &&
            !/\s/.test(linkText);

          if (isInternal) {
            return (
              <Link
                href={url}
                className={cn(
                  'transition-colors',
                  isLiteratureIdChip &&
                    'no-underline inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground hover:bg-muted/80 ring-1 ring-border/60',
                  isLiteratureRecord &&
                    !isLiteratureIdChip &&
                    'no-underline font-medium text-foreground hover:text-primary',
                  !isLiteratureRecord &&
                    'text-primary underline underline-offset-2 hover:text-primary/80'
                )}
                {...props}
              >
                {children}
              </Link>
            );
          }
          
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              {...props}
            >
              {children}
            </a>
          );
        },
        // Explicit list resets (avoid not-prose — it breaks wrapper [&>p+ul] sibling rules).
        ul({ children, ...props }) {
          return (
            <ul
              className={cn(
                'list-disc list-inside space-y-0 my-0 max-w-none pl-0 text-foreground marker:text-muted-foreground',
                '[&>li]:!my-0 [&>li]:!py-0 [&>li+li]:!mt-0',
                '[&>li>p]:!m-0 [&>li>p]:inline [&>li>p]:leading-[1.55]'
              )}
              {...props}
            >
              {children}
            </ul>
          );
        },
        ol({ children, ...props }) {
          return (
            <ol
              className={cn(
                'list-decimal list-outside space-y-0 my-0 max-w-none pl-5 text-foreground marker:text-muted-foreground',
                '[&>li]:!my-0 [&>li]:!py-0 [&>li+li]:!mt-0',
                '[&>li>p]:!m-0 [&>li>p]:inline [&>li>p]:leading-[1.55]'
              )}
              {...props}
            >
              {children}
            </ol>
          );
        },
        li({ children, ...props }) {
          const kids = React.Children.toArray(children);
          const liShell = cn(
            '!my-0 !py-0 leading-[1.55] text-left',
            '[&>ul]:mt-1 [&>ul]:mb-0 [&>ul]:ml-3',
            '[&>ol]:mt-1 [&>ol]:mb-0 [&>ol]:ml-3'
          );

          if (kids.length === 1 && React.isValidElement(kids[0]) && kids[0].type === MarkdownParagraph) {
            const inner = (kids[0] as React.ReactElement<{ children?: React.ReactNode }>).props
              .children;
            return (
              <li className={liShell} {...props}>
                {inner}
              </li>
            );
          }
          if (
            kids.length > 1 &&
            React.isValidElement(kids[0]) &&
            kids[0].type === MarkdownParagraph
          ) {
            const inner = (kids[0] as React.ReactElement<{ children?: React.ReactNode }>).props
              .children;
            const tail = kids.slice(1);
            return (
              <li className={liShell} {...props}>
                {inner}
                <div className="mt-1 space-y-1 [&_p]:!my-0 [&_ul]:mt-1 [&_ol]:mt-1">{tail}</div>
              </li>
            );
          }

          return (
            <li className={cn(liShell, '[&>p]:!my-0')} {...props}>
              {children}
            </li>
          );
        },
        p: MarkdownParagraph,
        hr({ ...props }) {
          return <hr className="my-2 shrink-0 border-0 border-t border-border/50" {...props} />;
        },
        h1({ children, ...props }) {
          return (
            <h1
              className="text-xl font-bold mt-4 mb-1 border-b border-border/40 pb-1 first:mt-0"
              {...props}
            >
              {children}
            </h1>
          );
        },
        h2({ children, ...props }) {
          return (
            <h2 className="text-base font-semibold mt-3 mb-0.5 first:mt-0" {...props}>
              {children}
            </h2>
          );
        },
        h3({ children, ...props }) {
          return (
            <h3 className="text-sm font-semibold mt-2 mb-0 first:mt-0" {...props}>
              {children}
            </h3>
          );
        },
        // Custom blockquote
        blockquote({ children, ...props }) {
          return (
            <blockquote
              className="border-l-4 border-primary/30 pl-3 py-1 italic text-muted-foreground my-2"
              {...props}
            >
              {children}
            </blockquote>
          );
        },
        // Custom table
        table({ children, ...props }) {
          return (
            <div className="overflow-x-auto my-0">
              <table className="min-w-full border-collapse border border-border" {...props}>
                {children}
              </table>
            </div>
          );
        },
        th({ children, ...props }) {
          return (
            <th className="border border-border bg-muted px-2 py-1.5 text-left font-semibold text-sm" {...props}>
              {children}
            </th>
          );
        },
        td({ children, ...props }) {
          return (
            <td className="border border-border px-2 py-1.5 text-sm" {...props}>
              {children}
            </td>
          );
        },
      }}
    >
      {md}
    </ReactMarkdown>
    </div>
  );
}

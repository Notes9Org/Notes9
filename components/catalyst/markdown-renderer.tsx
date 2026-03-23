'use client';

import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import Link from 'next/link';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        'notes9-md prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground [&_.katex]:text-inherit [&_.katex-display]:my-2',
        // Disable typography defaults that stack with our component margins
        'prose-p:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-hr:my-0 leading-[1.45]',
        '[&_li>p]:!my-0 [&_li>p]:leading-[1.45]',
        '[&_p:has(>strong:only-child)+ul]:!mt-0 [&_p:has(>strong:only-child)+ol]:!mt-0',
        className
      )}
    >
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
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
              className="bg-muted/50 border rounded-lg p-4 overflow-x-auto text-sm"
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
          
          if (isInternal) {
            return (
              <Link
                href={url}
                className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
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
        // Custom list styling — no space-y (GFM <li><p> already got margin until we zero it above)
        ul({ children, ...props }) {
          return (
            <ul
              className="list-disc list-outside space-y-0 !my-0 mb-0 mt-0 pl-4 marker:text-muted-foreground [&:not(:first-child)]:mt-1"
              {...props}
            >
              {children}
            </ul>
          );
        },
        ol({ children, ...props }) {
          return (
            <ol
              className="list-decimal list-outside space-y-0 !my-0 mb-0 mt-0 pl-4 marker:text-muted-foreground [&:not(:first-child)]:mt-1"
              {...props}
            >
              {children}
            </ol>
          );
        },
        li({ children, ...props }) {
          return (
            <li className="!my-0 py-0 leading-[1.45] [&>p]:!my-0" {...props}>
              {children}
            </li>
          );
        },
        // Paragraphs: tight stack; **Section** lines (single <strong>) hug the list below
        p({ children, ...props }) {
          return (
            <p
              className={cn(
                'leading-[1.45] text-foreground',
                'mt-0 mb-1 last:mb-0',
                '[&:has(>strong:only-child)]:mb-0',
                '[&:has(>strong:only-child)]:mt-1',
                'first:[&:has(>strong:only-child)]:mt-0'
              )}
              {...props}
            >
              {children}
            </p>
          );
        },
        hr({ ...props }) {
          return <hr className="my-2 border-border" {...props} />;
        },
        // Custom headings (tighter spacing)
        h1({ children, ...props }) {
          return (
            <h1 className="text-xl font-bold mt-2.5 mb-1" {...props}>
              {children}
            </h1>
          );
        },
        h2({ children, ...props }) {
          return (
            <h2 className="text-lg font-semibold mt-2 mb-0.5" {...props}>
              {children}
            </h2>
          );
        },
        h3({ children, ...props }) {
          return (
            <h3 className="text-base font-semibold mt-1.5 mb-0.5 first:mt-0" {...props}>
              {children}
            </h3>
          );
        },
        // Custom blockquote
        blockquote({ children, ...props }) {
          return (
            <blockquote
              className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-1"
              {...props}
            >
              {children}
            </blockquote>
          );
        },
        // Custom table
        table({ children, ...props }) {
          return (
            <div className="overflow-x-auto my-1">
              <table className="min-w-full border-collapse border border-border" {...props}>
                {children}
              </table>
            </div>
          );
        },
        th({ children, ...props }) {
          return (
            <th className="border border-border bg-muted px-3 py-2 text-left font-semibold" {...props}>
              {children}
            </th>
          );
        },
        td({ children, ...props }) {
          return (
            <td className="border border-border px-3 py-2" {...props}>
              {children}
            </td>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}

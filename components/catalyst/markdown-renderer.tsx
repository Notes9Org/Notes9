'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import 'highlight.js/styles/github-dark.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // Custom code block rendering
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match;
          
          return isInline ? (
            <code
              className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
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
          const isInternal = href?.startsWith('/');
          
          if (isInternal) {
            return (
              <Link
                href={href}
                className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                {...props}
              >
                {children}
              </Link>
            );
          }
          
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              {...props}
            >
              {children}
            </a>
          );
        },
        // Custom list styling
        ul({ children, ...props }) {
          return (
            <ul className="list-disc list-inside space-y-1 my-2" {...props}>
              {children}
            </ul>
          );
        },
        ol({ children, ...props }) {
          return (
            <ol className="list-decimal list-inside space-y-1 my-2" {...props}>
              {children}
            </ol>
          );
        },
        // Custom paragraph
        p({ children, ...props }) {
          return (
            <p className="my-2 leading-relaxed" {...props}>
              {children}
            </p>
          );
        },
        // Custom headings
        h1({ children, ...props }) {
          return (
            <h1 className="text-xl font-bold mt-4 mb-2" {...props}>
              {children}
            </h1>
          );
        },
        h2({ children, ...props }) {
          return (
            <h2 className="text-lg font-semibold mt-3 mb-2" {...props}>
              {children}
            </h2>
          );
        },
        h3({ children, ...props }) {
          return (
            <h3 className="text-base font-semibold mt-2 mb-1" {...props}>
              {children}
            </h3>
          );
        },
        // Custom blockquote
        blockquote({ children, ...props }) {
          return (
            <blockquote
              className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-2"
              {...props}
            >
              {children}
            </blockquote>
          );
        },
        // Custom table
        table({ children, ...props }) {
          return (
            <div className="overflow-x-auto my-2">
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


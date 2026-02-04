"use client"

import { cn } from '@/lib/utils'
import '@/styles/html-content.css'

interface HtmlContentProps {
  content: string | null
  className?: string
  fallback?: string
  style?: React.CSSProperties
}

export function HtmlContent({ content, className, fallback = "No description" }: HtmlContentProps) {
  if (!content || content.trim() === '' || content === '<p></p>') {
    return <span className={cn("text-muted-foreground", className)}>{fallback}</span>
  }

  return (
    <div
      className={cn("prose prose-sm max-w-none html-content", className)}
      dangerouslySetInnerHTML={{ __html: content }}
      style={{
        // Override prose styles to match your app's design
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
      } as React.CSSProperties}
    />
  )
}

// For truncated display in lists
export function HtmlContentTruncated({ content, className, fallback = "No description", style }: HtmlContentProps) {
  if (!content || content.trim() === '' || content === '<p></p>') {
    return <span className={cn("text-muted-foreground", className)} style={style}>{fallback}</span>
  }

  // Strip HTML tags for truncated display
  const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  return (
    <span className={className} style={style}>
      {textContent}
    </span>
  )
}
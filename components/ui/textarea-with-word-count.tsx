"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"

const DEFAULT_MAX_WORDS = 1000

function countWords(text: string): number {
  if (!text || !text.trim()) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Strip HTML tags and count words (for rich text / HTML content). */
function countWordsFromHtml(html: string): number {
  if (!html || !html.trim()) return 0
  const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  return plain ? plain.split(/\s+/).filter(Boolean).length : 0
}

function truncateToMaxWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return text
  return words.slice(0, maxWords).join(" ")
}

export interface TextareaWithWordCountProps
  extends Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange"> {
  value: string
  onChange: (value: string) => void
  maxWords?: number
}

const TextareaWithWordCount = React.forwardRef<
  HTMLTextAreaElement,
  TextareaWithWordCountProps
>(function TextareaWithWordCount(
  { value, onChange, maxWords = DEFAULT_MAX_WORDS, className, ...props },
  ref
) {
  const wordCount = countWords(value)
  const atLimit = wordCount >= maxWords

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    const nextCount = countWords(next)
    if (nextCount > maxWords) {
      onChange(truncateToMaxWords(next, maxWords))
    } else {
      onChange(next)
    }
  }

  return (
    <div className="space-y-1.5">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        className={className}
        aria-invalid={atLimit}
        {...props}
      />
      <p
        className={cn(
          "text-right text-xs tabular-nums",
          atLimit
            ? "text-destructive"
            : "text-muted-foreground"
        )}
        aria-live="polite"
      >
        {wordCount} / {maxWords} words
      </p>
    </div>
  )
})

export { TextareaWithWordCount, countWords, countWordsFromHtml, truncateToMaxWords }

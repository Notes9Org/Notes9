'use client'

import { Fragment } from 'react'

import { cn } from '@/lib/utils'

/**
 * A single keycap. Sized off the `--text-2xs` theme token rather than an
 * arbitrary pixel value, and given a min-width so a one-character cap ('K')
 * stays the same shape as a wider one ('Ctrl').
 */
function Kbd({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex min-w-6 items-center justify-center rounded-md border border-border/70 bg-muted/70 px-1.5 py-0.5 font-mono text-2xs font-medium leading-none text-muted-foreground shadow-sm',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/**
 * A run of keycaps. `joiner` renders between caps — the shortcuts cheat sheet
 * passes "then" so a leader sequence reads "G then D" instead of looking like a
 * chord you hold down.
 */
function KbdRow({
  tokens,
  className,
  joiner,
}: {
  tokens: string[]
  className?: string
  joiner?: string
}) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {tokens.map((token, i) => (
        <Fragment key={`${token}-${i}`}>
          {joiner && i > 0 && (
            <span className="text-2xs text-muted-foreground/80">{joiner}</span>
          )}
          <Kbd>{token}</Kbd>
        </Fragment>
      ))}
    </span>
  )
}

export { Kbd, KbdRow }

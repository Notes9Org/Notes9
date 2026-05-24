import * as React from 'react'

import { cn } from '@/lib/utils'

function PageHeading({
  className,
  as: Comp = 'h1',
  ...props
}: React.ComponentProps<'h1'> & { as?: 'h1' | 'h2' }) {
  return (
    <Comp
      data-slot="page-heading"
      className={cn(
        'font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl',
        className,
      )}
      {...props}
    />
  )
}

function PageSubheading({
  className,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="page-subheading"
      className={cn('text-sm text-muted-foreground md:text-base', className)}
      {...props}
    />
  )
}

export { PageHeading, PageSubheading }

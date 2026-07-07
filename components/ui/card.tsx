import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const cardVariants = cva(
  'bg-card text-card-foreground flex flex-col gap-6 rounded-xl py-6',
  {
    variants: {
      variant: {
        default: 'border shadow-sm',
        outline: 'border',
        filled: 'bg-muted/50 border-transparent',
        ghost: 'border-transparent',
        // Clickable cards: token-driven hover lift + elevation, reduced-motion-safe.
        interactive:
          'border shadow-sm cursor-pointer transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-md hover:border-border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Card({
  className,
  variant,
  ribbon,
  style,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof cardVariants> & {
    /** Signature kind-ribbon: a CSS color for a 3px left accent bar (entity identity). */
    ribbon?: string
  }) {
  return (
    <div
      data-slot="card"
      className={cn(
        cardVariants({ variant }),
        ribbon &&
          'relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--card-ribbon)] before:content-[""]',
        className,
      )}
      style={ribbon ? { ...style, ['--card-ribbon' as string]: ribbon } : style}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
}

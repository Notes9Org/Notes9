import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-pulse rounded-md bg-muted/75 ring-1 ring-border/35 dark:bg-muted/45 dark:ring-border/25',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }

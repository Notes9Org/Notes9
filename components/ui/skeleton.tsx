import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const skeletonVariants = cva('bg-accent animate-pulse', {
  variants: {
    variant: {
      default: 'rounded-md',
      text: 'h-4 rounded',
      title: 'h-6 w-1/2 rounded',
      avatar: 'rounded-full',
      thumbnail: 'aspect-square rounded-md',
      card: 'rounded-xl',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

function Skeleton({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof skeletonVariants>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(skeletonVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Skeleton, skeletonVariants }

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // `n9-press` supplies the unified token-driven transition (color/bg/border/shadow +
  // an active scale press) and is reduced-motion-safe; it replaces the old transition-colors.
  // Icons scale up on hover and press in on click so every button reads as interactive
  // (reduced-motion users get the color changes without the movement).
  "group/btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium n9-press disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-150 [&_svg]:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:hover:[&_svg]:scale-110 motion-safe:active:[&_svg]:scale-90 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "n9-sheen bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:shadow-md focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-ring/40 dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "n9-sheen bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 hover:shadow-sm",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        "destructive-ghost":
          "text-destructive hover:bg-destructive/10 hover:text-destructive [&_svg]:text-current",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

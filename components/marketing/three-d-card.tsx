import * as React from "react"

import { cn } from "@/lib/utils"

interface ProductFrameProps {
  children: React.ReactNode
  className?: string
}

export function ProductFrame({ children, className }: ProductFrameProps) {
  return (
    <div
      className={cn(
        "marketing-glass-surface group relative overflow-hidden rounded-2xl border border-border bg-background/78 shadow-[0_32px_80px_-30px_rgba(44,36,24,0.18)] transition-transform duration-500 [transform:perspective(1200px)_rotateX(2deg)_rotateY(-1deg)] hover:[transform:perspective(1200px)_rotateX(0deg)_rotateY(0deg)] dark:shadow-[0_32px_80px_-30px_rgba(0,0,0,0.5)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/10" />
      <div className="relative">{children}</div>
    </div>
  )
}

export function MinimalCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "marketing-glass-surface rounded-2xl border border-border/50 bg-card/70 p-6 dark:bg-card/55",
        className,
      )}
    >
      {children}
    </div>
  )
}

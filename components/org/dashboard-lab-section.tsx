import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type DashboardLabSectionProps = {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  className?: string
}

/** Bottom-of-dashboard frame so My Lab stays visible without crowding the main grid. */
export function DashboardLabSection({
  eyebrow,
  title,
  description,
  children,
  className,
}: DashboardLabSectionProps) {
  return (
    <section
      id="my-lab"
      data-tour="dash-my-lab"
      aria-labelledby="my-lab-heading"
      className={cn(
        "scroll-mt-20 rounded-xl border border-primary/20 bg-[color-mix(in_oklab,var(--primary)_8%,var(--card)_92%)] p-5 shadow-sm md:p-6",
        className,
      )}
    >
      <div className="mb-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {eyebrow}
        </p>
        <h2
          id="my-lab-heading"
          className="text-lg font-semibold tracking-tight md:text-xl"
        >
          {title}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

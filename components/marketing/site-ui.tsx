"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MinimalCard } from "@/components/marketing/three-d-card"

type ButtonVariant = React.ComponentProps<typeof Button>["variant"]

interface ActionLink {
  href: string
  label: string
  variant?: ButtonVariant
}

export function MarketingPageFrame({ children }: { children: React.ReactNode }) {
  return <div className="relative overflow-hidden bg-background">{children}</div>
}

export function PageHero({
  badge,
  title,
  description,
  actions = [],
  aside,
}: {
  badge: string
  title: React.ReactNode
  description: string
  actions?: ActionLink[]
  aside?: React.ReactNode
}) {
  return (
    <section className="container mx-auto px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
      <div className={cn("grid gap-12", aside && "lg:grid-cols-[1fr_1fr] lg:items-start")}>
        <div className="max-w-2xl">
          <Badge
            variant="outline"
            className="mb-6 rounded-full border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-4 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[var(--n9-accent)]"
          >
            {badge}
          </Badge>
          <h1 className="font-serif text-4xl tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
            {title}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            {description}
          </p>
          {actions.length > 0 ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {actions.map((action, index) => (
                <Button
                  key={action.label}
                  asChild
                  size="lg"
                  variant={action.variant ?? (index === 0 ? "default" : "outline")}
                  className={cn(
                    "h-11 rounded-full px-6",
                    index === 0 && "bg-[var(--n9-accent)] text-white shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]",
                  )}
                >
                  <Link href={action.href}>
                    {action.label}
                    {index === 0 ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        {aside ? <div className="flex h-full items-start">{aside}</div> : null}
      </div>
    </section>
  )
}

export function SectionHeader({
  badge,
  title,
  description,
  align = "left",
  className,
}: {
  badge?: string
  title: string
  description?: string
  align?: "left" | "center"
  className?: string
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {badge ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--n9-accent)]">
          {badge}
        </p>
      ) : null}
      <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
      ) : null}
    </div>
  )
}

export function StatCard({
  value,
  label,
  source,
}: {
  value: string
  label: string
  source?: string
}) {
  return (
    <MinimalCard>
      <div className="text-3xl font-bold tracking-tight text-foreground">{value}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{label}</p>
      {source ? (
        <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">{source}</p>
      ) : null}
    </MinimalCard>
  )
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <MinimalCard className="h-full">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </MinimalCard>
  )
}

export function WorkflowStep({
  step,
  title,
  description,
}: {
  step: string
  title: string
  description: string
}) {
  return (
    <MinimalCard className="h-full">
      <div className="mb-3 inline-flex rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">
        {step}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </MinimalCard>
  )
}

export function ComparisonRow({
  label,
  legacy,
  notes9,
}: {
  label: string
  legacy: string
  notes9: string
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-border/40 bg-muted/30 p-4 sm:grid-cols-[0.7fr_1fr_1fr]">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="text-sm leading-6 text-muted-foreground">{legacy}</p>
      <p className="text-sm leading-6 text-foreground">{notes9}</p>
    </div>
  )
}

export function LinkCard({
  eyebrow,
  title,
  description,
  href,
  hrefLabel,
}: {
  eyebrow: string
  title: string
  description: string
  href: string
  hrefLabel: string
}) {
  return (
    <MinimalCard className="flex h-full flex-col">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
      <Link
        href={href}
        className="mt-5 inline-flex items-center text-sm font-medium text-[var(--n9-accent)] transition-colors hover:text-[var(--n9-accent-hover)]"
      >
        {hrefLabel}
        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
      </Link>
    </MinimalCard>
  )
}

export function CTAPanel({
  title,
  description,
  primary,
  secondary,
}: {
  title: string
  description: string
  primary: ActionLink
  secondary?: ActionLink
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-[var(--n9-accent-light)] p-8 text-center dark:bg-muted/20 lg:p-12">
      <h2 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          asChild
          size="lg"
          className="h-11 rounded-full bg-[var(--n9-accent)] px-6 text-white shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]"
        >
          <Link href={primary.href}>
            {primary.label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        {secondary ? (
          <Button asChild size="lg" variant="outline" className="h-11 rounded-full px-6">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

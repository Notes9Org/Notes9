"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, LucideIcon } from "lucide-react"

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
  return (
    <div className="marketing-glass-page relative min-h-0 w-full min-w-0 max-w-full">{children}</div>
  )
}

export function PageHero({
  badge,
  title,
  description,
  actions = [],
  aside,
  splitClassName,
  contentClassName,
  descriptionClassName,
  sectionClassName,
  layout = "default",
  /**
   * When `layout` is `centered`, scales the hero column width relative to `max-w-4xl` (56rem).
   * Example: `2.4` → cap at `min(100%, 56rem × 2.4)`. Uses inline max-width so values need not be Tailwind-prefixed.
   */
  centeredContentScale,
  /** Extra classes on the `<h1>` (e.g. `whitespace-nowrap` for a single-line headline). */
  titleClassName,
  heroFillViewport = false,
}: {
  badge: string
  title: React.ReactNode
  description: string
  actions?: ActionLink[]
  aside?: React.ReactNode
  /** When `aside` is set, overrides the default two-column hero grid (e.g. wider visual column). */
  splitClassName?: string
  /** Left-column wrapper classes (defaults keep copy readable on marketing pages). */
  contentClassName?: string
  /** Description paragraph classes (default caps line length). */
  descriptionClassName?: string
  /** Merged onto the hero `<section>` (e.g. tighter vertical padding). */
  sectionClassName?: string
  /**
   * `centered`: single column, text centered, fills viewport below the fixed header (`pt-16` on `main`).
   * Ignored when `aside` is set (split layout wins).
   */
  layout?: "default" | "centered"
  centeredContentScale?: number
  titleClassName?: string
  /** Centered only: lock hero height to one viewport below the header. */
  heroFillViewport?: boolean
}) {
  const effectiveLayout = layout === "centered" && !aside ? "centered" : "default"
  const centeredScale =
    effectiveLayout === "centered" && centeredContentScale != null && centeredContentScale > 1
      ? centeredContentScale
      : 1

  const body = (
    <div
      className={cn(
        "space-y-7",
        effectiveLayout === "centered" && "text-center",
        aside && "text-center lg:text-left",
      )}
    >
      <div
        className={cn(
          "flex",
          effectiveLayout === "centered" && "justify-center",
          aside && "justify-center lg:justify-start",
          !aside && effectiveLayout !== "centered" && "justify-start",
        )}
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--n9-accent)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--n9-accent)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--n9-accent)]" />
          </span>
          {badge}
        </span>
      </div>

      <h1
        className={cn(
          "academic-hero-serif-headline text-4xl font-normal tracking-tight text-foreground sm:text-5xl lg:text-[3.35rem] lg:leading-[1.07] xl:text-[3.45rem]",
          effectiveLayout === "centered" && !titleClassName && "text-balance",
          titleClassName,
        )}
      >
        {title}
      </h1>

      <p
        className={cn(
          "text-pretty leading-relaxed text-muted-foreground",
          effectiveLayout === "centered" &&
            cn(
              "mx-auto max-w-[min(100%,calc(42rem*1.6))] text-center text-xl sm:text-2xl sm:leading-relaxed",
              descriptionClassName,
            ),
          effectiveLayout !== "centered" &&
            cn(
              "text-[1.6875rem] sm:text-[1.875rem] sm:leading-relaxed",
              descriptionClassName ?? "max-w-xl",
            ),
        )}
      >
        {description}
      </p>

      {actions.length > 0 ? (
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-4 sm:flex-row",
            effectiveLayout === "centered" && "sm:flex-row",
            aside && "lg:justify-start",
            !aside && effectiveLayout !== "centered" && "justify-start sm:justify-start",
          )}
        >
          {actions.map((action, index) => (
            <Button
              key={action.label}
              asChild
              size="lg"
              variant={action.variant ?? (index === 0 ? "default" : "outline")}
              className={cn(
                "group h-12 rounded-full px-8",
                index === 0 &&
                  "bg-[var(--n9-accent)] text-primary-foreground shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] transition-all duration-300 hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_20px_50px_-12px_var(--n9-accent-glow)]",
                index > 0 &&
                  (action.variant === "outline" || action.variant === undefined) &&
                  "border-border/60 transition-colors duration-200 hover:border-[var(--n9-accent)]/40",
              )}
            >
              <Link href={action.href}>
                {action.label}
                {index === 0 ? (
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                ) : null}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )

  if (effectiveLayout === "centered") {
    const wideCentered = centeredScale > 1
    return (
      <section
        style={
          wideCentered
            ? { maxWidth: `min(100%, calc(56rem * ${centeredScale}))` }
            : undefined
        }
        className={cn(
          /* pt-16 clears fixed header; lives on section so section bg (e.g. accent) fills the band — not transparent main padding */
          wideCentered
            ? cn(
                "relative z-10 mx-auto flex w-full flex-col justify-center px-4 pb-10 pt-16 sm:px-6 lg:px-8",
                heroFillViewport
                  ? "h-[calc(100dvh-4rem)] shrink-0 overflow-y-auto"
                  : "min-h-[calc(100dvh-4rem)]",
              )
            : cn(
                "container relative z-10 mx-auto flex flex-col justify-center px-4 pb-10 pt-16 sm:px-6 lg:px-8",
                heroFillViewport
                  ? "h-[calc(100dvh-4rem)] shrink-0 overflow-y-auto"
                  : "min-h-[calc(100dvh-4rem)]",
              ),
          sectionClassName,
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full flex-col items-center text-center",
            !wideCentered && "max-w-4xl",
            contentClassName,
          )}
        >
          {body}
        </div>
      </section>
    )
  }

  return (
    <section
      className={cn(
        "container mx-auto px-4 pb-12 pt-16 sm:px-6 sm:pb-16 lg:px-8 lg:pb-20",
        sectionClassName,
      )}
    >
      <div
        className={cn(
          "grid gap-10 lg:gap-12",
          aside && (splitClassName ?? "lg:grid-cols-[1fr_1fr] lg:items-start"),
        )}
      >
        <div
          className={cn(
            "w-full max-w-4xl",
            aside && "text-center lg:mx-0 lg:max-w-none lg:text-left",
            contentClassName,
          )}
        >
          {body}
        </div>
        {aside ? (
          <div className="flex h-full min-w-0 w-full items-center justify-stretch">{aside}</div>
        ) : null}
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
    <div className="marketing-glass-surface grid gap-3 rounded-xl border border-border/40 bg-muted/28 p-4 sm:grid-cols-[0.7fr_1fr_1fr]">
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
    <div className="marketing-section-accent rounded-2xl border border-border/40 p-8 text-center lg:p-12">
      <h2 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          asChild
          size="lg"
          className="h-11 rounded-full bg-[var(--n9-accent)] px-6 text-primary-foreground shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]"
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

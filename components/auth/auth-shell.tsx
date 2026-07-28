import type { ReactNode } from "react"
import Link from "next/link"
import { Notes9Brand } from "@/components/brand/notes9-brand"

/**
 * Modern shell for the sign-in / sign-up pages: a warm aurora + masked dot-grid
 * background with a floating glass card. Keeps the auth forms unchanged — only
 * the surrounding chrome is restyled.
 */
export function AuthShell({
  children,
  title,
  subtitle,
  aside,
}: {
  children: ReactNode
  title: string
  subtitle: string
  /** Optional small line under the card (e.g. a "back to home" or terms link). */
  aside?: ReactNode
}) {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background p-5 sm:p-6">
      {/* Aurora + depth background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[520px] w-[680px] -translate-x-1/2 rounded-full bg-[var(--n9-accent)]/[0.13] blur-[120px]" />
        <div className="absolute bottom-[-14%] right-[-8%] h-[440px] w-[540px] rounded-full bg-amber-500/[0.07] blur-[120px]" />
        <div className="absolute bottom-[6%] left-[-8%] h-[360px] w-[440px] rounded-full bg-[var(--n9-accent)]/[0.08] blur-[110px]" />
        <div className="absolute inset-0 [background-image:radial-gradient(rgba(150,80,52,0.10)_0.6px,transparent_0.7px)] [background-size:34px_34px] [mask-image:radial-gradient(58%_50%_at_50%_38%,#000,transparent_76%)]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Link
          href="/"
          className="mb-6 flex flex-col items-center gap-2 text-center transition-opacity hover:opacity-90"
        >
          <Notes9Brand stacked iconClassName="h-[54px] w-[54px]" textClassName="h-9 w-auto" />
        </Link>

        <div className="mb-5 text-center">
          <h1 className="font-serif text-[26px] font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="rounded-[26px] border border-border/60 bg-card/80 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.5)_inset,0_30px_80px_-42px_rgba(44,36,24,0.45)] backdrop-blur-xl sm:p-8">
          {children}
        </div>

        {aside && <div className="mt-5 text-center text-xs text-muted-foreground/80">{aside}</div>}
      </div>
    </div>
  )
}

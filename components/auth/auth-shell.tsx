import type { ReactNode } from "react"
import Link from "next/link"
import { Notes9Brand } from "@/components/brand/notes9-brand"

/**
 * Shell for every auth page (sign in, sign up, invite, reset, error).
 *
 * Two columns on large screens: the form on the left, and on the right a panel
 * that argues for finishing the form. Most auth screens put a testimonial or a
 * stock illustration there; this one says what actually happens on the other
 * side of the button, because that is the question someone hesitating over a
 * signup form is asking.
 *
 * Below `lg` it collapses to the single centred column it was before, the
 * right panel is supporting material, never a reason to scroll on a phone.
 *
 * The API is unchanged (`children`, `title`, `subtitle`, `aside`) so all seven
 * auth pages pick this up without edits.
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
    <div className="relative min-h-svh w-full bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ── Form column ───────────────────────────────────────────────── */}
      <div className="flex min-h-svh flex-col justify-center px-5 py-12 sm:px-10 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-[26rem]">
          <Link
            href="/"
            className="mb-10 inline-flex transition-opacity hover:opacity-90"
            aria-label="Notes9 home"
          >
            <Notes9Brand textClassName="h-8 w-auto" />
          </Link>

          <h1 className="font-serif text-[32px] leading-[1.15] tracking-[-0.02em] text-foreground">
            {title}
          </h1>
          <p className="mt-2.5 text-[15px] leading-6 text-muted-foreground">{subtitle}</p>

          <div className="mt-9">{children}</div>

          {aside && <div className="mt-6 text-xs text-muted-foreground/80">{aside}</div>}
        </div>
      </div>

      {/* ── Showcase panel ────────────────────────────────────────────── */}
      <aside className="hidden p-3 lg:block">
        <ShowcasePanel />
      </aside>
    </div>
  )
}

/**
 * The right half, as its own inset surface rather than copy floating in the page
 * background, which is what made the earlier version read as unfinished. Every
 * modern auth screen worth copying (Fabric, Lindy, Typeform, Runway) gives this
 * half a contained surface with real visual weight and a product artefact in it.
 *
 * Content is the honest version of "why finish this form": what happens next,
 * plus the screen you end up in.
 */
function ShowcasePanel() {
  return (
    <div className="relative flex h-full min-h-[calc(100svh-1.5rem)] flex-col justify-between overflow-hidden rounded-[28px] border border-border/50 p-12 xl:p-14">
      <PanelField />

      <div className="relative">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="size-1.5 rounded-[1px] bg-primary" />
          What happens next
        </p>

        <h2 className="mt-6 max-w-md font-serif text-[clamp(1.8rem,2.4vw,2.5rem)] leading-[1.12] tracking-[-0.02em] text-foreground">
          Set up around your research, not a blank page.
        </h2>

        <ol className="mt-9 space-y-5">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="mt-[3px] font-mono text-[11px] tabular-nums text-primary">
                {s.n}
              </span>
              <p className="max-w-sm text-[14px] leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">{s.title}.</span> {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {/* The product artefact. Bleeds off the right edge and sits on a slight
          tilt so it reads as a window into the app rather than a pasted image. */}
      <div className="relative mt-10 -mr-24 xl:-mr-16">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-[0_40px_110px_-40px_rgba(44,36,24,0.5)] [transform:perspective(1400px)_rotateY(-9deg)_rotateX(2deg)]">
          <div className="flex items-center gap-1.5 border-b border-border/50 bg-muted/40 px-3.5 py-2">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <img
            src="/demo/light/data-analysis.png"
            alt="The Notes9 data workspace: a spreadsheet of readings beside a fitted standard curve"
            loading="lazy"
            decoding="async"
            className="block w-full dark:hidden"
          />
          <img
            src="/demo/dark/data-analysis.png"
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="hidden w-full dark:block"
          />
        </div>
      </div>

      <p className="relative mt-8 text-[13px] text-muted-foreground">
        Free to start, with AI credits included. No card required.
      </p>
    </div>
  )
}

/** Panel-scoped colour field: the marketing hero recipe, contained. */
function PanelField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))]" />
      <div className="absolute inset-0 [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px)] [background-size:52px_52px]" />
      <div className="absolute -inset-[20%] opacity-90 blur-[70px] saturate-[1.15]">
        <div className="absolute inset-0 [background:radial-gradient(56%_38%_at_46%_-4%,color-mix(in_oklab,#f6e4cf_60%,transparent),transparent_72%),radial-gradient(40%_50%_at_14%_26%,color-mix(in_oklab,var(--primary)_38%,transparent),transparent_68%),radial-gradient(38%_46%_at_86%_66%,color-mix(in_oklab,#7f8f74_34%,transparent),transparent_70%)]" />
      </div>
      <div className="absolute inset-0 bg-[image:var(--glass-grain-img)] bg-repeat opacity-[0.16] mix-blend-soft-light" />
    </div>
  )
}


/**
 * What happens after signup, in the order it happens. Concrete and checkable,
 * no invented customer quotes, no logo wall we have not earned.
 */
const STEPS = [
  {
    n: "01",
    title: "Answer three questions",
    body: "Your role, your field, what you want to do first. Under a minute, and every question is skippable.",
  },
  {
    n: "02",
    title: "Get a workspace built around your field",
    body: "A sample project matched to your research, protocols, lab notes and real reference papers you can pull apart.",
  },
  {
    n: "03",
    title: "Create your first project",
    body: "Then Catalyst can answer from your work instead of guessing, and cite the record behind every claim.",
  },
]


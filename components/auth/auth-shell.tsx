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
 * Below `lg` it collapses to the single centred column it was before — the
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
    <div className="relative min-h-svh w-full overflow-hidden bg-background">
      <BackgroundField />

      <div className="relative z-10 mx-auto grid min-h-svh w-full max-w-7xl grid-cols-1 items-center gap-16 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-24 lg:px-12">
        {/* ── Form column ─────────────────────────────────────────────── */}
        <div className="mx-auto w-full max-w-md lg:mx-0">
          <Link
            href="/"
            className="mb-8 inline-flex transition-opacity hover:opacity-90"
            aria-label="Notes9 home"
          >
            <Notes9Brand textClassName="h-8 w-auto" />
          </Link>

          <h1 className="font-serif text-[30px] leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{subtitle}</p>

          <div className="mt-8">{children}</div>

          {aside && <div className="mt-6 text-xs text-muted-foreground/80">{aside}</div>}
        </div>

        {/* ── Proof column ────────────────────────────────────────────── */}
        <aside className="hidden lg:block">
          <ProofPanel />
        </aside>
      </div>
    </div>
  )
}

/**
 * Same layered recipe as the marketing hero — technical grid, organic colour,
 * grain, vignette — but written with inline values rather than the `.n9-*`
 * classes, which are scoped to `.marketing-theme`. Auth deliberately sits
 * outside that scope so it keeps the product colour tokens.
 */
function BackgroundField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_30%_35%,#000,transparent_78%)]" />

      <div className="absolute -inset-[18%] opacity-90 blur-[72px] saturate-[1.15]">
        <div className="absolute inset-0 [background:radial-gradient(58%_38%_at_50%_-6%,color-mix(in_oklab,#f6e4cf_58%,transparent),transparent_72%),radial-gradient(38%_52%_at_18%_28%,color-mix(in_oklab,var(--primary)_42%,transparent),transparent_68%),radial-gradient(34%_44%_at_80%_26%,color-mix(in_oklab,#c9a227_30%,transparent),transparent_66%),radial-gradient(46%_58%_at_66%_78%,color-mix(in_oklab,#7f8f74_36%,transparent),transparent_70%)]" />
      </div>

      <div className="absolute inset-0 bg-[image:var(--glass-grain-img)] bg-repeat opacity-[0.16] mix-blend-soft-light" />
      <div className="absolute inset-0 [background:radial-gradient(120%_88%_at_40%_10%,transparent_44%,var(--background)_94%)]" />
    </div>
  )
}

/**
 * What happens after signup, in the order it happens. Concrete and checkable —
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
    body: "A sample project matched to your research — protocols, lab notes and real reference papers you can pull apart.",
  },
  {
    n: "03",
    title: "Create your first project",
    body: "Then Catalyst can answer from your work instead of guessing, and cite the record behind every claim.",
  },
]

function ProofPanel() {
  return (
    <div className="max-w-lg">
      <p className="n9-auth-label flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="size-1.5 rounded-[1px] bg-primary" />
        What happens next
      </p>

      <h2 className="mt-6 font-serif text-[clamp(1.75rem,2.6vw,2.4rem)] leading-[1.12] tracking-[-0.02em] text-foreground">
        Set up around your research, not a blank page.
      </h2>

      <ol className="mt-10 space-y-7">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-5">
            <span className="mt-1 font-mono text-xs tabular-nums text-primary">{s.n}</span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug text-foreground">{s.title}</p>
              <p className="mt-1.5 max-w-sm text-[14px] leading-6 text-muted-foreground">
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <hr className="mt-10 border-0 border-t border-border/60" />

      <p className="mt-6 max-w-sm text-[13px] leading-6 text-muted-foreground">
        Free to start, with AI credits included. No card required.
      </p>
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "@phosphor-icons/react/ssr"
import { FlareIcon } from "@/components/ui/flare-icon"

/**
 * Real, interactive literature-search entry point on the marketing hero.
 * A logged-out visitor types a research question and submits; we stash the
 * query and route them to sign-up. After they authenticate they land on their
 * own /literature-reviews page with the query auto-filled and auto-executed,
 * so their very first moment in the product is a live, cited answer.
 */

const PENDING_QUERY_COOKIE = "n9_pending_lit_query"

/**
 * What the placeholder types out, on a loop.
 *
 * The first line is an instruction rather than an example, because the box needs
 * to say what it is FOR before the examples mean anything: a visitor reading a
 * research question in a hero input assumes it is decorative copy, not a live
 * control they are invited to use. Naming Catalyst and literature search once
 * per cycle turns the same animation into the invitation.
 *
 * Purely a live affordance; nothing is submitted until the user types their own
 * question and hits Search.
 */
const DEMO_QUESTIONS = [
  "Try it: run a real literature search with Notes9 Catalyst",
  "Why does a 3:1 PEI:DNA ratio maximize transient transfection yield?",
  "Summarize recent CRISPR base-editing off-target safety findings",
  "Compare AAV serotypes for CNS gene delivery",
  "What stabilizes antibody-drug conjugate linkers in circulation?",
]

export function HeroSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [typed, setTyped] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Typewriter placeholder: types a question, pauses, deletes, moves on.
  // Pauses whenever the user is interacting (focused or has typed something),
  // and stays static under prefers-reduced-motion.
  const active = !focused && query.length === 0
  useEffect(() => {
    if (!active) return
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setTyped(DEMO_QUESTIONS[0])
      return
    }
    let phrase = 0
    let char = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const full = DEMO_QUESTIONS[phrase]
      char += deleting ? -1 : 1
      setTyped(full.slice(0, Math.max(0, char)))
      if (!deleting && char >= full.length) {
        deleting = true
        timer = setTimeout(tick, 2000)
        return
      }
      if (deleting && char <= 0) {
        deleting = false
        phrase = (phrase + 1) % DEMO_QUESTIONS.length
      }
      timer = setTimeout(tick, deleting ? 24 : 46)
    }
    timer = setTimeout(tick, 500)
    return () => clearTimeout(timer)
  }, [active])

  const launch = (raw: string) => {
    const q = raw.trim()
    if (!q || submitting) return
    setSubmitting(true)
    // Durable fallback: URL state can't survive the email-verification hop, so
    // also drop a short-lived cookie the literature page + middleware can read.
    document.cookie = `${PENDING_QUERY_COOKIE}=${encodeURIComponent(
      q
    )}; path=/; max-age=1800; samesite=lax`
    const dest = `/literature-reviews?q=${encodeURIComponent(q)}&autorun=1`
    router.push(`/auth/sign-up?next=${encodeURIComponent(dest)}`)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    launch(query)
  }

  return (
    <div className="w-full max-w-2xl">
      <form onSubmit={onSubmit} className="group relative">
        {/* focus glow */}
        <div className="pointer-events-none absolute -inset-1 rounded-full bg-[var(--n9-accent)]/[0.12] opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />
        {/* The accent ring is the same affordance the app's sidebar search uses:
            a tinted border with a soft 3px accent ring, so the one live control
            on the page is recognisably the product's own search field rather
            than a generic hero input. */}
        <div className="relative flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/35 bg-card/90 py-1.5 pl-5 pr-1.5 shadow-[0_0_0_3px_color-mix(in_srgb,var(--n9-accent)_10%,transparent),0_14px_40px_-22px_var(--n9-accent-glow)] backdrop-blur-md transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--n9-accent)]/70 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--n9-accent)_16%,transparent),0_16px_44px_-20px_var(--n9-accent-glow)]">
          {/* The Catalyst mark rather than a magnifier: this is not a site
              search, and the glyph is the first thing that says so. */}
          <FlareIcon
            className="h-5 w-5 shrink-0 text-[var(--n9-accent)]"
            weight="fill"
            aria-hidden
          />
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label="Ask a research question"
              className="h-10 w-full border-0 bg-transparent text-[15px] text-foreground outline-none"
            />
            {/* Animated typewriter shown while the field is empty & unfocused. */}
            {active && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] text-muted-foreground/60"
              >
                <span className="truncate">
                  {typed || "Ask a research question and Catalyst searches the literature…"}
                </span>
                <span className="ml-0.5 inline-block h-[1.1em] w-px animate-pulse bg-[var(--n9-accent)]/70" />
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting || !query.trim()}
            aria-label="Search live literature"
            className="group/btn flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--n9-accent)] text-white shadow-[0_8px_22px_-10px_var(--n9-accent-glow)] transition-all duration-200 hover:bg-[var(--n9-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5"
              weight="bold"
            />
          </button>
        </div>
      </form>

      {/* No helper line under the box. The typed placeholder already says what
          this is and invites the visitor to use it, so a sentence repeating that
          underneath was saying the same thing twice. */}
    </div>
  )
}

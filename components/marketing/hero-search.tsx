"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react/ssr"

/**
 * Real, interactive literature-search entry point on the marketing hero.
 * A logged-out visitor types a research question and submits; we stash the
 * query and route them to sign-up. After they authenticate they land on their
 * own /literature-reviews page with the query auto-filled and auto-executed,
 * so their very first moment in the product is a live, cited answer.
 */

const PENDING_QUERY_COOKIE = "n9_pending_lit_query"

// Example questions the placeholder types out, to invite the user to try a
// real search. Purely a live affordance — nothing is submitted until the user
// types their own question and hits Search.
const DEMO_QUESTIONS = [
  "Why does a 3:1 PEI:DNA ratio maximize transient transfection yield?",
  "Summarize recent CRISPR base-editing off-target safety findings",
  "Compare AAV serotypes for CNS gene delivery",
  "What stabilizes antibody–drug conjugate linkers in circulation?",
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
    <div className="mx-auto w-full max-w-2xl">
      <form onSubmit={onSubmit} className="group relative">
        {/* rotating conic aura */}
        <div className="n9-search-aura" aria-hidden />
        {/* focus glow */}
        <div className="pointer-events-none absolute -inset-1 rounded-[26px] bg-[var(--n9-accent)]/[0.12] opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />
        <div className="relative flex items-center gap-2 rounded-[22px] border border-border/60 bg-card/90 py-2 pl-4 pr-2 shadow-[0_18px_50px_-24px_var(--n9-accent-glow)] backdrop-blur-md transition-colors duration-200 focus-within:border-[var(--n9-accent)]/50">
          <MagnifyingGlass className="h-5 w-5 shrink-0 text-muted-foreground/70" weight="bold" />
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label="Ask a research question"
              className="h-11 w-full border-0 bg-transparent text-[15px] text-foreground outline-none sm:text-base"
            />
            {/* Animated typewriter shown while the field is empty & unfocused. */}
            {active && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] text-muted-foreground/60 sm:text-base"
              >
                <span className="truncate">{typed || "Ask a research question…"}</span>
                <span className="ml-0.5 inline-block h-[1.1em] w-px animate-pulse bg-[var(--n9-accent)]/70" />
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting || !query.trim()}
            aria-label="Search live literature"
            className="group/btn flex h-11 shrink-0 items-center gap-1.5 rounded-[16px] bg-[linear-gradient(115deg,var(--n9-accent),color-mix(in_oklab,var(--n9-accent)_58%,#d9a24a))] px-4 text-[15px] font-semibold text-white shadow-[0_10px_28px_-10px_var(--n9-accent-glow)] transition-all duration-200 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45 sm:px-5"
          >
            <span className="hidden sm:inline">Search</span>
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5"
              weight="bold"
            />
          </button>
        </div>
      </form>

      <p className="mt-3 text-center text-[13px] text-muted-foreground/80">
        Ask a real research question and see it answered from live literature — cited, in seconds.
      </p>
    </div>
  )
}

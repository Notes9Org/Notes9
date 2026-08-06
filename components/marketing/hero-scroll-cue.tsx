"use client"

import { useEffect, useState } from "react"
import { CaretDown } from "@phosphor-icons/react/ssr"

/**
 * "There is more below this" for a hero that fills the viewport.
 *
 * The hero is min-h-[92svh] and ends in a search box, which is a natural place
 * to stop reading: a visitor who types nothing has no signal that the rest of
 * the page exists. This is the cue, borrowed from the pattern used by Maze and
 * Telescope: a quiet pill at the foot of the first screen that names what is
 * below rather than just pointing down.
 *
 * It is a real button, not decoration. Clicking it scrolls to the next section,
 * which is also the accessible affordance, so keyboard users get the same
 * shortcut. It retires itself permanently the first time the visitor scrolls,
 * because a cue that keeps reappearing reads as chrome rather than a hint.
 */
export function HeroScrollCue() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    // Any meaningful scroll means the hint has done its job.
    const onScroll = () => {
      if (window.scrollY > 80) setHidden(true)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const advance = () => {
    const hero = document.getElementById("hero")
    const next = hero?.nextElementSibling
    if (next) {
      next.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    window.scrollTo({ top: window.innerHeight, behavior: "smooth" })
  }

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-7 z-20 flex justify-center transition-opacity duration-500 ${
        hidden ? "opacity-0" : "opacity-100"
      }`}
      // Once retired it must not sit in the tab order or catch a stray click.
      aria-hidden={hidden}
    >
      <button
        type="button"
        onClick={advance}
        tabIndex={hidden ? -1 : 0}
        className="n9-scroll-cue pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/80 py-2 pl-4 pr-3 text-[13px] font-medium text-muted-foreground shadow-[0_10px_30px_-18px_rgba(44,36,24,0.4)] backdrop-blur-md transition-colors hover:border-[var(--n9-accent)]/40 hover:text-foreground"
      >
        Scroll to see how it works
        <CaretDown
          className="n9-scroll-cue-caret size-3.5 text-[var(--n9-accent)]"
          weight="bold"
          aria-hidden
        />
      </button>
    </div>
  )
}

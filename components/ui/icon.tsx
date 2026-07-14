"use client"

/**
 * The single icon abstraction for the product UI.
 *
 * Wraps Phosphor Icons (see docs/UI_UX_REVAMP_PLAN.md §3.2) so call sites never
 * import the raw library. Benefits:
 *  - one place controls default size, weight, and stroke — swap the library once, never 151× again;
 *  - the signature "weight-shift on hover" (regular → fill) is opt-in via `interactive`,
 *    driving the platform-wide "every icon is interactive" gesture from the motion tokens;
 *  - decorative-by-default a11y (aria-hidden unless a label is given).
 *
 * Phosphor icons default to `1em` and `currentColor`, so an <Icon> scales with the
 * surrounding text and inherits its color unless a size/className overrides it.
 *
 * Usage:
 *   import { Flask } from "@phosphor-icons/react/ssr"
 *   <Icon icon={Flask} />                       // 16px, regular weight
 *   <Icon icon={Flask} className="size-5" />    // larger, via Tailwind
 *   <Icon icon={Flask} weight="fill" />         // filled
 *   <button className="group"><Icon icon={Flask} interactive /> Run</button>  // fills on hover
 */

import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

export type IconProps = {
  /** A Phosphor icon component, e.g. `Flask` from "@phosphor-icons/react/ssr" (RSC-safe entry). */
  icon: PhosphorIcon
  /** Explicit pixel size. Omit to let the icon scale with font-size / a `size-*` className. Default 16. */
  size?: number
  /** Phosphor weight. Default "regular". Ignored for the resting layer when `interactive`. */
  weight?: IconWeight
  /** When true, cross-fades regular → fill on hover of the nearest `.group` ancestor. */
  interactive?: boolean
  /** Accessible label. When provided the icon is exposed to AT; otherwise it is decorative (aria-hidden). */
  label?: string
  className?: string
}

const BASE = "shrink-0 [&_svg]:shrink-0"

export function Icon({
  icon: IconCmp,
  size = 16,
  weight = "regular",
  interactive = false,
  label,
  className,
}: IconProps) {
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const }

  if (!interactive) {
    return <IconCmp size={size} weight={weight} className={cn(BASE, className)} {...a11y} />
  }

  // Interactive: stack a resting (regular) and a hover (fill) layer, cross-fade on
  // `group-hover` using the fast motion token. Pure CSS — no per-icon JS state.
  return (
    <span
      className={cn("relative inline-flex", BASE, className)}
      style={{ width: size, height: size }}
      {...a11y}
    >
      <IconCmp
        size={size}
        weight={weight}
        className="absolute inset-0 transition-opacity duration-[120ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-0"
      />
      <IconCmp
        size={size}
        weight="fill"
        className="absolute inset-0 opacity-0 transition-opacity duration-[120ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100"
      />
    </span>
  )
}

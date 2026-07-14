import type { SVGAttributes } from "react"
import { cn } from "@/lib/utils"

export type FlareIconProps = SVGAttributes<SVGSVGElement> & {
  /** Parity with Phosphor icons (the sidebar fills the active item's icon). */
  weight?: "regular" | "fill"
}

/**
 * Concave four-point flare for Catalyst — one continuous path whose edges
 * bow inward toward the core, so the glyph reads as a single sculpted spark
 * rather than a star outline. Custom SVG (Phosphor has no concave flare).
 * Mirrors the Phosphor icon API: className sizing plus `weight`, where
 * `weight="fill"` renders the flare solid for the active nav state.
 */
export function FlareIcon({ className, weight = "regular", ...props }: FlareIconProps) {
  const isFill = weight === "fill"
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
      {...props}
    >
      <path
        d="M12 2.6c.9 5.1 4.3 8.5 9.4 9.4-5.1.9-8.5 4.3-9.4 9.4-.9-5.1-4.3-8.5-9.4-9.4 5.1-.9 8.5-4.3 9.4-9.4Z"
        fill={isFill ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={isFill ? 0 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

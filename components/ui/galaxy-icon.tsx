import type { SVGAttributes } from "react"
import { cn } from "@/lib/utils"

export type GalaxyIconProps = SVGAttributes<SVGSVGElement> & {
  /** Parity with Phosphor icons (the sidebar fills the active item's icon). */
  weight?: "regular" | "fill"
}

/**
 * Spiral-galaxy glyph for Catalyst — a bright core with two sweeping,
 * round-capped arms (plus two fainter inner strokes) so the arms read as
 * visible brush strokes. Custom SVG: Phosphor ships no galaxy icon. Mirrors
 * the Phosphor icon API (className sizing + `weight`), and `weight="fill"`
 * thickens the arms for the active nav state.
 */
export function GalaxyIcon({ className, weight = "regular", ...props }: GalaxyIconProps) {
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
      {/* Core */}
      <circle cx="12" cy="12" r={isFill ? 2.4 : 2} fill="currentColor" />
      {/* Outer arms — long tapering sweeps, round caps = brush-stroke ends */}
      <path
        d="M12 4.4c4.2 0 7.6 3.4 7.6 7.6 0 2.7-1.4 5-3.5 6.4"
        stroke="currentColor"
        strokeWidth={isFill ? 2.1 : 1.6}
        strokeLinecap="round"
      />
      <path
        d="M12 19.6c-4.2 0-7.6-3.4-7.6-7.6 0-2.7 1.4-5 3.5-6.4"
        stroke="currentColor"
        strokeWidth={isFill ? 2.1 : 1.6}
        strokeLinecap="round"
      />
      {/* Inner arms — fainter, shorter strokes for the layered brushed look */}
      <path
        d="M12 8.1c2.2 0 3.9 1.7 3.9 3.9"
        stroke="currentColor"
        strokeOpacity={isFill ? 0.8 : 0.55}
        strokeWidth={isFill ? 1.7 : 1.3}
        strokeLinecap="round"
      />
      <path
        d="M12 15.9c-2.2 0-3.9-1.7-3.9-3.9"
        stroke="currentColor"
        strokeOpacity={isFill ? 0.8 : 0.55}
        strokeWidth={isFill ? 1.7 : 1.3}
        strokeLinecap="round"
      />
    </svg>
  )
}

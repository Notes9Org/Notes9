import type { HTMLAttributes } from "react"
import { Clipboard, Info } from "@phosphor-icons/react/ssr"
import { cn } from "@/lib/utils"

export type ClipboardInfoIconProps = HTMLAttributes<HTMLSpanElement> & {
  /** Parity with Phosphor icons (the sidebar fills the active item's icon). */
  weight?: "regular" | "fill"
}

/**
 * Clipboard with a small info mark, used for Protocols / protocol AI affordances.
 */
export function ClipboardInfoIcon({
  className,
  weight = "regular",
  ...props
}: ClipboardInfoIconProps) {
  return (
    <span
      className={cn(
        "relative inline-flex size-4 shrink-0 text-current [&_svg]:overflow-visible",
        className
      )}
      aria-hidden
      {...props}
    >
      <Clipboard className="size-full" strokeWidth={2} weight={weight} />
      <Info
        className="pointer-events-none absolute -bottom-0.5 -right-0.5 size-2.5 stroke-[2.75]"
        aria-hidden
      />
    </span>
  )
}

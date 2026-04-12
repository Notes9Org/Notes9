import type { HTMLAttributes } from "react"
import { Clipboard, Info } from "lucide-react"
import { cn } from "@/lib/utils"

export type ClipboardInfoIconProps = HTMLAttributes<HTMLSpanElement>

/**
 * Clipboard with a small info mark — used for Protocols / protocol AI affordances.
 */
export function ClipboardInfoIcon({
  className,
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
      <Clipboard className="size-full" strokeWidth={2} />
      <Info
        className="pointer-events-none absolute -bottom-0.5 -right-0.5 size-2.5 stroke-[2.75]"
        aria-hidden
      />
    </span>
  )
}

import { cn } from "@/lib/utils"

/**
 * Modern glass browser frame wrapping a real product screenshot. Theme-aware:
 * shows the light capture in light mode and the dark capture in dark mode.
 * `src` is the base filename (without extension) present in both
 * /public/demo/light and /public/demo/dark.
 */
export function BrowserFrame({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-[0_50px_120px_-45px_rgba(44,36,24,0.55)] ring-1 ring-black/[0.04] backdrop-blur",
        className
      )}
    >
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-border/50 bg-muted/40 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
      </div>
      {/* screenshot */}
      <img
        src={`/demo/light/${src}.png`}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block w-full dark:hidden"
      />
      <img
        src={`/demo/dark/${src}.png`}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="hidden w-full dark:block"
      />
    </div>
  )
}

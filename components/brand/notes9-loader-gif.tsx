import { cn } from "@/lib/utils"

const MASCOT_SRC = "/notes9-mascot-ui.png"

export interface Notes9LoaderGifProps {
  alt?: string
  widthPx?: number
  widthClassName?: string
  className?: string
}

/**
 * Guided-tour mascot for loaders (transparent `notes9-mascot-ui.png` + soft Gaussian glow).
 * Source art is built from `public/notes9-mascot.png` via `scripts/build-mascot-transparent.py`.
 */
export function Notes9LoaderGif({
  alt = "Notes9 loader",
  widthPx,
  widthClassName,
  className,
}: Notes9LoaderGifProps) {
  const useClass = Boolean(widthClassName)
  return (
    <div
      className={cn("relative inline-block max-w-full", widthClassName, className)}
      style={useClass ? undefined : { width: widthPx ?? 64 }}
    >
      <div
        className="notes9-loader-dark-white-halo pointer-events-none absolute left-1/2 top-1/2 z-0 hidden aspect-square w-[118%] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-full bg-white dark:block"
        aria-hidden
      />
      <div className="tour-mascot-animate relative z-10 aspect-square w-full overflow-hidden rounded-full bg-transparent">
        <img
          src={MASCOT_SRC}
          alt=""
          aria-hidden
          className="notes9-loader-mascot-blur-glow pointer-events-none absolute left-1/2 top-1/2 z-0 size-[112%] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
        />
        <img
          src={MASCOT_SRC}
          alt={alt}
          className="relative z-10 size-full object-contain"
        />
      </div>
    </div>
  )
}

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
 * Blur and halo layers are centered on the same square as the mascot so the glow stays behind the face.
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
      className={cn(
        "relative isolate inline-flex max-w-full -translate-y-[25px] items-center justify-center",
        widthClassName,
        className,
      )}
      style={useClass ? undefined : { width: widthPx ?? 64 }}
    >
      {/* Large radial sits behind the whole mascot stack; centered on the loader box, not the page */}
      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 z-0 aspect-square w-[142%] max-w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full",
          "bg-[radial-gradient(circle_at_center,rgba(92,54,34,0.24),rgba(92,54,34,0.09)_50%,transparent_70%)]",
          "dark:bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.38),rgba(0,0,0,0.14)_50%,transparent_72%)]",
        )}
        aria-hidden
      />
      <div
        className="tour-mascot-animate relative z-10 aspect-square w-full overflow-hidden rounded-full bg-transparent"
        style={{ contain: "layout style" }}
      >
        {/* Dark mode: soft halo — same box as mascot, centered */}
        <div
          className="notes9-loader-dark-white-halo pointer-events-none absolute left-1/2 top-1/2 z-0 hidden aspect-square w-[118%] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-full bg-white dark:block"
          aria-hidden
        />
        {/* Blurred duplicate — centered; object-center matches the crisp layer */}
        <img
          src={MASCOT_SRC}
          alt=""
          aria-hidden
          className="notes9-loader-mascot-blur-glow pointer-events-none absolute left-1/2 top-1/2 z-[1] max-h-none w-[112%] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain object-center"
        />
        <img
          src={MASCOT_SRC}
          alt={alt}
          className="relative z-10 size-full object-contain object-center"
        />
      </div>
    </div>
  )
}

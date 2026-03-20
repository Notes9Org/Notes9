import { cn } from "@/lib/utils"

interface Notes9MascotLoaderProps {
  className?: string
  title?: string
  description?: string
  size?: number
}

export function Notes9MascotLoader({
  className,
  title = "Searching with Notes9",
  description,
  size = 240,
}: Notes9MascotLoaderProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 bg-transparent text-center", className)}>
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-x-[14%] inset-y-[18%] rounded-[2rem] bg-black/18 blur-2xl dark:bg-black/28" />
        <picture className="relative z-10 block" style={{ width: size }}>
          <source srcSet="/notes9-loading-transparent.apng" type="image/apng" />
          <img
            src="/notes9-mascot-ghost-transparent.png"
            alt="Notes9 mascot"
            className="tour-mascot-animate relative z-10 h-auto w-full object-contain [filter:sepia(0.22)_saturate(0.76)_hue-rotate(-10deg)_brightness(0.48)_contrast(1.54)] dark:[filter:brightness(0.96)_contrast(1.14)]"
          />
        </picture>
      </div>
      {(title || description) ? (
        <div className="space-y-1.5">
          {title ? (
            <p className="text-sm font-semibold tracking-[0.16em] text-foreground uppercase">
              {title}
            </p>
          ) : null}
          {description ? (
            <p className="max-w-sm text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

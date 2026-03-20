import Image from "next/image"
import { cn } from "@/lib/utils"

interface Notes9BrandProps {
  className?: string
  iconClassName?: string
  textClassName?: string
  stacked?: boolean
  showIcon?: boolean
  withTagline?: boolean
  hrefLabel?: string
}

export function Notes9Brand({
  className,
  iconClassName,
  textClassName,
  stacked = false,
  showIcon = false,
  withTagline = false,
  hrefLabel = "Notes9",
}: Notes9BrandProps) {
  return (
    <div
      aria-label={hrefLabel}
      className={cn(
        "flex min-w-0 items-center gap-3",
        stacked && "flex-col text-center",
        className,
      )}
    >
      {stacked || showIcon ? (
        <div className={cn("relative h-9 w-9 shrink-0", iconClassName)}>
          <Image
            src="/notes9-logo-mark-transparent.png"
            alt="Notes9 logo"
            fill
            sizes="(max-width: 768px) 36px, 48px"
            className="object-contain dark:invert dark:brightness-125"
            priority
          />
        </div>
      ) : null}
      <div className={cn("min-w-0", stacked && "flex flex-col items-center")}>
        <Image
          src="/notes9-wordmark-transparent.png"
          alt="Notes9"
          width={493}
          height={139}
          sizes="(max-width: 768px) 180px, 240px"
          className={cn("block h-8 w-auto object-contain dark:hidden", textClassName)}
          priority
        />
        <Image
          src="/notes9-wordmark-dark.png"
          alt="Notes9"
          width={493}
          height={139}
          sizes="(max-width: 768px) 180px, 240px"
          className={cn("hidden h-8 w-auto object-contain dark:block", textClassName)}
          priority
        />
        {withTagline ? (
          <span className="block truncate text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Research Lab
          </span>
        ) : null}
      </div>
    </div>
  )
}

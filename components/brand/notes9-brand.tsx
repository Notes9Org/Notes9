import Image from "next/image"
import { cn } from "@/lib/utils"

interface Notes9BrandProps {
  className?: string
  iconClassName?: string
  textClassName?: string
  /** Applied to the inline “N · mark · tes9” row */
  wordmarkClassName?: string
  stacked?: boolean
  showIcon?: boolean
  withTagline?: boolean
  hrefLabel?: string
}

function getWordmarkMetrics(textClassName?: string) {
  if (!textClassName) {
    return {
      text: "text-[2.34rem]",
      mascot: "h-[1.55rem] w-[1.55rem]",
      baseline: "items-end",
      extra: "tracking-[-0.01em]",
      textNudgeY: "translate-y-[0.28em]",
    }
  }

  if (textClassName.includes("h-10")) {
    return {
      text: "text-[3.1rem]",
      mascot: "h-[2.05rem] w-[2.05rem]",
      baseline: "items-end",
      extra: "tracking-[-0.01em]",
      textNudgeY: "translate-y-[0.28em]",
    }
  }

  if (textClassName.includes("h-9")) {
    return {
      text: "text-[2.74rem]",
      mascot: "h-[1.62rem] w-[1.62rem]",
      baseline: "items-end",
      extra: "tracking-[-0.01em]",
      textNudgeY: "translate-y-[0.28em]",
    }
  }

  if (textClassName.includes("h-5")) {
    return {
      text: "text-[1.82rem]",
      mascot: "h-[1.1rem] w-[1.1rem]",
      baseline: "items-end",
      extra: "tracking-[0em]",
      // Sidebar compact wordmark: sit "N" / "tes9" lower vs. the mark for optical balance
      textNudgeY: "translate-y-[0.32em]",
    }
  }

  if (/(?:^|\s)h-8(?:\s|$)/.test(textClassName)) {
    return {
      text: "text-[2.34rem]",
      mascot: "h-[1.3rem] w-[1.3rem]",
      baseline: "items-end",
      extra: "tracking-[-0.01em]",
      textNudgeY: "translate-y-[0.30em]",
    }
  }

  return {
    text: "text-[2.34rem]",
    mascot: "h-[1.55rem] w-[1.55rem]",
    baseline: "items-end",
    extra: "tracking-[-0.01em]",
    textNudgeY: "translate-y-[0.28em]",
  }
}

export function Notes9Brand({
  className,
  iconClassName,
  textClassName,
  wordmarkClassName,
  stacked = false,
  showIcon = false,
  withTagline = false,
  hrefLabel = "Notes9",
}: Notes9BrandProps) {
  const metrics = getWordmarkMetrics(textClassName)

  return (
    <div
      aria-label={hrefLabel}
      className={cn(
        "flex min-w-0 items-center",
        stacked && "flex-col text-center",
        className,
      )}
    >
      <div className={cn("min-w-0", stacked && "flex flex-col items-center")}>
        <div
          className={cn(
            "inline-flex min-w-0 font-sans font-semibold leading-none text-foreground",
            metrics.baseline,
            metrics.text,
            metrics.extra,
            wordmarkClassName,
          )}
        >
          <span aria-hidden="true" className={metrics.textNudgeY}>N</span>
          <span className="sr-only">o</span>
          <span
            aria-hidden="true"
            className={cn(
              "relative mx-[0.02em] inline-flex shrink-0 items-center justify-center self-end translate-y-[calc(-0.03em-2px)]",
              metrics.mascot,
            )}
          >
            <Image
              src="/notes9-logo-mark-transparent.png"
              alt=""
              fill
              sizes="40px"
              className="object-contain dark:invert dark:brightness-125"
            />
          </span>
          <span aria-hidden="true" className={metrics.textNudgeY}>tes9</span>
        </div>
        {withTagline ? (
          <span className="mt-0.5 block truncate text-[11px] font-medium uppercase leading-normal tracking-[0.18em] text-muted-foreground">
            Research Lab
          </span>
        ) : null}
      </div>
    </div>
  )
}

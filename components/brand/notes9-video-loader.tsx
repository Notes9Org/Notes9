"use client"

import { useEffect, useState } from "react"
import { BookOpen, ClipboardList, FlaskConical, Microscope, Network, NotebookPen, Search, Sparkles, TestTube2 } from "lucide-react"
import { Notes9LoaderGif } from "@/components/brand/notes9-loader-gif"
import { cn } from "@/lib/utils"

export type Notes9LoaderVariant =
  | "default"
  | "auth"
  | "literature"
  | "search"
  | "projects"
  | "experiments"
  | "samples"
  | "equipment"
  | "notes"
  | "protocols"
  | "research-map"

interface Notes9VideoLoaderProps {
  className?: string
  label?: string
  title?: string
  caption?: string
  captions?: string[]
  size?: "sm" | "md" | "lg"
  compact?: boolean
  horizontal?: boolean
  /** Smaller mascot + orbit (e.g. AI chat thread while generating) */
  inline?: boolean
  variant?: Notes9LoaderVariant
}

function SceneShell({
  children,
  compact,
  horizontal,
  inline = false,
}: {
  children: React.ReactNode
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        compact ? "h-24 w-24 sm:h-28 sm:w-28" : "h-44 w-44 sm:h-52 sm:w-52",
        horizontal && compact && !inline && "h-20 w-20 sm:h-24 sm:w-24",
        horizontal && compact && inline && "h-14 w-14 sm:h-16 sm:w-16",
      )}
    >
      {children}
    </div>
  )
}

function Mascot({
  compact,
  inline = false,
  horizontal = false,
}: {
  compact: boolean
  inline?: boolean
  horizontal?: boolean
}) {
  const nudgeY =
    inline ? "-translate-y-5 sm:-translate-y-6"
    : compact && horizontal ? "-translate-y-10 sm:-translate-y-12"
    : compact
      ? "-translate-y-8 sm:-translate-y-10"
      : "-translate-y-14 sm:-translate-y-16"

  return (
    <div
      className={cn(
        "relative z-10",
        compact
          ? inline
            ? "w-[48px] sm:w-[52px]"
            : "w-[68px] sm:w-[72px]"
          : "w-[84px] sm:w-[92px]",
        nudgeY,
      )}
    >
      <Notes9LoaderGif alt="Notes9 loader" widthClassName="w-full" />
    </div>
  )
}

function DefaultScene({
  compact,
  horizontal,
  inline = false,
}: {
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <SceneShell compact={compact} horizontal={horizontal} inline={inline}>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(92,54,34,0.22),rgba(92,54,34,0.08)_52%,transparent_72%)] dark:bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.34),rgba(0,0,0,0.12)_52%,transparent_74%)]" />
      <Sparkles
        className={cn(
          "loader-orbit absolute left-1/2 z-20 -translate-x-1/2 text-primary/70",
          inline ? "top-1.5 size-3" : "top-3 size-4",
        )}
      />
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
    </SceneShell>
  )
}

function LiteratureScene({
  compact,
  horizontal,
  inline = false,
}: {
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <SceneShell compact={compact} horizontal={horizontal} inline={inline}>
      <div className="absolute inset-x-0 bottom-4 z-0 flex items-end justify-center gap-1.5">
        <BookOpen className="loader-book-tilt size-5 text-primary/38 [animation-delay:0ms]" />
        <BookOpen className="loader-book-tilt size-6 text-primary/62 [animation-delay:140ms]" />
        <BookOpen className="loader-book-tilt size-5 text-primary/38 [animation-delay:280ms]" />
      </div>
      <div className="absolute bottom-6 left-1/2 z-20 -translate-x-[15%]">
        <Search className={cn("loader-scan text-primary/68", compact ? "size-7" : "size-8")} />
      </div>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_65%,rgba(92,54,34,0.18),rgba(92,54,34,0.07)_48%,transparent_68%)] dark:bg-[radial-gradient(circle_at_50%_65%,rgba(0,0,0,0.30),rgba(0,0,0,0.10)_48%,transparent_68%)]" />
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
    </SceneShell>
  )
}

function SearchScene({
  compact,
  horizontal,
  inline = false,
}: {
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <SceneShell compact={compact} horizontal={horizontal} inline={inline}>
      <div className="absolute inset-0 flex items-center justify-center">
        <Search className={cn("loader-search-swing h-auto text-primary/28", compact ? "w-[3.75rem]" : "w-[5.5rem]")} />
      </div>
      <div className="loader-scan-line absolute left-1/2 top-1/2 z-0 h-[3px] w-24 -translate-x-1/2 bg-primary/58 blur-[1px]" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(92,54,34,0.18),rgba(92,54,34,0.08)_50%,transparent_70%)] dark:bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.30),rgba(0,0,0,0.10)_50%,transparent_70%)]" />
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
    </SceneShell>
  )
}

function ProjectsScene({
  compact,
  horizontal,
  inline = false,
}: {
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <SceneShell compact={compact} horizontal={horizontal} inline={inline}>
      <div className="absolute bottom-4 left-1/2 z-0 flex -translate-x-1/2 items-end gap-1.5">
        <div className="loader-block-rise h-3.5 w-6 rounded-md bg-primary/24 [animation-delay:0ms]" />
        <div className="loader-block-rise h-6 w-6 rounded-md bg-primary/42 [animation-delay:180ms]" />
        <div className="loader-block-rise h-8.5 w-6 rounded-md bg-primary/62 [animation-delay:360ms]" />
      </div>
      <div className="absolute bottom-3 left-1/2 z-0 h-1 w-24 -translate-x-1/2 rounded-full bg-primary/14" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_70%,rgba(92,54,34,0.18),rgba(92,54,34,0.07)_48%,transparent_68%)] dark:bg-[radial-gradient(circle_at_50%_70%,rgba(0,0,0,0.30),rgba(0,0,0,0.10)_48%,transparent_68%)]" />
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
    </SceneShell>
  )
}

function ExperimentsScene({
  compact,
  horizontal,
  inline = false,
}: {
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <SceneShell compact={compact} horizontal={horizontal} inline={inline}>
      <div className="absolute bottom-3 left-1/2 z-0 -translate-x-1/2">
        <FlaskConical className="loader-research-icon size-9 text-primary/58" />
      </div>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_62%,rgba(92,54,34,0.18),rgba(92,54,34,0.07)_48%,transparent_68%)] dark:bg-[radial-gradient(circle_at_50%_62%,rgba(0,0,0,0.30),rgba(0,0,0,0.10)_48%,transparent_68%)]" />
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
    </SceneShell>
  )
}

function SamplesScene({
  compact,
  horizontal,
  inline = false,
}: {
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <SceneShell compact={compact} horizontal={horizontal} inline={inline}>
      <div className="absolute bottom-4 left-1/2 z-0 h-10 w-24 -translate-x-1/2 overflow-hidden">
        <div className="loader-carousel-track flex items-end gap-3">
          <TestTube2 className="size-6 shrink-0 text-primary/36" />
          <TestTube2 className="size-7 shrink-0 text-primary/62" />
          <TestTube2 className="size-6 shrink-0 text-primary/42" />
          <TestTube2 className="size-6 shrink-0 text-primary/36" />
          <TestTube2 className="size-7 shrink-0 text-primary/62" />
          <TestTube2 className="size-6 shrink-0 text-primary/42" />
        </div>
      </div>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_64%,rgba(92,54,34,0.18),rgba(92,54,34,0.07)_48%,transparent_68%)] dark:bg-[radial-gradient(circle_at_50%_64%,rgba(0,0,0,0.30),rgba(0,0,0,0.10)_48%,transparent_68%)]" />
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
    </SceneShell>
  )
}

function EquipmentScene({
  compact,
  horizontal,
  inline = false,
}: {
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <SceneShell compact={compact} horizontal={horizontal} inline={inline}>
      <div className="absolute bottom-4 left-1/2 z-0 -translate-x-1/2">
        <Microscope className="loader-microscope size-11 text-primary/62" />
      </div>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_68%,rgba(92,54,34,0.18),rgba(92,54,34,0.07)_48%,transparent_68%)] dark:bg-[radial-gradient(circle_at_50%_68%,rgba(0,0,0,0.30),rgba(0,0,0,0.10)_48%,transparent_68%)]" />
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
    </SceneShell>
  )
}

function NotesScene({
  compact,
  horizontal,
  protocol = false,
  inline = false,
}: {
  compact: boolean
  horizontal: boolean
  protocol?: boolean
  inline?: boolean
}) {
  return (
    <SceneShell compact={compact} horizontal={horizontal} inline={inline}>
      <div className="absolute bottom-4 left-1/2 z-0 flex -translate-x-1/2 items-center gap-2">
        <div className="flex h-12 w-10 items-center justify-center rounded-xl border border-primary/16 bg-primary/6">
          {protocol ? (
            <ClipboardList className="size-5 text-primary/68" />
          ) : (
            <NotebookPen className="size-5 text-primary/68" />
          )}
        </div>
        <div className="flex min-w-[3.25rem] flex-col gap-1">
          <div className="loader-writing-grow-1 h-1.5 rounded-full bg-primary/32" />
          <div className="loader-writing-grow-2 h-1.5 rounded-full bg-primary/24" />
          {protocol ? <div className="loader-writing-grow-3 h-1.5 rounded-full bg-primary/18" /> : null}
        </div>
      </div>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_68%,rgba(92,54,34,0.18),rgba(92,54,34,0.07)_48%,transparent_68%)] dark:bg-[radial-gradient(circle_at_50%_68%,rgba(0,0,0,0.30),rgba(0,0,0,0.10)_48%,transparent_68%)]" />
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
    </SceneShell>
  )
}

function ResearchMapScene({
  compact,
  horizontal,
  inline = false,
}: {
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <SceneShell compact={compact} horizontal={horizontal} inline={inline}>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_70%,rgba(92,54,34,0.18),rgba(92,54,34,0.07)_48%,transparent_68%)] dark:bg-[radial-gradient(circle_at_50%_70%,rgba(0,0,0,0.30),rgba(0,0,0,0.10)_48%,transparent_68%)]" />
      <div className="absolute bottom-4 left-1/2 z-0 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <Network className={cn("loader-research-icon text-primary/62", compact ? "size-8" : "size-10")} />
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary/35" />
          <span className="size-2 rounded-full bg-primary/55" />
          <span className="size-2 rounded-full bg-primary/35" />
        </div>
      </div>
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
    </SceneShell>
  )
}

export function Notes9VideoLoader({
  className,
  label = "Notes9 is loading",
  title = "Loading Notes9",
  caption = "Loading your next view",
  captions,
  size = "md",
  compact = false,
  horizontal = false,
  inline = false,
  variant = "default",
}: Notes9VideoLoaderProps) {
  const resolvedCaptions = captions?.length ? captions : [caption]
  const [captionIndex, setCaptionIndex] = useState(0)

  useEffect(() => {
    setCaptionIndex(0)
  }, [title, caption, captions, variant])

  useEffect(() => {
    if (resolvedCaptions.length <= 1) return

    const intervalId = window.setInterval(() => {
      setCaptionIndex((current) => (current + 1) % resolvedCaptions.length)
    }, 2200)

    return () => window.clearInterval(intervalId)
  }, [resolvedCaptions])

  const sceneCompact = compact || size === "sm"

  const renderScene = () => {
    if (variant === "literature")
      return <LiteratureScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
    if (variant === "search") return <SearchScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
    if (variant === "projects") return <ProjectsScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
    if (variant === "experiments") return <ExperimentsScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
    if (variant === "samples") return <SamplesScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
    if (variant === "equipment") return <EquipmentScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
    if (variant === "notes") return <NotesScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
    if (variant === "protocols")
      return <NotesScene compact={sceneCompact} horizontal={horizontal} protocol inline={inline} />
    if (variant === "research-map")
      return <ResearchMapScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
    return <DefaultScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 bg-transparent",
        horizontal && "flex-row items-center gap-4",
        horizontal && compact && "gap-3",
        className,
      )}
    >
      {renderScene()}
      <div
        className={cn(
          "space-y-1 text-center",
          compact && "space-y-0.5",
          horizontal && "flex min-w-0 flex-col justify-center text-left",
          horizontal && compact && "max-w-[220px]",
        )}
      >
        <p className={cn("text-base font-semibold leading-tight text-foreground/95", compact && "text-sm")}>
          {title}
        </p>
        <p className={cn("text-sm leading-snug text-foreground/88 transition-opacity duration-500", compact && "text-xs")}>
          {resolvedCaptions[captionIndex]}
        </p>
      </div>
    </div>
  )
}

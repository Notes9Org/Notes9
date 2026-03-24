"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  BookOpen,
  ClipboardList,
  FlaskConical,
  Microscope,
  Network,
  NotebookPen,
  ScrollText,
  Search,
  Sparkles,
  TestTube2,
} from "lucide-react"
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
  | "writing"

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
  children: ReactNode
  compact: boolean
  horizontal: boolean
  inline?: boolean
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-visible",
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
  const widthCls = compact
    ? inline
      ? "w-[48px] sm:w-[52px]"
      : "w-[68px] sm:w-[72px]"
    : "w-[84px] sm:w-[92px]"

  return <Notes9LoaderGif alt="Notes9 loader" widthClassName={cn(widthCls)} className="shrink-0" />
}

function OrbitSparkle({ compact, inline }: { compact: boolean; inline?: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 items-center justify-center",
        inline ? "h-3.5 -translate-y-[5px]" : compact ? "h-4" : "h-5",
      )}
      aria-hidden
    >
      <Sparkles
        className={cn(
          "loader-orbit text-primary/70",
          inline ? "size-3" : compact ? "size-3.5" : "size-4",
        )}
      />
    </div>
  )
}

/** Reserve space at bottom for scene props so the mascot stays visually centered above them */
function MascotColumn({
  compact,
  inline,
  horizontal,
  bottomOffset,
  showOrbit,
}: {
  compact: boolean
  horizontal: boolean
  inline?: boolean
  /** Extra bottom padding as fraction of scene (scenes with floor illustrations) */
  bottomOffset?: "none" | "sm" | "md"
  showOrbit?: boolean
}) {
  const pad =
    bottomOffset === "md"
      ? "pb-[min(34%,5.75rem)] pt-1 sm:pb-[min(32%,5.25rem)]"
      : bottomOffset === "sm"
        ? "pb-[min(28%,4.5rem)] pt-1"
        : "py-0"

  return (
    <div
      className={cn(
        "relative z-10 flex w-full max-w-full flex-col items-center justify-center",
        pad,
        bottomOffset === "none" && "gap-1",
        bottomOffset !== "none" && "gap-0.5",
      )}
    >
      {showOrbit ? <OrbitSparkle compact={compact} inline={inline} /> : null}
      <Mascot compact={compact} inline={inline} horizontal={horizontal} />
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
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="none"
        showOrbit
      />
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
      <div className="absolute inset-x-0 bottom-2 z-0 flex items-end justify-center gap-1.5 sm:bottom-3">
        <BookOpen className="loader-book-tilt size-5 text-primary/38 [animation-delay:0ms]" />
        <BookOpen className="loader-book-tilt size-6 text-primary/62 [animation-delay:140ms]" />
        <BookOpen className="loader-book-tilt size-5 text-primary/38 [animation-delay:280ms]" />
      </div>
      <div className="pointer-events-none absolute bottom-[18%] left-[58%] z-[8] sm:bottom-[20%]">
        <Search className={cn("loader-scan text-primary/55", compact ? "size-6" : "size-7")} />
      </div>
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="md"
      />
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
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <Search className={cn("loader-search-swing h-auto text-primary/22", compact ? "w-[3.25rem]" : "w-[5rem]")} />
      </div>
      <div className="loader-scan-line absolute left-1/2 top-1/2 z-[1] h-[3px] w-24 -translate-x-1/2 bg-primary/45 blur-[1px]" />
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="none"
      />
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
      <div className="absolute bottom-2 left-1/2 z-0 flex -translate-x-1/2 items-end gap-1.5 sm:bottom-3">
        <div className="loader-block-rise h-3.5 w-6 rounded-md bg-primary/24 [animation-delay:0ms]" />
        <div className="loader-block-rise h-6 w-6 rounded-md bg-primary/42 [animation-delay:180ms]" />
        <div className="loader-block-rise h-[2.125rem] w-6 rounded-md bg-primary/62 [animation-delay:360ms]" />
      </div>
      <div className="absolute bottom-1.5 left-1/2 z-0 h-1 w-24 -translate-x-1/2 rounded-full bg-primary/14 sm:bottom-2" />
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="md"
      />
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
      <div className="absolute bottom-2 left-1/2 z-0 -translate-x-1/2 sm:bottom-3">
        <FlaskConical className="loader-research-icon size-8 text-primary/52 sm:size-9" />
      </div>
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="sm"
      />
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
      <div className="absolute bottom-2 left-1/2 z-0 h-9 w-[5.5rem] -translate-x-1/2 overflow-hidden sm:bottom-3 sm:h-10 sm:w-24">
        <div className="loader-carousel-track flex items-end gap-3">
          <TestTube2 className="size-6 shrink-0 text-primary/36" />
          <TestTube2 className="size-7 shrink-0 text-primary/62" />
          <TestTube2 className="size-6 shrink-0 text-primary/42" />
          <TestTube2 className="size-6 shrink-0 text-primary/36" />
          <TestTube2 className="size-7 shrink-0 text-primary/62" />
          <TestTube2 className="size-6 shrink-0 text-primary/42" />
        </div>
      </div>
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="md"
      />
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
      <div className="absolute bottom-2 left-1/2 z-0 -translate-x-1/2 sm:bottom-3">
        <Microscope className="loader-microscope size-10 text-primary/55 sm:size-11" />
      </div>
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="sm"
      />
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
      <div className="absolute bottom-2 left-1/2 z-0 flex -translate-x-1/2 items-center gap-2 sm:bottom-3">
        <div className="flex h-11 w-10 items-center justify-center rounded-xl border border-primary/16 bg-primary/6 sm:h-12">
          {protocol ? (
            <ClipboardList className="size-5 text-primary/62" />
          ) : (
            <NotebookPen className="size-5 text-primary/62" />
          )}
        </div>
        <div className="flex min-w-[3.25rem] flex-col gap-1">
          <div className="loader-writing-grow-1 h-1.5 rounded-full bg-primary/32" />
          <div className="loader-writing-grow-2 h-1.5 rounded-full bg-primary/24" />
          {protocol ? <div className="loader-writing-grow-3 h-1.5 rounded-full bg-primary/18" /> : null}
        </div>
      </div>
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="md"
      />
    </SceneShell>
  )
}

/** Writing section — same ScrollText icon as AppSidebar "Writing" / papers nav. */
function WritingScene({
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
      <div className="absolute bottom-2 left-1/2 z-0 flex -translate-x-1/2 items-center gap-2 sm:bottom-3">
        <div className="flex h-11 w-10 items-center justify-center rounded-xl border border-primary/16 bg-primary/6 sm:h-12">
          <ScrollText className="size-5 text-primary/62" />
        </div>
        <div className="flex min-w-[3.25rem] flex-col gap-1">
          <div className="loader-writing-grow-1 h-1.5 rounded-full bg-primary/32" />
          <div className="loader-writing-grow-2 h-1.5 rounded-full bg-primary/24" />
        </div>
      </div>
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="md"
      />
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
      <div className="absolute bottom-2 left-1/2 z-0 flex -translate-x-1/2 flex-col items-center gap-1 sm:bottom-3">
        <Network className={cn("loader-research-icon text-primary/55", compact ? "size-7" : "size-9")} />
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary/35" />
          <span className="size-2 rounded-full bg-primary/55" />
          <span className="size-2 rounded-full bg-primary/35" />
        </div>
      </div>
      <MascotColumn
        compact={compact}
        horizontal={horizontal}
        inline={inline}
        bottomOffset="md"
      />
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
    if (variant === "writing")
      return <WritingScene compact={sceneCompact} horizontal={horizontal} inline={inline} />
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

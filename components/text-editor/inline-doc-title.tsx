"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const SIZE_CLASSES = {
  base: "text-base",
  lg: "text-lg",
  "2xl": "text-2xl",
} as const

interface InlineDocTitleProps {
  value: string
  onChange: (value: string) => void
  /** Persist the title; called after blur or Enter (not after Escape). */
  onCommit?: () => void | Promise<void>
  /** Shown when the value is empty, and as the static text while disabled. */
  placeholder?: string
  size?: keyof typeof SIZE_CLASSES
  /** Static, non-editable rendering (e.g. while creating a new document). */
  disabled?: boolean
  className?: string
  "aria-label"?: string
  "data-tour"?: string
}

/**
 * The one click-to-edit document title used by every editor surface (lab notes,
 * protocols, reports, papers): a quiet heading that turns into a borderless
 * input on click, commits on blur/Enter, and cancels on Escape.
 */
export function InlineDocTitle({
  value,
  onChange,
  onCommit,
  placeholder = "Untitled",
  size = "lg",
  disabled = false,
  className,
  "aria-label": ariaLabel,
  "data-tour": dataTour,
}: InlineDocTitleProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Escape restores the value captured when editing began and skips the commit.
  const originalRef = useRef(value)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const displayText = value.trim() || placeholder
  const headingClass = cn(
    "block w-full min-w-0 truncate border-b border-transparent pb-0.5 text-left font-semibold leading-none tracking-tight text-foreground",
    SIZE_CLASSES[size],
    className,
  )

  if (disabled) {
    return (
      <span className={headingClass} data-tour={dataTour}>
        {displayText}
      </span>
    )
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (!cancelledRef.current) void onCommit?.()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            e.currentTarget.blur()
          }
          if (e.key === "Escape") {
            e.preventDefault()
            cancelledRef.current = true
            onChange(originalRef.current)
            e.currentTarget.blur()
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? "Document title"}
        data-tour={dataTour}
        className={cn(
          "w-full min-w-0 border-b border-transparent bg-transparent pb-0.5 font-semibold leading-none tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary",
          SIZE_CLASSES[size],
          className,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        originalRef.current = value
        cancelledRef.current = false
        setEditing(true)
      }}
      title="Rename"
      aria-label={ariaLabel ?? "Rename document"}
      data-tour={dataTour}
      className={cn(
        headingClass,
        "cursor-pointer rounded px-1 -mx-1 hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {displayText}
    </button>
  )
}

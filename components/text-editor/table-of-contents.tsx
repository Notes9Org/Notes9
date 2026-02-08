"use client"

import React, { useEffect, useState, useCallback } from "react"
import { Editor } from "@tiptap/react"
import { cn } from "@/lib/utils"

interface TOCItem {
    id: string
    text: string
    level: number
    pos: number
}

interface TableOfContentsProps {
    editor: Editor | null
    className?: string
}

export function TableOfContents({ editor, className }: TableOfContentsProps) {
    const [items, setItems] = useState<TOCItem[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [cursorY, setCursorY] = useState<number | null>(null)

    const updateTOC = useCallback(() => {
        if (!editor) return

        const headings: TOCItem[] = []
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === "heading") {
                headings.push({
                    id: `heading-${pos}`,
                    text: node.textContent,
                    level: node.attrs.level,
                    pos,
                })
            }
        })
        setItems(headings)
    }, [editor])

    // 1. Update TOC items when the editor changes
    useEffect(() => {
        if (!editor) return

        updateTOC()
        editor.on("update", updateTOC)
        return () => {
            editor.off("update", updateTOC)
        }
    }, [editor, updateTOC])

    // 2. Scroll and Cursor tracking to highlight the active section
    useEffect(() => {
        if (!editor || items.length === 0) return

        const handleUpdate = () => {
            if (!editor) return
            const { from } = editor.state.selection

            // 1. Calculate vertical position for the TOC widget to follow cursor
            try {
                // Get cursor coordinates relative to viewport
                const coords = editor.view.coordsAtPos(from)
                // Get editor content element (the box that scrolls)
                const scrollContainer = editor.view.dom.parentElement

                if (scrollContainer) {
                    const scrollRect = scrollContainer.getBoundingClientRect()

                    // Position relative to the visible editor clipping box
                    let relativeY = coords.top - scrollRect.top

                    // Add scroll container's current scroll offset if we were absolute to the full content
                    // But we are absolute to the outer container (the clipping box)
                    // So relativeY is exactly where it is in the "visible window"

                    // Clamp to keep strictly within visible area (with padding)
                    // We account for TOC own height roughly by padding more at bottom
                    const containerHeight = scrollRect.height
                    const margin = 40
                    relativeY = Math.max(margin, Math.min(containerHeight - margin, relativeY))

                    setCursorY(relativeY)
                }
            } catch (e) {
                // If coords fail (e.g. editor not ready), default to middle-ish
                if (cursorY === null) setCursorY(200)
            }

            // 2. Identify active section based on selection position
            let currentActiveId = items[0].id
            for (const item of items) {
                if (item.pos <= from) {
                    currentActiveId = item.id
                } else {
                    break
                }
            }
            setActiveId(currentActiveId)
        }

        const handleScroll = () => {
            // Re-calculate widget vertical position as user scrolls
            handleUpdate()

            // Also update active section based on viewport top for reading feel
            const scrollContainer = editor.view.dom.parentElement
            if (!scrollContainer) return

            const scrollPos = scrollContainer.scrollTop + 50 // Threshold from top
            let scrollActiveId = items[0].id

            for (const item of items) {
                const element = editor.view.nodeDOM(item.pos) as HTMLElement
                if (element && (element.offsetTop) <= scrollPos) {
                    scrollActiveId = item.id
                } else {
                    break
                }
            }

            setActiveId(scrollActiveId)
        }

        const scrollContainer = editor.view.dom.parentElement
        if (scrollContainer) {
            scrollContainer.addEventListener("scroll", handleScroll)
            handleScroll()
        }

        editor.on("selectionUpdate", handleUpdate)
        // Also update on content changes 
        editor.on("update", handleUpdate)

        return () => {
            editor.off("selectionUpdate", handleUpdate)
            editor.off("update", handleUpdate)
            if (scrollContainer) {
                scrollContainer.removeEventListener("scroll", handleScroll)
            }
        }
    }, [editor, items])

    const onItemClick = (pos: number) => {
        if (!editor) return

        // Smooth scroll to the heading
        editor.commands.focus(pos)

        const element = editor.view.nodeDOM(pos) as HTMLElement
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" })
        }
    }

    if (items.length === 0) return null

    return (
        <div
            className={cn(
                "absolute right-4 z-40 pointer-events-none flex flex-col items-end gap-1.5",
                className
            )}
            style={{
                top: cursorY !== null ? `${cursorY}px` : "100px",
                transform: "translateY(-50%)",
                transition: "top 1.2s cubic-bezier(0.65, 0, 0.35, 1)"
            }}
        >
            {items.map((item) => {
                const isActive = activeId === item.id
                return (
                    <button
                        key={item.id}
                        onClick={() => onItemClick(item.pos)}
                        className="group relative flex items-center justify-end h-4 outline-none pointer-events-auto"
                    >
                        {/* Label - strictly visible on hover per user request */}
                        <span
                            className={cn(
                                "mr-4 text-[11px] font-medium text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0 pointer-events-none",
                                isActive && "text-primary font-bold", // Keep color but not visibility
                                item.level === 1 && !isActive && "text-foreground font-semibold",
                                item.level === 3 && "text-[10px]"
                            )}
                        >
                            {item.text}
                        </span>

                        {/* Bar - always visible, width based on level */}
                        <div
                            className={cn(
                                "h-[2px] rounded-full bg-border transition-all duration-300",
                                isActive ? "bg-primary w-10 shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "group-hover:bg-primary",
                                !isActive && (item.level === 1 ? "w-8" : item.level === 2 ? "w-5" : "w-3")
                            )}
                        />
                    </button>
                )
            })}
        </div>
    )
}

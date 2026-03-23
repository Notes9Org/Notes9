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

    // 2. Scroll tracking to highlight the active section
    useEffect(() => {
        if (!editor || items.length === 0) return

        const handleUpdate = () => {
            if (!editor) return
            const { from } = editor.state.selection

            // Identify active section based on selection position
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

        const dom = editor.view.nodeDOM(pos)
        if (dom) {
            const el = dom instanceof Element ? dom : dom.parentElement
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
        }
    }

    if (items.length === 0) return null

    return (
        <div
            className={cn(
                "group absolute right-4 top-1/2 -translate-y-1/2 z-40 pointer-events-none",
                className
            )}
        >
            <div className="pointer-events-auto w-fit max-w-[280px] rounded-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none transition-all duration-300 group-hover:rounded-2xl group-hover:border group-hover:border-border/60 group-hover:bg-background/68 group-hover:p-2.5 group-hover:shadow-[0_12px_32px_rgba(44,36,24,0.12)] group-hover:backdrop-blur-md supports-[backdrop-filter]:group-hover:bg-background/56 dark:group-hover:border-border/70 dark:group-hover:bg-card/70">
                <div className="flex flex-col items-end gap-1.5">
                    {items.map((item) => {
                        const isActive = activeId === item.id
                        return (
                            <button
                                key={item.id}
                                onClick={() => onItemClick(item.pos)}
                                className={cn(
                                    "peer relative flex w-fit max-w-full items-center justify-end rounded-full px-2 py-1 outline-none transition-colors duration-200",
                                    "group-hover:hover:bg-card/80 dark:group-hover:hover:bg-background/35",
                                    "group-hover:bg-card/55 dark:group-hover:bg-background/20",
                                    isActive && "group-hover:bg-card/90 dark:group-hover:bg-background/40"
                                )}
                            >
                                <span
                                    className={cn(
                                        "mr-3 max-w-0 truncate text-[11px] font-medium whitespace-nowrap opacity-0 transition-all duration-300 group-hover:max-w-[210px] group-hover:opacity-100",
                                        isActive && "text-primary font-bold",
                                        !isActive && "text-muted-foreground group-hover:text-foreground",
                                        item.level === 1 && !isActive && "text-foreground font-semibold",
                                        item.level === 3 && "text-[10px]"
                                    )}
                                >
                                    {item.text}
                                </span>

                                <div
                                    className={cn(
                                        "h-[2px] shrink-0 rounded-full bg-border transition-all duration-300",
                                        isActive ? "bg-primary w-10 shadow-[0_0_8px_rgba(150,80,52,0.28)]" : "group-hover:bg-primary",
                                        !isActive && (item.level === 1 ? "w-8" : item.level === 2 ? "w-5" : "w-3")
                                    )}
                                />
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

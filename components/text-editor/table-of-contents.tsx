"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
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

const SCROLL_SPY_SUPPRESS_MS = 700

export function TableOfContents({ editor, className }: TableOfContentsProps) {
    const [items, setItems] = useState<TOCItem[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    /** After a TOC click, ignore scroll-based active until smooth scroll finishes (scroll spy was overwriting the correct selection-based highlight). */
    const suppressScrollSpyUntilRef = useRef(0)

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

    useEffect(() => {
        if (!editor) return

        updateTOC()
        editor.on("update", updateTOC)
        return () => {
            editor.off("update", updateTOC)
        }
    }, [editor, updateTOC])

    useEffect(() => {
        if (!editor || items.length === 0) return

        const handleUpdate = () => {
            if (!editor) return
            const { from } = editor.state.selection

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
            handleUpdate()

            if (typeof performance !== "undefined" && performance.now() < suppressScrollSpyUntilRef.current) {
                return
            }

            const scrollContainer = editor.view.dom.parentElement
            if (!scrollContainer) return

            const scrollPos = scrollContainer.scrollTop + 50
            let scrollActiveId = items[0].id

            for (const item of items) {
                const element = editor.view.nodeDOM(item.pos) as HTMLElement
                if (element && element.offsetTop <= scrollPos) {
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
        editor.on("update", handleUpdate)

        return () => {
            editor.off("selectionUpdate", handleUpdate)
            editor.off("update", handleUpdate)
            if (scrollContainer) {
                scrollContainer.removeEventListener("scroll", handleScroll)
            }
        }
    }, [editor, items])

    const onItemClick = (pos: number, id: string) => {
        if (!editor) return

        suppressScrollSpyUntilRef.current = performance.now() + SCROLL_SPY_SUPPRESS_MS
        setActiveId(id)

        const endInsideHeading = pos + 1
        editor.chain().focus().setTextSelection(endInsideHeading).run()

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
                "pointer-events-none absolute inset-y-3 z-40 flex max-h-[calc(100%-1.5rem)] w-0 flex-col justify-center items-end",
                className
            )}
        >
            {/* w-0 anchor on the right; child w-max grows left. Scroll on outer wrapper avoids overflow-x clipping with overflow-y */}
            <div
                className={cn(
                    /* Panel chrome uses `hover:` on this node (not group-hover). Idle: zero border/pad/shadow — no rectangle; scrollbar only while hovered */
                    "group pointer-events-auto max-h-[min(70vh,calc(100%-1rem))] min-h-0 w-max max-w-[min(280px,calc(100vw-1.5rem))]",
                    /* x always clipped — stops brief horizontal scrollbar when inner width collapses; don’t transition overflow (browser scrollbar flicker) */
                    "overflow-x-hidden overflow-y-hidden overscroll-y-contain",
                    "rounded-none border-0 bg-transparent p-0 shadow-none",
                    "transition-[background-color,border-color,box-shadow,border-radius,padding] duration-500 ease-out",
                    "hover:overflow-y-auto hover:rounded-2xl hover:border hover:border-border/80 hover:bg-background hover:p-2.5 hover:shadow-[0_10px_28px_rgba(44,36,24,0.09)]",
                    "dark:hover:border-border dark:hover:bg-card dark:hover:shadow-[0_10px_28px_rgba(0,0,0,0.35)]"
                )}
            >
                <div className="flex min-w-0 max-w-full w-max flex-col items-end gap-1.5 overflow-x-hidden group-hover:w-full group-hover:items-stretch">
                    {items.map((item) => {
                        const isActive = activeId === item.id
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onItemClick(item.pos, item.id)}
                                className={cn(
                                    "relative flex w-max max-w-full shrink-0 flex-row items-center justify-end gap-2 rounded-none border-0 bg-transparent p-0 outline-none",
                                    "transition-[width,justify-content,padding,border-radius,background-color,color] duration-500 ease-out",
                                    "group-hover:w-full group-hover:justify-between group-hover:rounded-md group-hover:px-2 group-hover:py-1",
                                    "group-hover:hover:bg-muted/70 dark:group-hover:hover:bg-muted/50",
                                    "focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:ring-offset-1",
                                    isActive &&
                                        "group-hover:bg-secondary group-hover:text-secondary-foreground dark:group-hover:bg-secondary dark:group-hover:text-secondary-foreground"
                                )}
                            >
                                <span
                                    className={cn(
                                        "min-w-0 truncate text-left text-[11px] font-medium whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-500 ease-out",
                                        "max-w-0 overflow-hidden group-hover:max-w-[min(210px,100%)] group-hover:flex-1 group-hover:opacity-100",
                                        isActive && "font-semibold text-primary group-hover:text-secondary-foreground",
                                        !isActive && "text-muted-foreground group-hover:text-foreground",
                                        item.level === 1 && !isActive && "text-foreground",
                                        item.level === 3 && "text-[10px]"
                                    )}
                                >
                                    {item.text || "Untitled"}
                                </span>

                                <div
                                    className={cn(
                                        "h-[2px] shrink-0 rounded-full bg-border transition-[width,background-color,box-shadow] duration-500 ease-out",
                                        isActive
                                            ? "bg-primary w-10 shadow-[0_0_8px_rgba(150,80,52,0.28)]"
                                            : "group-hover:bg-primary",
                                        !isActive && (item.level === 1 ? "w-8" : item.level === 2 ? "w-5" : "w-3")
                                    )}
                                    aria-hidden
                                />
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

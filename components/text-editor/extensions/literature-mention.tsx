"use client"

import { ReactRenderer } from "@tiptap/react"
import tippy, { Instance as TippyInstance } from "tippy.js"
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useState,
    MutableRefObject,
} from "react"
import { cn } from "@/lib/utils"
import Mention from "@tiptap/extension-mention"

export interface LiteratureItem {
    id: string
    title: string
    authors: string | null
    publication_year: number | null
    journal: string | null
}

interface MentionListProps {
    items: LiteratureItem[]
    command: (item: { id: string; label: string }) => void
}

interface MentionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const LiteratureMentionList = forwardRef<MentionListRef, MentionListProps>(
    (props, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0)

        const selectItem = (index: number) => {
            const item = props.items[index]
            if (item) {
                const firstAuthor = item.authors
                    ? item.authors.split(",")[0].trim()
                    : null
                const label = firstAuthor
                    ? `${firstAuthor}${item.publication_year ? ` (${item.publication_year})` : ""}`
                    : item.title.slice(0, 40)
                props.command({ id: item.id, label })
            }
        }

        const upHandler = () => {
            setSelectedIndex(
                (selectedIndex + props.items.length - 1) % props.items.length
            )
        }

        const downHandler = () => {
            setSelectedIndex((selectedIndex + 1) % props.items.length)
        }

        const enterHandler = () => {
            selectItem(selectedIndex)
        }

        useEffect(() => setSelectedIndex(0), [props.items])

        useImperativeHandle(ref, () => ({
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                if (event.key === "ArrowUp") {
                    upHandler()
                    return true
                }
                if (event.key === "ArrowDown") {
                    downHandler()
                    return true
                }
                if (event.key === "Enter") {
                    enterHandler()
                    return true
                }
                return false
            },
        }))

        return (
            <div className="bg-popover border rounded-md shadow-md overflow-hidden max-h-[220px] overflow-y-auto w-72">
                {props.items.length ? (
                    props.items.map((item, index) => (
                        <button
                            key={item.id}
                            onClick={() => selectItem(index)}
                            onMouseDown={(e) => {
                                e.preventDefault()
                                selectItem(index)
                            }}
                            className={cn(
                                "w-full text-left px-3 py-2 text-sm hover:bg-accent flex flex-col gap-0.5",
                                index === selectedIndex && "bg-accent"
                            )}
                        >
                            <span className="font-medium line-clamp-1 text-foreground">
                                {item.title}
                            </span>
                            {(item.authors || item.publication_year) && (
                                <span className="text-xs text-muted-foreground truncate">
                                    {item.authors ? item.authors.split(",")[0].trim() : ""}
                                    {item.authors?.includes(",") ? " et al." : ""}
                                    {item.publication_year ? ` · ${item.publication_year}` : ""}
                                    {item.journal ? ` · ${item.journal}` : ""}
                                </span>
                            )}
                        </button>
                    ))
                ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                        No literature linked. Add papers to the repository first.
                    </div>
                )}
            </div>
        )
    }
)

LiteratureMentionList.displayName = "LiteratureMentionList"

export function createLiteratureSuggestion(
    literatureRef: MutableRefObject<LiteratureItem[]>
) {
    return {
        char: "[[",
        items: ({ query }: { query: string }) => {
            const items = literatureRef.current
            return items
                .filter(
                    (item) =>
                        item.title.toLowerCase().includes(query.toLowerCase()) ||
                        (item.authors ?? "").toLowerCase().includes(query.toLowerCase())
                )
                .slice(0, 6)
        },

        render: () => {
            let component: ReactRenderer<MentionListRef> | null = null
            let popup: TippyInstance[] | null = null

            return {
                onStart: (props: any) => {
                    component = new ReactRenderer(LiteratureMentionList, {
                        props,
                        editor: props.editor,
                    })

                    if (!props.clientRect) return

                    popup = tippy("body", {
                        getReferenceClientRect: props.clientRect,
                        appendTo: () => document.body,
                        content: component.element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: "manual",
                        placement: "bottom-start",
                    })
                },

                onUpdate(props: any) {
                    component?.updateProps(props)
                    if (!props.clientRect) return
                    popup?.[0]?.setProps({
                        getReferenceClientRect: props.clientRect,
                    })
                },

                onKeyDown(props: any) {
                    if (props.event.key === "Escape") {
                        popup?.[0]?.hide()
                        return true
                    }
                    return component?.ref?.onKeyDown(props) ?? false
                },

                onExit() {
                    popup?.[0]?.destroy()
                    component?.destroy()
                },
            }
        },
    }
}

export const LiteratureMention = Mention.extend({
    name: "literatureMention",

    parseHTML() {
        return [{ tag: `a[data-literature-id]` }]
    },

    renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: any }) {
        return [
            "a",
            {
                ...HTMLAttributes,
                href: `/literature-reviews/${node.attrs.id}`,
                "data-literature-id": node.attrs.id,
                class: "mention-literature",
            },
            `@${node.attrs.label ?? node.attrs.id}`,
        ]
    },
})

export function createLiteratureMentionExtension(
    literatureRef: MutableRefObject<LiteratureItem[]>
) {
    return LiteratureMention.configure({
        HTMLAttributes: {
            class: "mention-literature",
        },
        suggestion: createLiteratureSuggestion(literatureRef),
        renderLabel({ node }: { node: any }) {
            return `@${node.attrs.label ?? node.attrs.id}`
        },
    })
}

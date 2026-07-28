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

export interface SampleItem {
    id: string
    sample_code: string
    sample_type?: string | null
    quantity?: number | null
    quantity_unit?: string | null
}

interface MentionListProps {
    items: SampleItem[]
    command: (item: { id: string; label: string }) => void
}

interface MentionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const SampleMentionList = forwardRef<MentionListRef, MentionListProps>(
    (props, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0)

        const selectItem = (index: number) => {
            const item = props.items[index]
            if (item) {
                props.command({ id: item.id, label: item.sample_code })
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
            <div className="bg-popover border rounded-md shadow-md overflow-hidden max-h-[200px] overflow-y-auto">
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
                                "w-full text-left px-3 py-2 text-sm flex flex-col hover:bg-accent",
                                index === selectedIndex && "bg-accent"
                            )}
                        >
                            <span className="font-medium text-foreground">{item.sample_code}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <span>{item.sample_type || "Unknown Type"}</span>
                                {item.quantity != null && (
                                    <>
                                        <span>•</span>
                                        <span>{item.quantity} {item.quantity_unit || ""}</span>
                                    </>
                                )}
                            </span>
                        </button>
                    ))
                ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                        No samples found
                    </div>
                )}
            </div>
        )
    }
)

SampleMentionList.displayName = "SampleMentionList"

// Create suggestion config that uses a ref to access current samples
export function createSampleSuggestion(
    samplesRef: MutableRefObject<SampleItem[]>
) {
    return {
        char: "$",
        items: ({ query }: { query: string }) => {
            const samples = samplesRef.current
            return samples
                .filter((item) =>
                    item.sample_code.toLowerCase().includes(query.toLowerCase())
                )
                .slice(0, 5)
        },

        render: () => {
            let component: ReactRenderer<MentionListRef> | null = null
            let popup: TippyInstance[] | null = null

            return {
                onStart: (props: any) => {
                    component = new ReactRenderer(SampleMentionList, {
                        props,
                        editor: props.editor,
                    })

                    if (!props.clientRect) {
                        return
                    }

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

                    if (!props.clientRect) {
                        return
                    }

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

// Create a custom Mention extension for samples
export const SampleMention = Mention.extend({
    name: "sampleMention",

    parseHTML() {
        return [
            {
                tag: `a[data-sample-id]`,
            },
        ]
    },

    renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: any }) {
        return [
            "a",
            {
                ...HTMLAttributes,
                href: `/samples/${node.attrs.id}`,
                "data-sample-id": node.attrs.id,
                class: "mention-sample",
            },
            `$${node.attrs.label ?? node.attrs.id}`,
        ]
    },
})

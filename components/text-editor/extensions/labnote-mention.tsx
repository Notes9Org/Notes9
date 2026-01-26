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

export interface LabNoteItem {
    id: string
    title: string
    experimentName?: string | null
}

interface MentionListProps {
    items: LabNoteItem[]
    command: (item: { id: string; label: string }) => void
}

interface MentionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const LabNoteMentionList = forwardRef<MentionListRef, MentionListProps>(
    (props, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0)

        const selectItem = (index: number) => {
            const item = props.items[index]
            if (item) {
                props.command({ id: item.id, label: item.title })
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
                            <span className="font-medium">{item.title}</span>
                            {item.experimentName && (
                                <span className="text-xs text-muted-foreground">
                                    {item.experimentName}
                                </span>
                            )}
                        </button>
                    ))
                ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                        No lab notes found
                    </div>
                )}
            </div>
        )
    }
)

LabNoteMentionList.displayName = "LabNoteMentionList"

// Create suggestion config that uses a ref to access current lab notes
export function createLabNoteSuggestion(
    labNotesRef: MutableRefObject<LabNoteItem[]>
) {
    return {
        char: "#",
        items: ({ query }: { query: string }) => {
            const labNotes = labNotesRef.current
            return labNotes
                .filter((item) =>
                    item.title.toLowerCase().includes(query.toLowerCase())
                )
                .slice(0, 5)
        },

        render: () => {
            let component: ReactRenderer<MentionListRef> | null = null
            let popup: TippyInstance[] | null = null

            return {
                onStart: (props: any) => {
                    component = new ReactRenderer(LabNoteMentionList, {
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

// Create a custom Mention extension for lab notes
export const LabNoteMention = Mention.extend({
    name: "labNoteTag",

    parseHTML() {
        return [
            {
                tag: `a[data-labnote-id]`,
            },
        ]
    },

    renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: any }) {
        return [
            "a",
            {
                ...HTMLAttributes,
                href: `/lab-notes/${node.attrs.id}`,
                "data-labnote-id": node.attrs.id,
                class: "mention-labnote",
            },
            `#${node.attrs.label ?? node.attrs.id}`,
        ]
    },
})

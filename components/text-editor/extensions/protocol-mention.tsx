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

export interface ProtocolItem {
    id: string
    name: string
    version?: string | null
}

interface MentionListProps {
    items: ProtocolItem[]
    command: (item: { id: string; label: string }) => void
}

interface MentionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
    (props, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0)

        const selectItem = (index: number) => {
            const item = props.items[index]
            if (item) {
                props.command({ id: item.id, label: item.name })
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
                                "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent",
                                index === selectedIndex && "bg-accent"
                            )}
                        >
                            <span className="font-medium">{item.name}</span>
                            {item.version && (
                                <span className="text-xs text-muted-foreground">
                                    v{item.version}
                                </span>
                            )}
                        </button>
                    ))
                ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                        No protocols linked. Add protocols above first.
                    </div>
                )}
            </div>
        )
    }
)

MentionList.displayName = "MentionList"

// Create suggestion config that uses a ref to access current protocols
export function createProtocolSuggestion(
    protocolsRef: MutableRefObject<ProtocolItem[]>
) {
    return {
        items: ({ query }: { query: string }) => {
            const protocols = protocolsRef.current
            return protocols
                .filter((item) =>
                    item.name.toLowerCase().includes(query.toLowerCase())
                )
                .slice(0, 5)
        },

        render: () => {
            let component: ReactRenderer<MentionListRef> | null = null
            let popup: TippyInstance[] | null = null

            return {
                onStart: (props: any) => {
                    component = new ReactRenderer(MentionList, {
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

// Create a custom Mention extension that renders as clickable links
export const ProtocolMention = Mention.extend({
    name: "protocolMention",

    parseHTML() {
        return [
            {
                tag: `a[data-protocol-id]`,
            },
        ]
    },

    renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: any }) {
        return [
            "a",
            {
                ...HTMLAttributes,
                href: `/protocols/${node.attrs.id}`,
                "data-protocol-id": node.attrs.id,
                class: "mention-protocol",
            },
            `@${node.attrs.label ?? node.attrs.id}`,
        ]
    },
})

// Configure the Protocol Mention extension with the ref-based suggestion
export function createProtocolMentionExtension(
    protocolsRef: MutableRefObject<ProtocolItem[]>
) {
    return ProtocolMention.configure({
        HTMLAttributes: {
            class: "mention-protocol",
        },
        suggestion: createProtocolSuggestion(protocolsRef),
        renderLabel({ node }: { node: any }) {
            return `@${node.attrs.label ?? node.attrs.id}`
        },
    })
}


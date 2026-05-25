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
import { FileText, FlaskConical } from "lucide-react"

export interface EntityItem {
    id: string
    name: string
    type: "protocol" | "sample"
    version?: string | null
    sample_code?: string | null
}

interface MentionListProps {
    items: EntityItem[]
    command: (item: { id: string; label: string; type: string }) => void
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
                props.command({ id: item.id, label: item.name || item.sample_code || "Unnamed", type: item.type })
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
                            {item.type === "protocol" ? (
                                <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                            ) : (
                                <FlaskConical className="h-4 w-4 text-emerald-500 shrink-0" />
                            )}
                            <span className="font-medium truncate">{item.name || item.sample_code || "Unnamed"}</span>
                            {item.type === "protocol" && item.version && (
                                <span className="text-xs text-muted-foreground shrink-0 border rounded px-1">
                                    v{item.version}
                                </span>
                            )}
                            {item.type === "sample" && item.sample_code && (
                                <span className="text-xs text-muted-foreground shrink-0 border rounded px-1">
                                    {item.sample_code}
                                </span>
                            )}
                        </button>
                    ))
                ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                        No matches found.
                    </div>
                )}
            </div>
        )
    }
)

MentionList.displayName = "MentionList"

// Create suggestion config that uses a ref to access current entities
export function createEntitySuggestion(
    entitiesRef: MutableRefObject<EntityItem[]>
) {
    return {
        items: ({ query }: { query: string }) => {
            const entities = entitiesRef.current
            return entities
                .filter((item) => {
                    try {
                        if (!item) return false;
                        const n = item.name || item.sample_code || "Unnamed";
                        const q = query || "";
                        return String(n).toLowerCase().includes(String(q).toLowerCase());
                    } catch (e) {
                        console.error("Mention filter error:", e);
                        return false;
                    }
                })
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
export const EntityMention = Mention.extend({
    name: "entityMention",

    parseHTML() {
        return [
            {
                tag: `a[data-entity-id]`,
            },
            {
                tag: `a[data-protocol-id]`, // Legacy support
            }
        ]
    },

    renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: any }) {
        const entityType = node.attrs.type || "protocol" // Fallback for legacy
        const href = entityType === "protocol" ? `/protocols/${node.attrs.id}` : `/samples/${node.attrs.id}`
        
        return [
            "a",
            {
                ...HTMLAttributes,
                href: href,
                "data-entity-id": node.attrs.id,
                "data-entity-type": entityType,
                class: `mention-${entityType}`,
            },
            `@${node.attrs.label ?? node.attrs.id}`,
        ]
    },
})

// Configure the Entity Mention extension with the ref-based suggestion
export function createEntityMentionExtension(
    entitiesRef: MutableRefObject<EntityItem[]>
) {
    return EntityMention.configure({
        HTMLAttributes: {
            class: "mention-entity",
        },
        suggestion: createEntitySuggestion(entitiesRef),
        renderLabel({ node }: { node: any }) {
            return `@${node.attrs.label ?? node.attrs.id}`
        },
    })
}


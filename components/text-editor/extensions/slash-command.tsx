"use client"

import { Extension, type Editor, type Range } from "@tiptap/core"
import { ReactRenderer } from "@tiptap/react"
import Suggestion from "@tiptap/suggestion"
import { PluginKey } from "@tiptap/pm/state"
import tippy, { Instance as TippyInstance } from "tippy.js"
import {
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type ComponentType,
    type MutableRefObject,
    type Ref,
} from "react"
import {
    TextHOne as HeadingOneIcon,
    TextHTwo as HeadingTwoIcon,
    TextHThree as HeadingThreeIcon,
    ListBullets as BulletListIcon,
    ListNumbers as OrderedListIcon,
    ListChecks as TaskListIcon,
    Table as TableIcon,
    ImageSquare as ImageIcon,
    GridNine as SpreadsheetIcon,
    Sigma as EquationIcon,
    Code as CodeBlockIcon,
    Quotes as QuoteIcon,
    Minus as DividerIcon,
    Scissors as PageBreakIcon,
    Columns as ColumnsIcon,
} from "@phosphor-icons/react/ssr"
import { cn } from "@/lib/utils"

/**
 * Host-owned insert actions the slash menu can trigger. These live in the editor
 * component (they open dialogs / file pickers), so the extension reads them
 * through a ref — same pattern as entitiesRef / labNotesRef for the mentions.
 * An action left undefined simply hides its menu item.
 */
export interface SlashCommandActions {
    insertImage?: () => void
    insertSpreadsheet?: () => void
    insertEquation?: () => void
}

interface SlashItem {
    title: string
    subtitle?: string
    keywords: string[]
    group: string
    Icon: ComponentType<{ className?: string }>
    command: (ctx: { editor: Editor; range: Range }) => void
}

function buildItems(actions: SlashCommandActions): SlashItem[] {
    const items: SlashItem[] = [
        {
            title: "Heading 1",
            subtitle: "Section title",
            keywords: ["h1", "title", "heading", "large"],
            group: "Basic blocks",
            Icon: HeadingOneIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
        },
        {
            title: "Heading 2",
            subtitle: "Subsection title",
            keywords: ["h2", "subtitle", "heading", "medium"],
            group: "Basic blocks",
            Icon: HeadingTwoIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
        },
        {
            title: "Heading 3",
            subtitle: "Minor heading",
            keywords: ["h3", "heading", "small"],
            group: "Basic blocks",
            Icon: HeadingThreeIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
        },
        {
            title: "Quote",
            subtitle: "Callout or citation",
            keywords: ["blockquote", "citation", "cite"],
            group: "Basic blocks",
            Icon: QuoteIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
        },
        {
            title: "Code block",
            subtitle: "Script or raw output",
            keywords: ["code", "snippet", "script", "monospace", "pre"],
            group: "Basic blocks",
            Icon: CodeBlockIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
        },
        {
            title: "Divider",
            subtitle: "Horizontal rule",
            keywords: ["hr", "separator", "line", "rule", "break"],
            group: "Basic blocks",
            Icon: DividerIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
        },
        {
            title: "Bulleted list",
            keywords: ["bullet", "unordered", "ul", "list"],
            group: "Lists",
            Icon: BulletListIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).toggleBulletList().run(),
        },
        {
            title: "Numbered list",
            keywords: ["ordered", "ol", "numbers", "steps", "list"],
            group: "Lists",
            Icon: OrderedListIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
        },
        {
            title: "Task list",
            subtitle: "Checkboxes for protocol steps",
            keywords: ["todo", "checkbox", "check", "tasks", "list"],
            group: "Lists",
            Icon: TaskListIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).toggleTaskList().run(),
        },
        {
            title: "Table",
            subtitle: "3 × 3 with header row",
            keywords: ["grid", "rows", "columns", "data"],
            group: "Insert",
            Icon: TableIcon,
            command: ({ editor, range }) =>
                editor
                    .chain()
                    .focus()
                    .deleteRange(range)
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run(),
        },
    ]

    if (actions.insertImage) {
        items.push({
            title: "Image",
            subtitle: "Upload, URL or camera",
            keywords: ["picture", "photo", "figure", "gel", "micrograph", "upload"],
            group: "Insert",
            Icon: ImageIcon,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).run()
                actions.insertImage?.()
            },
        })
    }

    if (actions.insertSpreadsheet) {
        items.push({
            title: "Spreadsheet",
            subtitle: "Embed .xlsx / .csv",
            keywords: ["excel", "xlsx", "csv", "sheet", "data"],
            group: "Insert",
            Icon: SpreadsheetIcon,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).run()
                actions.insertSpreadsheet?.()
            },
        })
    }

    if (actions.insertEquation) {
        items.push({
            title: "Equation",
            subtitle: "LaTeX / KaTeX",
            keywords: ["math", "latex", "katex", "formula", "sigma"],
            group: "Insert",
            Icon: EquationIcon,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).run()
                actions.insertEquation?.()
            },
        })
    }

    items.push(
        {
            title: "Columns",
            subtitle: "Two-column layout",
            keywords: ["column", "layout", "split", "side by side"],
            group: "Layout",
            Icon: ColumnsIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).setColumns(2).run(),
        },
        {
            title: "Page break",
            subtitle: "Start a new printed page",
            keywords: ["page", "break", "print", "pagination"],
            group: "Layout",
            Icon: PageBreakIcon,
            command: ({ editor, range }) =>
                editor.chain().focus().deleteRange(range).setPageBreak().run(),
        }
    )

    return items
}

interface SlashCommandListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface SlashCommandListProps {
    items: SlashItem[]
    command: (item: SlashItem) => void
    ref?: Ref<SlashCommandListRef>
}

function SlashCommandList({ items, command, ref }: SlashCommandListProps) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

    const selectItem = (index: number) => {
        const item = items[index]
        if (item) {
            command(item)
        }
    }

    const upHandler = () => {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length)
    }

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % items.length)
    }

    useEffect(() => setSelectedIndex(0), [items])

    useEffect(() => {
        itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" })
    }, [selectedIndex])

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (!items.length) {
                return false
            }
            if (event.key === "ArrowUp") {
                upHandler()
                return true
            }
            if (event.key === "ArrowDown") {
                downHandler()
                return true
            }
            if (event.key === "Enter") {
                selectItem(selectedIndex)
                return true
            }
            return false
        },
    }))

    return (
        <div className="bg-popover border rounded-md shadow-md overflow-hidden max-h-80 overflow-y-auto w-72 py-1">
            {items.length ? (
                items.map((item, index) => {
                    const showGroup = index === 0 || items[index - 1].group !== item.group
                    return (
                        <div key={item.title}>
                            {showGroup && (
                                <div className="px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {item.group}
                                </div>
                            )}
                            <button
                                ref={(el) => {
                                    itemRefs.current[index] = el
                                }}
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
                                <item.Icon className="size-4 shrink-0 text-muted-foreground" />
                                <span className="font-medium truncate text-foreground">
                                    {item.title}
                                </span>
                                {item.subtitle && (
                                    <span className="text-xs text-muted-foreground truncate ml-auto">
                                        {item.subtitle}
                                    </span>
                                )}
                            </button>
                        </div>
                    )
                })
            ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                    No blocks found.
                </div>
            )}
        </div>
    )
}

export function createSlashSuggestion(
    actionsRef?: MutableRefObject<SlashCommandActions>
) {
    return {
        char: "/",
        // The slash must open the line. Without this, "and/or" mid-sentence would
        // pop the menu open. `allow` additionally keeps it out of headings, code
        // blocks and any non-paragraph block.
        startOfLine: true,
        allow: ({ state, range }: { state: any; range: Range }) =>
            state.doc.resolve(range.from).parent.type.name === "paragraph",

        items: ({ query }: { query: string }) => {
            const all = buildItems(actionsRef?.current ?? {})
            const q = (query || "").toLowerCase().trim()
            if (!q) return all
            return all.filter(
                (item) =>
                    item.title.toLowerCase().includes(q) ||
                    item.keywords.some((keyword) => keyword.includes(q))
            )
        },

        command: ({
            editor,
            range,
            props,
        }: {
            editor: Editor
            range: Range
            props: SlashItem
        }) => {
            props.command({ editor, range })
        },

        render: () => {
            let component: ReactRenderer<SlashCommandListRef> | null = null
            let popup: TippyInstance[] | null = null

            return {
                onStart: (props: any) => {
                    component = new ReactRenderer(SlashCommandList, {
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
                        showOnCreate: props.items.length > 0,
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

                    if (props.items.length === 0) {
                        popup?.[0]?.hide()
                    } else {
                        popup?.[0]?.show()
                    }
                },

                onKeyDown(props: any) {
                    if (props.event.key === "Escape") {
                        popup?.[0]?.hide()
                        return true
                    }

                    // Hidden popup (query matched nothing): let keys through so
                    // Enter still inserts a newline instead of being swallowed.
                    if (!popup?.[0]?.state.isVisible) {
                        return false
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

export const SlashCommand = Extension.create<{ suggestion: Record<string, any> }>({
    name: "slashCommand",

    addOptions() {
        return {
            suggestion: createSlashSuggestion(),
        }
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                pluginKey: new PluginKey("slashCommand"),
                ...this.options.suggestion,
            }),
        ]
    },
})

export function createSlashCommandExtension(
    actionsRef?: MutableRefObject<SlashCommandActions>
) {
    return SlashCommand.configure({
        suggestion: createSlashSuggestion(actionsRef),
    })
}

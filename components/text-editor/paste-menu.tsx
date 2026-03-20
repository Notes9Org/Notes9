import { Editor } from "@tiptap/react"
import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
    Clipboard,
    FileText,
    RemoveFormatting,
    X,
    Type
} from "lucide-react"

interface PasteMenuProps {
    editor: Editor
}

export const PasteMenu = ({ editor }: PasteMenuProps) => {
    const [isOpen, setIsOpen] = useState(false)
    const [position, setPosition] = useState({ top: 0, left: 0 })
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!editor) return

        const update = () => {
            const storage = (editor.storage as any).pasteHandler
            if (storage?.isPasteMenuOpen && storage.lastPasteRange) {
                setIsOpen(true)

                try {
                    const { to } = storage.lastPasteRange
                    // Get coordinates for the end of the paste
                    const coords = editor.view.coordsAtPos(to)

                    // Use viewport coordinates directly since we use fixed position
                    // Adjust for menu height/width if needed, or just place below cursor
                    setPosition({
                        top: coords.bottom + 5,
                        left: coords.left
                    })
                } catch (e) {
                    // Fallback if coordsAtPos fails (e.g. if range is invalid)
                    setIsOpen(false)
                }
            } else {
                setIsOpen(false)
            }
        }

        // Subscribe to transaction to react to storage changes
        editor.on('transaction', update)
        // Also update on selection change or focus? 
        // Mainly transaction is enough because checking storage.

        // Initial check
        update()

        return () => {
            editor.off('transaction', update)
        }
    }, [editor])

    // Click outside to close
    useEffect(() => {
        if (!isOpen) return

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                // If clicking inside editor, the paste handler might want to keep it open?
                // Actually, usually interacting with anything else should close the menu.
                // Tiptap's BubbleMenu closes on selection change.
                // We close on explicit outside click.
                editor.chain().focus().pasteCloseMenu().run()
            }
        }

        // Defer adding listener to avoid immediate close on the paste event/click
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 100)

        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen, editor])

    if (!isOpen) return null

    return (
        <div
            ref={menuRef}
            className="fixed z-50 flex flex-col gap-1 p-1 bg-background border border-border rounded-lg shadow-lg animate-in fade-in zoom-in-95 duration-200"
            style={{
                top: position.top,
                left: position.left,
                maxWidth: '200px'
            }}
        >
            <div className="flex items-center justify-between px-2 py-1 border-b border-border/50 mb-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Paste Options</span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-2 hover:bg-muted"
                    onClick={() => {
                        console.log('PasteMenu: X clicked')
                        editor.chain().focus().pasteCloseMenu().run()
                    }}
                >
                    <X className="h-3 w-3" />
                </Button>
            </div>

            <Button
                variant="ghost"
                size="sm"
                className="justify-start h-8 px-2 text-xs font-normal"
                onClick={() => {
                    console.log('PasteMenu: Keep Source clicked')
                    editor.chain().focus().pasteApplyOption('keep-source').run()
                }}
            >
                <Clipboard className="mr-2 h-3.5 w-3.5 text-blue-500" />
                Keep Source
            </Button>

            <Button
                variant="ghost"
                size="sm"
                className="justify-start h-8 px-2 text-xs font-normal"
                onClick={() => {
                    console.log('PasteMenu: Merge Formatting clicked')
                    editor.chain().focus().pasteApplyOption('merge-formatting').run()
                }}
            >
                <RemoveFormatting className="mr-2 h-3.5 w-3.5 text-orange-500" />
                Merge Formatting
            </Button>

            <Button
                variant="ghost"
                size="sm"
                className="justify-start h-8 px-2 text-xs font-normal"
                onClick={() => {
                    console.log('PasteMenu: Keep Text clicked')
                    editor.chain().focus().pasteApplyOption('keep-text').run()
                }}
            >
                <FileText className="mr-2 h-3.5 w-3.5 text-green-500" />
                Keep Text Only
            </Button>
        </div>
    )
}

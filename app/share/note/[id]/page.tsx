"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { Loader2, AlertCircle, Calendar, Clock, Globe } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

type PublicNote = {
    title: string
    content: string
    updatedAt: string
}

export default function PublicNotePage() {
    const { id } = useParams()
    const [note, setNote] = useState<PublicNote | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchNote = async () => {
            try {
                setLoading(true)
                const supabase = createClient()

                // Fetch JSON directly from public storage bucket
                const { data, error } = await supabase.storage
                    .from('lab_notes_public')
                    .download(`${id}.json`)

                if (error) {
                    if (error.message.includes("Object not found")) {
                        throw new Error("This note has not been published or does not exist.")
                    }
                    throw error
                }

                const text = await data.text()
                const noteData = JSON.parse(text)
                setNote(noteData)
            } catch (err: any) {
                console.error("Error fetching note:", err)
                setError(err.message || "Failed to load the note.")
            } finally {
                setLoading(false)
            }
        }

        if (id) {
            fetchNote()
        }
    }, [id])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4 bg-background">
                <Alert variant="destructive" className="max-w-md shadow-lg">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        )
    }

    if (!note) return null

    return (
        <div className="min-h-screen bg-background">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto max-w-5xl px-4 h-14 flex items-center justify-between relative">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
                            <Globe className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-semibold text-sm hidden sm:inline-block">Lab Note Preview</span>
                    </div>

                    <div className="flex items-center gap-2">

                        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Live Updates Active"></span>
                        <p className="text-[10px] font-medium text-muted-foreground leading-none">
                            Powered by <span className="flex items-center gap-2">Notes9</span>
                        </p>
                    </div>
                </div>
            </header>

            <main className="container mx-auto max-w-4xl px-4 py-8 md:py-12 animate-in fade-in duration-500 slide-in-from-bottom-4">
                {/* Header Section */}
                <div className="mb-8 space-y-4">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">{note.title}</h1>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(note.updatedAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            <span>{new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <Badge variant="secondary" className="font-normal">
                            Published Version
                        </Badge>
                    </div>
                </div>

                <Separator className="my-8" />

                {/* Content Section */}
                <div className="prose prose-lg dark:prose-invert max-w-none pb-24">
                    <TiptapEditor
                        content={note.content}
                        editable={false}
                        hideToolbar={true}
                        className="min-h-[60vh] border-none shadow-none bg-transparent px-0"
                    />
                </div>
            </main>
        </div>
    )
}

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
                // Fetch JSON directly from public storage bucket with cache-busting
                const supabase = createClient()
                const { data: urlData } = supabase.storage
                    .from('lab_notes_public')
                    .getPublicUrl(`${id}.json`)

                // Add timestamp to bypass browser/CDN cache
                const response = await fetch(`${urlData.publicUrl}?t=${Date.now()}`, {
                    cache: 'no-store'
                })

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error("This note has not been published or does not exist.")
                    }
                    throw new Error("Failed to fetch note")
                }

                const noteData = await response.json()
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
            {/* Top Navigation Bar - Scrolls with content */}
            <header className="w-full border-b bg-background">
                <div className="w-full px-4 md:px-8 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
                            <Globe className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-semibold text-sm hidden sm:inline-block">Lab Note Preview</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Live Updates Active"></span>
                        <p className="text-[10px] font-medium text-muted-foreground leading-none">
                            Powered by <span className="font-bold text-foreground">Notes9</span>
                        </p>
                    </div>
                </div>
            </header>

            {/* Main content - Full width */}
            <main className="w-full px-4 md:px-8 py-8 md:py-12">
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

                {/* Content Section - Full width */}
                <div className="w-full">
                    <TiptapEditor
                        content={note.content}
                        editable={false}
                        hideToolbar={true}
                        className="min-h-[70vh] border-none shadow-none bg-transparent"
                    />
                </div>
            </main>
        </div>
    )
}

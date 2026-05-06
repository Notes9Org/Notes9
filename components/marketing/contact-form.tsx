"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Loader2, Send } from "lucide-react"
import { useEffect, useState } from "react"

const formSchema = z.object({
    email: z.string().email({
        message: "Please enter a valid email address.",
    }),
    subject: z.string().min(3, {
        message: "Subject must be at least 3 characters.",
    }),
    context: z.string().min(10, {
        message: "Message must be at least 10 characters.",
    }),
    company: z.string().optional(),
})

export function ContactForm() {
    const [mounted, setMounted] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            subject: "",
            context: "",
            company: "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            })

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.error || "Could not send your message.")
            }

            toast.success("Message sent", {
                description: "Your note has been delivered to admin@notes9.com.",
            })
            form.reset()
        } catch (error) {
            toast.error("Message not sent", {
                description: error instanceof Error ? error.message : "Please try again in a moment.",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!mounted) {
        return (
            <div className="rounded-2xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm dark:bg-card/60 sm:p-8">
                <div className="mb-6">
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        <Send className="h-4 w-4 text-[var(--n9-accent)]" />
                        Book a workflow conversation
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Tell us about your lab and where friction shows up today. Messages go to admin@notes9.com.
                    </p>
                </div>
                <div className="space-y-5" aria-hidden="true">
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <div className="grid gap-2">
                            <div className="h-4 w-16 rounded bg-muted/70" />
                            <div className="h-9 rounded-md border border-border/60 bg-muted/40" />
                        </div>
                        <div className="grid gap-2">
                            <div className="h-4 w-20 rounded bg-muted/70" />
                            <div className="h-9 rounded-md border border-border/60 bg-muted/40" />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <div className="h-4 w-20 rounded bg-muted/70" />
                        <div className="min-h-[120px] rounded-md border border-border/60 bg-muted/40" />
                    </div>
                    <div className="flex justify-end">
                        <div className="h-10 w-full rounded-full bg-[var(--n9-accent)]/80 md:w-40" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="rounded-2xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm dark:bg-card/60 sm:p-8">
            <div className="mb-6">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Send className="h-4 w-4 text-[var(--n9-accent)]" />
                    Book a workflow conversation
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Tell us about your lab and where friction shows up today. Messages go to admin@notes9.com.
                </p>
            </div>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register("company")} />
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input placeholder="you@example.com" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="subject"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Subject</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Workflow walkthrough for our lab" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <FormField
                        control={form.control}
                        name="context"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Message</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Describe your team, current tools, and where research context or reporting gets difficult."
                                        className="min-h-[120px] resize-none"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="flex justify-end">
                        <div className="w-full md:w-auto">
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full rounded-full bg-[var(--n9-accent)] text-white transition-all ease-in-out hover:scale-[1.02] hover:bg-[var(--n9-accent-hover)] active:scale-95"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        Send Message
                                        <Send className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            </Form>
        </div>
    )
}

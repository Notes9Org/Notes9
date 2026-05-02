"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

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
import { cn } from "@/lib/utils"

const ROLE_OPTIONS = [
  "Postdoc / PhD researcher",
  "Principal Investigator",
  "Research Scientist",
  "Biotech founder / CSO",
  "Lab manager",
  "Other",
] as const

const formSchema = z.object({
  firstName: z.string().min(1, "First name is required.").max(80),
  lastName: z.string().min(1, "Last name is required.").max(80),
  email: z.string().email("Enter a valid work email."),
  institution: z.string().min(1, "Institution or company is required.").max(200),
  role: z.string().min(1, "Select your role."),
  message: z.string().min(10, "Please share at least a few sentences (10+ characters).").max(5000),
  company: z.string().max(200).optional(),
})

type FormValues = z.infer<typeof formSchema>

const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"

export function PricingGetInTouchForm({ className }: { className?: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      institution: "",
      role: "",
      message: "",
      company: "",
    },
  })

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true)
    const subject =
      `Pricing — ${values.firstName} ${values.lastName} — ${values.institution}`.slice(0, 160)
    const context = [
      `Name: ${values.firstName} ${values.lastName}`,
      `Email: ${values.email}`,
      `Institution: ${values.institution}`,
      `Role: ${values.role}`,
      "",
      "What they're working on:",
      values.message.trim(),
    ].join("\n")

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          subject,
          context,
          company: values.company ?? "",
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Could not send your message.")
      }

      toast.success("Message sent", {
        description: "We’ll get back to you within 24 hours.",
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

  return (
    <div
      className={cn(
        "marketing-glass-surface rounded-[14px] border border-border/60 bg-card/95 p-6 text-left shadow-md backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/85 dark:shadow-xl",
        className,
      )}
    >
      <div className="mb-5">
        <h3 className="font-sans text-base font-semibold tracking-tight text-foreground">Get in touch</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Tell us about your lab. We&apos;ll get back within 24 hours.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register("company")} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className={labelClass}>First name</FormLabel>
                  <FormControl>
                    <Input placeholder="Sarah" className="h-9 text-[13px]" autoComplete="given-name" {...field} />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className={labelClass}>Last name</FormLabel>
                  <FormControl>
                    <Input placeholder="Chen" className="h-9 text-[13px]" autoComplete="family-name" {...field} />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={labelClass}>Work email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="sarah@labname.com"
                    className="h-9 text-[13px]"
                    autoComplete="email"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="institution"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={labelClass}>Institution or company</FormLabel>
                <FormControl>
                  <Input
                    placeholder="University / Biotech name"
                    className="h-9 text-[13px]"
                    autoComplete="organization"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={labelClass}>Role</FormLabel>
                <FormControl>
                  <select
                    className={cn(
                      "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-[13px] shadow-xs outline-none transition-[color,box-shadow]",
                      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
                    )}
                    {...field}
                  >
                    <option value="">Select your role</option>
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={labelClass}>Message</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Tell us about your current research and tools you use today..."
                    className="min-h-[80px] resize-none text-[13px]"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 h-11 w-full rounded-lg bg-[var(--n9-accent)] text-sm font-medium text-primary-foreground shadow-[0_8px_24px_-8px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)] disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>Send message</>
            )}
          </Button>

          <p className="pt-1 text-center text-[11px] text-muted-foreground">We never share your information.</p>
        </form>
      </Form>
    </div>
  )
}

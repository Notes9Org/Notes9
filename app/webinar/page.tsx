"use client"

import { useState } from "react"
import { ArrowUpRight, CheckCircle2, Instagram, Linkedin, Loader2, Mail, Youtube } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ModeToggle } from "@/components/mode-toggle"
import { InteractiveParticles } from "@/components/ui/interactive-particles"

const WEBINAR_TITLE = 'Making AI Reliable for Researchers'

// Social links mirror components/marketing/footer.tsx.
const SOCIALS: {
  label: string
  href: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  { label: "Instagram", href: "https://www.instagram.com/notes9_ai/", Icon: Instagram },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/notes9", Icon: Linkedin },
  { label: "YouTube", href: "https://www.youtube.com/@Notes9-catalyst", Icon: Youtube },
]

function Header() {
  return (
    <div className="p-4 text-center relative">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <a
        href="https://notes9.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 mx-auto mb-2 hover:opacity-80 transition-opacity"
      >
        <img src="/notes9-logo.png" alt="Notes9" className="h-10" />
        <span className="text-xl font-bold">Notes9</span>
      </a>
    </div>
  )
}

function ConnectRow() {
  return (
    <div className="text-center">
      <p className="text-sm font-medium text-muted-foreground">Connect with us</p>
      <div className="mt-3 flex items-center justify-center gap-3">
        {SOCIALS.map(({ label, href, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Icon className="h-5 w-5" />
          </a>
        ))}
      </div>
    </div>
  )
}

export default function WebinarPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [organization, setOrganization] = useState("")
  const [updates, setUpdates] = useState(true)
  const [company, setCompany] = useState("") // honeypot
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === "submitting") return
    setError(null)
    setStatus("submitting")

    try {
      const res = await fetch("/api/webinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, organization, updates, company }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Please try again.")
        setStatus("idle")
        return
      }
      setStatus("success")
    } catch {
      setError("Network error. Please check your connection and try again.")
      setStatus("idle")
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background relative overflow-hidden">
      <InteractiveParticles />

      {/* Overlays matching the survey/login page pattern */}
      <div className="absolute inset-0 z-0 bg-background/30 backdrop-blur-[1px]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_800px_at_center,theme(colors.background)_30%,transparent_100%)]" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <Header />

        <div className="flex flex-1 items-center justify-center px-4 pb-10">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-background/70 p-6 shadow-2xl backdrop-blur-md sm:p-8">
            {status === "success" ? (
              <div className="space-y-8">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h1 className="text-2xl font-bold">Thanks for registering!</h1>
                  <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
                    Your spot for{" "}
                    <span className="font-medium text-foreground">{WEBINAR_TITLE}</span>{" "}
                    is confirmed. You&apos;ll receive an email with the meeting link and
                    details shortly — keep an eye on your inbox.
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    Can&apos;t find it? Check your spam or promotions folder.
                  </p>

                  <a
                    href="https://notes9.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "outline", className: "mt-6" })}
                  >
                    Check out Notes9
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </a>
                  <p className="mt-2 text-xs text-muted-foreground">
                    While you wait, explore the AI research platform at notes9.com
                  </p>
                </div>

                <div className="border-t border-border/60 pt-6">
                  <ConnectRow />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Free live webinar
                  </p>
                  <h1 className="mt-1 text-2xl font-bold">{WEBINAR_TITLE}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Register below to save your spot. We&apos;ll email you the meeting link.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="organization">Institution / Organization</Label>
                    <Input
                      id="organization"
                      name="organization"
                      autoComplete="organization"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="Where you work or study (optional)"
                    />
                  </div>

                  {/* Honeypot — visually hidden, off-screen; real users never fill it. */}
                  <div aria-hidden className="absolute left-[-9999px] top-[-9999px]" tabIndex={-1}>
                    <label htmlFor="company">Company</label>
                    <input
                      id="company"
                      name="company"
                      autoComplete="off"
                      tabIndex={-1}
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </div>

                  <div className="flex items-start gap-3 pt-1">
                    <Checkbox
                      id="updates"
                      checked={updates}
                      onCheckedChange={(v) => setUpdates(v === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="updates" className="text-sm font-normal leading-snug text-muted-foreground">
                      Send me occasional updates on Notes9
                    </Label>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={status === "submitting"}
                  >
                    {status === "submitting" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Registering…
                      </>
                    ) : (
                      "Register"
                    )}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

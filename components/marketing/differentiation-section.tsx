"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"

export function DifferentiationSection() {
  return (
    <section className="bg-[var(--n9-accent-light)] dark:bg-muted/20">
      <div className="container mx-auto px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            See how Notes9 can work for your lab
          </h2>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            Walk us through your current workflow. We will show you where Notes9 saves time and reduces friction.
          </p>
          <div className="mt-8 flex justify-center items-center">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-[var(--n9-accent)] px-8 text-white shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]"
            >
              <Link href="/#contact">
                Request a demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

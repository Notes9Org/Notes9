"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { FlaskConical, Users, MessageCircle } from "lucide-react"

export default function PricingPage() {
  return (
    <div className="relative overflow-hidden py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="mx-auto max-w-4xl text-center mb-16">
          <Badge variant="secondary" className="mb-6 text-sm font-medium">
            <FlaskConical className="mr-2 h-4 w-4" />
            Early Access
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Notes9 Early Access & Collaboration
          </h1>

          <p className="mt-6 text-xl max-w-3xl mx-auto text-muted-foreground">
            Notes9 is currently being evaluated with a small number of research groups. Standard pricing has not yet
            been finalised; instead, we are working closely with early partners to shape the platform, usage model,
            and support structure around real laboratory workflows.
          </p>
        </div>

        {/* Two-column cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16">
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-3">How we are approaching pricing</h2>
            <p className="text-muted-foreground mb-3">
              Our goal is to design a pricing model that is sustainable for us while remaining realistic for academic
              laboratories, translational groups, and early-stage biotech teams.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
              <li>Transparent, usage-linked pricing once generally available</li>
              <li>No lock-in: clear data export and migration options</li>
              <li>Support for different organisational structures (labs, institutes, companies)</li>
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-bold mb-3">Design partner laboratories</h2>
            <p className="text-muted-foreground mb-3">
              During the early-access phase, we collaborate with a limited number of labs as design partners.
              These collaborations focus on:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
              <li>Mapping existing ELN and data workflows into Notes9</li>
              <li>Co-developing AI-assisted literature and analysis workflows</li>
              <li>Evaluating usability, reproducibility, and integration needs</li>
            </ul>
          </Card>
        </div>

        {/* Contact / CTA */}
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center">
            <div className="flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-blue-500 mr-2" />
              <h2 className="text-2xl font-bold">Interested in collaborating?</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              If you would like to explore using Notes9 in your group or discuss potential collaboration models,
              please reach out. We can share more detail on the current capabilities, roadmap, and options for
              early-access participation.
            </p>
            <a
              href="mailto:support@notes9.com"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Contact the team
            </a>
            <p className="mt-3 text-xs text-muted-foreground">
              Existing early-access users can continue to sign in through the main portal using the button in the
              navigation bar.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}


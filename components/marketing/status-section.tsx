"use client"

import { Database, FileSearch, LineChart } from "lucide-react"

export function StatusSection() {
  const values = [
    {
      icon: FileSearch,
      title: "Keep context attached to the work",
      description:
        "Literature, experiments, and decisions stay linked so your team spends less time searching and more time doing the science.",
    },
    {
      icon: Database,
      title: "Build a lab memory that grows with you",
      description:
        "Every record, source, and output is structured for retrieval. Context becomes easier to find as projects evolve, not harder.",
    },
    {
      icon: LineChart,
      title: "Report faster with connected evidence",
      description:
        "Move from active work into summaries, updates, and handoffs without reconstructing the evidence trail from scratch.",
    },
  ]

  return (
    <section className="border-t border-border/40">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Why teams choose Notes9
          </h2>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            Reduce workflow fragmentation, cut reporting overhead, and give your lab structured continuity.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-10 md:grid-cols-3">
          {values.map((item) => (
            <div key={item.title} className="flex flex-col items-center text-center">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
              <p className="mt-3 text-base leading-7 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

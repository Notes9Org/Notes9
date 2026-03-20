"use client"

export function FeaturesSection() {
  const metrics = [
    {
      value: "42%",
      label: "of faculty time on federally funded research goes to administrative burden rather than science.",
      source: "FDP Faculty Burden Survey",
    },
    {
      value: "~5 hrs",
      label: "per week estimated time researchers spend searching for or re-documenting context that should already be accessible.",
      source: "Nature & Elsevier workflow studies",
    },
    {
      value: "70%+",
      label: "of researchers surveyed by Nature said they tried and failed to reproduce another scientist's experiments.",
      source: "Nature reproducibility survey",
    },
  ]

  return (
    <section className="border-t border-border/40">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            The problem is real and measurable
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Fragmented workflows cost small labs real time and money every week.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-10 md:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.value} className="flex flex-col items-center text-center">
              <div className="text-4xl font-bold tracking-tight text-[var(--n9-accent)]">
                {m.value}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{m.label}</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
                {m.source}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

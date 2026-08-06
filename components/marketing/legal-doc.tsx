import type { ReactNode } from "react"

/**
 * Presentational primitives shared by the Terms and the Privacy Notice.
 *
 * These documents are long, cross-referenced and numbered, and the numbering has
 * to stay stable because both documents cite their own clauses ("as described in
 * clause 12.3") and the DPA cites them from outside. So section numbers are
 * passed in explicitly rather than derived from document order: renumbering by
 * accident is a legal problem, not a formatting one.
 *
 * `break-words` on the root is load-bearing on mobile. Legal prose carries long
 * unbreakable tokens (URLs, slash-joined lists, statute references) and at 390px
 * a single one of them is enough to push the whole page into horizontal scroll.
 */

export function LegalDoc({
  title,
  subtitle,
  updated,
  version,
  children,
}: {
  title: string
  subtitle: string
  updated: string
  version: string
  children: ReactNode
}) {
  return (
    <div className="prose dark:prose-invert max-w-none break-words">
      <header className="not-prose">
        <h1 className="font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-muted-foreground">{subtitle}</p>
        <dl className="mt-6 grid gap-x-8 gap-y-2 border-t border-border/60 pt-5 text-[14px] sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="font-medium text-foreground">Last updated</dt>
            <dd className="text-muted-foreground">{updated}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-foreground">Version</dt>
            <dd className="text-muted-foreground">{version}</dd>
          </div>
        </dl>
      </header>
      {children}
    </div>
  )
}

/** A top-level numbered clause. */
export function Clause({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: ReactNode
}) {
  return (
    <section id={`clause-${n}`} className="mt-10 scroll-mt-24">
      <h2 className="not-prose flex gap-3 font-serif text-[21px] leading-snug tracking-tight text-foreground sm:text-[24px]">
        <span className="shrink-0 font-sans text-[15px] font-semibold tabular-nums text-[var(--n9-accent)] sm:text-[16px]">
          {n}.
        </span>
        <span>{title}</span>
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-[1.75] text-foreground/85">{children}</div>
    </section>
  )
}

/** A sub-clause, numbered `parent.index`. */
export function SubClause({
  n,
  title,
  children,
}: {
  n: string
  title?: string
  children: ReactNode
}) {
  return (
    <div className="pt-2">
      {title ? (
        <h3 className="not-prose text-[15px] font-semibold text-foreground">
          <span className="mr-2 tabular-nums text-muted-foreground">{n}</span>
          {title}
        </h3>
      ) : null}
      <div className="mt-1.5 space-y-3">
        {title ? children : (
          <p>
            <span className="mr-2 font-medium tabular-nums text-muted-foreground">{n}</span>
            {children}
          </p>
        )}
      </div>
    </div>
  )
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-6">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

/** A two-column definition table, used for retention periods and lawful bases. */
export function DataTable({
  head,
  rows,
}: {
  head: string[]
  rows: ReactNode[][]
}) {
  return (
    <div className="not-prose -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[34rem] border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-semibold text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 align-top">
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 pr-4 leading-[1.6] text-foreground/85">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A boxed notice for the things a reader must not miss. */
export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="not-prose my-5 rounded-xl border border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] p-4 dark:bg-[var(--n9-accent)]/[0.07]">
      <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[var(--n9-accent)]">
        {title}
      </p>
      <div className="mt-2 space-y-2 text-[15px] leading-[1.7] text-foreground/85">{children}</div>
    </div>
  )
}

/** Jump list. Long documents are unusable without one. */
export function Contents({ items }: { items: string[] }) {
  return (
    <nav
      aria-label="Contents"
      className="not-prose mt-8 rounded-xl border border-border/60 bg-muted/30 p-5"
    >
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Contents
      </p>
      <ol className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {items.map((item, i) => (
          <li key={item} className="flex gap-2 text-[14px]">
            <span className="shrink-0 tabular-nums text-muted-foreground/70">{i + 1}.</span>
            <a
              href={`#clause-${i + 1}`}
              className="text-foreground/85 underline-offset-4 hover:text-[var(--n9-accent)] hover:underline"
            >
              {item}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Contact() {
  return (
    <a
      href="mailto:admin@notes9.com"
      className="text-[var(--n9-accent)] underline-offset-4 hover:underline"
    >
      admin@notes9.com
    </a>
  )
}

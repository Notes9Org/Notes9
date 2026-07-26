import { Check } from "@phosphor-icons/react/ssr"
import { cn } from "@/lib/utils"
import { BrowserFrame } from "@/components/marketing/browser-frame"

/**
 * One capability, shown as a real-UI experience: a concise eyebrow → headline →
 * benefit bullets on one side, and the actual product screenshot in a glass
 * browser frame (with a warm aurora glow) on the other. Sized to sit on one
 * screen inside a StackSection. `reverse` flips the image to the left.
 */
export function ShowcaseSection({
  eyebrow,
  title,
  description,
  points,
  image,
  imageAlt,
  reverse = false,
}: {
  eyebrow: string
  title: string
  description: string
  points: string[]
  image: string
  imageAlt: string
  reverse?: boolean
}) {
  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        {/* Copy */}
        <div className={cn("min-w-0", reverse ? "lg:order-2" : "lg:order-1")}>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/25 bg-[var(--n9-accent)]/[0.06] px-3 py-1 text-[12.5px] font-semibold uppercase tracking-[0.12em] text-[var(--n9-accent)]">
            {eyebrow}
          </span>
          <h2 className="mt-4 font-serif text-[2rem] font-bold leading-[1.12] tracking-tight text-foreground sm:text-[2.6rem] sm:leading-[1.08]">
            {title}
          </h2>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
            {description}
          </p>
          <ul className="mt-6 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[15px] text-foreground/90 sm:text-base">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--n9-accent)]/12 text-[var(--n9-accent)]">
                  <Check className="h-3.5 w-3.5" weight="bold" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Real UI in a glass frame */}
        <div className={cn("relative min-w-0", reverse ? "lg:order-1" : "lg:order-2")}>
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-full bg-[var(--n9-accent)]/[0.10] blur-[70px]" />
          <BrowserFrame src={image} alt={imageAlt} />
        </div>
      </div>
    </div>
  )
}

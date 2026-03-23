import { cn } from "@/lib/utils"
import { Notes9LoaderGif } from "@/components/brand/notes9-loader-gif"

interface Notes9MascotLoaderProps {
  className?: string
  title?: string
  description?: string
  size?: number
}

export function Notes9MascotLoader({
  className,
  title = "Searching with Notes9",
  description,
  size = 110,
}: Notes9MascotLoaderProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 bg-transparent text-center", className)}>
      <div className="relative flex items-center justify-center">
        <Notes9LoaderGif alt="Notes9 loader" widthPx={size} />
      </div>
      {(title || description) ? (
        <div className="space-y-1.5">
          {title ? (
            <p className="text-sm font-semibold tracking-[0.16em] text-foreground uppercase">
              {title}
            </p>
          ) : null}
          {description ? (
            <p className="max-w-sm text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

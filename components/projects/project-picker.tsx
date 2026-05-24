"use client"

import { useRouter } from "next/navigation"
import { Check, ChevronDown, Plus } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { colorFromId } from "@/contexts/project-scope-context"
import { cn } from "@/lib/utils"

export type ProjectPickerItem = {
  id: string
  name: string
  status?: string | null
}

type Props = {
  currentProject: { id: string; name: string }
  projects: ProjectPickerItem[]
}

export function ProjectPicker({ currentProject, projects }: Props) {
  const router = useRouter()
  const currentColor = colorFromId(currentProject.id)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Switch project — currently ${currentProject.name}`}
          className="group/picker inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm transition-colors hover:bg-muted/60 data-[state=open]:bg-muted"
        >
          <span className="font-medium text-muted-foreground">Project</span>
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: currentColor }}
          />
          <span className="min-w-0 max-w-[200px] truncate font-medium text-foreground sm:max-w-[280px]">
            {currentProject.name}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/picker:rotate-180"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[260px]">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Switch project
        </DropdownMenuLabel>
        {projects.length === 0 ? (
          <DropdownMenuItem disabled>No other projects yet</DropdownMenuItem>
        ) : (
          projects.map((p) => {
            const isCurrent = p.id === currentProject.id
            return (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => {
                  if (!isCurrent) router.push(`/projects/${p.id}`)
                }}
                className={cn(
                  "cursor-pointer gap-2.5",
                  isCurrent && "bg-muted/60",
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: colorFromId(p.id) }}
                />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {isCurrent ? (
                  <Check
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </DropdownMenuItem>
            )
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => router.push("/projects/new")}
          className="cursor-pointer gap-2.5 text-muted-foreground"
        >
          <Plus className="size-3.5 shrink-0" aria-hidden />
          <span>New project</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

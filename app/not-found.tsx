import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Compass } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Compass className="size-6" />
          </EmptyMedia>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>
            We couldn&apos;t find what you were looking for. The link may be
            outdated, or the page may have moved.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/projects">View projects</Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}

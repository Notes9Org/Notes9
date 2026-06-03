"use client"

import { useCallback, useId, useState } from "react"
import { useSearchParams, usePathname } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ReactNode } from "react"

const TAB_VALUES = ["overview", "molecular", "links", "storage", "history", "qc"] as const
type TabValue = (typeof TAB_VALUES)[number]

function isValidTab(value: string | null | undefined): value is TabValue {
  return !!value && (TAB_VALUES as readonly string[]).includes(value)
}

type SampleTabsProps = {
  initialTab?: string
  overview: ReactNode
  molecular: ReactNode
  links: ReactNode
  storage: ReactNode
  history: ReactNode
  qc: ReactNode
}

export function SampleTabs({
  initialTab,
  overview,
  molecular,
  links,
  storage,
  history,
  qc,
}: SampleTabsProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const baseId = useId()

  // Local state is the source of truth so a tab click switches INSTANTLY.
  // The previous version derived `active` straight from `searchParams` and only
  // called router.replace() — but on a dynamic server page (with loading.tsx)
  // that re-runs every DB query in page.tsx, so the navigation stays pending and
  // `searchParams` never updates → the tab appeared to do nothing. We keep local
  // state and sync the URL via history.replaceState (no server round-trip), which
  // still preserves deep-links and refresh while decoupling the switch from the DB.
  const initialFromProps: TabValue = isValidTab(initialTab) ? initialTab : "overview"
  const [active, setActive] = useState<TabValue>(initialFromProps)

  const handleChange = useCallback(
    (value: string) => {
      if (!isValidTab(value)) return
      setActive(value)
      try {
        const next = new URLSearchParams(searchParams?.toString() ?? "")
        if (value === "overview") next.delete("tab")
        else next.set("tab", value)
        const query = next.toString()
        window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname)
      } catch {
        /* URL sync is best-effort; the tab still switches via local state */
      }
    },
    [pathname, searchParams]
  )

  return (
    <Tabs
      id={`sample-tabs-${baseId}`}
      value={active}
      onValueChange={handleChange}
      className="space-y-4"
    >
      <TabsList data-tour="sample-tabs" className="flex h-auto flex-wrap justify-start">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="molecular">Molecular Files</TabsTrigger>
        <TabsTrigger value="links">Links</TabsTrigger>
        <TabsTrigger value="storage">Storage</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="qc">QC</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-4">
        {overview}
      </TabsContent>
      <TabsContent value="molecular" className="space-y-4">
        {molecular}
      </TabsContent>
      <TabsContent value="links" className="space-y-4">
        {links}
      </TabsContent>
      <TabsContent value="storage" className="space-y-4">
        {storage}
      </TabsContent>
      <TabsContent value="history" className="space-y-4">
        {history}
      </TabsContent>
      <TabsContent value="qc" className="space-y-4">
        {qc}
      </TabsContent>
    </Tabs>
  )
}

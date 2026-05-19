"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const baseId = useId()
  const [mounted, setMounted] = useState(false)

  // Tab state is derived directly from URL — no useState/useEffect sync dance.
  // The old useState + useEffect([searchParams, active]) pattern raced router.replace:
  // a click would set state, then the effect would re-run with stale searchParams
  // (still showing the previous tab) and revert the click.
  const fromUrl = searchParams.get("tab")
  const initialFromProps = isValidTab(initialTab) ? initialTab : "overview"
  const active: TabValue = isValidTab(fromUrl) ? fromUrl : initialFromProps

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleChange = useCallback(
    (value: string) => {
      if (!isValidTab(value)) return
      const next = new URLSearchParams(searchParams.toString())
      if (value === "overview") next.delete("tab")
      else next.set("tab", value)
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  if (!mounted) {
    return <div className="min-h-[400px]" />
  }

  return (
    <Tabs
      id={`sample-tabs-${baseId}`}
      value={active}
      onValueChange={handleChange}
      className="space-y-4"
    >
      <TabsList className="flex h-auto flex-wrap justify-start">
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

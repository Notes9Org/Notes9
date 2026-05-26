"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSmartBack } from "@/hooks/use-smart-back"
import { isFromDashboard } from "@/lib/from-dashboard"

export function useCreatePageNav(options: {
  pageLabel: string
  listFallbackPath: string
}): {
  fromDashboard: boolean
  handleBack: () => void
  backHref: string
} {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromDashboard = isFromDashboard(searchParams)
  const listFallbackPath = options.listFallbackPath

  const smartBack = useSmartBack(
    fromDashboard ? "/dashboard" : listFallbackPath,
  )

  const backHref = fromDashboard ? "/dashboard" : listFallbackPath

  const handleBack = useCallback(() => {
    if (fromDashboard) {
      router.push("/dashboard")
      return
    }
    smartBack()
  }, [fromDashboard, router, smartBack])

  return { fromDashboard, handleBack, backHref }
}

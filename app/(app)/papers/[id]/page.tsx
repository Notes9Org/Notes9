"use client"

import { useParams } from "next/navigation"
import { PaperWorkspace } from "../paper-workspace"

export default function PaperDetailPage() {
  const params = useParams()
  const id = params.id as string

  return <PaperWorkspace paperId={id} backLink={{ href: "/papers" }} />
}

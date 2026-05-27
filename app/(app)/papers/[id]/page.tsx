"use client"

import { useParams } from "next/navigation"
import { PaperDetailClient } from "./paper-detail-client"

export default function PaperDetailPage() {
  const params = useParams()
  const id = params.id as string

  return <PaperDetailClient activePaperId={id} />
}

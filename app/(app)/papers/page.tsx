"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { PaperList } from "./paper-list"
import { IS_PAPERS_MOCKED, getMockPapers } from "@/lib/papers-mock"

export default function PapersPage() {
  const [papers, setPapers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPapers = async () => {
      if (IS_PAPERS_MOCKED) {
        setPapers(getMockPapers())
        setLoading(false)
        return
      }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from("papers")
        .select(`
          *,
          project:projects(id, name),
          created_by_profile:profiles!papers_created_by_fkey(first_name, last_name)
        `)
        .eq("created_by", user.id)
        .order("updated_at", { ascending: false })

      setPapers(data || [])
      setLoading(false)
    }
    fetchPapers()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button asChild>
          <Link href="/papers/new">
            <Plus className="h-4 w-4 mr-2" />
            New Paper
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <PaperList papers={papers} />
      )}
    </div>
  )
}

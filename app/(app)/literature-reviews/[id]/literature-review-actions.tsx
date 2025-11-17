"use client"

import { EditLiteratureReviewDialog } from './edit-literature-review-dialog'
import { DeleteLiteratureReviewDialog } from './delete-literature-review-dialog'

export function LiteratureReviewActions({ literature }: { literature: any }) {
  return (
    <div className="flex gap-2">
      <EditLiteratureReviewDialog literature={literature} />
      <DeleteLiteratureReviewDialog 
        literatureId={literature.id} 
        literatureTitle={literature.title}
      />
    </div>
  )
}


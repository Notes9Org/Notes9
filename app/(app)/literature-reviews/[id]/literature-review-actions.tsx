"use client";

import { EditLiteratureReviewDialog } from "./edit-literature-review-dialog";
import { DeleteLiteratureReviewDialog } from "./delete-literature-review-dialog";

export function LiteratureReviewActions({
  literature,
  onRefresh,
}: {
  literature: any;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex gap-2">
      <EditLiteratureReviewDialog
        literature={literature}
        onSuccess={onRefresh}
      />
      <DeleteLiteratureReviewDialog
        literatureId={literature.id}
        literatureTitle={literature.title}
      />
    </div>
  );
}

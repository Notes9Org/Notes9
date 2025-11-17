"use client"

import { EditSampleDialog } from './edit-sample-dialog'
import { DeleteSampleDialog } from './delete-sample-dialog'

export function SampleActions({ sample }: { sample: any }) {
  return (
    <div className="flex gap-2">
      <EditSampleDialog sample={sample} />
      <DeleteSampleDialog sampleId={sample.id} sampleCode={sample.sample_code} />
    </div>
  )
}


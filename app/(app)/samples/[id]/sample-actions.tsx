"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { EditSampleDialog } from './edit-sample-dialog'
import { DeleteSampleDialog } from './delete-sample-dialog'

export function SampleActions({ sample }: { sample: any }) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <EditSampleDialog sample={sample} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <DeleteSampleDialog sampleId={sample.id} sampleCode={sample.sample_code} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Delete</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}


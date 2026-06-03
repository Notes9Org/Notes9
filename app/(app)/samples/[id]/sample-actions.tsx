"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { EditSampleDialog } from './edit-sample-dialog'
import { DeleteSampleDialog } from './delete-sample-dialog'
import type { SampleLinkOption } from "../sample-context-picker"

type SampleActionsProps = {
  sample: any
  allProjects?: SampleLinkOption[]
  allExperiments?: SampleLinkOption[]
  allLabNotes?: SampleLinkOption[]
  linkedProjectIds?: string[]
  linkedExperimentIds?: string[]
  linkedLabNoteIds?: string[]
}

export function SampleActions({
  sample,
  allProjects = [],
  allExperiments = [],
  allLabNotes = [],
  linkedProjectIds = [],
  linkedExperimentIds = [],
  linkedLabNoteIds = [],
}: SampleActionsProps) {
  return (
    <TooltipProvider>
      <div data-tour="sample-actions" className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <EditSampleDialog
                sample={sample}
                allProjects={allProjects}
                allExperiments={allExperiments}
                allLabNotes={allLabNotes}
                linkedProjectIds={linkedProjectIds}
                linkedExperimentIds={linkedExperimentIds}
                linkedLabNoteIds={linkedLabNoteIds}
              />
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

'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CollaboratorInfo } from '@/lib/collaboration/use-collaboration'

export interface CollaboratorAvatarsProps {
  collaborators: CollaboratorInfo[]
  maxVisible?: number
}

/**
 * Extracts initials from a user's name.
 * - If the name has multiple words, uses the first letter of the first and last word.
 * - If the name is a single word, uses the first letter only.
 * - Falls back to "?" for empty names.
 */
function getInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'

  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return parts[0][0].toUpperCase()
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Renders a horizontal stack of overlapping avatar circles representing
 * active collaborators. Each avatar shows the user's initials with a
 * colored border matching their cursor color. Shows a "+N" overflow
 * indicator when collaborators exceed the maxVisible limit.
 */
export function CollaboratorAvatars({
  collaborators,
  maxVisible = 5,
}: CollaboratorAvatarsProps) {
  if (collaborators.length === 0) return null

  const visible = collaborators.slice(0, maxVisible)
  const overflowCount = collaborators.length - maxVisible

  return (
    <div className="flex items-center -space-x-2" role="group" aria-label="Active collaborators">
      {visible.map((collaborator) => (
        <Tooltip key={collaborator.userId}>
          <TooltipTrigger asChild>
            <div
              className="relative flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background cursor-default"
              style={{ borderColor: collaborator.color, borderWidth: '2px', borderStyle: 'solid' }}
              aria-label={collaborator.name}
            >
              {getInitials(collaborator.name)}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {collaborator.name}
          </TooltipContent>
        </Tooltip>
      ))}

      {overflowCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background cursor-default border-2 border-muted-foreground/30"
              aria-label={`${overflowCount} more collaborator${overflowCount === 1 ? '' : 's'}`}
            >
              +{overflowCount}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {overflowCount} more collaborator{overflowCount === 1 ? '' : 's'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

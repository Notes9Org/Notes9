"use client"

import { Grid3x3, List } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ViewMode = 'grid' | 'table'

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (value: ViewMode) => void
  /**
   * When true, the table option is force-disabled and the toggle stays on
   * "grid". Used by list pages to lock to cards on small screens where the
   * data table can't render readably.
   */
  tableDisabled?: boolean
  className?: string
}

export function ViewModeToggle({
  value,
  onChange,
  tableDisabled = false,
  className,
}: ViewModeToggleProps) {
  return (
    <div className={cn('inline-flex gap-1 rounded-lg border p-1', className)}>
      <Button
        variant={value === 'grid' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onChange('grid')}
        className="gap-2"
        aria-label="Switch to grid view"
        aria-pressed={value === 'grid'}
      >
        <Grid3x3 className="h-4 w-4" />
        Grid
      </Button>
      <Button
        variant={tableDisabled ? 'ghost' : value === 'table' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => !tableDisabled && onChange('table')}
        className="gap-2"
        disabled={tableDisabled}
        aria-disabled={tableDisabled}
        aria-label="Switch to table view"
        aria-pressed={value === 'table'}
      >
        <List className="h-4 w-4" />
        Table
      </Button>
    </div>
  )
}

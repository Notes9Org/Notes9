import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exportSnapshotFirstSheetAsCsv } from '@/lib/spreadsheet-workbook'

export const maxDuration = 30

/**
 * POST /api/reports/experiment-data
 *
 * Fetches tabular data (xlsx/csv) from experiment_data for the given project
 * and optional experiment IDs. Returns CSV text for each file so the AI can
 * analyze real data.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { projectId, experimentIds } = body as {
      projectId: string
      experimentIds?: string[]
    }

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    // Build query for experiment data files
    let query = supabase
      .from('experiment_data')
      .select('id, file_name, file_type, tabular_format, workbook_snapshot, data_type, experiment_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (experimentIds && experimentIds.length > 0) {
      query = query.in('experiment_id', experimentIds)
    }

    const { data: files, error } = await query

    if (error) {
      console.error('Error fetching experiment data:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const tabularData: Array<{
      fileName: string
      dataType: string
      csv: string
    }> = []

    const otherFiles: Array<{
      fileName: string
      fileType: string
      dataType: string
    }> = []

    for (const file of files ?? []) {
      // Extract CSV from tabular files that have a workbook snapshot
      if (file.workbook_snapshot && file.tabular_format) {
        try {
          const csv = exportSnapshotFirstSheetAsCsv(
            file.workbook_snapshot as Record<string, unknown>
          )
          if (csv.trim()) {
            // Limit to first 100 rows to avoid token overflow
            const lines = csv.split('\n')
            const truncated = lines.slice(0, 101).join('\n')
            const wasTruncated = lines.length > 101

            tabularData.push({
              fileName: file.file_name,
              dataType: file.data_type,
              csv: truncated + (wasTruncated ? `\n... (${lines.length - 101} more rows)` : ''),
            })
          }
        } catch {
          // Skip files that can't be parsed
        }
      } else {
        otherFiles.push({
          fileName: file.file_name,
          fileType: file.file_type || 'unknown',
          dataType: file.data_type,
        })
      }
    }

    // Fetch lab notes for the project/experiments
    // Lab notes are primarily linked via experiment_id, so we need to:
    // 1. If specific experiments selected, query by experiment_id directly
    // 2. Otherwise, find all experiments for the project first, then query their notes
    let labNoteExperimentIds = experimentIds ?? []

    if (labNoteExperimentIds.length === 0) {
      // Get all experiment IDs for this project
      const { data: projectExperiments } = await supabase
        .from('experiments')
        .select('id')
        .eq('project_id', projectId)
      labNoteExperimentIds = (projectExperiments ?? []).map((e) => e.id)
    }

    let labNotes: Array<{ id: string; title: string; content: string | null; note_type: string | null; experiment_id: string | null }> | null = null

    if (labNoteExperimentIds.length > 0) {
      const { data } = await supabase
        .from('lab_notes')
        .select('id, title, content, note_type, experiment_id')
        .in('experiment_id', labNoteExperimentIds)
        .order('created_at', { ascending: false })
        .limit(20)
      labNotes = data
    } else {
      // Fallback: try project_id directly (some notes may be project-level)
      const { data } = await supabase
        .from('lab_notes')
        .select('id, title, content, note_type, experiment_id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20)
      labNotes = data
    }

    const labNotesData: Array<{
      title: string
      noteType: string | null
      content: string
    }> = []

    for (const note of labNotes ?? []) {
      if (note.content?.trim()) {
        // Strip HTML tags for a plain-text summary, limit length
        const plainText = note.content
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2000)
        if (plainText) {
          labNotesData.push({
            title: note.title,
            noteType: note.note_type,
            content: plainText,
          })
        }
      }
    }

    console.log('[experiment-data] tabularData files:', tabularData.length, '| otherFiles:', otherFiles.length, '| labNotes:', labNotesData.length)
    if (labNotesData.length > 0) {
      console.log('[experiment-data] lab note titles:', labNotesData.map(n => n.title).join(', '))
    }

    return NextResponse.json({ tabularData, otherFiles, labNotesData })
  } catch (error: any) {
    console.error('Experiment data fetch error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch experiment data' },
      { status: 500 }
    )
  }
}

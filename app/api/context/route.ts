import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('id');

    if (!type || !id) {
        return NextResponse.json(
            { error: 'Missing type or id parameter' },
            { status: 400 }
        );
    }

    const supabase = await createClient();

    // Verify user is authenticated
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        switch (type) {
            case 'project': {
                const { data: project, error } = await supabase
                    .from('projects')
                    .select(`
            id,
            name,
            description,
            status,
            priority,
            start_date,
            end_date,
            created_at,
            experiments (
              id,
              name,
              description,
              status
            )
          `)
                    .eq('id', id)
                    .single();

                if (error) throw error;

                return NextResponse.json({
                    type: 'project',
                    context: formatProjectContext(project)
                });
            }

            case 'experiment': {
                const { data: experiment, error } = await supabase
                    .from('experiments')
                    .select(`
            id,
            name,
            description,
            status,
            hypothesis,
            methodology,
            results,
            conclusions,
            start_date,
            completion_date,
            project:projects (
              id,
              name
            ),
            lab_notes (
              id,
              title,
              note_type
            )
          `)
                    .eq('id', id)
                    .single();

                if (error) throw error;

                return NextResponse.json({
                    type: 'experiment',
                    // Supabase types embedded relations (project, lab_notes) as
                    // arrays, but this single-row query returns them as objects —
                    // the shape the formatter reads at runtime. Cast through
                    // unknown to that runtime shape without widening access.
                    context: formatExperimentContext(
                        experiment as unknown as ExperimentContextRow,
                    )
                });
            }

            case 'lab_note': {
                const { data: labNote, error } = await supabase
                    .from('lab_notes')
                    .select(`
            id,
            title,
            content,
            note_type,
            created_at,
            updated_at,
            experiment:experiments (
              id,
              name,
              project:projects (
                id,
                name
              )
            )
          `)
                    .eq('id', id)
                    .single();

                if (error) throw error;

                return NextResponse.json({
                    type: 'lab_note',
                    // Same Supabase array-vs-object relation typing as above.
                    context: formatLabNoteContext(
                        labNote as unknown as LabNoteContextRow,
                    )
                });
            }

            default:
                return NextResponse.json(
                    { error: 'Invalid type. Must be project, experiment, or lab_note' },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('Error fetching context:', error);
        return NextResponse.json(
            { error: 'Failed to fetch context' },
            { status: 500 }
        );
    }
}

// Shapes below mirror the `.select(...)` projections used in the GET handler.
// Nested Supabase relations may arrive as an object or a single-element array
// depending on cardinality typing, so relation fields are typed permissively.
interface ProjectExperimentRow {
    id?: string;
    name?: string;
    description?: string | null;
    status?: string | null;
}

interface ProjectContextRow {
    id?: string;
    name?: string;
    description?: string | null;
    status?: string | null;
    priority?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    created_at?: string | null;
    experiments?: ProjectExperimentRow[] | null;
}

interface ProjectRelationRow {
    id?: string;
    name?: string;
}

interface ExperimentLabNoteRow {
    id?: string;
    title?: string | null;
    note_type?: string | null;
}

interface ExperimentContextRow {
    id?: string;
    name?: string;
    description?: string | null;
    status?: string | null;
    hypothesis?: string | null;
    methodology?: string | null;
    results?: string | null;
    conclusions?: string | null;
    start_date?: string | null;
    completion_date?: string | null;
    project?: ProjectRelationRow | null;
    lab_notes?: ExperimentLabNoteRow[] | null;
}

interface LabNoteContextRow {
    id?: string;
    title?: string | null;
    content?: string | null;
    note_type?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    experiment?:
        | (ProjectRelationRow & { project?: ProjectRelationRow | null })
        | null;
}

function formatProjectContext(project: ProjectContextRow | null): string {
    if (!project) return '';

    let context = `## Project: ${project.name}\n\n`;

    if (project.description) {
        context += `**Description:** ${project.description}\n\n`;
    }

    context += `**Status:** ${project.status || 'Unknown'}\n`;

    if (project.priority) {
        context += `**Priority:** ${project.priority}\n`;
    }

    if (project.start_date) {
        context += `**Start Date:** ${project.start_date}\n`;
    }

    if (project.end_date) {
        context += `**End Date:** ${project.end_date}\n`;
    }

    if (project.experiments && project.experiments.length > 0) {
        context += `\n### Experiments (${project.experiments.length}):\n`;
        project.experiments.forEach((exp) => {
            context += `- **${exp.name}** (${exp.status || 'unknown status'})\n`;
            if (exp.description) {
                context += `  ${exp.description}\n`;
            }
        });
    }

    return context;
}

function formatExperimentContext(experiment: ExperimentContextRow | null): string {
    if (!experiment) return '';

    let context = `## Experiment: ${experiment.name}\n\n`;

    if (experiment.project) {
        context += `**Project:** ${experiment.project.name}\n\n`;
    }

    if (experiment.description) {
        context += `**Description:** ${experiment.description}\n\n`;
    }

    context += `**Status:** ${experiment.status || 'Unknown'}\n`;

    if (experiment.hypothesis) {
        context += `\n### Hypothesis\n${experiment.hypothesis}\n`;
    }

    if (experiment.methodology) {
        context += `\n### Methodology\n${experiment.methodology}\n`;
    }

    if (experiment.results) {
        context += `\n### Results\n${experiment.results}\n`;
    }

    if (experiment.conclusions) {
        context += `\n### Conclusions\n${experiment.conclusions}\n`;
    }

    if (experiment.lab_notes && experiment.lab_notes.length > 0) {
        context += `\n### Lab Notes (${experiment.lab_notes.length}):\n`;
        experiment.lab_notes.forEach((note) => {
            context += `- ${note.title || 'Untitled'} (${note.note_type || 'general'})\n`;
        });
    }

    return context;
}

function formatLabNoteContext(labNote: LabNoteContextRow | null): string {
    if (!labNote) return '';

    let context = `## Lab Note: ${labNote.title || 'Untitled'}\n\n`;

    if (labNote.experiment) {
        context += `**Experiment:** ${labNote.experiment.name}\n`;
        if (labNote.experiment.project) {
            context += `**Project:** ${labNote.experiment.project.name}\n`;
        }
        context += '\n';
    }

    context += `**Type:** ${labNote.note_type || 'general'}\n`;
    context += `**Created:** ${labNote.created_at}\n`;

    if (labNote.content) {
        context += `\n### Content\n${labNote.content}\n`;
    }

    return context;
}

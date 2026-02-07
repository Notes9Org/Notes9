import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type SearchResultItem = {
  id: string;
  type: 'project' | 'experiment' | 'lab_note' | 'protocol' | 'sample';
  title: string;
  subtitle?: string;
  href: string;
};

const LIMIT_PER_TYPE = 5;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const term = `%${q}%`;

  try {
    const [projectsRes, experimentsRes, labNotesRes, protocolsRes, samplesRes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name')
        .or(`name.ilike.${term},description.ilike.${term}`)
        .limit(LIMIT_PER_TYPE),
      supabase
        .from('experiments')
        .select('id, name, project_id')
        .or(`name.ilike.${term},description.ilike.${term}`)
        .limit(LIMIT_PER_TYPE),
      supabase
        .from('lab_notes')
        .select('id, title, experiment_id')
        .or(`title.ilike.${term}`)
        .limit(LIMIT_PER_TYPE),
      supabase
        .from('protocols')
        .select('id, name')
        .eq('is_active', true)
        .or(`name.ilike.${term},description.ilike.${term}`)
        .limit(LIMIT_PER_TYPE),
      supabase
        .from('samples')
        .select('id, sample_code, description')
        .or(`sample_code.ilike.${term},description.ilike.${term}`)
        .limit(LIMIT_PER_TYPE),
    ]);

    const results: SearchResultItem[] = [];

    (projectsRes.data || []).forEach((p) => {
      results.push({
        id: p.id,
        type: 'project',
        title: p.name || 'Untitled project',
        href: `/projects/${p.id}`,
      });
    });

    (experimentsRes.data || []).forEach((e) => {
      results.push({
        id: e.id,
        type: 'experiment',
        title: e.name || 'Untitled experiment',
        href: `/experiments/${e.id}`,
      });
    });

    (labNotesRes.data || []).forEach((n) => {
      // Lab notes open in experiment context when linked; no standalone /lab-notes/[id] route
      const href = n.experiment_id
        ? `/experiments/${n.experiment_id}?noteId=${n.id}`
        : '/lab-notes';
      results.push({
        id: n.id,
        type: 'lab_note',
        title: n.title || 'Untitled note',
        href,
      });
    });

    (protocolsRes.data || []).forEach((p) => {
      results.push({
        id: p.id,
        type: 'protocol',
        title: p.name || 'Untitled protocol',
        href: `/protocols/${p.id}`,
      });
    });

    (samplesRes.data || []).forEach((s) => {
      results.push({
        id: s.id,
        type: 'sample',
        title: s.sample_code || 'Sample',
        subtitle: s.description || undefined,
        href: `/samples/${s.id}`,
      });
    });

    return NextResponse.json({ results });
  } catch (err) {
    console.error('Search error:', err);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}

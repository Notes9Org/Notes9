import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

const NOTES9_API_BASE = process.env.CHAT_API_URL?.replace(/\/$/, '') || '';

/**
 * GET /api/ai/activity-summary
 *
 * Returns an AI-generated one-liner summarising the user's recent lab activity.
 * Uses existing Notes9 `/chat` backend — no extra LLM dependencies needed.
 *
 * Response: `{ summary: string, generatedAt: string }`
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── 1. Gather recent activity from existing tables (last 24h) ───
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [experimentsRes, notesRes, papersRes, protocolsRes, tasksRes, samplesRes] =
      await Promise.all([
        supabase
          .from('experiments')
          .select('name, status, updated_at')
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('lab_notes')
          .select('title, updated_at')
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('papers')
          .select('title, updated_at')
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('protocols')
          .select('name, updated_at')
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('dashboard_tasks')
          .select('title, completed, updated_at')
          .eq('user_id', user.id)
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('samples')
          .select('name, updated_at')
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(3),
      ]);

    // ─── 2. Build a compact activity digest ─────────────────────────
    const events: string[] = [];

    for (const exp of experimentsRes.data ?? []) {
      events.push(`Updated experiment "${exp.name}" (status: ${exp.status})`);
    }
    for (const note of notesRes.data ?? []) {
      events.push(`Edited lab note "${note.title || 'Untitled'}"`);
    }
    for (const paper of papersRes.data ?? []) {
      events.push(`Worked on paper "${paper.title || 'Untitled'}"`);
    }
    for (const proto of protocolsRes.data ?? []) {
      events.push(`Updated protocol "${proto.name || 'Untitled'}"`);
    }
    const completedTaskCount = (tasksRes.data ?? []).filter((t) => t.completed).length;
    const pendingTaskCount = (tasksRes.data ?? []).filter((t) => !t.completed).length;
    if (completedTaskCount > 0) {
      events.push(`Completed ${completedTaskCount} task${completedTaskCount > 1 ? 's' : ''}`);
    }
    if (pendingTaskCount > 0) {
      events.push(`${pendingTaskCount} task${pendingTaskCount > 1 ? 's' : ''} still in progress`);
    }
    for (const sample of samplesRes.data ?? []) {
      events.push(`Recorded sample "${sample.name || 'Untitled'}"`);
    }

    // ─── 3. Handle empty activity ────────────────────────────────────
    if (events.length === 0) {
      return NextResponse.json({
        summary: 'No recent activity — start an experiment or jot down some notes to see your lab pulse here.',
        generatedAt: new Date().toISOString(),
      });
    }

    // ─── 4. Call Notes9 /chat for a one-liner summary ────────────────
    const sessionToken = (await supabase.auth.getSession()).data.session?.access_token;

    if (!NOTES9_API_BASE || !sessionToken) {
      // Fallback: return a simple non-AI summary
      const fallback =
        events.length <= 2
          ? events.join(' and ')
          : `${events.slice(0, 2).join(', ')}, and ${events.length - 2} more activities`;
      return NextResponse.json({
        summary: fallback,
        generatedAt: new Date().toISOString(),
      });
    }

    const activityDigest = events.map((e, i) => `${i + 1}. ${e}`).join('\n');

    const prompt = `You are a lab assistant summarising a researcher's recent activity. Given the following activity log from the last 24 hours, write a SINGLE concise sentence (max 25 words) that captures what the researcher has been working on. Use a warm, professional tone. Do NOT use bullet points. Do NOT include timestamps. Do NOT start with "You". Write in third-person observational style like a lab notebook entry.

Activity log:
${activityDigest}

Single-sentence summary:`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${NOTES9_API_BASE}/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          content: prompt,
          session_id: `activity-summary-${user.id}-${Date.now()}`,
          history: [],
          web_search: 'off',
        }),
      });

      if (!response.ok) {
        console.error('Activity summary AI error:', response.status);
        // Fallback to non-AI summary
        const fallback =
          events.length <= 2
            ? events.join(' and ')
            : `${events.slice(0, 2).join(', ')}, and ${events.length - 2} more activities`;
        return NextResponse.json({
          summary: fallback,
          generatedAt: new Date().toISOString(),
        });
      }

      const data = (await response.json()) as { content?: string };
      const rawSummary = typeof data.content === 'string' ? data.content.trim() : '';

      // Clean up: remove quotes, trailing period if duplicated, etc.
      const cleanSummary = rawSummary
        .replace(/^["']|["']$/g, '')
        .replace(/\n/g, ' ')
        .trim();

      return NextResponse.json({
        summary: cleanSummary || events[0],
        generatedAt: new Date().toISOString(),
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error('Activity summary error:', error);
    return NextResponse.json(
      { error: 'Failed to generate activity summary' },
      { status: 500 }
    );
  }
}

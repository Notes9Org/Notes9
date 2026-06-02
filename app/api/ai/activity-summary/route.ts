import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';

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
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── 1. Gather recent activity from existing tables (last 24h) ───
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [experimentsRes, notesRes, papersRes, protocolsRes, tasksRes, samplesRes] =
      await Promise.all([
        // Every query is scoped to the calling user via created_by. RLS alone is
        // org-wide for these tables, so without this filter a member's personal
        // AI activity summary would surface colleagues' recent work.
        supabase
          .from('experiments')
          .select('name, status, updated_at')
          .eq('created_by', user.id)
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('lab_notes')
          .select('title, updated_at')
          .eq('created_by', user.id)
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('papers')
          .select('title, updated_at')
          .eq('created_by', user.id)
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('protocols')
          .select('name, updated_at')
          .eq('created_by', user.id)
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
        // samples has no `name` column — the unique identifier is sample_code.
        supabase
          .from('samples')
          .select('sample_code, updated_at')
          .eq('created_by', user.id)
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
    const completedTasks = (tasksRes.data ?? []).filter((t) => t.completed);
    const pendingTasks = (tasksRes.data ?? []).filter((t) => !t.completed);
    if (completedTasks.length > 0) {
      events.push(`Completed ${completedTasks.length} task(s): ${completedTasks.map(t => t.title).join(', ')}`);
    }
    if (pendingTasks.length > 0) {
      events.push(`Pending task(s) to be done: ${pendingTasks.map(t => t.title).join(', ')}`);
    }
    for (const sample of samplesRes.data ?? []) {
      events.push(`Recorded sample "${sample.sample_code || 'Untitled'}"`);
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

    // Computed (non-AI) summary, used whenever the AI backend is unavailable.
    const fallbackSummary =
      events.length <= 2
        ? events.join(' and ')
        : `${events.slice(0, 2).join(', ')}, and ${events.length - 2} more activities`;

    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
    const firstName = fullName ? fullName.split(' ')[0] : 'the researcher';

    const activityDigest = events.map((e, i) => `${i + 1}. ${e}`).join('\n');

    const prompt = `You are an insightful lab assistant summarising recent activity for ${firstName}. Given the following activity log from the last 24 hours, write a concise, personalised summary (max 40 words) that captures what was done, what is being worked on, and gives a useful insight about what needs to be done next based on pending tasks. Use a warm, professional, and encouraging tone. Do NOT use bullet points. Do NOT include timestamps. Address them by name (e.g., "${firstName}, you have...").

Activity log:
${activityDigest}

Summary:`;

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
        return NextResponse.json({
          summary: fallbackSummary,
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
    } catch (aiError) {
      // The AI backend is optional. A network failure (ECONNREFUSED when the
      // Notes9/Catalyst chat service isn't running), an 8s timeout abort, or a
      // bad JSON body must NOT 500 the dashboard — degrade to the computed
      // summary instead.
      console.warn('Activity summary AI unavailable, using computed summary:', (aiError as Error)?.message);
      return NextResponse.json({
        summary: fallbackSummary,
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

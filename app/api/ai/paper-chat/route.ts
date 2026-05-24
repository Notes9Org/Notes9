import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const NOTES9_API_BASE =
  process.env.CHAT_API_URL?.replace(/\/$/, '') ||
  ''
const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.replace(/\/$/, '') || ''
const AI_SERVICE_BEARER_TOKEN = process.env.AI_SERVICE_BEARER_TOKEN || ''

const MAX_PAPER_CONTENT_BYTES = 50 * 1024
const MAX_MESSAGE_BYTES = 4 * 1024
const INSERTABLE_START = '---INSERTABLE_START---'
const INSERTABLE_END = '---INSERTABLE_END---'

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

function stripDelimiters(s: string): string {
  if (!s) return s
  return s.split(INSERTABLE_START).join('---INSERTABLE-STARTx---').split(INSERTABLE_END).join('---INSERTABLE-ENDx---')
}

function buildSystemPrompt(opts: {
  citationStyle?: string
  mode?: string
}): string {
  const { citationStyle, mode } = opts

  let base = `You are an expert academic research writing assistant embedded in a paper editor. The user is writing a research paper and needs your help.

Your capabilities:
- Write, improve, and restructure sections of the paper
- Suggest better phrasing, transitions, and academic tone
- Help with methodology descriptions, results interpretation, discussion points
- Add inline citations and references in the correct format
- Use proper scientific terminology for biology, chemistry, biochemistry
- Suggest structural improvements

RULES:
1. Write in formal academic tone appropriate for peer-reviewed journals
2. When the user asks you to write or improve text, provide publication-ready prose they can directly insert
3. Reference the paper content provided to give contextually relevant suggestions
4. For chemical formulas use proper notation
5. For math/equations use LaTeX: $inline$ or $$block$$
6. Be specific - do not give generic advice, reference their actual content
7. Keep responses focused and actionable`

  if (citationStyle) {
    base += `\n\nCITATION STYLE INSTRUCTIONS:\n${citationStyle}
When writing content that includes citations:
- Add inline citations in the specified format within the text
- At the end of the insertable content, add a "References" section with full reference entries
- Use real, plausible references from the biomedical literature (real authors, real journals, realistic DOIs)
- Make inline citations clickable by formatting them consistently`
  }

  base += `

SMART INSERTION RULES:
- When writing content for a specific section (e.g. Abstract, Introduction), do NOT include the section header if it already exists in the paper
- Only include headers for NEW sections that don't exist yet
- Write content that flows naturally from the existing text at the cursor position

CRITICAL OUTPUT FORMAT RULE:
When your response contains text that should be inserted into the paper, you MUST wrap ONLY the insertable content between these exact markers:

${INSERTABLE_START}
(the actual paper content to insert goes here - no commentary, no notes, no explanations)
${INSERTABLE_END}

Put any explanations, notes, caveats, or commentary OUTSIDE these markers (before or after).
If your entire response is insertable content with no commentary, still wrap it in the markers.
If your response is purely conversational (e.g. answering a question, no content to insert), do NOT use the markers.`

  return base
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { message, history, paperContent, paperTitle, sessionId, citationStylePrompt, mode } = body

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (typeof message !== 'string' || byteLength(message) > MAX_MESSAGE_BYTES) {
      return NextResponse.json({ error: 'Message too large' }, { status: 413 })
    }

    if (paperContent && (typeof paperContent !== 'string' || byteLength(paperContent) > MAX_PAPER_CONTENT_BYTES)) {
      return NextResponse.json({ error: 'Paper content too large' }, { status: 413 })
    }

    const safePaperContent = paperContent ? stripDelimiters(paperContent) : ''
    const safeMessage = stripDelimiters(message)

    const systemPrompt = buildSystemPrompt({
      citationStyle: citationStylePrompt,
      mode,
    })

    const paperContext = safePaperContent
      ? `\n\n---\nPAPER TITLE: ${paperTitle ? String(paperTitle).slice(0, 200) : 'Untitled'}\n\nFULL PAPER CONTENT:\n${safePaperContent}\n---\n\n`
      : ''

    const enrichedQuery = `${systemPrompt}${paperContext}User request: ${safeMessage}`

    const chatHistory = (history || []).map((h: { role: string; content: string }) => ({
      role: h.role,
      content: h.content,
    }))

    const sessionToken = (await supabase.auth.getSession()).data.session?.access_token
    const useNotes9 = sessionToken && NOTES9_API_BASE
    const useAIService = AI_SERVICE_BEARER_TOKEN && AI_SERVICE_URL

    if (!useNotes9 && !useAIService) {
      return NextResponse.json(
        { error: 'No AI service configured.' },
        { status: 503 }
      )
    }

    const apiUrl = useNotes9 ? `${NOTES9_API_BASE}/chat` : `${AI_SERVICE_URL}/chat`
    const authHeader = useNotes9 ? `Bearer ${sessionToken}` : `Bearer ${AI_SERVICE_BEARER_TOKEN}`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        content: enrichedQuery,
        history: chatHistory,
        session_id: sessionId || `paper-${Date.now()}`,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Paper chat error:', response.status, errText)
      return NextResponse.json({ error: `AI service error: ${response.status}` }, { status: response.status })
    }

    const data = (await response.json()) as { content?: string }
    const assistantContent = typeof data.content === 'string' ? data.content : String(data.content ?? '')

    return NextResponse.json({ text: assistantContent })
  } catch (error: any) {
    console.error('Paper chat error:', error)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}

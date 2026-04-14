import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const NOTES9_API_BASE = process.env.NEXT_PUBLIC_NOTES9_API_URL?.replace(/\/$/, '') || ''
const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.replace(/\/$/, '') || ''
const AI_SERVICE_BEARER_TOKEN = process.env.AI_SERVICE_BEARER_TOKEN || ''

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

  // Citation style instructions
  if (citationStyle) {
    base += `\n\nCITATION STYLE INSTRUCTIONS:\n${citationStyle}
When writing content that includes citations:
- Add inline citations in the specified format within the text
- At the end of the insertable content, add a "References" section with full reference entries
- Use real, plausible references from the biomedical literature (real authors, real journals, realistic DOIs)
- Make inline citations clickable by formatting them consistently`
  }

  // Smart insertion rules
  base += `

SMART INSERTION RULES:
- When writing content for a specific section (e.g. Abstract, Introduction), do NOT include the section header if it already exists in the paper
- Only include headers for NEW sections that don't exist yet
- Write content that flows naturally from the existing text at the cursor position

CRITICAL OUTPUT FORMAT RULE:
When your response contains text that should be inserted into the paper, you MUST wrap ONLY the insertable content between these exact markers:

---INSERTABLE_START---
(the actual paper content to insert goes here - no commentary, no notes, no explanations)
---INSERTABLE_END---

Put any explanations, notes, caveats, or commentary OUTSIDE these markers (before or after).
If your entire response is insertable content with no commentary, still wrap it in the markers.
If your response is purely conversational (e.g. answering a question, no content to insert), do NOT use the markers.`

  return base
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, history, paperContent, paperTitle, sessionId, citationStylePrompt, mode } = body

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()

    const systemPrompt = buildSystemPrompt({
      citationStyle: citationStylePrompt,
      mode,
    })

    const paperContext = paperContent
      ? `\n\n---\nPAPER TITLE: ${paperTitle || 'Untitled'}\n\nFULL PAPER CONTENT:\n${paperContent}\n---\n\n`
      : ''

    const enrichedQuery = `${systemPrompt}${paperContext}User request: ${message}`

    const chatHistory = (history || []).map((h: { role: string; content: string }) => ({
      role: h.role,
      content: h.content,
    }))

    const useNotes9 = token && NOTES9_API_BASE
    const useAIService = AI_SERVICE_BEARER_TOKEN && AI_SERVICE_URL

    if (!useNotes9 && !useAIService) {
      return NextResponse.json(
        { error: 'No AI service configured. Please sign in or configure AI_SERVICE_URL.' },
        { status: 503 }
      )
    }

    let assistantContent: string
    const apiUrl = useNotes9 ? `${NOTES9_API_BASE}/chat` : `${AI_SERVICE_URL}/chat`
    const authHeader = useNotes9 ? `Bearer ${token}` : `Bearer ${AI_SERVICE_BEARER_TOKEN}`

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
    assistantContent = typeof data.content === 'string' ? data.content : String(data.content ?? '')

    return NextResponse.json({ text: assistantContent })
  } catch (error: any) {
    console.error('Paper chat error:', error)
    return NextResponse.json({ error: error.message || 'Failed to process request' }, { status: 500 })
  }
}

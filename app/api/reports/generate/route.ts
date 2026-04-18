import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const NOTES9_API_BASE = process.env.NEXT_PUBLIC_NOTES9_API_URL?.replace(/\/$/, '') || ''
const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.replace(/\/$/, '') || ''
const AI_SERVICE_BEARER_TOKEN = process.env.AI_SERVICE_BEARER_TOKEN || ''

export function buildReportSystemPrompt(opts: {
  projectName: string
  experimentNames?: string[]
}): string {
  return `You are an expert scientific data analysis assistant. The user is a researcher who needs a data analysis report for their project.

PROJECT: ${opts.projectName}
${opts.experimentNames?.length ? `EXPERIMENTS: ${opts.experimentNames.join(', ')}` : ''}

Your capabilities:
- Analyze experimental data patterns and trends
- Generate statistical summaries and interpretations
- Identify significant findings and anomalies
- Suggest follow-up experiments based on results
- Present data in clear, structured report format
- Generate inline data visualizations as Chart.js chart specifications

OUTPUT FORMAT:
Generate a structured data analysis report in markdown. Include charts INLINE within the relevant section — not grouped in a separate section. Each chart should appear right after the paragraph that discusses the data it visualizes.

Suggested sections (adapt as needed):
1. **Executive Summary** - Key findings in 2-3 sentences
2. **Data Overview** - Description of the dataset and methodology
3. **Analysis Results** - Detailed findings with subsections; place charts inline here next to the data they illustrate
4. **Conclusions & Recommendations** - Interpretation and next steps

CHART GENERATION:
Place charts INLINE immediately after the text that references them. Do NOT group all charts in one section.

Example — a chart placed right after its discussion:

The treatment groups showed significant variation in cell viability...

\`\`\`chart
{
  "type": "bar",
  "data": {
    "labels": ["Group A", "Group B", "Group C"],
    "datasets": [{
      "label": "Cell Viability (%)",
      "data": [85, 72, 91],
      "backgroundColor": ["rgba(59,130,246,0.7)", "rgba(239,68,68,0.7)", "rgba(34,197,94,0.7)"]
    }]
  },
  "options": {
    "plugins": { "title": { "display": true, "text": "Cell Viability by Treatment Group" } },
    "scales": { "y": { "beginAtZero": true, "max": 100 } }
  }
}
\`\`\`

Chart rules:
- Use valid Chart.js v4 configuration JSON inside \`\`\`chart code blocks
- Supported types: bar, line, pie, doughnut, radar, scatter, bubble
- Always include a descriptive title in options.plugins.title
- Use realistic, plausible data values relevant to the project
- Include 2-4 charts spread across the report, each placed inline with its related analysis
- Use colors from this palette: blue rgba(59,130,246,0.7), red rgba(239,68,68,0.7), green rgba(34,197,94,0.7), amber rgba(245,158,11,0.7), purple rgba(168,85,247,0.7), cyan rgba(6,182,212,0.7)

RULES:
1. Write in formal scientific tone
2. Be specific to the project and experiments mentioned
3. Use proper scientific terminology
4. Include quantitative observations where possible
5. Structure the report for easy scanning with headers and bullet points
6. Place each chart immediately after the paragraph discussing that data — never in a separate charts section`
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()

    if (!token) {
      return NextResponse.json(
        { error: 'Authorization required. Please provide a valid Bearer token.' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { query, projectName, experimentNames, experimentData } = body

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    if (!projectName) {
      return NextResponse.json({ error: 'projectName is required' }, { status: 400 })
    }

    const useNotes9 = token && NOTES9_API_BASE
    const useAIService = AI_SERVICE_BEARER_TOKEN && AI_SERVICE_URL

    if (!useNotes9 && !useAIService) {
      return NextResponse.json(
        { error: 'No AI service configured. Please sign in or configure AI_SERVICE_URL.' },
        { status: 503 }
      )
    }

    const systemPrompt = buildReportSystemPrompt({ projectName, experimentNames })

    // Include actual experiment data if available
    const dataContext = experimentData
      ? `\n\n---\nACTUAL EXPERIMENT DATA (from uploaded files):\n${experimentData}\n---\n\nIMPORTANT: Use the ACTUAL data above to generate charts and analysis. The chart data values MUST reflect the real numbers from the uploaded files. Do NOT invent placeholder data when real data is available.\n`
      : ''

    const enrichedQuery = `${systemPrompt}${dataContext}\n\nUser request: ${query}`

    const apiUrl = useNotes9 ? `${NOTES9_API_BASE}/chat` : `${AI_SERVICE_URL}/chat`
    const authHeader = useNotes9 ? `Bearer ${token}` : `Bearer ${AI_SERVICE_BEARER_TOKEN}`

    // // Debug: log the full content being sent to the agent
    // console.log('[report-generate] === FULL REQUEST TO AGENT ===')
    // console.log('[report-generate] API URL:', apiUrl)
    // console.log('[report-generate] enrichedQuery length:', enrichedQuery.length)
    // console.log('[report-generate] enrichedQuery:\n', enrichedQuery)
    // console.log('[report-generate] === END REQUEST ===')

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        content: enrichedQuery,
        history: [],
        session_id: `report-${Date.now()}`,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Report generation error:', response.status, errText)
      return NextResponse.json(
        { error: `AI service error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = (await response.json()) as { content?: string }
    const content = typeof data.content === 'string' ? data.content : String(data.content ?? '')

    return NextResponse.json({ content })
  } catch (error: any) {
    console.error('Report generation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    )
  }
}

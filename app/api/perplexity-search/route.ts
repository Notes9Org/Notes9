import { NextRequest, NextResponse } from 'next/server';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = process.env.PERPLEXITY_API_URL || 'https://api.perplexity.ai/chat/completions';

interface PerplexityCitation {
  url: string;
  title?: string;
}

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
      citations?: PerplexityCitation[];
    };
  }>;
}

interface PaperResult {
  rank: number;
  title: string;
  summary: string;
  source_url: string;
  publication_year: string | null;
}

export async function POST(request: NextRequest) {
  // Check API key
  if (!PERPLEXITY_API_KEY) {
    return NextResponse.json(
      { error: 'Perplexity API key not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    // Construct the prompt for Perplexity
    const systemPrompt = `You are a research assistant specialized in finding and summarizing academic papers. 
Your task is to search for high-quality academic sources (papers, preprints, journals, conference publications) and provide up to 5 of the most relevant results. Only include papers you have high confidence in.

For each result, you MUST provide:
1. Paper title (exact title as published)
2. A concise summary of EXACTLY 2-3 lines that captures the key contribution, finding, or method
3. Source URL or DOI (must be a real, accessible URL)
4. Publication year if available

Requirements:
- Summaries must be factual, grounded in sources, and free of speculation
- Prefer insight-level summaries (key contribution, finding, or method), not generic descriptions
- If confidence in a summary is low, explicitly state uncertainty instead of guessing
- Do NOT add information beyond what is supported by sources
- Avoid marketing language or overgeneralization

Response format: Return a clean JSON object with the following structure:
{
  "results": [
    {
      "rank": 1,
      "title": "Exact paper title",
      "summary": "2-3 line factual summary of key contribution/findings",
      "source_url": "https://doi.org/... or https://arxiv.org/...",
      "publication_year": "2024"
    }
  ]
}

IMPORTANT: 
- Return ONLY the JSON object, no markdown formatting, no code blocks
- Ensure all URLs are real and accessible
- If you cannot find a reliable source for a paper, do not include it
- Include up to 5 results, but fewer is acceptable if high-quality sources are limited`;

    const userPrompt = `Search for academic papers related to: "${query}"

Find the top 5 most relevant, high-quality academic papers and return them in the specified JSON format.
Focus on peer-reviewed papers, preprints from reputable sources (arXiv, bioRxiv, medRxiv), and conference publications.`;

    // Call Perplexity API
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.2, // Low temperature for factual responses
        return_citations: true,
        search_domain_filter: ['arxiv.org', 'doi.org', 'pubmed.ncbi.nlm.nih.gov', 'biorxiv.org', 'medrxiv.org', 'ncbi.nlm.nih.gov', 'semanticscholar.org', 'google.com', 'scholar.google.com'],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Perplexity API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to fetch results from Perplexity' },
        { status: response.status }
      );
    }

    const data: PerplexityResponse = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'No results returned from Perplexity' },
        { status: 500 }
      );
    }

    // Parse the JSON response from Perplexity
    let parsedResults: { results: PaperResult[] };
    try {
      // Try to extract JSON if it's wrapped in markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : content.trim();
      parsedResults = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse Perplexity response:', content);
      return NextResponse.json(
        { error: 'Failed to parse search results' },
        { status: 500 }
      );
    }

    // Validate and sanitize results
    const resultsArray = Array.isArray(parsedResults.results) ? parsedResults.results : [];
    const validatedResults = resultsArray
      .slice(0, 5)
      .map((result, index) => ({
        rank: result.rank || index + 1,
        title: result.title?.trim() || '',
        summary: result.summary?.trim() || 'No summary available.',
        source_url: result.source_url?.trim() || '',
        publication_year: result.publication_year || null,
      }))
      .filter(result => result.title !== '' && result.source_url !== '');

    return NextResponse.json({
      query: query.trim(),
      results: validatedResults,
      totalResults: validatedResults.length,
    });

  } catch (error) {
    console.error('Perplexity search error:', error);
    return NextResponse.json(
      { error: 'Internal server error during search' },
      { status: 500 }
    );
  }
}

# Perplexity AI Search Integration

## Overview
AI-powered research paper search using Perplexity's API with natural language queries, delivering top 5 relevant papers with concise summaries.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                           │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │  🔍 Search...                    [AI Toggle ⏻]     │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│   Toggle OFF: Database only  |  Toggle ON: DB + AI Search   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              app/api/perplexity-search/route.ts              │
│  • POST /api/perplexity-search                               │
│  • Validates PERPLEXITY_API_KEY                              │
│  • Constructs system + user prompts                          │
│  • Calls sonar-reasoning-pro model                           │
│  • Parses JSON response                                      │
│  • Validates & returns top 5 results                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Perplexity API (sonar-reasoning-pro)         │
│  • Built-in web search across academic sources               │
│  • Domain filter: arxiv, doi.org, pubmed, biorxiv, etc.     │
│  • Returns structured JSON with citations                    │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Model Selection
- **Model**: `sonar-pro`
- **Reason**: Optimized for research tasks with built-in search and reasoning capabilities
- **Temperature**: 0.2 (low for factual accuracy)
- **Max Tokens**: 2000 (sufficient for 5 papers with summaries)

### 2. Prompt Engineering
```typescript
// System Prompt Key Requirements:
- Up to 5 most relevant results (fewer acceptable if quality sources limited)
- Each summary: EXACTLY 2-3 lines
- Focus on: key contribution, finding, or method
- Output: Clean JSON only, no markdown
- No fabrication - only sourced information
```

### 3. Response Validation
- Parses JSON (handles markdown code blocks)
- Validates required fields: title, summary, source_url
- Filters out papers without reliable sources
- Limits to maximum 5 results

### 4. Domain Filtering
Restricts search to academic sources:
- `arxiv.org` - Preprint server
- `doi.org` - DOI resolver
- `pubmed.ncbi.nlm.nih.gov` - PubMed database
- `biorxiv.org`, `medrxiv.org` - Bio/med preprints
- `semanticscholar.org` - Academic search engine

## API Usage

### Request
```bash
POST /api/perplexity-search
Content-Type: application/json

{
  "query": "latest techniques for hallucination reduction in LLMs"
}
```

### Response
```json
{
  "query": "latest techniques for hallucination reduction in LLMs",
  "results": [
    {
      "rank": 1,
      "title": "Chain-of-Verification Reduces Hallucination in Large Language Models",
      "summary": "Proposes CoVe method where LLMs draft responses, verify claims through additional queries, and revise based on findings. Reduces hallucinations by 28% on factual QA tasks.",
      "source_url": "https://arxiv.org/abs/2309.11495",
      "publication_year": "2023"
    }
  ],
  "totalResults": 5
}
```

## Environment Setup

Add to `.env.local`:
```bash
PERPLEXITY_API_KEY=your_api_key_here
```

Get API key from: https://www.perplexity.ai/settings/api

## UI Components

### SearchTab

**Unified Search Bar with Toggle:**
```
┌─────────────────────────────────────────────────────────┐
│ 🔍  Search...                     [⚡ AI  ⏻]  │ Search │
└─────────────────────────────────────────────────────────┘
```

**Toggle Behavior:**
| Toggle State | Behavior |
|--------------|----------|
| **OFF** (gray) | Searches traditional databases (PubMed, BioRxiv, MedRxiv) |
| **ON** (purple) | Searches Perplexity AI only |

**Visual Indicators:**
- Toggle button positioned at rightmost part of search bar
- Purple styling when AI mode is active
- Sparkle icon animates when enabled
- Helper text explains dual search is active

### PerplexitySearchCard
- Purple left border to distinguish AI results
- Shows rank, source domain, publication year
- Expandable 2-3 line summaries
- Direct source link
- Stage/Save actions

## Cost Considerations

- Perplexity API: ~$0.005-0.01 per search (sonar-reasoning-pro)
- **AI Toggle**: Users control when AI search is invoked (cost savings)
- Caching: Not implemented (stateless by design)
- Rate limiting: Recommended 10 req/min for cost control

## Search Behavior

```
User enters query ──► Clicks Search
                            │
                            ▼
                    ┌───────────────┐
                    │ AI Toggle ON? │
                    └───────┬───────┘
                            │
                    ┌───────┴───────┐
                    ▼               ▼
                  [OFF]           [ON]
                    │               │
                    ▼               ▼
            ┌──────────────┐  ┌──────────┐
            │ Database     │  │ Perplexity│
            │ Search Only  │  │ AI Search │
            │ (PubMed etc) │  │           │
            └──────────────┘  └──────────┘
```

## Error Handling

| Error Scenario | Response | User Feedback |
|----------------|----------|---------------|
| Missing API key | 500 | "Perplexity API key not configured" |
| Invalid query | 400 | "Query is required and must be a string" |
| API failure | 502 | "Failed to fetch results from Perplexity" |
| Parse error | 500 | "Failed to parse search results" |
| No results | 200 (empty) | Shows "No papers found" |

## Non-Goals (As Specified)

✗ Custom retrieval pipeline  
✗ OpenAlex/Semantic Scholar/Crossref integration  
✗ PDF parsing  
✗ Recall optimization over precision  
✗ Google Scholar scraping  

## Future Enhancements

1. **Result Caching**: Cache queries for 24h to reduce API costs
2. **Batch Export**: Export all AI results to CSV
3. **Citation Network**: Show paper relationships
4. **Confidence Scoring**: Display Perplexity confidence levels

## Testing

Example queries to test:
```
1. "CRISPR-Cas9 off-target effects reduction methods"
2. "mRNA vaccine stability improvement techniques 2024"
3. "attention mechanism alternatives to transformers"
4. "protein folding prediction recent advances"
5. "causal inference methods in observational studies"
```

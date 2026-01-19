# Notes9 Agent - Usage Guide

## Overview

The Notes9 Agent is a LangGraph-based agentic AI system that processes scientific lab management queries using SQL and RAG (Retrieval Augmented Generation).

## How to Run the Agent

### 1. Via FastAPI Server (Production)

Start the FastAPI server:

```bash
cd python-service
python main.py
```

Or with uvicorn:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

The server will be available at `http://localhost:8000`

**Endpoints:**
- `POST /agent/run` - Execute full agent graph
- `POST /agent/normalize/test` - Test normalize node only
- `GET /health` - Health check
- `GET /` - API information

**Example API call:**

```bash
curl -X POST http://localhost:8000/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How many experiments were completed last month?",
    "user_id": "user-123",
    "session_id": "session-456",
    "scope": {
      "organization_id": "org-123",
      "project_id": "proj-456"
    },
    "history": [],
    "options": {
      "debug": true,
      "max_retries": 2
    }
  }'
```

### 2. Via Test Script (Development/Testing)

Test the full agent graph:

```bash
cd python-service
python test_cases/test_agent_full.py "How many experiments were completed last month?" org-123
```

Test normalize node only:

```bash
python test_cases/test_normalize_cli.py "What protocols mention PCR?" org-123
```

Test LLM client:

```bash
python test_cases/test_llm_direct.py
```

## Environment Variables

Required environment variables (set in `.env` file):

```bash
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4  # Your chat model deployment name
AZURE_OPENAI_DEFAULT_TEMPERATURE=0.0

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database (for SQL execution)
DB_HOST=db.your-project.supabase.co
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-db-password
DB_NAME=postgres

# Optional
PORT=8000
CORS_ORIGINS=*
NORMALIZE_TEMPERATURE=0.0
```

## Agent Thinking Logs

The agent now logs all thinking, reasoning, and decision-making processes for future reference. This helps with:

1. **Debugging** - Understand why the agent made specific decisions
2. **Improvement** - Identify patterns and areas for optimization
3. **Audit** - Track agent reasoning for compliance and transparency
4. **Learning** - Use historical thinking to improve prompts and logic

### Thinking Log Types

The agent logs several types of thinking:

1. **Reasoning** - How the agent reasons about a problem
   - Normalize: Query normalization reasoning
   - Retry: Why a retry is needed

2. **Decisions** - Decisions made by the agent
   - Router: Tool selection decision

3. **Analysis** - Analysis performed on data
   - SQL: SQL execution analysis
   - RAG: Semantic search analysis
   - Summarizer: Answer synthesis analysis
   - Judge: Answer quality analysis

4. **Validation** - Validation processes
   - Normalize: Invariant validation
   - Judge: Answer quality validation

### Accessing Thinking Logs

Thinking logs are stored in the `agent_trace_events` table with `event_type='thinking'`.

**Query thinking logs for a run:**

```sql
SELECT 
  node_name,
  payload->>'thinking_type' as thinking_type,
  payload->'content' as content,
  created_at
FROM agent_trace_events
WHERE run_id = 'your-run-id'
  AND event_type = 'thinking'
ORDER BY created_at;
```

**Query all thinking for debugging:**

```sql
SELECT 
  ar.run_id,
  ar.query,
  ate.node_name,
  ate.payload->>'thinking_type' as thinking_type,
  ate.payload->'content' as content,
  ate.created_at
FROM agent_runs ar
JOIN agent_trace_events ate ON ar.run_id = ate.run_id
WHERE ate.event_type = 'thinking'
  AND ar.organization_id = 'your-org-id'
ORDER BY ate.created_at DESC
LIMIT 100;
```

### Thinking Log Structure

Each thinking log contains:

```json
{
  "thinking_type": "reasoning|decision|analysis|validation",
  "content": {
    // Type-specific content
  },
  "timestamp": 1234567890.123,
  "metadata": {}
}
```

**Example - Router Decision:**

```json
{
  "thinking_type": "decision",
  "content": {
    "decision": "Route to sql, rag",
    "alternatives": ["sql", "rag", "hybrid"],
    "rationale": "Intent: hybrid (SQL + RAG) comprehensive analysis.",
    "confidence": 0.85
  }
}
```

**Example - Judge Validation:**

```json
{
  "thinking_type": "validation",
  "content": {
    "validation_type": "answer_quality",
    "criteria": [
      "Factual consistency (SQL numbers match answer)",
      "Citation coverage (all claims cited)",
      "Scope leakage (no out-of-scope info)",
      "Completeness (answers the query)"
    ],
    "result": "pass",
    "issues": []
  }
}
```

## Agent Graph Flow

```
START
  ↓
normalize (Query normalization)
  ↓
router (Tool selection)
  ↓
├─→ sql (SQL execution) ──┐
│                          ↓
└─→ rag (RAG retrieval) ──→ summarizer (Answer synthesis)
                              ↓
                            judge (Quality validation)
                              ↓
                            retry (Retry logic)
                              ↓
                            final (Response formatting)
                              ↓
                            END
```

## Node Descriptions

1. **normalize** - Converts raw query to structured format with intent, entities, context
2. **router** - Selects tools (SQL, RAG, or both) based on intent
3. **sql** - Executes SQL queries for aggregate operations
4. **rag** - Retrieves semantic chunks for search operations
5. **summarizer** - Synthesizes answer from SQL facts and RAG evidence
6. **judge** - Validates answer quality using LLM-as-Judge
7. **retry** - Handles retries with query refinement
8. **final** - Formats final response with citations and confidence

## Debug Mode

Enable debug mode to get detailed execution traces:

```json
{
  "options": {
    "debug": true,
    "max_retries": 2
  }
}
```

Debug mode includes:
- Node-by-node execution trace
- Input/output for each node
- Latency measurements
- Router decisions
- Judge verdicts

## Troubleshooting

### Agent fails to start

1. Check environment variables are set correctly
2. Verify Azure OpenAI credentials
3. Check Supabase connection
4. Review logs for specific errors

### SQL execution fails - Database Connection Error

**Error**: `password authentication failed for user "postgres"`

**Quick Fix:**
1. Run the connection test:
   ```bash
   python test_cases/test_db_connection.py
   ```

2. Get your database password:
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Settings → Database → Database Password
   - Copy or reset the password

3. Add to `.env` file:
   ```bash
   DB_HOST=db.rutcjpugsrfoobsrufnn.supabase.co
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_database_password_here
   DB_NAME=postgres
   ```

4. See `DATABASE_SETUP.md` for detailed instructions

**Other SQL errors:**
1. Verify database credentials are correct
2. Check organization_id is in scope
3. Review SQL safety validation
4. Check database schema matches expectations

### Agent returns low confidence

1. Check if SQL/RAG returned relevant data
2. Review judge validation issues
3. Check thinking logs for reasoning
4. Verify query normalization was correct

### RAG returns no results

1. Verify semantic chunks exist in database
2. Check embedding service is working
3. Review similarity threshold (default: 0.75)
4. Verify organization_id/project_id filters

## Best Practices

1. **Always include organization_id in scope** - Required for security
2. **Use debug mode during development** - Helps understand agent behavior
3. **Review thinking logs regularly** - Identify patterns and improvements
4. **Monitor confidence scores** - Low confidence may indicate issues
5. **Test with various query types** - Aggregate, search, and hybrid queries

## Support

For issues or questions:
1. Check thinking logs for reasoning
2. Review trace events in database
3. Enable debug mode for detailed traces
4. Check agent execution logs

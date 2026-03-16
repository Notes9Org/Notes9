# Notes9 AI – Frontend integration guide

## 1. Base URL and authentication

- **Base URL:** `https://cyplpzwhgszj7adrhy6tcuodzy0wmzdk.lambda-url.us-east-1.on.aws`
- **Stability:** This Function URL is stable across deployments and only changes if the Lambda or its Function URL is recreated.
- **CORS:** Backend uses `CORS_ORIGINS` (default `*`). Set it in backend `.env` if you need specific origins.
- **Auth:** All AI endpoints use **Supabase Auth JWT**:
  - Header: `Authorization: Bearer <access_token>`
  - Get `access_token` from your Supabase client after sign-in (e.g. `session.access_token`).
- **401:** Missing or invalid token → show login or refresh token.

---

## 2. Chat API (simple LLM chat)

**Endpoint:** `POST /chat`

Use this for general Q&A without the full agent (no SQL/RAG pipeline).

### Request

```json
{
  "content": "What is the molar mass of glucose?",
  "session_id": "session-456",
  "history": [
    { "role": "user", "content": "What is glucose?" },
    { "role": "assistant", "content": "Glucose is a simple sugar..." }
  ]
}
```

| Field         | Type   | Required | Description                                    |
|---------------|--------|----------|------------------------------------------------|
| `content`     | string | Yes      | Current user message                           |
| `session_id`  | string | Yes      | Session/conversation id for context            |
| `history`     | array  | No       | Previous messages; each has `role`, `content`  |

### Response

```json
{
  "content": "The molar mass of glucose (C₆H₁₂O₆) is 180.16 g/mol...",
  "role": "assistant"
}
```

| Field     | Type   | Description         |
|-----------|--------|---------------------|
| `content` | string | Assistant reply     |
| `role`    | string | Always `"assistant"` |

### Display

- Append user message with `content` and `role: "user"`.
- Append assistant message with `response.content` and `response.role`.
- The backend system prompt asks for: no filler openings, single-line list items with "—", no UUIDs in text. Render `content` as markdown (or plain text); no special handling needed beyond that.

---

## 3. Agent run API (one-shot answer)

**Endpoint:** `POST /notes9/run`

Full pipeline: normalize → router → SQL/RAG → summarizer → judge → final answer. One request, one JSON response.

### Request

```json
{
  "query": "How many experiments were completed last month?",
  "session_id": "session-456",
  "history": [
    { "role": "user", "content": "Show me experiment stats" },
    { "role": "assistant", "content": "Here are the stats..." }
  ],
  "scope": null,
  "options": {
    "debug": false,
    "max_retries": 2
  }
}
```

| Field         | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `query`       | string | Yes      | User question |
| `session_id`  | string | Yes      | Session id    |
| `user_id`     | string | No       | Ignored; server uses JWT `sub` |
| `history`     | array  | No       | Previous `{ role, content }` messages |
| `scope`       | object | No       | Optional; not used for filtering |
| `options`     | object | No       | `debug` (bool), `max_retries` (int) |

### Response

```json
{
  "answer": "Based on the database records, 12 experiments were completed last month.",
  "citations": [
    {
      "display_label": "Lab note: PCR Protocol",
      "source_type": "lab_note",
      "source_name": "PCR Protocol",
      "relevance": 0.95,
      "excerpt": "Experiment completed on January 15, 2024..."
    }
  ],
  "confidence": 0.92,
  "tool_used": "sql",
  "debug": null
}
```

| Field         | Type    | Description |
|---------------|---------|-------------|
| `answer`      | string  | Final answer text |
| `citations`  | array   | Sources; see citation object below |
| `confidence`  | number  | 0.0–1.0 |
| `tool_used`   | string  | `"sql"` \| `"rag"` \| `"hybrid"` \| `"none"` |
| `debug`       | object? | Present only when `options.debug === true` |

**Citation object (per item in `citations`):**

| Field           | Type   | Description |
|-----------------|--------|-------------|
| `display_label` | string?| e.g. "Lab note: PCR Protocol" |
| `source_type`   | string | e.g. `lab_note`, `protocol`, `report` |
| `source_name`   | string?| Document name |
| `relevance`     | number | 0.0–1.0 |
| `excerpt`       | string?| Snippet from source |

### Display

- **Answer:** Render `answer` as the main reply (markdown or plain).
- **Citations:** List below the answer; use `display_label` or `source_name` as title, optionally show `excerpt` and `relevance` (e.g. "Relevance: 95%").
- **Confidence:** Optional badge or subtitle, e.g. "Confidence: 92%"; you can dim or warn when &lt; 0.5.
- **Tool used:** Optional chip/badge: "From database", "From documents", "Both", "General" for `none`.

---

## 4. Agent stream API (SSE)

**Endpoint:** `POST /notes9/stream`  
**Request body:** Same as `/notes9/run` (e.g. `query`, `session_id`, `history`, `options`).  
**Response:** `Content-Type: text/event-stream`. Use `EventSource` or `fetch` + stream reader; parse SSE lines (`event:` and `data:`).

### SSE event format

Each event has:

- `event: <event_type>`
- `data: <JSON>`

Then a blank line. Parse `event_type` and `JSON.parse(data)` for payloads below.

### Event types and payloads

**1. `thinking`** – Progress updates (show "thinking" or step label)

```json
{
  "node": "normalize",
  "status": "started",
  "message": "Understanding your query..."
}
```

or

```json
{
  "node": "summarizer",
  "status": "completed",
  "message": "Answer generated"
}
```

- **Nodes you may see:** `normalize`, `router`, `sql`, `rag`, `anchor_expander`, `summarizer`, `judge`, `final`.
- **Display:** e.g. "Understanding your query…", "Calling SQL", "Synthesizing answer…", "Formatting response…". Update a single status line or stepper as events arrive.

**2. `token`** – Streaming answer tokens (only when summarizer streams)

```json
{ "text": "Based " }
```
```json
{ "text": "on " }
```
```json
{ "text": "the " }
```

- **Display:** Append `data.text` to the in-progress answer; when you get the final `done` event, replace or keep this as the final answer.

**3. `sql`** – Generated SQL (optional to show)

```json
{ "query": "SELECT COUNT(*) FROM experiments WHERE created_at >= '2024-01-01' AND ..." }
```

- **Display:** Optional "Query used" expandable or debug section; do not show by default to non-admin users.

**4. `rag_chunks`** – RAG retrieval result

```json
{
  "message": "Retrieved 6 document chunk(s)",
  "count": 6,
  "chunks": [
    {
      "source_type": "lab_note",
      "source_id": "...",
      "source_name": "PCR Protocol",
      "excerpt": "Relevant text...",
      "relevance": 0.87
    }
  ]
}
```

- **Display:** Optional "Searching documents…" then "Found 6 chunks"; you can list chunks in a collapsible "Sources" section.

**5. `done`** – Final response (same shape as `/agent/run`)

```json
{
  "answer": "Based on the database records, 12 experiments were completed last month.",
  "citations": [
    {
      "display_label": "Lab note: PCR Protocol",
      "source_type": "lab_note",
      "source_name": "PCR Protocol",
      "relevance": 0.95,
      "excerpt": "Experiment completed on January 15, 2024..."
    }
  ],
  "confidence": 0.92,
  "tool_used": "sql",
  "debug": null
}
```

- **Display:** Same as Section 3: set final answer, citations, confidence, tool_used. If you were appending `token` events, you can replace the streamed text with `answer` or keep it if it matches.

**6. `error`**

```json
{ "error": "Agent execution failed: ..." }
```

- **Display:** Show error message; stop any "thinking" or loading state.

**7. `ping`** – Keep-alive (every ~15 s)

```json
{ "ts": 1234567890.123 }
```

- **Display:** Ignore; use only to keep connection alive if needed.

### Suggested streaming UI flow

1. Send `POST /notes9/stream` with body and `Authorization: Bearer <token>`.
2. Parse SSE: on `thinking` → update status text; on `token` → append to buffer and show live answer; on `sql`/`rag_chunks` → optional debug/sources.
3. On `done` → set final `answer`, `citations`, `confidence`, `tool_used` and stop loading.
4. On `error` → show `data.error`, stop loading.
5. Handle 4xx/5xx: parse JSON body for `error` and optional `details` (validation).

---

## 5. Error responses (all endpoints)

- **401 Unauthorized:** Missing or invalid Bearer token → re-auth or refresh.
- **422 Validation error:**

```json
{
  "error": "Validation error",
  "details": [
    {
      "loc": ["body", "query"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

- **500 / 502:** `{ "error": "..." }` – show message; optionally log `details` if present.

Use the same pattern for Chat and Agent: check `response.ok`, then parse JSON and handle `error` and `details` for display.

---

## 6. Quick reference

| Use case              | Endpoint               | Input                               | Output / display                    |
|-----------------------|------------------------|-------------------------------------|-------------------------------------|
| Simple chat           | `POST /chat`           | `content`, `session_id`, `history`  | `content`, `role` → append message  |
| One-shot agent answer | `POST /notes9/run`     | `query`, `session_id`, `history`, `options` | `answer`, `citations`, `confidence`, `tool_used` |
| Streaming agent       | `POST /notes9/stream`  | Same as run                         | SSE: `thinking`, `token`, `sql`, `rag_chunks`, `done`, `error`, `ping` |

- **Auth:** `Authorization: Bearer <access_token>` (Supabase JWT).  
- **Confidence:** 0.0–1.0; `tool_used`: `sql` \| `rag` \| `hybrid` \| `none`.  
- **Citations:** Use `display_label` or `source_name` + optional `excerpt` and `relevance` for display.

The existing **`backend/API_DOCUMENTATION.md`** has more detail (including normalize test and literature search). The above focuses on what the frontend needs: inputs, outputs, and how to display them for Chat, Agent run, and Agent stream.

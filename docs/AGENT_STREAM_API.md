# Agent Stream API – Frontend integration

> **See also:** [Notes9 AI – Frontend integration guide](./FRONTEND_INTEGRATION_GUIDE.md) for Chat, Agent run, Agent stream, and error handling in one place.

Use this to connect the UI to the Notes9 agent streaming endpoint and render thinking, SQL, RAG chunks, and the final answer.

---

## Endpoint

| Item | Value |
|------|--------|
| **Method** | `POST` |
| **Path** | `/agent/stream` (e.g. `https://your-api/agent/stream`) |
| **Auth** | Bearer token (e.g. `Authorization: Bearer <access_token>`) |
| **Content-Type** | `application/json` |
| **Response** | `text/event-stream` (SSE) |

---

## Request body (JSON)

Same shape as the non-streaming agent request:

```ts
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentRequest {
  query: string;           // required – user question
  session_id: string;      // required – session id for this conversation
  history?: ChatMessage[]; // optional – previous messages for context
  options?: {              // optional
    debug?: boolean;
    max_retries?: number;
  };
}
```

Example:

```json
{
  "query": "Explain about the attention mechanism from the lab notes?",
  "session_id": "session-abc-123",
  "history": [
    { "role": "user", "content": "What is PCR?" },
    { "role": "assistant", "content": "PCR is..." }
  ]
}
```

`user_id` is taken from the authenticated user (JWT); do not send it in the body.

---

## Server-Sent Events (SSE)

The response is a stream of SSE messages. Each message has:

- **`event`** – event type (e.g. `thinking`, `token`, `sql`, `rag_chunks`, `done`, `error`, `ping`).
- **`data`** – JSON string; parse it to get the payload.

Order is roughly: thinking steps → optional `sql` → optional `rag_chunks` → optional `token` (streaming answer) → `done` (or `error`).

---

## Event types and payloads

### 1. `event: thinking`

Agent step (e.g. "Calling SQL", "Calling RAG", "Synthesizing answer"). Use for a "thinking" or "steps" section.

**Data (parsed):**

```ts
{
  node: string;      // "normalize" | "router" | "sql" | "rag" | "anchor_expander" | "summarizer" | "judge" | "final"
  status: string;    // "started" | "completed"
  message: string;   // e.g. "Calling SQL", "Query understood", "Retrieved 3 document chunk(s)"
  // When status === "completed", may also include:
  intent?: string;
  conclusion?: string;
  decision?: string;
  rationale?: string;
  confidence?: number;
  sql?: string;      // present when node === "sql" – same query as in event: sql
  verdict?: string;
  issues?: string[];
}
```

**UI:** Show `message` (and optionally `node` / `status`). When `data.sql` is present, you can show the SQL in a code block (or rely on `event: sql`).

---

### 2. `event: sql`

Emitted when the agent has run a SQL step. Use to show "Calling SQL" and the query.

**Data (parsed):**

```ts
{
  query: string;   // full SQL (may contain \n)
}
```

**UI:** After showing "Calling SQL" (from a `thinking` event with `node === "sql"`), display `data.query` in a code block or preformatted block.

---

### 3. `event: rag_chunks`

Emitted after RAG retrieval. Use to show "Calling RAG" and the list of chunks.

**Data (parsed):**

```ts
{
  message: string;   // e.g. "Retrieved 3 document chunk(s)"
  count: number;
  chunks: Array<{
    source_type: string;   // e.g. "lab_note"
    source_id: string;     // UUID
    chunk_id: string | null;
    excerpt: string;       // first ~400 chars of content
    relevance: number;     // 0–1
  }>;
}
```

**UI:** After "Calling RAG" (from a `thinking` event with `node === "rag"`), show `data.message` and a list/cards of `data.chunks` (excerpt, source_type, relevance).

---

### 4. `event: token`

Streaming answer from the summarizer (final answer text).

**Data (parsed):**

```ts
{
  text: string;   // one chunk of the answer (append to previous tokens)
}
```

**UI:** Append `data.text` to the visible answer area so the user sees the answer stream in real time.

---

### 5. `event: done`

Final response. Emitted once at the end (after any tokens).

**Data (parsed):** same as the non-streaming agent response:

```ts
{
  answer: string;
  citations: Array<{
    source_type: string;
    source_id: string;
    display_label?: string;
    chunk_id?: string | null;
    relevance: number;
    excerpt?: string | null;
  }>;
  confidence: number;
  tool_used: "sql" | "rag" | "hybrid" | "none";
  debug?: Record<string, unknown> | null;
}
```

**UI:** Replace or finalize the streamed answer with `data.answer`, and show `data.citations` and `data.confidence` / `data.tool_used` as needed.

---

### 6. `event: error`

Something went wrong (e.g. backend exception).

**Data (parsed):**

```ts
{
  error: string;
}
```

**UI:** Show an error state and `data.error` to the user.

---

### 7. `event: ping`

Keep-alive (sent when the stream is idle for a while). Optional to handle.

**Data (parsed):** `{ ts: number }`.

**UI:** No need to show; can be used to detect a live connection.

---

## Suggested UI flow

1. **Thinking / steps**  
   On each `event: thinking`, append or update a "Steps" or "Thinking" section with `data.message` (and optionally `data.node`).  
   - When `data.node === "sql"` and `data.message === "Calling SQL"`, show a "Calling SQL" label and wait for `event: sql` to show the query.  
   - When `data.node === "rag"` and `data.message === "Calling RAG"`, show "Calling RAG" and wait for `event: rag_chunks` to show the chunks.

2. **SQL**  
   On `event: sql`, display `data.query` in a code block (e.g. under "Calling SQL").

3. **RAG chunks**  
   On `event: rag_chunks`, show `data.message` and render `data.chunks` (excerpt, source, relevance).

4. **Streaming answer**  
   On each `event: token`, append `data.text` to the answer area.

5. **Final**  
   On `event: done`, set the final answer to `data.answer`, show citations from `data.citations`, and hide or collapse the "thinking" section if desired.

6. **Error**  
   On `event: error`, show `data.error` and stop streaming.

---

## Example: parsing the stream (TypeScript)

```ts
const response = await fetch(`${API_BASE}/agent/stream`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    query: userInput,
    session_id: sessionId,
    history: conversationHistory,
  }),
});

if (!response.ok) throw new Error(response.statusText);
const reader = response.body?.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader!.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n\n");
  buffer = lines.pop() ?? "";
  for (const block of lines) {
    const eventMatch = block.match(/^event:\s*(.+)$/m);
    const dataMatch = block.match(/^data:\s*(.+)$/m);
    const event = eventMatch?.[1]?.trim();
    const dataJson = dataMatch?.[1]?.trim();
    if (!event || !dataJson) continue;
    try {
      const data = JSON.parse(dataJson);
      switch (event) {
        case "thinking":
          appendThinkingStep(data);
          if (data.sql) showSql(data.sql);
          break;
        case "sql":
          showSql(data.query);
          break;
        case "rag_chunks":
          showRagChunks(data);
          break;
        case "token":
          appendAnswerToken(data.text);
          break;
        case "done":
          setFinalResponse(data);
          break;
        case "error":
          showError(data.error);
          break;
        case "ping":
          // optional: keep-alive
          break;
      }
    } catch (e) {
      console.warn("Parse SSE data", e);
    }
  }
}
```

---

## Summary for the UI repo

- **POST** `/agent/stream` with **Bearer** auth and JSON body: `{ query, session_id, history?, options? }`.
- **Parse SSE:** `event` + `data` (JSON).
- **Events:** `thinking` (steps + optional `sql`) → `sql` (query) → `rag_chunks` (chunks) → `token` (streaming answer) → `done` (final answer + citations) or `error`.
- **UI:** Show "Calling SQL" + SQL from `sql`/`thinking`, "Calling RAG" + list from `rag_chunks`, stream text from `token`, then finalize with `done`.

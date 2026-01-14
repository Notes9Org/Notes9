"""Summarizer node for answer synthesis."""
import time
import structlog
from typing import Dict
from agents.graph.state import AgentState
from agents.services.llm_client import LLMClient, LLMError
from agents.graph.nodes.normalize import get_llm_client
from services.trace_service import TraceService

logger = structlog.get_logger()

# Singleton trace service
_trace_service: TraceService = None


def get_trace_service() -> TraceService:
    """Get or create trace service singleton."""
    global _trace_service
    if _trace_service is None:
        _trace_service = TraceService()
    return _trace_service


def summarizer_node(state: AgentState) -> AgentState:
    """
    Synthesize answer from SQL facts and RAG evidence.
    
    Combines results into scientific summary with citations.
    """
    start_time = time.time()
    sql_result = state.get("sql_result")
    rag_result = state.get("rag_result", [])
    normalized = state.get("normalized_query")
    request = state["request"]
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    logger.info(
        "summarizer_node started",
        run_id=run_id,
        has_sql=sql_result is not None,
        rag_chunks=len(rag_result)
    )
    
    # Log input event
    if run_id:
        try:
            trace_service.log_event(
                run_id=run_id,
                node_name="summarizer",
                event_type="input",
                payload={
                    "sql_rows": sql_result.get("row_count", 0) if sql_result else 0,
                    "rag_chunks": len(rag_result)
                }
            )
        except Exception:
            pass
    
    try:
        llm_client = get_llm_client()
        
        # Build context from SQL results
        sql_context = ""
        if sql_result and sql_result.get("data"):
            sql_context = f"SQL Facts:\n{_format_sql_result(sql_result)}"
        else:
            sql_context = "SQL Facts: None available"
        
        # Build context from RAG chunks
        rag_context = ""
        if rag_result:
            rag_context = "RAG Evidence:\n"
            for i, chunk in enumerate(rag_result, 1):
                rag_context += f"\n[{i}] Source: {chunk.get('source_type')} (ID: {chunk.get('source_id')})\n"
                rag_context += f"Similarity: {chunk.get('similarity', 0.0):.3f}\n"
                rag_context += f"Content: {chunk.get('content', '')}\n"
        else:
            rag_context = "RAG Evidence: None available"
        
        # Build prompt
        original_query = normalized.normalized_query if normalized else request["query"]
        
        prompt = f"""Synthesize a scientific answer from the following data for a lab management system.

User Query: {original_query}

{sql_context}

{rag_context}

Requirements:
1. Answer must be factual and cite sources
2. SQL facts are authoritative numbers - use them directly
3. RAG evidence provides context and details - cite specific chunks
4. All claims must have citations referencing the source
5. Use scientific terminology appropriate for lab management
6. If SQL and RAG conflict, prefer SQL for numbers, RAG for context
7. If no relevant data, say so clearly

Return JSON with:
{{
  "answer": "Complete answer text with citations in [1], [2] format",
  "citations": [
    {{
      "source_type": "lab_note|protocol|report|experiment_summary",
      "source_id": "UUID",
      "chunk_id": "UUID or null",
      "relevance": 0.0-1.0,
      "excerpt": "Relevant excerpt or null"
    }}
  ]
}}

Citations must reference actual sources from the RAG evidence or SQL results."""

        # Define schema
        schema = {
            "type": "object",
            "properties": {
                "answer": {"type": "string"},
                "citations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "source_type": {"type": "string"},
                            "source_id": {"type": "string"},
                            "chunk_id": {"type": ["string", "null"]},
                            "relevance": {"type": "number"},
                            "excerpt": {"type": ["string", "null"]}
                        },
                        "required": ["source_type", "source_id", "relevance"]
                    }
                }
            },
            "required": ["answer", "citations"]
        }
        
        # Call LLM
        result = llm_client.complete_json(prompt, schema, temperature=0.3)
        
        # Validate citations map to actual sources
        validated_citations = []
        rag_source_map = {
            (chunk.get("source_type"), chunk.get("source_id")): chunk
            for chunk in rag_result
        }
        
        for citation in result.get("citations", []):
            source_key = (citation.get("source_type"), citation.get("source_id"))
            
            # Validate citation exists in RAG results or is from SQL
            if source_key in rag_source_map or citation.get("source_type") == "sql":
                validated_citations.append(citation)
            else:
                logger.warning(
                    "Invalid citation filtered out",
                    source_type=citation.get("source_type"),
                    source_id=citation.get("source_id")
                )
        
        summary = {
            "answer": result.get("answer", ""),
            "citations": validated_citations
        }
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            "summarizer_node completed",
            run_id=run_id,
            answer_length=len(summary["answer"]),
            citations_count=len(validated_citations),
            latency_ms=round(latency_ms, 2)
        )
        
        state["summary"] = summary
        
        # Log output event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="summarizer",
                    event_type="output",
                    payload={
                        "answer_length": len(summary["answer"]),
                        "citations_count": len(validated_citations)
                    },
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        # Add to trace if debug enabled
        if request.get("options", {}).get("debug"):
            state["trace"].append({
                "node": "summarizer",
                "input": {
                    "sql_rows": sql_result.get("row_count", 0) if sql_result else 0,
                    "rag_chunks": len(rag_result)
                },
                "output": {
                    "answer_length": len(summary["answer"]),
                    "citations_count": len(validated_citations)
                },
                "latency_ms": round(latency_ms, 2),
                "timestamp": time.time()
            })
        
        return state
        
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "summarizer_node failed",
            run_id=run_id,
            error=str(e),
            latency_ms=round(latency_ms, 2)
        )
        
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="summarizer",
                    event_type="error",
                    payload={"error": str(e)},
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        # Set error summary
        state["summary"] = {
            "answer": f"Error synthesizing answer: {str(e)}",
            "citations": []
        }
        
        return state


def _format_sql_result(sql_result: Dict) -> str:
    """Format SQL result for prompt."""
    if not sql_result or not sql_result.get("data"):
        return "No data"
    
    lines = []
    for row in sql_result["data"]:
        line = ", ".join([f"{k}={v}" for k, v in row.items()])
        lines.append(line)
    
    return "\n".join(lines)
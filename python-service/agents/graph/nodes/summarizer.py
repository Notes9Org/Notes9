"""Summarizer node for answer synthesis."""
import time
import structlog
from typing import Dict
from agents.graph.state import AgentState
from agents.services.llm_client import LLMClient, LLMError
from agents.graph.nodes.normalize import get_llm_client
from services.trace_service import TraceService
from agents.services.thinking_logger import get_thinking_logger

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
    rag_result = state.get("rag_result")  # Can be None if RAG was skipped
    if rag_result is None:
        rag_result = []  # Default to empty list if None
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
        if sql_result and isinstance(sql_result, dict):
            if sql_result.get("data") and not sql_result.get("error"):
                sql_context = f"SQL Facts:\n{_format_sql_result(sql_result)}"
            elif sql_result.get("error"):
                sql_context = f"SQL Facts: Error occurred - {sql_result.get('error', 'Unknown error')}"
            else:
                sql_context = "SQL Facts: No data returned"
        else:
            sql_context = "SQL Facts: None available"
        
        # Build context from RAG chunks
        rag_context = ""
        if rag_result and isinstance(rag_result, list) and len(rag_result) > 0:
            rag_context = "RAG Evidence:\n"
            for i, chunk in enumerate(rag_result, 1):
                if isinstance(chunk, dict):
                    rag_context += f"\n[{i}] Source: {chunk.get('source_type', 'unknown')} (ID: {chunk.get('source_id', 'unknown')})\n"
                    rag_context += f"Similarity: {chunk.get('similarity', 0.0):.3f}\n"
                    rag_context += f"Content: {chunk.get('content', '')[:500]}\n"
        else:
            rag_context = "RAG Evidence: None available"
        
        # Build prompt
        query_text = request.get("query", "") if isinstance(request, dict) else getattr(request, "query", "")
        original_query = normalized.normalized_query if normalized else query_text
        
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
        try:
            result = llm_client.complete_json(prompt, schema, temperature=0.3)
        except Exception as e:
            logger.error("Summarizer LLM call failed", error=str(e), run_id=run_id)
            # Return error summary
            state["summary"] = {
                "answer": f"Error synthesizing answer: {str(e)}",
                "citations": []
            }
            return state
        
        if not result or not isinstance(result, dict):
            logger.error("Invalid LLM result in summarizer", run_id=run_id)
            state["summary"] = {
                "answer": "Error: Invalid response from synthesis",
                "citations": []
            }
            return state
        
        # Validate citations map to actual sources
        validated_citations = []
        rag_source_map = {}
        if rag_result and isinstance(rag_result, list) and len(rag_result) > 0:
            for chunk in rag_result:
                if isinstance(chunk, dict):
                    source_type = chunk.get("source_type")
                    source_id = chunk.get("source_id")
                    if source_type and source_id:
                        rag_source_map[(source_type, source_id)] = chunk
        
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
        
        # Log thinking: synthesis reasoning
        thinking_logger = get_thinking_logger()
        if run_id:
            thinking_logger.log_analysis(
                run_id=run_id,
                node_name="summarizer",
                analysis=f"Synthesized answer from {len(validated_citations)} citations",
                data_summary={
                    "sql_rows": sql_result.get("row_count", 0) if sql_result else 0,
                    "rag_chunks": len(rag_result),
                    "answer_length": len(summary["answer"]),
                    "citations_count": len(validated_citations)
                },
                insights=[
                    f"Combined SQL facts with RAG evidence",
                    f"Validated {len(validated_citations)} citations",
                    f"Generated {len(summary['answer'])} character answer"
                ]
            )
        
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
        options = request.get("options", {}) if isinstance(request, dict) else getattr(request, "options", {}) if hasattr(request, "options") else {}
        if (isinstance(options, dict) and options.get("debug")) or (hasattr(options, "debug") and getattr(options, "debug", False)):
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
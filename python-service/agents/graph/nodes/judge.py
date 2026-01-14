"""Judge node for answer validation."""
import time
import structlog
from typing import Dict
from agents.graph.state import AgentState
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


def judge_node(state: AgentState) -> AgentState:
    """
    Validate answer quality using LLM-as-Judge.
    
    Checks factual consistency, citation coverage, scope leakage, completeness.
    """
    start_time = time.time()
    summary = state.get("summary")
    sql_result = state.get("sql_result")
    rag_result = state.get("rag_result", [])
    normalized = state.get("normalized_query")
    request = state["request"]
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    if not summary:
        logger.error("judge_node: summary missing", run_id=run_id)
        judge_output = {
            "verdict": "fail",
            "confidence": 0.0,
            "issues": ["Summary missing"],
            "suggested_revision": None
        }
        state["judge_result"] = judge_output
        
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="judge",
                    event_type="error",
                    payload={"error": "summary missing"}
                )
            except Exception:
                pass
        
        return state
    
    logger.info(
        "judge_node started",
        run_id=run_id,
        answer_length=len(summary.get("answer", "")),
        citations_count=len(summary.get("citations", []))
    )
    
    # Log input event
    if run_id:
        try:
            trace_service.log_event(
                run_id=run_id,
                node_name="judge",
                event_type="input",
                payload={
                    "answer_length": len(summary.get("answer", "")),
                    "citations_count": len(summary.get("citations", []))
                }
            )
        except Exception:
            pass
    
    try:
        llm_client = get_llm_client()
        
        # Build context
        original_query = normalized.normalized_query if normalized else request["query"]
        answer = summary.get("answer", "")
        citations = summary.get("citations", [])
        
        sql_facts = ""
        if sql_result and sql_result.get("data"):
            sql_facts = _format_sql_result(sql_result)
        else:
            sql_facts = "None"
        
        rag_evidence = ""
        if rag_result:
            rag_evidence = "\n".join([
                f"[{i+1}] {chunk.get('content', '')[:200]}"
                for i, chunk in enumerate(rag_result[:3])
            ])
        else:
            rag_evidence = "None"
        
        citations_text = "\n".join([
            f"- {c.get('source_type')} (ID: {c.get('source_id')}): relevance={c.get('relevance', 0.0):.2f}"
            for c in citations
        ])
        
        prompt = f"""Judge the following answer for a scientific lab management query.

Original Query: {original_query}

Generated Answer:
{answer}

Citations:
{citations_text}

SQL Facts (authoritative):
{sql_facts}

RAG Evidence (context):
{rag_evidence}

Evaluate the answer on:
1. Factual Consistency: Do numbers/statistics in the answer match SQL facts? Are claims supported?
2. Citation Coverage: Are all factual claims properly cited? Do citations reference real sources?
3. Scope Leakage: Does the answer stay within the query scope? No hallucinated information?
4. Completeness: Does the answer fully address the query? Missing important points?

Return JSON with:
{{
  "verdict": "pass" or "fail",
  "confidence": 0.0-1.0,
  "issues": ["list of specific issues if any"],
  "suggested_revision": "optional improved answer or null"
}}

Verdict "pass" if:
- Facts match SQL data
- All claims are cited
- No scope leakage
- Query is answered

Verdict "fail" if any major issue exists."""

        # Define schema
        schema = {
            "type": "object",
            "properties": {
                "verdict": {"type": "string", "enum": ["pass", "fail"]},
                "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                "issues": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "suggested_revision": {"type": ["string", "null"]}
            },
            "required": ["verdict", "confidence", "issues"]
        }
        
        # Call LLM
        result = llm_client.complete_json(prompt, schema, temperature=0.0)
        
        judge_output = {
            "verdict": result.get("verdict", "fail"),
            "confidence": float(result.get("confidence", 0.0)),
            "issues": result.get("issues", []),
            "suggested_revision": result.get("suggested_revision")
        }
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            "judge_node completed",
            run_id=run_id,
            verdict=judge_output["verdict"],
            confidence=judge_output["confidence"],
            issues_count=len(judge_output["issues"]),
            latency_ms=round(latency_ms, 2)
        )
        
        state["judge_result"] = judge_output
        
        # Log output event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="judge",
                    event_type="output",
                    payload={
                        "verdict": judge_output["verdict"],
                        "confidence": judge_output["confidence"],
                        "issues_count": len(judge_output["issues"])
                    },
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        # Add to trace if debug enabled
        if request.get("options", {}).get("debug"):
            state["trace"].append({
                "node": "judge",
                "input": {
                    "answer_length": len(answer),
                    "citations_count": len(citations)
                },
                "output": judge_output,
                "latency_ms": round(latency_ms, 2),
                "timestamp": time.time()
            })
        
        return state
        
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "judge_node failed",
            run_id=run_id,
            error=str(e),
            latency_ms=round(latency_ms, 2)
        )
        
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="judge",
                    event_type="error",
                    payload={"error": str(e)},
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        # Default to fail on error
        state["judge_result"] = {
            "verdict": "fail",
            "confidence": 0.0,
            "issues": [f"Judge error: {str(e)}"],
            "suggested_revision": None
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
"""Final node for response formatting."""
import time
import structlog
from agents.graph.state import AgentState
from agents.contracts.response import FinalResponse, Citation
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


def final_node(state: AgentState) -> AgentState:
    """
    Format final response with answer, citations, confidence, and debug trace.
    """
    start_time = time.time()
    summary = state.get("summary")
    judge = state.get("judge_result")
    router = state.get("router_decision")
    retry_count = state.get("retry_count", 0)
    request = state["request"]
    trace = state.get("trace", [])
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    logger.info(
        "final_node started",
        run_id=run_id,
        has_summary=summary is not None,
        has_judge=judge is not None,
        retry_count=retry_count
    )
    
    # Log input event
    if run_id:
        try:
            trace_service.log_event(
                run_id=run_id,
                node_name="final",
                event_type="input",
                payload={
                    "has_summary": summary is not None,
                    "has_judge": judge is not None,
                    "retry_count": retry_count
                }
            )
        except Exception:
            pass
    
    try:
        # Determine tool used
        tool_used = "rag"  # Default
        if router:
            tools = router.tools
            if "sql" in tools and "rag" in tools:
                tool_used = "hybrid"
            elif "sql" in tools:
                tool_used = "sql"
            elif "rag" in tools:
                tool_used = "rag"
        
        # Handle error cases
        if not summary:
            answer = "Unable to generate answer. Please try rephrasing your query."
            citations = []
            confidence = 0.0
        else:
            answer = summary.get("answer", "")
            
            # Convert citations to Citation objects
            citations = []
            for cit in summary.get("citations", []):
                citations.append(Citation(
                    source_type=cit.get("source_type", "unknown"),
                    source_id=cit.get("source_id", ""),
                    chunk_id=cit.get("chunk_id"),
                    relevance=float(cit.get("relevance", 0.0)),
                    excerpt=cit.get("excerpt")
                ))
            
            # Determine confidence
            if judge and judge.get("verdict") == "pass":
                confidence = judge.get("confidence", 0.7)
                # Boost confidence for hybrid
                if tool_used == "hybrid":
                    confidence = min(confidence + 0.1, 1.0)
            elif tool_used == "sql":
                # SQL-only queries are high confidence
                confidence = 0.9
            else:
                # Default confidence
                confidence = 0.6
        
        # Build debug trace if enabled
        debug = None
        if request.get("options", {}).get("debug"):
            debug = {
                "trace": trace,
                "retry_count": retry_count,
                "router_decision": {
                    "tools": router.tools if router else [],
                    "reasoning": router.reasoning if router else None
                } if router else None,
                "judge_verdict": judge.get("verdict") if judge else None,
                "total_latency_ms": sum(t.get("latency_ms", 0) for t in trace)
            }
        
        # Create final response
        final_response = FinalResponse(
            answer=answer,
            citations=citations,
            confidence=confidence,
            tool_used=tool_used,
            debug=debug
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            "final_node completed",
            run_id=run_id,
            answer_length=len(answer),
            citations_count=len(citations),
            confidence=confidence,
            tool_used=tool_used,
            latency_ms=round(latency_ms, 2)
        )
        
        state["final_response"] = final_response
        
        # Log output event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="final",
                    event_type="output",
                    payload={
                        "answer_length": len(answer),
                        "citations_count": len(citations),
                        "confidence": confidence,
                        "tool_used": tool_used
                    },
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        return state
        
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "final_node failed",
            run_id=run_id,
            error=str(e),
            latency_ms=round(latency_ms, 2)
        )
        
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="final",
                    event_type="error",
                    payload={"error": str(e)},
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        # Error response
        state["final_response"] = FinalResponse(
            answer=f"Error formatting response: {str(e)}",
            citations=[],
            confidence=0.0,
            tool_used="rag"
        )
        
        return state
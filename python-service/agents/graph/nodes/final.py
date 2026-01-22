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
    """Format final response with answer, citations, confidence, and debug trace."""
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
        agent_node="final",
        run_id=run_id,
        has_summary=summary is not None,
        has_judge=judge is not None,
        retry_count=retry_count,
        payload={
            "input_has_summary": summary is not None,
            "input_has_judge": judge is not None,
            "input_retry_count": retry_count
        }
    )
    
    if run_id:
        try:
            trace_service.log_event(run_id=run_id, node_name="final", event_type="input",
                                   payload={"has_summary": summary is not None, "has_judge": judge is not None})
        except Exception:
            pass
    
    try:
        tool_used = "rag"
        if router:
            if isinstance(router, dict):
                tools = router.get("tools", [])
            else:
                tools = getattr(router, "tools", [])
            
            if isinstance(tools, list):
                if "sql" in tools and "rag" in tools:
                    tool_used = "hybrid"
                elif "sql" in tools:
                    tool_used = "sql"
                elif "rag" in tools:
                    tool_used = "rag"
        
        if not summary:
            answer = "Unable to generate answer. Please try rephrasing your query."
            citations = []
            confidence = 0.0
        else:
            answer = summary.get("answer", "")
            citations = []
            for cit in summary.get("citations", []):
                citations.append(Citation(
                    source_type=cit.get("source_type", "unknown"),
                    source_id=cit.get("source_id", ""),
                    chunk_id=cit.get("chunk_id"),
                    relevance=float(cit.get("relevance", 0.0)),
                    excerpt=cit.get("excerpt")
                ))
            
            if judge and judge.get("verdict") == "pass":
                confidence = judge.get("confidence", 0.7)
                if tool_used == "hybrid":
                    confidence = min(confidence + 0.1, 1.0)
            elif tool_used == "sql":
                confidence = 0.9
            else:
                confidence = 0.6
        
        debug = None
        options = request.get("options", {}) if isinstance(request, dict) else getattr(request, "options", {}) if hasattr(request, "options") else {}
        if (isinstance(options, dict) and options.get("debug")) or (hasattr(options, "debug") and getattr(options, "debug", False)):
            router_tools = []
            if router:
                router_tools = router.get("tools", []) if isinstance(router, dict) else getattr(router, "tools", [])
            
            judge_verdict = judge.get("verdict") if judge and isinstance(judge, dict) else getattr(judge, "verdict", None) if judge else None
            debug = {
                "trace": trace, "retry_count": retry_count,
                "router_decision": {"tools": router_tools},
                "judge_verdict": judge_verdict
            }
        
        final_response = FinalResponse(
            answer=answer, citations=citations, confidence=confidence, tool_used=tool_used, debug=debug
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        logger.info("final_node completed", agent_node="final", run_id=run_id,
                   answer_length=len(answer), confidence=confidence, tool_used=tool_used,
                   payload={"input_has_summary": summary is not None, "input_has_judge": judge is not None,
                           "output_answer_length": len(answer), "output_confidence": confidence,
                           "output_tool_used": tool_used, "output_citations_count": len(citations)})
        state["final_response"] = final_response
        
        if run_id:
            try:
                trace_service.log_event(run_id=run_id, node_name="final", event_type="output",
                                      payload={"answer_length": len(answer), "confidence": confidence},
                                      latency_ms=latency_ms)
            except Exception:
                pass
        
        return state
        
    except Exception as e:
        logger.error("final_node failed", run_id=run_id, error=str(e))
        
        if run_id:
            try:
                trace_service.log_event(run_id=run_id, node_name="final", event_type="error",
                                      payload={"error": str(e)})
            except Exception:
                pass
        
        state["final_response"] = FinalResponse(
            answer=f"Error formatting response: {str(e)}", citations=[], confidence=0.0, tool_used="rag"
        )
        return state
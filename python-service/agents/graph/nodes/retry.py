"""Retry node for ReAct-style refinement."""
import structlog
from agents.graph.state import AgentState
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


def retry_node(state: AgentState) -> AgentState:
    """Handle retries: if judge fails and retries available, reset state and retry."""
    judge = state.get("judge_result")
    retry_count = state.get("retry_count", 0)
    request = state["request"]
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    options = request.get("options", {}) if isinstance(request, dict) else getattr(request, "options", {}) if hasattr(request, "options") else {}
    max_retries = options.get("max_retries", 2) if isinstance(options, dict) else getattr(options, "max_retries", 2)
    
    if judge and judge.get("verdict") == "pass":
        return state
    
    if retry_count >= max_retries:
        if run_id:
            try:
                trace_service.log_event(run_id=run_id, node_name="retry", event_type="output",
                                       payload={"action": "max_retries_reached", "retry_count": retry_count})
            except Exception:
                pass
        return state
    
    new_retry_count = retry_count + 1
    state["retry_count"] = new_retry_count
    
    if new_retry_count >= max_retries:
        if run_id:
            try:
                trace_service.log_event(run_id=run_id, node_name="retry", event_type="output",
                                       payload={"action": "max_retries_reached", "retry_count": new_retry_count})
            except Exception:
                pass
        return state
    
    thinking_logger = get_thinking_logger()
    if run_id:
        thinking_logger.log_reasoning(
            run_id=run_id, node_name="retry",
            reasoning=f"Retry attempt {new_retry_count}/{max_retries}",
            factors=[f"Judge verdict: {judge.get('verdict') if judge else 'unknown'}"],
            conclusion="Resetting state and retrying"
        )
    
    state["router_decision"] = None
    state["sql_result"] = None
    state["rag_result"] = []
    state["summary"] = None
    state["judge_result"] = None
    
    if run_id:
        try:
            trace_service.log_event(run_id=run_id, node_name="retry", event_type="output",
                                   payload={"action": "retry_initiated", "retry_count": new_retry_count})
        except Exception:
            pass
    
    return state
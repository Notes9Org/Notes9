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
    """
    Handle retries with query refinement.
    
    If judge fails and retry_count < max_retries, refine query and retry.
    Otherwise, proceed to final node.
    """
    judge = state.get("judge_result")
    retry_count = state.get("retry_count", 0)
    request = state["request"]
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    # Handle both dict and object access
    options = request.get("options", {}) if isinstance(request, dict) else getattr(request, "options", {}) if hasattr(request, "options") else {}
    max_retries = options.get("max_retries", 2) if isinstance(options, dict) else getattr(options, "max_retries", 2)
    
    logger.info(
        "retry_node started",
        run_id=run_id,
        verdict=judge.get("verdict") if judge else None,
        retry_count=retry_count,
        max_retries=max_retries
    )
    
    # Log input event
    if run_id:
        try:
            trace_service.log_event(
                run_id=run_id,
                node_name="retry",
                event_type="input",
                payload={
                    "verdict": judge.get("verdict") if judge else None,
                    "retry_count": retry_count,
                    "max_retries": max_retries
                }
            )
        except Exception:
            pass
    
    # If judge passed, no retry needed - preserve state and go to final
    if judge and judge.get("verdict") == "pass":
        logger.debug("retry_node: judge passed, no retry needed", run_id=run_id)
        return state
    
    # CRITICAL: Check max retries BEFORE resetting state
    # If max retries reached, preserve the last attempt's results and go to final
    if retry_count >= max_retries:
        logger.info(
            "retry_node: max retries reached, preserving last attempt results",
            run_id=run_id,
            retry_count=retry_count,
            max_retries=max_retries,
            has_summary=state.get("summary") is not None,
            has_judge=state.get("judge_result") is not None,
            summary_keys=list(state.get("summary", {}).keys()) if state.get("summary") else [],
            judge_verdict=judge.get("verdict") if judge else None
        )
        # Log output event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="retry",
                    event_type="output",
                    payload={
                        "action": "max_retries_reached",
                        "retry_count": retry_count,
                        "has_summary": state.get("summary") is not None,
                        "has_judge": state.get("judge_result") is not None
                    }
                )
            except Exception:
                pass
        # DO NOT reset state - preserve summary and judge_result for final node
        return state
    
    # Retry: increment count and check if we've hit max retries
    new_retry_count = retry_count + 1
    state["retry_count"] = new_retry_count
    
    # CRITICAL: If incrementing to max_retries, preserve state and go to final
    # Don't reset state if this will be the last attempt
    if new_retry_count >= max_retries:
        logger.info(
            "retry_node: reached max retries after increment, preserving state for final",
            run_id=run_id,
            retry_count=new_retry_count,
            max_retries=max_retries,
            has_summary=state.get("summary") is not None,
            has_judge=state.get("judge_result") is not None
        )
        # Log output event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="retry",
                    event_type="output",
                    payload={
                        "action": "max_retries_reached_after_increment",
                        "retry_count": new_retry_count,
                        "has_summary": state.get("summary") is not None,
                        "has_judge": state.get("judge_result") is not None
                    }
                )
            except Exception:
                pass
        # DO NOT reset state - preserve summary and judge_result for final node
        return state
    
    # Log thinking: retry reasoning
    thinking_logger = get_thinking_logger()
    if run_id:
        judge_issues = judge.get("issues", []) if judge else []
        thinking_logger.log_reasoning(
            run_id=run_id,
            node_name="retry",
            reasoning=f"Retry attempt {new_retry_count}/{max_retries}",
            factors=[
                f"Judge verdict: {judge.get('verdict') if judge else 'unknown'}",
                f"Issues found: {len(judge_issues)}",
                f"Has suggestion: {bool(judge and judge.get('suggested_revision'))}"
            ],
            conclusion=f"Resetting state and retrying from router"
        )
    
    # Optionally refine normalized_query using judge's suggested_revision
    if judge and judge.get("suggested_revision"):
        logger.info(
            "retry_node: refining query",
            run_id=run_id,
            retry_count=new_retry_count,
            has_suggestion=True
        )
        # Note: In a full implementation, you might refine the normalized_query here
        # For now, we'll just reset intermediate results and let the graph retry
    
    # Reset intermediate results for retry (ONLY if we're actually retrying, not at max)
    state["router_decision"] = None
    state["sql_result"] = None
    state["rag_result"] = []
    state["summary"] = None
    state["judge_result"] = None
    
    logger.info(
        "retry_node: prepared for retry",
        run_id=run_id,
        retry_count=new_retry_count
    )
    
    # Log output event
    if run_id:
        try:
            trace_service.log_event(
                run_id=run_id,
                node_name="retry",
                event_type="output",
                payload={
                    "action": "retry_initiated",
                    "retry_count": new_retry_count,
                    "reason": judge.get("issues", [])[:3] if judge else []  # First 3 issues
                }
            )
        except Exception:
            pass
    
    return state
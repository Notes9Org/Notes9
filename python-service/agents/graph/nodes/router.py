"""Router node for tool selection."""
import time
import structlog
from agents.graph.state import AgentState
from agents.contracts.router import RouterDecision
from services.trace_service import TraceService
from agents.services.thinking_logger import get_thinking_logger

logger = structlog.get_logger()

_trace_service: TraceService = None


def get_trace_service() -> TraceService:
    """Get or create trace service singleton."""
    global _trace_service
    if _trace_service is None:
        _trace_service = TraceService()
    return _trace_service


def router_node(state: AgentState) -> AgentState:
    """Route to tools based on intent."""

    start_time = time.time()
    normalized = state.get("normalized_query")
    request = state.get("request")
    run_id = state.get("run_id")
    trace_service = get_trace_service()

    if not normalized:
        logger.error("No normalized query found in state.", run_id=run_id, request=request)

        decision = RouterDecision(
            tools=["rag"],
            confidence=0.4,
            reasoning="Fallback: normalized query missing.",
            constraints={}
        )
        state["router_decision"] = decision
        
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="router",
                    event_type="error",
                    payload={"error": "normalized query missing"}
                )
            except Exception:
                pass
        
        return state
    
    normalized_query_text = normalized.normalized_query[:100] if normalized and normalized.normalized_query else "None"
    logger.info(
        "Router node started",
        agent_node="router",
        run_id=run_id,
        normalized_query=normalized_query_text,
        payload={
            "input_intent": normalized.intent if normalized else None,
            "input_normalized_query": normalized.normalized_query if normalized else None
        }
    )

    # Log input event
    if run_id:
        try:
            trace_service.log_event(
                run_id=run_id,
                node_name="router",
                event_type="input",
                payload={"intent": normalized.intent}
            )
        except Exception:
            pass

    try:
        thinking_logger = get_thinking_logger()

        if normalized.intent == "aggregate":
            tools = ["sql"]
            confidence = 0.9
            reasoning = "Intent: aggregate (SQL) data analysis."
        elif normalized.intent == "search":
            tools = ["rag"]
            confidence = 0.8
            reasoning = "Intent: search (RAG) semantic retrieval."
        elif normalized.intent == "hybrid":
            tools = ["sql", "rag"]
            confidence = 0.85
            reasoning = "Intent: hybrid (SQL + RAG) comprehensive analysis."
        else:
            tools = ["rag"]
            confidence = 0.5
            reasoning = f"Fallback: unknown intent: {normalized.intent}."
        
        if run_id:
            thinking_logger.log_decision(
                run_id=run_id, node_name="router", decision=f"Route to {', '.join(tools)}",
                alternatives=["sql", "rag", "hybrid"], rationale=reasoning, confidence=confidence
            )

        constraints = {}
        entities = normalized.entities if normalized and isinstance(normalized.entities, dict) else {}
        
        if entities.get("dates"):
            constraints["date_range"] = entities["dates"]
        if entities.get("statuses"):
            constraints["status"] = entities["statuses"]
        if entities.get("sample_types"):
            constraints["sample_type"] = entities["sample_types"]
        if entities.get("time_range"):
            constraints["time_range"] = entities["time_range"]

        decision = RouterDecision(
            tools=tools,
            confidence=confidence,
            reasoning=reasoning,
            constraints=constraints
        )

        latency_ms = int((time.time() - start_time) * 1000)
        logger.info("router_node completed", agent_node="router", run_id=run_id,
                   tools=tools, confidence=confidence, latency_ms=round(latency_ms, 2),
                   payload={"input_intent": normalized.intent if normalized else None,
                           "input_normalized_query": normalized.normalized_query[:200] if normalized else None,
                           "output_tools": tools, "output_confidence": confidence, "output_reasoning": reasoning})
        state["router_decision"] = decision

        if run_id:
            try:
                trace_service.log_event(run_id=run_id, node_name="router", event_type="output",
                                       payload={"tools": tools, "confidence": confidence}, latency_ms=latency_ms)
            except Exception:
                pass

        options = request.get("options", {}) if isinstance(request, dict) else getattr(request, "options", {}) if hasattr(request, "options") else {}
        if (isinstance(options, dict) and options.get("debug")) or (hasattr(options, "debug") and getattr(options, "debug", False)):
            state["trace"].append({
                "node": "router", "input": {"intent": normalized.intent},
                "output": {"tools": tools, "confidence": confidence}, "latency_ms": round(latency_ms, 2)
            })
        
        return state
        
    except Exception as e:
        logger.error("router_node failed", run_id=run_id, error=str(e))
        
        if run_id:
            try:
                trace_service.log_event(run_id=run_id, node_name="router", event_type="error",
                                       payload={"error": str(e)})
            except Exception:
                pass
        
        state["router_decision"] = RouterDecision(
            tools=["rag"], confidence=0.5, reasoning=f"Error in routing: {str(e)}", constraints={}
        )
        return state
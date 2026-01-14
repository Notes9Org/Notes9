""" Router node for tool selection."""

import time
import structlog
from agents.graph.state import AgentState
from agents.contracts.router import RouterDecision
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

def router_node(state: AgentState) -> AgentState:
    """ Router node for tool selection based on intent.
    Uses deterministic routing rules based on intent."""

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
    
    logger.info("Router node started", run_id=run_id, request=request, normalized_query=normalized.normalized_query[:100])

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

        if normalized.intent == "aggregate":
            tools = ["sql"]
            confidence = 0.8
            reasoning = "Intent: aggregate (SQL) data analysis."
        elif normalized.intent == "search":
            tools = ["rag"]
            confidence = 0.6
            reasoning = "Intent: search (RAG) semantic retrieval."
        elif normalized.intent == "hybrid":
            tools = ["sql", "rag"]
            confidence = 0.7
            reasoning = "Intent: hybrid (SQL + RAG) comprehensive analysis."
        else:
            # Fallback
            tools = ["rag"]
            confidence = 0.4
            reasoning = f"Fallback: unknown intent: {normalized.intent}."

        constraints = {}

        if normalized.entities.get("dates"):
            constraints["date_range"] = normalized.entities["dates"]
        
        if normalized.entities.get("statuses"):
            constraints["status"] = normalized.entities["statuses"]

        if normalized.entities.get("sample_types"):
            constraints["sample_type"] = normalized.entities["sample_types"]

        if normalized.entities.get("time_range"):
            constraints["time_range"] = normalized.entities["time_range"]

        decision = RouterDecision(
            tools=tools,
            confidence=confidence,
            reasoning=reasoning,
            constraints=constraints
        )

        latency_ms = int((time.time() - start_time) * 1000)
        logger.info("Router node completed", run_id=run_id, tools=tools, confidence=confidence, latency_ms=round(latency_ms, 2))
        state["router_decision"] = decision

        # Log output event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="router",
                    event_type="output",
                    payload={
                        "tools": tools,
                        "confidence": confidence,
                        "reasoning": reasoning
                    },
                    latency_ms=latency_ms
                )
            except Exception:
                pass

        if request.get("options", {}).get("debug"):
            state["trace"].append({
                "node": "router",
                "input": {"intent": normalized.intent},
                "output": {
                    "tools": tools,
                    "confidence": confidence,
                    "reasoning": reasoning
                },
                "latency_ms": round(latency_ms, 2),
                "timestamp": time.time()
            })
        
        return state
        
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "router_node failed",
            run_id=run_id,
            error=str(e),
            latency_ms=round(latency_ms, 2)
        )
        
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="router",
                    event_type="error",
                    payload={"error": str(e)},
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        # Fallback decision
        state["router_decision"] = RouterDecision(
            tools=["rag"],
            confidence=0.5,
            reasoning=f"Error in routing: {str(e)}",
            constraints={}
        )
        
        return state
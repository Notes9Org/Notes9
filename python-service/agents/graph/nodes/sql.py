"""SQL execution node with dynamic SQL generation."""
import time
import structlog
from agents.graph.state import AgentState
from agents.services.sql_service import SQLService
from services.trace_service import TraceService
from agents.services.thinking_logger import get_thinking_logger

logger = structlog.get_logger()

# Singleton services
_sql_service: SQLService = None
_trace_service: TraceService = None


def get_sql_service() -> SQLService:
    """Get or create SQL service singleton."""
    global _sql_service
    if _sql_service is None:
        _sql_service = SQLService()
    return _sql_service


def get_trace_service() -> TraceService:
    """Get or create trace service singleton."""
    global _trace_service
    if _trace_service is None:
        _trace_service = TraceService()
    return _trace_service


def sql_node(state: AgentState) -> AgentState:
    """
    Execute SQL tool if selected by router.
    
    Generates SQL queries dynamically using LLM based on database schema.
    """
    start_time = time.time()
    router = state.get("router_decision")
    normalized = state.get("normalized_query")
    request = state["request"]
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    # Skip if SQL not in tools
    if not router or "sql" not in router.tools:
        logger.debug("sql_node skipped - SQL not in router tools", run_id=run_id)
        return state
    
    logger.info(
        "sql_node started",
        run_id=run_id,
        intent=normalized.intent if normalized else None,
        normalized_query=normalized.normalized_query[:100] if normalized else None
    )
    
    # Log input event
    if run_id:
        try:
            trace_service.log_event(
                run_id=run_id,
                node_name="sql",
                event_type="input",
                payload={
                    "query": request.get("query", "")[:200],
                    "normalized_query": normalized.normalized_query[:200] if normalized else None
                }
            )
        except Exception:
            pass
    
    try:
        sql_service = get_sql_service()
        
        # Get original query and normalized query
        original_query = request.get("query", "") if isinstance(request, dict) else getattr(request, "query", "")
        normalized_query_text = normalized.normalized_query if normalized else original_query
        entities = normalized.entities if normalized else {}
        scope = request.get("scope", {}) if isinstance(request, dict) else getattr(request, "scope", {})
        
        # Generate and execute SQL
        result = sql_service.generate_and_execute(
            query=original_query,
            normalized_query=normalized_query_text,
            entities=entities,
            scope=scope
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            "sql_node completed",
            run_id=run_id,
            row_count=result.get("row_count", 0),
            has_error="error" in result,
            generated_sql_preview=result.get("generated_sql", "")[:100] if result.get("generated_sql") else None,
            latency_ms=round(latency_ms, 2)
        )
        
        state["sql_result"] = result
        
        # Log thinking: SQL execution reasoning
        thinking_logger = get_thinking_logger()
        if run_id:
            has_error = "error" in result
            thinking_logger.log_analysis(
                run_id=run_id,
                node_name="sql",
                analysis=f"Executed SQL query: {'Success' if not has_error else 'Failed'}",
                data_summary={
                    "row_count": result.get("row_count", 0),
                    "has_error": has_error,
                    "execution_time_ms": result.get("execution_time_ms", 0)
                },
                insights=[
                    f"Query returned {result.get('row_count', 0)} rows",
                    f"Execution time: {result.get('execution_time_ms', 0)}ms"
                ] if not has_error else [f"Error: {result.get('error', 'Unknown')}"]
            )
        
        # Log output event (safe data only - no full SQL queries)
        if run_id:
            try:
                sql_preview = result.get("generated_sql", "")
                trace_service.log_event(
                    run_id=run_id,
                    node_name="sql",
                    event_type="output",
                    payload={
                        "row_count": result.get("row_count", 0),
                        "has_data": len(result.get("data", [])) > 0,
                        "has_error": "error" in result,
                        "generated_sql_preview": sql_preview[:200] if sql_preview else None,  # First 200 chars only
                        "execution_time_ms": result.get("execution_time_ms")
                    },
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        # Add to trace if debug enabled
        options = request.get("options", {}) if isinstance(request, dict) else getattr(request, "options", {}) if hasattr(request, "options") else {}
        if (isinstance(options, dict) and options.get("debug")) or (hasattr(options, "debug") and getattr(options, "debug", False)):
            state["trace"].append({
                "node": "sql",
                "input": {
                    "query": original_query[:200],
                    "normalized_query": normalized_query_text[:200] if normalized_query_text else None,
                    "entities": entities
                },
                "output": {
                    "row_count": result.get("row_count", 0),
                    "has_data": len(result.get("data", [])) > 0,
                    "generated_sql": result.get("generated_sql", "")[:500] if result.get("generated_sql") else None
                },
                "latency_ms": round(latency_ms, 2),
                "timestamp": time.time()
            })
        
        return state
        
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "sql_node failed",
            run_id=run_id,
            error=str(e),
            latency_ms=round(latency_ms, 2)
        )
        
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="sql",
                    event_type="error",
                    payload={"error": str(e)},
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        # Set error result
        state["sql_result"] = {
            "data": [],
            "row_count": 0,
            "error": str(e),
            "execution_time_ms": round(latency_ms, 2)
        }
        
        return state
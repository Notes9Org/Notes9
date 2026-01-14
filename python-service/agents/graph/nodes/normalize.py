"""Normalize user query node."""
import time
import structlog
from agents.graph.state import AgentState
from agents.contracts.normalized import NormalizedQuery
from agents.services.llm_client import LLMClient, LLMError
from services.trace_service import TraceService
from agents.graph.nodes.normalize_validator import validate_normalized_output

logger = structlog.get_logger()

# Singleton LLM client (will be initialized on first use)
_llm_client: LLMClient = None
_trace_service: TraceService = None


def get_llm_client() -> LLMClient:
    """Get or create LLM client singleton."""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client


def get_trace_service() -> TraceService:
    """Get or create trace service singleton."""
    global _trace_service
    if _trace_service is None:
        _trace_service = TraceService()
    return _trace_service


def normalize_node(state: AgentState) -> AgentState:
    """
    Normalize user query into structured format.
    
    Converts raw query + history + scope → NormalizedQuery with intent, entities, context.
    """
    start_time = time.time()
    request = state["request"]
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    logger.info(
        "normalize_node started",
        run_id=run_id,
        query=request["query"][:100],
        user_id=request["user_id"],
        has_history=len(request.get("history", [])) > 0
    )
    
    # Log input event (enhanced)
    if run_id:
        try:
            trace_service.log_event(
                run_id=run_id,
                node_name="normalize",
                event_type="input",
                payload={
                    "query": request["query"][:200],
                    "has_history": len(request.get("history", [])) > 0,
                    "history_length": len(request.get("history", [])),
                    "scope_keys": list(request.get("scope", {}).keys()),
                    "has_organization_id": bool(request.get("scope", {}).get("organization_id")),
                    "has_project_id": bool(request.get("scope", {}).get("project_id"))
                }
            )
        except Exception:
            pass  # Don't break execution if trace logging fails
    
    try:
        # Build prompt
        history_text = ""
        if request.get("history"):
            history_text = "\n".join([
                f"{msg['role']}: {msg['content']}"
                for msg in request["history"][-5:]  # Last 5 messages
            ])
        
        scope_text = ", ".join([
            f"{k}={v}" for k, v in request["scope"].items() if v
        ])
        
        prompt = f"""Normalize the following user query for a scientific lab management system.

User Query: {request['query']}

Conversation History:
{history_text if history_text else 'None'}

Context (Scope):
{scope_text if scope_text else 'None'}

Extract and return JSON with:
1. intent: One of "aggregate" (for counting/statistics), "search" (for semantic search), or "hybrid" (needs both)
2. normalized_query: Cleaned query text preserving scientific terms
3. entities: Dict with extracted entities:
   - dates: List of date strings if mentioned
   - numbers: List of numbers if mentioned
   - experiment_ids: List of experiment IDs if mentioned
   - sample_types: List of sample types if mentioned
   - statuses: List of statuses if mentioned
4. context: Dict with:
   - requires_aggregation: boolean
   - requires_semantic_search: boolean
   - time_range: optional dict with start/end dates
5. history_summary: Optional string summarizing relevant conversation history (only if needed)

Return ONLY valid JSON matching this structure:
{{
  "intent": "aggregate|search|hybrid",
  "normalized_query": "cleaned query text",
  "entities": {{}},
  "context": {{}},
  "history_summary": null or "summary string"
}}"""

        # Call LLM with JSON schema
        llm_client = get_llm_client()
        
        # Define expected schema structure
        schema = {
            "type": "object",
            "properties": {
                "intent": {"type": "string", "enum": ["aggregate", "search", "hybrid"]},
                "normalized_query": {"type": "string"},
                "entities": {"type": "object"},
                "context": {"type": "object"},
                "history_summary": {"type": ["string", "null"]}
            },
            "required": ["intent", "normalized_query", "entities", "context"]
        }
        
        # Get temperature from env or use default (0.0 for deterministic)
        import os
        normalize_temperature = float(os.getenv("NORMALIZE_TEMPERATURE", "0.0"))
        
        # Retry once if JSON invalid
        llm_retries = 0
        try:
            result = llm_client.complete_json(prompt, schema, temperature=normalize_temperature)
        except LLMError:
            # Retry once
            llm_retries = 1
            logger.warning("Normalization failed, retrying once")
            result = llm_client.complete_json(prompt, schema, temperature=normalize_temperature)
        
        # Validate and create NormalizedQuery
        normalized = NormalizedQuery(**result)
        
        # Run invariant validation
        is_valid, validation_issues = validate_normalized_output(normalized, request)
        if not is_valid:
            logger.warning(
                "Normalize validation issues detected",
                run_id=run_id,
                issues=validation_issues,
                intent=normalized.intent
            )
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            "normalize_node completed",
            run_id=run_id,
            intent=normalized.intent,
            normalized_query=normalized.normalized_query[:100],
            entities_count=len(normalized.entities),
            latency_ms=round(latency_ms, 2)
        )
        
        # Update state
        state["normalized_query"] = normalized
        
        # Log output event (enhanced)
        if run_id:
            try:
                # Get sample of entities (first 3 keys)
                entities_sample = {}
                for i, (k, v) in enumerate(list(normalized.entities.items())[:3]):
                    entities_sample[k] = str(v)[:50]  # Truncate long values
                
                trace_service.log_event(
                    run_id=run_id,
                    node_name="normalize",
                    event_type="output",
                    payload={
                        "intent": normalized.intent,
                        "normalized_query": normalized.normalized_query[:200],
                        "entities_keys": list(normalized.entities.keys()),
                        "entities_sample": entities_sample,
                        "entities_count": len(normalized.entities),
                        "context_keys": list(normalized.context.keys()),
                        "has_history_summary": bool(normalized.history_summary),
                        "validation_passed": is_valid,
                        "validation_issues": validation_issues if not is_valid else []
                    },
                    latency_ms=latency_ms
                )
            except Exception:
                pass  # Don't break execution if trace logging fails
        
        # Log metric event
        if run_id:
            try:
                # Estimate prompt tokens (rough: ~4 chars per token)
                prompt_tokens_estimate = len(prompt) // 4
                
                trace_service.log_event(
                    run_id=run_id,
                    node_name="normalize",
                    event_type="metric",
                    payload={
                        "query_length": len(request["query"]),
                        "normalized_length": len(normalized.normalized_query),
                        "entities_extracted": len(normalized.entities),
                        "llm_retries": llm_retries,
                        "prompt_tokens_estimate": prompt_tokens_estimate,
                        "validation_passed": is_valid
                    },
                    latency_ms=latency_ms
                )
            except Exception:
                pass  # Don't break execution if trace logging fails
        
        # Add to trace if debug enabled
        if request.get("options", {}).get("debug"):
            state["trace"].append({
                "node": "normalize",
                "input": {"query": request["query"][:200]},
                "output": {
                    "intent": normalized.intent,
                    "normalized_query": normalized.normalized_query[:200]
                },
                "latency_ms": round(latency_ms, 2),
                "timestamp": time.time()
            })
        
        return state
        
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "normalize_node failed",
            run_id=run_id,
            error=str(e),
            latency_ms=round(latency_ms, 2)
        )
        
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="normalize",
                    event_type="error",
                    payload={"error": str(e)},
                    latency_ms=latency_ms
                )
            except Exception:
                pass  # Don't break execution if trace logging fails
        
        # Set error response
        from agents.contracts.response import FinalResponse
        state["final_response"] = FinalResponse(
            answer=f"Error normalizing query: {str(e)}",
            citations=[],
            confidence=0.0,
            tool_used="rag"  # Default
        )
        
        return state
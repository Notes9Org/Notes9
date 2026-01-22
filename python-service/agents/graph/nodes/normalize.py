"""Normalize user query node."""
import time
import structlog
from agents.graph.state import AgentState
from agents.contracts.normalized import NormalizedQuery
from agents.services.llm_client import LLMClient, LLMError
from services.trace_service import TraceService
from agents.graph.nodes.normalize_validator import validate_normalized_output
from agents.services.thinking_logger import get_thinking_logger

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
    """Normalize user query into structured format with intent, entities, and context."""
    start_time = time.time()
    request = state["request"]
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    query_text = request.get("query", "") if isinstance(request, dict) else getattr(request, "query", "")
    user_id = request.get("user_id", "") if isinstance(request, dict) else getattr(request, "user_id", "")
    history = request.get("history", []) if isinstance(request, dict) else getattr(request, "history", [])
    
    logger.info(
        "normalize_node started",
        agent_node="normalize",
        run_id=run_id,
        query=query_text[:100],
        user_id=user_id,
        has_history=len(history) > 0,
        payload={
            "input_query": query_text,
            "user_id": user_id,
            "history_length": len(history),
            "history_preview": [{"role": msg.get("role", getattr(msg, "role", "user")), "content": (msg.get("content", getattr(msg, "content", ""))[:100])} for msg in history[-2:]] if history else []
        }
    )
    
    if run_id:
        try:
            trace_service.log_event(run_id=run_id, node_name="normalize", event_type="input",
                                   payload={"query": query_text[:200], "has_history": len(history) > 0})
        except Exception:
            pass
    
    try:
        history_text = ""
        if history:
            history_text = "\n".join([
                f"{msg.get('role', getattr(msg, 'role', 'user'))}: {msg.get('content', getattr(msg, 'content', ''))}"
                for msg in history[-5:]
            ])
        
        prompt = f"""Normalize the following user query for a scientific lab management system.

User Query: {query_text}

Conversation History:
{history_text if history_text else 'None'}

Extract and return JSON with:
1. intent: One of "aggregate", "search", or "hybrid"
   - "aggregate": Use for queries that need SQL/database queries:
     * Counting, statistics, aggregations (e.g., "How many experiments?")
     * Retrieving specific data points by ID (e.g., "What is the status of experiment X?")
     * Filtering by structured fields (status, dates, types)
     * Queries with specific IDs (experiment_id, sample_id, project_id)
   - "search": Use for semantic/conceptual queries:
     * "What is attention mechanism?" (conceptual explanation)
     * "Find notes about PCR" (semantic search)
     * Questions requiring understanding of content meaning
   - "hybrid": Use when both SQL and semantic search are needed
2. normalized_query: Cleaned query text preserving scientific terms
3. entities: Dict with extracted entities:
   - dates: List of date strings if mentioned
   - numbers: List of numbers if mentioned
   - experiment_ids: List of experiment IDs (UUIDs) if mentioned
   - experiment_names: List of experiment names (e.g., "Protein purification", "Vaccine production") if mentioned
   - project_ids: List of project IDs (UUIDs) if mentioned
   - project_names: List of project names (e.g., "Vaccine production", "Research Project A") if mentioned
   - sample_types: List of sample types if mentioned
   - statuses: List of statuses if mentioned
   - person_names: List of person names (first name, last name, or full name like "John Doe") if mentioned
   - person_ids: List of person/profile IDs (UUIDs) if mentioned
4. context: Dict with:
   - requires_aggregation: boolean (true if needs SQL)
   - requires_semantic_search: boolean (true if needs RAG)
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

        llm_client = get_llm_client()
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
        
        from services.config import get_app_config
        normalize_temperature = get_app_config().normalize_temperature
        
        llm_retries = 0
        try:
            result = llm_client.complete_json(prompt, schema, temperature=normalize_temperature)
        except LLMError as e:
            llm_retries = 1
            logger.warning("Normalization failed, retrying once", error=str(e))
            try:
                result = llm_client.complete_json(prompt, schema, temperature=normalize_temperature)
            except LLMError as e2:
                logger.error("Normalization failed after retry", error=str(e2))
                raise
        
        if not result:
            raise ValueError("LLM returned empty result")
        
        normalized = NormalizedQuery(**result)
        
        thinking_logger = get_thinking_logger()
        if run_id:
            thinking_logger.log_reasoning(
                run_id=run_id,
                node_name="normalize",
                reasoning=f"Normalized query from '{query_text}' to '{normalized.normalized_query}'",
                factors=[
                    f"Intent: {normalized.intent}",
                    f"Entities: {len(normalized.entities)}"
                ],
                conclusion=f"Query classified as {normalized.intent} intent"
            )
        
        is_valid, validation_issues = validate_normalized_output(normalized, request)
        if not is_valid:
            logger.warning("Normalize validation issues", run_id=run_id, issues=validation_issues)
            if run_id:
                thinking_logger.log_validation(
                    run_id=run_id, node_name="normalize", validation_type="invariant",
                    criteria=["intent matches context", "query not empty"],
                    result="fail", issues=validation_issues
                )
        
        latency_ms = int((time.time() - start_time) * 1000)
        logger.info("normalize_node completed", agent_node="normalize", run_id=run_id,
                   intent=normalized.intent, normalized_query=normalized.normalized_query[:100],
                   entities_count=len(normalized.entities), latency_ms=round(latency_ms, 2),
                   payload={"input_query": query_text[:200], "output_intent": normalized.intent,
                           "output_normalized_query": normalized.normalized_query[:200], "output_entities_count": len(normalized.entities)})
        
        state["normalized_query"] = normalized
        
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id, node_name="normalize", event_type="output",
                    payload={"intent": normalized.intent, "entities_count": len(normalized.entities)},
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        options = request.get("options", {}) if isinstance(request, dict) else getattr(request, "options", {})
        if (isinstance(options, dict) and options.get("debug")) or (hasattr(options, "debug") and getattr(options, "debug", False)):
            state["trace"].append({
                "node": "normalize",
                "input": {"query": query_text[:200]},
                "output": {"intent": normalized.intent, "normalized_query": normalized.normalized_query[:200]},
                "latency_ms": round(latency_ms, 2)
            })
        
        return state
        
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.error("normalize_node failed", run_id=run_id, error=str(e))
        
        if run_id:
            try:
                trace_service.log_event(run_id=run_id, node_name="normalize", event_type="error",
                                       payload={"error": str(e)}, latency_ms=latency_ms)
            except Exception:
                pass
        
        from agents.contracts.response import FinalResponse
        state["final_response"] = FinalResponse(
            answer=f"Error normalizing query: {str(e)}", citations=[], confidence=0.0, tool_used="rag"
        )
        return state
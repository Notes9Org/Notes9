"""RAG retrieval node."""
import time
import structlog
from typing import List, Dict, Any
from agents.graph.state import AgentState
from services.rag import RAGService
from services.embedder import EmbeddingService
from services.trace_service import TraceService
from services.config import get_app_config
from agents.services.thinking_logger import get_thinking_logger

logger = structlog.get_logger()

# Get similarity threshold from config
_app_config = None
def _get_rag_threshold():
    global _app_config
    if _app_config is None:
        _app_config = get_app_config()
    return _app_config.rag_similarity_threshold

DEFAULT_RAG_THRESHOLD = _get_rag_threshold()

# Singleton services
_rag_service: RAGService = None
_embedding_service: EmbeddingService = None
_trace_service: TraceService = None


def get_rag_service() -> RAGService:
    """Get or create RAG service singleton."""
    global _rag_service
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service


def get_embedding_service() -> EmbeddingService:
    """Get or create embedding service singleton."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


def get_trace_service() -> TraceService:
    """Get or create trace service singleton."""
    global _trace_service
    if _trace_service is None:
        _trace_service = TraceService()
    return _trace_service


def rag_node(state: AgentState) -> AgentState:
    """Execute RAG tool: embed query and search semantic chunks."""
    start_time = time.time()
    router = state.get("router_decision")
    normalized = state.get("normalized_query")
    request = state["request"]
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    if not router or "rag" not in router.tools:
        return state
    
    if not normalized:
        logger.error("rag_node: normalized_query missing", run_id=run_id)
        state["rag_result"] = []
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="rag",
                    event_type="error",
                    payload={"error": "normalized_query missing"}
                )
            except Exception:
                pass
        return state
    
    logger.info(
        "rag_node started",
        agent_node="rag",
        run_id=run_id,
        normalized_query=normalized.normalized_query[:100],
        payload={
            "input_query": request.get("query", "") if isinstance(request, dict) else getattr(request, "query", ""),
            "input_normalized_query": normalized.normalized_query,
            "input_intent": normalized.intent
        }
    )
    
    # Log input event
    if run_id:
        try:
            trace_service.log_event(
                run_id=run_id,
                node_name="rag",
                event_type="input",
                payload={"normalized_query": normalized.normalized_query[:200]}
            )
        except Exception:
            pass
    
    try:
        embedding_service = get_embedding_service()
        rag_service = get_rag_service()
        
        # Generate query embedding with error handling
        try:
            query_embedding = embedding_service.embed_text(normalized.normalized_query)
            
            if not query_embedding or len(query_embedding) == 0:
                logger.error("RAG search: empty embedding generated", run_id=run_id)
                state["rag_result"] = []
                if run_id:
                    try:
                        trace_service.log_event(
                            run_id=run_id, node_name="rag", event_type="error",
                            payload={"error": "Empty embedding generated"}
                        )
                    except Exception:
                        pass
                return state
            
            logger.debug(
                "Query embedding generated",
                run_id=run_id,
                embedding_dim=len(query_embedding),
                query_preview=normalized.normalized_query[:100]
            )
        except Exception as e:
            logger.error(
                "RAG search: failed to generate embedding",
                run_id=run_id,
                error=str(e),
                error_type=type(e).__name__
            )
            state["rag_result"] = []
            if run_id:
                try:
                    trace_service.log_event(
                        run_id=run_id, node_name="rag", event_type="error",
                        payload={"error": f"Embedding generation failed: {str(e)}"}
                    )
                except Exception:
                    pass
            return state
        
        user_id = request.get("user_id", "") if isinstance(request, dict) else getattr(request, "user_id", "")
        
        if not user_id:
            logger.error("RAG search: user_id missing", run_id=run_id)
            state["rag_result"] = []
            return state
        
        match_threshold = _get_rag_threshold()
        chunks = rag_service.search_chunks(
            query_embedding=query_embedding, user_id=user_id,
            organization_id=None, project_id=None, experiment_id=None,
            match_threshold=match_threshold, match_count=6
        )
        
        # Deduplicate by experiment_id (keep highest similarity)
        seen_experiments = {}
        deduplicated = []
        for chunk in chunks:
            exp_id = chunk.get("experiment_id")
            similarity = chunk.get("similarity", 0.0)
            if exp_id:
                if exp_id not in seen_experiments or seen_experiments[exp_id]["similarity"] < similarity:
                    seen_experiments[exp_id] = chunk
            else:
                deduplicated.append(chunk)
        
        deduplicated.extend(seen_experiments.values())
        deduplicated.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
        final_chunks = deduplicated[:6]
        
        rag_result = []
        for chunk in final_chunks:
            rag_result.append({
                "chunk_id": chunk.get("id"),
                "source_type": chunk.get("source_type"),
                "source_id": chunk.get("source_id"),
                "experiment_id": chunk.get("experiment_id"),
                "content": chunk.get("content", "")[:500],
                "similarity": chunk.get("similarity", 0.0),
                "metadata": chunk.get("metadata", {})
            })
        
        latency_ms = int((time.time() - start_time) * 1000)
        avg_similarity = sum(c.get("similarity", 0.0) for c in final_chunks) / len(final_chunks) if final_chunks else 0.0
        
        logger.info("rag_node completed", agent_node="rag", run_id=run_id,
                   chunks_found=len(final_chunks), avg_similarity=round(avg_similarity, 3),
                   latency_ms=round(latency_ms, 2),
                   payload={"input_normalized_query": normalized.normalized_query[:200],
                           "output_chunks_found": len(final_chunks), "output_avg_similarity": round(avg_similarity, 3),
                           "output_top_similarity": round(max([c.get("similarity", 0.0) for c in final_chunks], default=0.0), 3) if final_chunks else 0.0})
        state["rag_result"] = rag_result
        
        thinking_logger = get_thinking_logger()
        if run_id:
            thinking_logger.log_analysis(
                run_id=run_id, node_name="rag",
                analysis=f"Retrieved {len(final_chunks)} semantic chunks",
                data_summary={"chunks_found": len(final_chunks), "avg_similarity": round(avg_similarity, 3)},
                insights=[f"Average similarity: {avg_similarity:.3f}"]
            )
        
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id, node_name="rag", event_type="output",
                    payload={"chunks_found": len(final_chunks), "avg_similarity": round(avg_similarity, 3)},
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        options = request.get("options", {}) if isinstance(request, dict) else getattr(request, "options", {}) if hasattr(request, "options") else {}
        if (isinstance(options, dict) and options.get("debug")) or (hasattr(options, "debug") and getattr(options, "debug", False)):
            state["trace"].append({
                "node": "rag", "input": {"normalized_query": normalized.normalized_query[:200]},
                "output": {"chunks_found": len(final_chunks)}, "latency_ms": round(latency_ms, 2)
            })
        
        return state
        
    except Exception as e:
        logger.error("rag_node failed", run_id=run_id, error=str(e))
        
        if run_id:
            try:
                trace_service.log_event(run_id=run_id, node_name="rag", event_type="error",
                                       payload={"error": str(e)})
            except Exception:
                pass
        
        state["rag_result"] = []
        return state
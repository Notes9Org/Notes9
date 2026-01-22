"""RAG retrieval node."""
import os
import time
import structlog
from typing import List, Dict, Any
from agents.graph.state import AgentState
from services.rag import RAGService
from services.embedder import EmbeddingService
from services.trace_service import TraceService
from agents.services.thinking_logger import get_thinking_logger

logger = structlog.get_logger()

# Configurable similarity threshold (default: 0.30 for better matching)
# Can be overridden via RAG_SIMILARITY_THRESHOLD environment variable
# Lowered from 0.75 to 0.30 based on actual similarity scores in the database
DEFAULT_RAG_THRESHOLD = float(os.getenv("RAG_SIMILARITY_THRESHOLD", "0.30"))

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
    """
    Execute RAG tool if selected by router.
    
    Embeds query and searches semantic chunks across all data.
    No filtering applied - users have complete access to all chunks.
    Results filtered only by similarity threshold.
    """
    start_time = time.time()
    router = state.get("router_decision")
    normalized = state.get("normalized_query")
    request = state["request"]
    run_id = state.get("run_id")
    trace_service = get_trace_service()
    
    # Skip if RAG not in tools
    if not router or "rag" not in router.tools:
        logger.debug("rag_node skipped - RAG not in router tools", run_id=run_id)
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
        run_id=run_id,
        normalized_query=normalized.normalized_query[:100]
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
        # Get services
        embedding_service = get_embedding_service()
        rag_service = get_rag_service()
        
        # Generate embedding for normalized query
        query_embedding = embedding_service.embed_text(normalized.normalized_query)
        
        # NO FILTERING - Search across all data
        # Users have complete access to all data
        logger.info(
            "RAG search - no filters applied",
            run_id=run_id,
            message="Searching across all organizations, projects, and experiments"
        )
        
        # Get threshold from env or use default
        match_threshold = float(os.getenv("RAG_SIMILARITY_THRESHOLD", str(DEFAULT_RAG_THRESHOLD)))
        
        logger.info(
            "RAG search threshold",
            run_id=run_id,
            threshold=match_threshold,
            source="env" if os.getenv("RAG_SIMILARITY_THRESHOLD") else "default"
        )
        
        # Search chunks - NO FILTERS (all None)
        chunks = rag_service.search_chunks(
            query_embedding=query_embedding,
            organization_id=None,  # No filter
            project_id=None,  # No filter
            experiment_id=None,  # No filter
            match_threshold=match_threshold,
            match_count=6
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
                # No experiment_id, include directly
                deduplicated.append(chunk)
        
        # Add deduplicated experiment chunks
        deduplicated.extend(seen_experiments.values())
        
        # Sort by similarity again
        deduplicated.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
        
        # Limit to top 6
        final_chunks = deduplicated[:6]
        
        # Format results
        rag_result = []
        for chunk in final_chunks:
            rag_result.append({
                "chunk_id": chunk.get("id"),
                "source_type": chunk.get("source_type"),
                "source_id": chunk.get("source_id"),
                "experiment_id": chunk.get("experiment_id"),
                "content": chunk.get("content", "")[:500],  # Truncate for summary
                "similarity": chunk.get("similarity", 0.0),
                "metadata": chunk.get("metadata", {})
            })
        
        latency_ms = int((time.time() - start_time) * 1000)
        avg_similarity = sum(c.get("similarity", 0.0) for c in final_chunks) / len(final_chunks) if final_chunks else 0.0
        
        logger.info(
            "rag_node completed",
            run_id=run_id,
            chunks_found=len(final_chunks),
            avg_similarity=round(avg_similarity, 3),
            latency_ms=round(latency_ms, 2)
        )
        
        state["rag_result"] = rag_result
        
        # Log thinking: RAG retrieval reasoning
        thinking_logger = get_thinking_logger()
        if run_id:
            thinking_logger.log_analysis(
                run_id=run_id,
                node_name="rag",
                analysis=f"Retrieved {len(final_chunks)} semantic chunks",
                data_summary={
                    "chunks_found": len(final_chunks),
                    "avg_similarity": round(avg_similarity, 3),
                    "deduplicated": len(final_chunks) < len(chunks)
                },
                insights=[
                    f"Average similarity: {avg_similarity:.3f}",
                    f"Deduplicated by experiment_id",
                    f"Top {len(final_chunks)} chunks selected"
                ]
            )
        
        # Log output event (safe data only - no full chunk content)
        if run_id:
            try:
                chunk_ids = [chunk.get("chunk_id") for chunk in rag_result[:10]]  # First 10 IDs only
                trace_service.log_event(
                    run_id=run_id,
                    node_name="rag",
                    event_type="output",
                    payload={
                        "chunks_found": len(final_chunks),
                        "avg_similarity": round(avg_similarity, 3),
                        "chunk_ids": chunk_ids  # IDs only, not content
                    },
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        # Add to trace if debug enabled
        options = request.get("options", {}) if isinstance(request, dict) else getattr(request, "options", {}) if hasattr(request, "options") else {}
        if (isinstance(options, dict) and options.get("debug")) or (hasattr(options, "debug") and getattr(options, "debug", False)):
            state["trace"].append({
                "node": "rag",
                "input": {"normalized_query": normalized.normalized_query[:200]},
                "output": {
                    "chunks_found": len(final_chunks),
                    "avg_similarity": round(avg_similarity, 3)
                },
                "latency_ms": round(latency_ms, 2),
                "timestamp": time.time()
            })
        
        return state
        
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "rag_node failed",
            run_id=run_id,
            error=str(e),
            latency_ms=round(latency_ms, 2)
        )
        
        # Log error event
        if run_id:
            try:
                trace_service.log_event(
                    run_id=run_id,
                    node_name="rag",
                    event_type="error",
                    payload={"error": str(e)},
                    latency_ms=latency_ms
                )
            except Exception:
                pass
        
        state["rag_result"] = []
        return state
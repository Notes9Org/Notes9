"""API routes for agent."""
import time
from uuid import uuid4
from fastapi import APIRouter, HTTPException
import structlog

from agents.contracts.request import AgentRequest, ChatMessage
from agents.contracts.response import FinalResponse
from agents.graph.state import AgentState
from agents.graph.build_graph import build_agent_graph
from agents.graph.nodes.normalize import normalize_node
from services.trace_service import TraceService
from pydantic import BaseModel
from typing import Optional, List

logger = structlog.get_logger()

router = APIRouter(prefix="/agent", tags=["agent"])

# Singleton graph (compiled once)
_agent_graph = None


class NormalizeTestRequest(BaseModel):
    """Request model for normalize testing."""
    query: str
    user_id: str = "test-user"
    session_id: str = "test-session"
    history: Optional[List[ChatMessage]] = None


def get_agent_graph():
    """Get or create agent graph singleton."""
    global _agent_graph
    if _agent_graph is None:
        _agent_graph = build_agent_graph()
    return _agent_graph


@router.post("/normalize/test")
async def test_normalize(request: NormalizeTestRequest):
    """Test normalize node directly without running full agent."""
    run_id = str(uuid4())
    
    state: AgentState = {
        "run_id": run_id,
        "request": {
            "query": request.query,
            "user_id": request.user_id,
            "session_id": request.session_id,
            "scope": {},
            "history": [msg.model_dump() if hasattr(msg, "model_dump") else msg for msg in (request.history or [])],
            "options": {}
        },
        "normalized_query": None,
        "router_decision": None,
        "sql_result": None,
        "rag_result": None,
        "summary": None,
        "judge_result": None,
        "retry_count": 0,
        "final_response": None,
        "trace": []
    }
    
    try:
        result = normalize_node(state)
        normalized = result.get("normalized_query")
        
        if normalized:
            return {
                "success": True,
                "input": {"query": request.query},
                "output": {
                    "intent": normalized.intent,
                    "normalized_query": normalized.normalized_query,
                    "entities": normalized.entities,
                    "context": normalized.context,
                    "history_summary": normalized.history_summary
                }
            }
        else:
            error_msg = result.get("final_response", {}).get("answer", "Unknown error") if result.get("final_response") else "No output generated"
            return {"success": False, "error": error_msg}
    except Exception as e:
        logger.error("normalize test failed", error=str(e), query=request.query)
        return {"success": False, "error": str(e)}


@router.post("/run", response_model=FinalResponse)
async def run_agent(request: AgentRequest) -> FinalResponse:
    """Execute agent graph: normalize → router → tools → summarizer → judge → final."""
    start_time = time.time()
    run_id = str(uuid4())
    trace_service = TraceService()
    
    logger.info("agent_run started", run_id=run_id, query=request.query[:100])
    
    try:
        try:
            trace_service.create_run(
                run_id=run_id,
                organization_id=None,
                created_by=request.user_id,
                session_id=request.session_id,
                query=request.query,
                project_id=None
            )
        except Exception as e:
            logger.warning("Trace logging failed, continuing", error=str(e))
        
        initial_state: AgentState = {
            "run_id": run_id,
            "request": {
                "query": request.query,
                "user_id": request.user_id,
                "session_id": request.session_id,
                "scope": {},
                "history": [msg.model_dump() if hasattr(msg, "model_dump") else msg for msg in request.history],
                "options": request.options or {}
            },
            "normalized_query": None,
            "router_decision": None,
            "sql_result": None,
            "rag_result": None,
            "summary": None,
            "judge_result": None,
            "retry_count": 0,
            "final_response": None,
            "trace": []
        }
        
        graph = get_agent_graph()
        final_state = graph.invoke(initial_state)
        final_response = final_state.get("final_response")
        
        if not final_response:
            final_response = FinalResponse(
                answer="Agent execution completed but no response generated.",
                citations=[],
                confidence=0.0,
                tool_used="rag"
            )
        
        total_latency_ms = int((time.time() - start_time) * 1000)
        trace_service.update_run_status(
            run_id=run_id,
            status="completed",
            final_confidence=final_response.confidence,
            tool_used=final_response.tool_used,
            total_latency_ms=total_latency_ms
        )
        
        logger.info("agent_run completed", run_id=run_id, confidence=final_response.confidence)
        return final_response
        
    except HTTPException:
        trace_service.update_run_status(run_id=run_id, status="failed", total_latency_ms=int((time.time() - start_time) * 1000))
        raise
    except Exception as e:
        trace_service.update_run_status(run_id=run_id, status="failed", total_latency_ms=int((time.time() - start_time) * 1000))
        logger.error("agent_run failed", run_id=run_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {str(e)}")
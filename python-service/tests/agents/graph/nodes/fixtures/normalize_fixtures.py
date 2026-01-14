"""Test fixtures for normalize node testing."""
from typing import List, Dict, Any, Optional
from agents.graph.state import AgentState


def mock_state(
    query: str,
    history: Optional[List[Dict[str, str]]] = None,
    scope: Optional[Dict[str, str]] = None,
    user_id: str = "test-user",
    session_id: str = "test-session",
    run_id: str = "test-run-123"
) -> AgentState:
    """
    Create a mock AgentState for testing.
    
    Args:
        query: User query string
        history: Optional conversation history
        scope: Optional scope dict (organization_id, project_id, etc.)
        user_id: User ID
        session_id: Session ID
        run_id: Run ID for tracing
        
    Returns:
        Mock AgentState dict
    """
    return {
        "run_id": run_id,
        "request": {
            "query": query,
            "user_id": user_id,
            "session_id": session_id,
            "scope": scope or {"organization_id": "test-org"},
            "history": history or [],
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


def mock_llm_response_aggregate() -> Dict[str, Any]:
    """Mock LLM response for aggregate intent."""
    return {
        "intent": "aggregate",
        "normalized_query": "count completed experiments last month",
        "entities": {
            "dates": ["2024-12-01", "2024-12-31"],
            "statuses": ["completed"]
        },
        "context": {
            "requires_aggregation": True,
            "requires_semantic_search": False,
            "time_range": {
                "start": "2024-12-01",
                "end": "2024-12-31"
            }
        },
        "history_summary": None
    }


def mock_llm_response_search() -> Dict[str, Any]:
    """Mock LLM response for search intent."""
    return {
        "intent": "search",
        "normalized_query": "key findings from experiment X",
        "entities": {
            "experiment_ids": ["X"]
        },
        "context": {
            "requires_aggregation": False,
            "requires_semantic_search": True
        },
        "history_summary": None
    }


def mock_llm_response_hybrid() -> Dict[str, Any]:
    """Mock LLM response for hybrid intent."""
    return {
        "intent": "hybrid",
        "normalized_query": "completed experiments from last month and their key findings",
        "entities": {
            "dates": ["2024-12-01", "2024-12-31"],
            "statuses": ["completed"]
        },
        "context": {
            "requires_aggregation": True,
            "requires_semantic_search": True,
            "time_range": {
                "start": "2024-12-01",
                "end": "2024-12-31"
            }
        },
        "history_summary": None
    }


def mock_llm_response_invalid_json() -> str:
    """Mock invalid JSON response from LLM."""
    return "This is not valid JSON {"


def mock_llm_response_missing_fields() -> Dict[str, Any]:
    """Mock LLM response missing required fields."""
    return {
        "normalized_query": "some query",
        # Missing: intent, entities, context
    }


def mock_llm_response_wrong_intent() -> Dict[str, Any]:
    """Mock LLM response with invalid intent value."""
    return {
        "intent": "invalid_intent",
        "normalized_query": "some query",
        "entities": {},
        "context": {}
    }


def mock_llm_response_empty_query() -> Dict[str, Any]:
    """Mock LLM response with empty normalized_query."""
    return {
        "intent": "search",
        "normalized_query": "",
        "entities": {},
        "context": {
            "requires_aggregation": False,
            "requires_semantic_search": True
        }
    }


def mock_llm_response_intent_mismatch() -> Dict[str, Any]:
    """Mock LLM response where intent doesn't match context flags."""
    return {
        "intent": "aggregate",
        "normalized_query": "count experiments",
        "entities": {},
        "context": {
            "requires_aggregation": False,  # Should be True for aggregate
            "requires_semantic_search": False
        }
    }

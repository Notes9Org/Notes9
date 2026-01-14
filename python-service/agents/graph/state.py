"""Agent state TypedDict for LangGraph."""
from typing import TypedDict, Optional, List, Dict, Any
from agents.contracts.request import AgentRequest
from agents.contracts.normalized import NormalizedQuery
from agents.contracts.router import RouterDecision
from agents.contracts.response import FinalResponse


class AgentState(TypedDict):
    """State passed between LangGraph nodes."""
    # Trace tracking
    run_id: str  # UUID string for trace correlation
    
    # Input
    request: AgentRequest
    
    # Normalization
    normalized_query: Optional[NormalizedQuery]
    
    # Routing
    router_decision: Optional[RouterDecision]
    
    # Tool results
    sql_result: Optional[Dict[str, Any]]
    rag_result: Optional[List[Dict[str, Any]]]
    
    # Synthesis
    summary: Optional[Dict[str, Any]]  # {answer, citations}
    
    # Validation
    judge_result: Optional[Dict[str, Any]]  # {verdict, confidence, issues, suggested_revision}
    
    # Retry control
    retry_count: int
    
    # Output
    final_response: Optional[FinalResponse]
    
    # Debug trace
    trace: List[Dict[str, Any]]  # Execution trace for debugging
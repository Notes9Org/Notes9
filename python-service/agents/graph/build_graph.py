"""Build LangGraph agent graph."""
from langgraph.graph import StateGraph, END
import structlog

from agents.graph.state import AgentState
from agents.graph.nodes.normalize import normalize_node
from agents.graph.nodes.router import router_node
from agents.graph.nodes.sql import sql_node
from agents.graph.nodes.rag import rag_node
from agents.graph.nodes.summarizer import summarizer_node
from agents.graph.nodes.judge import judge_node
from agents.graph.nodes.retry import retry_node
from agents.graph.nodes.final import final_node

logger = structlog.get_logger()




def should_retry(state: AgentState) -> str:
    """Conditional edge: should retry or go to final?"""
    # Early exit if final_response already set (error case)
    if state.get("final_response"):
        return "final"
    
    judge = state.get("judge_result")
    retry_count = state.get("retry_count", 0)
    request = state.get("request", {})
    
    # Handle both dict and object access
    if isinstance(request, dict):
        options = request.get("options", {})
    else:
        options = getattr(request, "options", {}) if hasattr(request, "options") else {}
    
    max_retries = options.get("max_retries", 2) if isinstance(options, dict) else getattr(options, "max_retries", 2)
    
    # If judge passed, go to final
    if judge and isinstance(judge, dict) and judge.get("verdict") == "pass":
        return "final"
    
    # If max retries reached, go to final
    if retry_count >= max_retries:
        return "final"
    
    # Otherwise, retry (go back to router)
    return "router"


def build_agent_graph() -> StateGraph:
    """
    Build and compile LangGraph agent graph.
    
    Graph structure:
    START → normalize → router → [sql, rag] → summarizer → judge → retry → final → END
                                                      ↑         ↓
                                                      └─────────┘
    """
    logger.info("Building agent graph")
    
    # Create graph
    graph = StateGraph(AgentState)
    
    # Add nodes
    graph.add_node("normalize", normalize_node)
    graph.add_node("router", router_node)
    graph.add_node("sql", sql_node)
    graph.add_node("rag", rag_node)
    graph.add_node("summarizer", summarizer_node)
    graph.add_node("judge", judge_node)
    graph.add_node("retry", retry_node)
    graph.add_node("final", final_node)
    
    # Add edges
    graph.set_entry_point("normalize")
    
    # normalize → router (always)
    graph.add_edge("normalize", "router")
    
    # router → tools (conditional routing)
    # For parallel execution when both SQL and RAG are needed:
    # We route to SQL first, then SQL checks if RAG is also needed and routes to it
    # Both SQL and RAG then route to summarizer
    def route_after_router(state: AgentState) -> str:
        """Route after router - returns next node name."""
        router = state.get("router_decision")
        if not router:
            return "summarizer"
        
        tools = router.tools
        
        # If SQL is needed, route to SQL first
        if "sql" in tools:
            return "sql"
        # If only RAG is needed, route to RAG
        elif "rag" in tools:
            return "rag"
        # Otherwise go to summarizer
        else:
            return "summarizer"
    
    graph.add_conditional_edges(
        "router",
        route_after_router,
        {
            "sql": "sql",
            "rag": "rag",
            "summarizer": "summarizer"
        }
    )
    
    # SQL node will check if RAG is also needed and route accordingly
    # For now, SQL always goes to summarizer, and RAG always goes to summarizer
    # The summarizer node will wait for both if both were executed
    def route_after_sql(state: AgentState) -> str:
        """After SQL, check if RAG is also needed."""
        router = state.get("router_decision")
        if router and "rag" in router.tools:
            # RAG is also needed, route to RAG
            return "rag"
        # Otherwise go to summarizer
        return "summarizer"
    
    graph.add_conditional_edges(
        "sql",
        route_after_sql,
        {
            "rag": "rag",
            "summarizer": "summarizer"
        }
    )
    
    # Both sql and rag → summarizer
    # LangGraph will wait for all incoming edges before executing summarizer
    graph.add_edge("rag", "summarizer")
    
    # summarizer → judge (always)
    graph.add_edge("summarizer", "judge")
    
    # judge → retry (always)
    graph.add_edge("judge", "retry")
    
    # retry → router or final (conditional)
    graph.add_conditional_edges(
        "retry",
        should_retry,
        {
            "router": "router",
            "final": "final"
        }
    )
    
    # final → END (always)
    graph.add_edge("final", END)
    
    # Compile graph with recursion limit
    compiled_graph = graph.compile()
    
    # Set recursion limit to prevent infinite loops
    # This prevents the graph from running indefinitely if nodes keep failing
    compiled_graph = compiled_graph.with_config({"recursion_limit": 50})
    
    logger.info("Agent graph built and compiled")
    
    return compiled_graph
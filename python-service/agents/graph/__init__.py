"""Graph package for LangGraph agent."""
from agents.graph.state import AgentState

# Lazy import to avoid circular dependencies and heavy imports during testing
# Only import build_agent_graph when actually needed (not during test imports)
_build_agent_graph = None

def __getattr__(name):
    """Lazy import for build_agent_graph."""
    if name == "build_agent_graph":
        global _build_agent_graph
        if _build_agent_graph is None:
            from agents.graph.build_graph import build_agent_graph
            _build_agent_graph = build_agent_graph
        return _build_agent_graph
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__ = ["AgentState", "build_agent_graph"]
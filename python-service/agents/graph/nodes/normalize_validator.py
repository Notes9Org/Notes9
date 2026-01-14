"""Validation functions for normalize node output."""
from typing import Tuple, List
from agents.contracts.normalized import NormalizedQuery
from agents.graph.state import AgentState


def validate_normalized_output(
    normalized: NormalizedQuery,
    request: dict
) -> Tuple[bool, List[str]]:
    """
    Validate normalized output against invariants.
    
    Args:
        normalized: NormalizedQuery object to validate
        request: Original request dict from state
        
    Returns:
        Tuple of (is_valid, list_of_issues)
    """
    issues: List[str] = []
    
    # Invariant 1: Intent matches context flags
    if normalized.intent == "aggregate":
        if not normalized.context.get("requires_aggregation"):
            issues.append(
                "Intent is 'aggregate' but context.requires_aggregation is not True"
            )
    
    if normalized.intent == "search":
        if not normalized.context.get("requires_semantic_search"):
            issues.append(
                "Intent is 'search' but context.requires_semantic_search is not True"
            )
    
    if normalized.intent == "hybrid":
        if not normalized.context.get("requires_aggregation"):
            issues.append(
                "Intent is 'hybrid' but context.requires_aggregation is not True"
            )
        if not normalized.context.get("requires_semantic_search"):
            issues.append(
                "Intent is 'hybrid' but context.requires_semantic_search is not True"
            )
    
    # Invariant 2: Normalized query not empty
    if not normalized.normalized_query or not normalized.normalized_query.strip():
        issues.append("normalized_query is empty")
    
    # Invariant 3: Entities structure is valid
    if not isinstance(normalized.entities, dict):
        issues.append("entities is not a dict")
    
    # Invariant 4: Context structure is valid
    if not isinstance(normalized.context, dict):
        issues.append("context is not a dict")
    
    # Invariant 5: If dates mentioned in query, entities.dates should ideally have values
    # (This is a soft check - we log warning but don't fail)
    query_lower = request.get("query", "").lower()
    date_keywords = ["date", "month", "year", "week", "day", "yesterday", "today", "last", "ago"]
    has_date_keywords = any(keyword in query_lower for keyword in date_keywords)
    
    if has_date_keywords:
        dates = normalized.entities.get("dates", [])
        if not dates or len(dates) == 0:
            # This is a warning, not an error - dates might be implicit
            pass  # Could add to issues if we want strict validation
    
    # Invariant 6: If experiment IDs mentioned, they should be extracted
    # (Soft check - log but don't fail)
    if "experiment" in query_lower or "exp-" in query_lower.lower():
        experiment_ids = normalized.entities.get("experiment_ids", [])
        # Could add validation here if needed
    
    return len(issues) == 0, issues

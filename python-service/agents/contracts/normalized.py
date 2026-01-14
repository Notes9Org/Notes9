""" Normalized query contract for agent schemas."""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any, Literal

class NormalizedQuery(BaseModel):
    """ Normalized query schema for agent execution."""
    intent: Literal["aggregate", "search", "hybrid"] = Field(
        ...,
        description="Query Intent: aggregate (SQL), search (RAG), hybrid (both)."
    )
    normalized_query: str = Field(
        ...,
        description="Cleaned and normalized query text for SQL or RAG processing."
    )
    entities: Dict[str, Any] = Field(
        default_factory=dict,
        description="Entities extracted: dates, numbers, experiment_ids, etc."
    )
    context: Dict[str, Any] = Field(
        default_factory=dict,
        description="Conversation context and metadata."
    )
    history_summary: Optional[str] = Field(
        default=None,
        description="Optional summary of relevant conversation history."
    )
    
    @field_validator("intent")
    @classmethod
    def validate_intent(cls, v: str) -> str:
        """Validate intent value."""
        allowed_intents = ["aggregate", "search", "hybrid"]
        if v not in allowed_intents:
            raise ValueError(f"Invalid intent: {v}. Must be one of: {allowed_intents}")
        return v
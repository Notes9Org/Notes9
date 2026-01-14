""" Router decision contract for agent schemas."""

from pydantic import BaseModel, Field, field_validator
from typing import Literal, List, Dict, Any

class RouterDecision(BaseModel):
    """ Router decision schema for agent execution and tool selection."""
    tools: List[Literal["sql", "rag"]] = Field(
        ...,
        description="Selected tools: ['sql'], ['rag'], or ['sql', 'rag']"
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence score for routing decision."
    )
    reasoning: str = Field(
        ...,
        description="Human readable explanation of routing decision."
    )
    constraints: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional constraints for the routing decision like date ranges, filters, limits, etc."
    )

    @field_validator("tools")
    @classmethod
    def validate_tools(cls, v: List[str]) -> List[str]:
        """Validate tools value."""
        allowed_tools = ["sql", "rag"]
        if not v or not all(t in allowed_tools for t in v):
            raise ValueError(f"Invalid tools: {v}. Must be one of: {allowed_tools}")
        return v
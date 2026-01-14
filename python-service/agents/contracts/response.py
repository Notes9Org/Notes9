"""Response schemas for agent API."""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal


class Citation(BaseModel):
    """Citation reference to source."""
    source_type: str = Field(..., description="Source type: lab_note, protocol, etc.")
    source_id: str = Field(..., description="Source ID (UUID)")
    chunk_id: Optional[str] = Field(None, description="Chunk ID if from RAG")
    relevance: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Relevance score"
    )
    excerpt: Optional[str] = Field(None, description="Relevant excerpt from source")


class FinalResponse(BaseModel):
    """Final response from agent."""
    answer: str = Field(..., description="Generated answer")
    citations: List[Citation] = Field(
        default_factory=list,
        description="Source citations"
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence score for the answer"
    )
    tool_used: Literal["sql", "rag", "hybrid"] = Field(
        ...,
        description="Tool(s) used to generate answer"
    )
    debug: Optional[Dict[str, Any]] = Field(
        None,
        description="Debug trace (node outputs, latency) if debug=true"
    )
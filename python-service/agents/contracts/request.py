""" Request contract for agent schemas."""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class ChatMessage(BaseModel):
    role: str = Field(..., description="Message Role: The role of the message sender.")
    content: str = Field(..., description="Message Content: The content of the message.")

class AgentRequest(BaseModel):
    """ Request schema for agent execution."""
    query: str = Field(..., description=" User query to process.")
    user_id: str = Field(..., description=" User ID for tracking and context.")
    session_id: str = Field(..., description=" Session ID for tracking and context.")
    scope: Dict[str, Optional[str]] = Field(
        ...,
        description=" Access scope: organization_id, project_id, experiment_id, user_id."
    )
    history: List[ChatMessage] = Field(
        default=list,
        description="Previous messages in the conversation."
    )
    options: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description=" Options: debug, max_retries, etc."
    )
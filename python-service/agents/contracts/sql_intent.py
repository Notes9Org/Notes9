"""SQL Intent contract for safe SQL generation."""
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Literal


class SQLIntent(BaseModel):
    """
    Structured SQL intent - maps to safe SQL templates.
    
    This replaces direct LLM SQL generation with intent-based template selection.
    """
    operation: Literal["count", "sum", "avg", "list", "group_by"] = Field(
        ...,
        description="SQL operation type"
    )
    table: Literal[
        "experiments",
        "samples",
        "protocols",
        "equipment",
        "lab_notes",
        "reports",
        "literature_reviews",
        "experiment_data",
        "quality_control"
    ] = Field(
        ...,
        description="Target table name"
    )
    filters: Dict[str, Any] = Field(
        default_factory=dict,
        description="Filter conditions: {status: 'in_progress', sample_type: 'cell_culture'}"
    )
    group_by: Optional[List[str]] = Field(
        None,
        description="Columns to group by: ['status', 'sample_type']"
    )
    order_by: Optional[List[Dict[str, str]]] = Field(
        None,
        description="Ordering: [{'column': 'created_at', 'direction': 'desc'}]"
    )
    limit: Optional[int] = Field(
        None,
        description="Result limit"
    )
    time_range: Optional[Dict[str, str]] = Field(
        None,
        description="Time range filter: {start: '2024-01-01', end: '2024-12-31'}"
    )
    select_columns: Optional[List[str]] = Field(
        None,
        description="Specific columns to select (default: all or count)"
    )

"""FastAPI application for Notes9 Agent Service."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
from dotenv import load_dotenv
import structlog

from agents.chat_agent import ChatAgent

load_dotenv()

# Configure logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ]
)

logger = structlog.get_logger()

app = FastAPI(
    title="Notes9 Agent Service",
    description="Agentic AI service for Notes9 with LangGraph",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize agent
chat_agent = ChatAgent()


# Request/Response models
class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: str
    user_id: str
    scope: Dict[str, Optional[str]]  # organization_id, project_id, experiment_id
    options: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    response: str
    citations: List[Dict[str, str]]
    confidence: float
    debug: Optional[Dict[str, Any]] = None


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "notes9-agent"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Notes9 Agent Service",
        "version": "1.0.0",
        "status": "operational"
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Agentic chat endpoint with SQL + RAG + ReAct capabilities.
    """
    try:
        result = await chat_agent.process(
            query=request.messages[-1].content if request.messages else "",
            user_id=request.user_id,
            session_id=request.session_id,
            scope=request.scope,
            history=request.messages[:-1] if len(request.messages) > 1 else [],
            options=request.options or {}
        )
        
        return ChatResponse(
            response=result["answer"],
            citations=result.get("citations", []),
            confidence=result.get("confidence_score", 0.0),
            debug=result.get("debug")
        )
    except Exception as e:
        logger.error("Chat error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
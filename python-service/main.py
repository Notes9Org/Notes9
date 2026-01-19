"""FastAPI application for Notes9 Agent Service."""
# Patch websockets before any supabase imports
try:
    from services.websockets_patch import *  # noqa: F401, F403
except ImportError:
    pass  # Patch not critical

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import structlog

from agents.api.routes import router as agent_router

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

# CORS middleware (must be before routes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include agent routes
app.include_router(agent_router)


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
        "status": "operational",
        "endpoints": {
            "agent": "/agent/run",
            "health": "/health"
        }
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
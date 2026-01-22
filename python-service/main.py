"""
FastAPI application for Notes9 Agent Chat Service.

This service provides an AI-powered chat interface for Notes9, enabling users to:
- Query their lab notes, experiments, and protocols
- Get intelligent answers using RAG (Retrieval Augmented Generation)
- Execute SQL queries on structured data
- Maintain conversation context across sessions

Architecture:
- LangGraph-based agentic framework
- Multi-node processing pipeline (normalize → router → tools → judge → final)
- Support for both SQL and RAG-based queries
- Comprehensive tracing and logging
"""
import os
import time
from contextlib import asynccontextmanager
from typing import Dict, Any
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
import structlog
import uvicorn

# Patch websockets before any supabase imports
try:
    from services.websockets_patch import *  # noqa: F401, F403
except ImportError:
    pass  # Patch not critical

from agents.api.routes import router as agent_router

# Load environment variables
load_dotenv()

# Configure structured logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ]
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info(
        "service_starting",
        service="notes9-agent-chat",
        version="1.0.0",
        environment=os.getenv("ENVIRONMENT", "development")
    )
    
    # Validate critical environment variables
    required_vars = [
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
    ]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        logger.warning(
            "missing_environment_variables",
            missing=missing_vars,
            message="Service may not function correctly without these variables"
        )
    
    # Log configuration (without sensitive data)
    logger.info(
        "service_configuration",
        cors_origins=os.getenv("CORS_ORIGINS", "*"),
        port=os.getenv("PORT", "8000"),
        has_azure_openai=bool(os.getenv("AZURE_OPENAI_ENDPOINT")),
        has_openai=bool(os.getenv("OPENAI_API_KEY")),
    )
    
    yield
    
    # Shutdown
    logger.info("service_shutting_down", service="notes9-agent-chat")


# Create FastAPI application
app = FastAPI(
    title="Notes9 Agent Chat Service",
    description=(
        "AI-powered chat service for Notes9 scientific lab documentation platform. "
        "Provides intelligent query processing using LangGraph-based agentic framework "
        "with support for SQL queries, RAG-based retrieval, and hybrid approaches."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS middleware configuration
cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests and responses."""
    start_time = time.time()
    
    # Log request
    logger.info(
        "request_received",
        method=request.method,
        path=request.url.path,
        query_params=str(request.query_params) if request.query_params else None,
        client_host=request.client.host if request.client else None,
    )
    
    try:
        response = await call_next(request)
        
        # Calculate processing time
        process_time = time.time() - start_time
        
        # Log response
        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            process_time_ms=round(process_time * 1000, 2),
        )
        
        # Add process time header
        response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))
        
        return response
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(
            "request_failed",
            method=request.method,
            path=request.url.path,
            error=str(e),
            process_time_ms=round(process_time * 1000, 2),
            exc_info=True,
        )
        raise


# Global exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with structured logging."""
    logger.warning(
        "http_exception",
        status_code=exc.status_code,
        detail=exc.detail,
        path=request.url.path,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "path": request.url.path,
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle request validation errors."""
    logger.warning(
        "validation_error",
        errors=exc.errors(),
        path=request.url.path,
    )
    return JSONResponse(
        status_code=422,
        content={
            "error": "Validation error",
            "details": exc.errors(),
            "path": request.url.path,
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    logger.error(
        "unexpected_error",
        error=str(exc),
        path=request.url.path,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": "An unexpected error occurred",
            "path": request.url.path,
        },
    )


# Include agent routes
app.include_router(agent_router)


@app.get("/health", tags=["monitoring"])
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint for service monitoring.
    
    Returns:
        Dict with service status and basic information
    """
    return {
        "status": "healthy",
        "service": "notes9-agent-chat",
        "version": "1.0.0",
        "timestamp": time.time(),
    }


@app.get("/health/ready", tags=["monitoring"])
async def readiness_check() -> Dict[str, Any]:
    """
    Readiness check endpoint for Kubernetes/Docker health probes.
    
    Checks if the service is ready to accept requests by validating
    critical dependencies.
    
    Returns:
        Dict with readiness status
    """
    checks = {
        "database": False,
        "embeddings": False,
    }
    
    # Check database connection
    try:
        from services.db import SupabaseService
        db = SupabaseService()
        # Simple check - try to access the service
        checks["database"] = db.client is not None
    except Exception as e:
        logger.warning("database_check_failed", error=str(e))
    
    # Check embeddings service
    try:
        from services.embedder import EmbeddingService
        embedder = EmbeddingService()
        checks["embeddings"] = embedder.client is not None
    except Exception as e:
        logger.warning("embeddings_check_failed", error=str(e))
    
    all_ready = all(checks.values())
    status_code = 200 if all_ready else 503
    
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_ready else "not_ready",
            "checks": checks,
            "timestamp": time.time(),
        },
    )


@app.get("/", tags=["info"])
async def root() -> Dict[str, Any]:
    """
    Root endpoint providing service information and available endpoints.
    
    Returns:
        Dict with service metadata and endpoint information
    """
    return {
        "service": "Notes9 Agent Chat Service",
        "version": "1.0.0",
        "status": "operational",
        "description": "AI-powered chat service for scientific lab documentation",
        "endpoints": {
            "agent": {
                "run": "/agent/run",
                "normalize_test": "/agent/normalize/test",
            },
            "monitoring": {
                "health": "/health",
                "readiness": "/health/ready",
            },
            "documentation": {
                "swagger": "/docs",
                "redoc": "/redoc",
                "openapi": "/openapi.json",
            },
        },
    }


if __name__ == "__main__":
    # Get configuration from environment
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    workers = int(os.getenv("WORKERS", "1"))
    log_level = os.getenv("LOG_LEVEL", "info").lower()
    reload = os.getenv("RELOAD", "false").lower() == "true"
    
    logger.info(
        "starting_server",
        host=host,
        port=port,
        workers=workers,
        log_level=log_level,
        reload=reload,
    )
    
    # Run the application
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        workers=workers if not reload else 1,  # Reload only works with 1 worker
        log_level=log_level,
        reload=reload,
        access_log=True,
    )
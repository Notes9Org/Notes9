"""FastAPI application for Notes9 Agent Chat Service."""
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

try:
    from services.websockets_patch import *  # noqa: F401, F403
except ImportError:
    pass

from agents.api.routes import router as agent_router

load_dotenv()

def console_renderer(logger, name, event_dict):
    """Console renderer for agent node events - shows only completed events with results."""
    if "agent_node" not in event_dict:
        return ""
    
    event = event_dict.get("event", "")
    
    # Only show completed events (they have final results)
    if not (event.endswith("_completed") or event.endswith(" completed") or event == "completed"):
        return ""
    
    if "error" in event_dict or "thinking_type" in event_dict:
        return ""
    
    node = event_dict.get("agent_node", "unknown").upper()
    payload = event_dict.get("payload", {})
    latency_ms = event_dict.get("latency_ms")
    
    # Extract input/output from payload
    input_items = {k.replace("input_", ""): v for k, v in payload.items() if k.startswith("input_")}
    output_items = {k.replace("output_", ""): v for k, v in payload.items() if k.startswith("output_")}
    
    # If no output_items, try to extract from event_dict directly
    if not output_items:
        # Extract meaningful output from event_dict fields
        output_candidates = {}
        if "intent" in event_dict:
            output_candidates["intent"] = event_dict.get("intent")
        if "tools" in event_dict:
            output_candidates["tools"] = event_dict.get("tools")
        if "row_count" in event_dict:
            output_candidates["row_count"] = event_dict.get("row_count")
        if "chunks_found" in event_dict:
            output_candidates["chunks_found"] = event_dict.get("chunks_found")
        if "answer_length" in event_dict:
            output_candidates["answer_length"] = event_dict.get("answer_length")
        if "verdict" in event_dict:
            output_candidates["verdict"] = event_dict.get("verdict")
        if "confidence" in event_dict:
            output_candidates["confidence"] = event_dict.get("confidence")
        if output_candidates:
            output_items = output_candidates
    
    # Special handling for SQL node - show generated SQL
    if node == "SQL" and "output_generated_sql" in payload:
        if "generated_sql" not in output_items:
            output_items["generated_sql"] = payload.get("output_generated_sql", "")
    
    # Only print if we have something to show
    if not input_items and not output_items and latency_ms is None:
        return ""
    
    print("-" * 8)
    print(f"🤖 {node}")
    print("-" * 8)
    
    if input_items:
        print("📥 INPUT:")
        for key, value in input_items.items():
            if isinstance(value, str) and len(value) > 250:
                value = value[:250] + "..."
            elif isinstance(value, (list, dict)):
                value_str = str(value)
                if len(value_str) > 250:
                    value = value_str[:250] + "..."
            print(f"   • {key}: {value}")
    
    if output_items:
        print("📤 OUTPUT:")
        for key, value in output_items.items():
            # Special formatting for SQL queries
            if key == "generated_sql" and isinstance(value, str):
                # Show full SQL query for debugging
                print(f"   • {key}:")
                # Print SQL with indentation for readability
                sql_lines = value.split('\n')
                for line in sql_lines:
                    print(f"      {line}")
            elif isinstance(value, str) and len(value) > 250:
                value = value[:250] + "..."
            elif isinstance(value, (list, dict)):
                value_str = str(value)
                if len(value_str) > 250:
                    value = value_str[:250] + "..."
            else:
                print(f"   • {key}: {value}")
    
    if latency_ms is not None:
        print(f"⏱️  Latency: {latency_ms}ms")
    
    print("=" * 80)
    return ""

from services.config import get_app_config, get_azure_openai_config, get_supabase_config

app_config = get_app_config()
use_json = app_config.log_format == "json"

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        console_renderer if not use_json else structlog.processors.JSONRenderer()
    ]
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    app_config = get_app_config()
    logger.info("service_starting", service="notes9-agent-chat", version="1.0.0")
    
    try:
        get_supabase_config()
        logger.info("Supabase service: available")
    except Exception as e:
        logger.error("Supabase service: not available", error=str(e))
    
    try:
        get_azure_openai_config()
        logger.info("Azure OpenAI service: available")
    except Exception as e:
        logger.error("Azure OpenAI service: not available", error=str(e))
    
    yield
    logger.info("service_shutting_down", service="notes9-agent-chat")


app = FastAPI(
    title="Notes9 Agent Chat Service",
    description="AI-powered chat service for Notes9 scientific lab documentation platform.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in app_config.cors_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log incoming requests and responses."""
    start_time = time.time()
    logger.info("request_received", method=request.method, path=request.url.path)
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.info("request_completed", method=request.method, path=request.url.path, 
                   status_code=response.status_code, process_time_ms=round(process_time * 1000, 2))
        response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))
        return response
    except Exception as e:
        logger.error("request_failed", method=request.method, path=request.url.path, error=str(e))
        raise


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions."""
    logger.warning("http_exception", status_code=exc.status_code, detail=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status_code": exc.status_code},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle request validation errors."""
    logger.warning("validation_error", errors=exc.errors())
    return JSONResponse(
        status_code=422,
        content={"error": "Validation error", "details": exc.errors()},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    logger.error("unexpected_error", error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


app.include_router(agent_router)


@app.get("/health", tags=["monitoring"])
async def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    return {"status": "healthy", "service": "notes9-agent-chat", "version": "1.0.0"}


@app.get("/health/ready", tags=["monitoring"])
async def readiness_check() -> Dict[str, Any]:
    """Readiness check for Kubernetes/Docker health probes."""
    checks = {"database": False, "embeddings": False}
    
    try:
        from services.db import SupabaseService
        db = SupabaseService()
        checks["database"] = db.client is not None
    except Exception as e:
        logger.warning("database_check_failed", error=str(e))
    
    try:
        from services.embedder import EmbeddingService
        embedder = EmbeddingService()
        checks["embeddings"] = embedder.client is not None
    except Exception as e:
        logger.warning("embeddings_check_failed", error=str(e))
    
    all_ready = all(checks.values())
    return JSONResponse(
        status_code=200 if all_ready else 503,
        content={"status": "ready" if all_ready else "not_ready", "checks": checks},
    )


@app.get("/", tags=["info"])
async def root() -> Dict[str, Any]:
    """Root endpoint with service information."""
    return {
        "service": "Notes9 Agent Chat Service",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "agent": {"run": "/agent/run", "normalize_test": "/agent/normalize/test"},
            "monitoring": {"health": "/health", "readiness": "/health/ready"},
            "documentation": {"swagger": "/docs", "redoc": "/redoc"},
        },
    }


if __name__ == "__main__":
    app_config = get_app_config()
    logger.info("starting_server", host=app_config.host, port=app_config.port)
    
    uvicorn.run(
        "main:app",
        host=app_config.host,
        port=app_config.port,
        workers=app_config.workers if not app_config.reload else 1,
        log_level=app_config.log_level,
        reload=app_config.reload,
        access_log=True,
    )
# Biomni Agent — Comprehensive Integration Architecture Plan

## Overview

Biomni is a general-purpose biomedical AI agent from Stanford's SNAP lab, released under the Apache 2.0 license. It ships with 150 specialized biomedical tools, 59 databases, and 105 software integrations, making it one of the most comprehensive open-source biomedical agents available. This document outlines a production-grade architecture to integrate Biomni into a modern AI application stack — covering the core agent layer, API surface, MCP integration, LLM backend routing, security sandboxing, and deployment strategy.[^1][^2]

***

## System Architecture — Layer by Layer

The full integration stack is composed of five logical layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│         (Web UI / CLI / External Apps / Other Agents)           │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP / WebSocket
┌─────────────────────────▼───────────────────────────────────────┐
│                    API GATEWAY LAYER                             │
│           FastAPI (REST + WebSocket endpoints)                   │
│     Auth Middleware │ Rate Limiting │ Request Validation         │
└────────┬────────────────────────────────────────────┬───────────┘
         │ Sync Tasks                                  │ Streaming
┌────────▼──────────┐                      ┌──────────▼───────────┐
│   BIOMNI AGENT    │                      │   ASYNC QUEUE        │
│     LAYER (A1)    │                      │  (Celery / Redis)    │
│ Planning + RAG +  │                      │  Long-running tasks  │
│ Code Execution    │                      └──────────────────────┘
└────────┬──────────┘
         │
┌────────▼──────────────────────────────────────────────────────┐
│                    TOOL / MCP LAYER                            │
│  Biomni E1 Tools (150+)  │  MCP Server  │  Custom FastAPI Tools│
│  59 Databases (GWAS, PDB)│  Exposed via │  Your own endpoints  │
│  105 Software Pkgs       │  YAML config │  (fastapi-mcp)       │
└────────┬──────────────────────────────────────────────────────┘
         │
┌────────▼──────────────────────────────────────────────────────┐
│                    LLM BACKEND LAYER                           │
│   Reasoning:  Biomni-R0-32B (SGLang local) or Groq/Claude     │
│   DB Queries: Anthropic Claude (default_config)               │
│   Fallback:   OpenAI / Gemini / Ollama                        │
└────────┬──────────────────────────────────────────────────────┘
         │
┌────────▼──────────────────────────────────────────────────────┐
│                   DATA / STORAGE LAYER                         │
│   Biomni Data Lake (~11GB) │ PostgreSQL │ DuckDB │ Redis Cache │
└───────────────────────────────────────────────────────────────┘
```

***

## Layer 1 — Biomni Agent Core

The agent core is `biomni.agent.A1`, which implements a **retrieval-augmented planning + code execution loop**. It receives a natural language task, plans a multi-step execution strategy using retrieval from tool/database indexes, and executes generated Python code.[^1]

### Installation and Base Setup

```bash
# 1. Clone and set up the Biomni E1 environment (~11GB data lake auto-downloaded)
git clone https://github.com/snap-stanford/Biomni.git
cd Biomni
bash setup.sh
conda activate biomni_e1
pip install biomni --upgrade
```

```bash
# 2. .env configuration
ANTHROPIC_API_KEY=your_key_here
GROQ_API_KEY=your_groq_key_here
LLM_SOURCE=Groq                     # Switch to Groq for cost-efficiency
BIOMNI_DATA_PATH=/app/data
BIOMNI_TIMEOUT_SECONDS=1200
```

### Agent Initialization (config-first pattern)

```python
# biomni_core/agent_factory.py
from biomni.config import default_config
from biomni.agent import A1

def create_agent(llm: str = "llama-3.3-70b-versatile", source: str = "Groq") -> A1:
    # default_config ensures ALL operations (DB queries + reasoning) use same settings
    default_config.llm = llm
    default_config.source = source
    default_config.timeout_seconds = 1200

    agent = A1(path="/app/data")
    return agent
```

> **Critical Note:** Always use `default_config` instead of passing params directly to `A1()` — direct params only affect the reasoning LLM, not internal database query LLMs.[^1]

***

## Layer 2 — FastAPI API Gateway

Wrapping Biomni in a FastAPI service decouples your clients from the agent internals, enables async task handling, and makes it composable with other systems.[^3]

### Project Structure

```
biomni-service/
├── app/
│   ├── main.py              # FastAPI app entrypoint
│   ├── routers/
│   │   ├── agent.py         # /agent endpoints
│   │   ├── tasks.py         # /tasks async polling
│   │   └── mcp.py           # /mcp tool exposure
│   ├── core/
│   │   ├── agent_factory.py # A1 initialization
│   │   ├── task_queue.py    # Celery task definitions
│   │   └── security.py      # Auth middleware
│   ├── schemas/
│   │   └── models.py        # Pydantic request/response models
│   └── config.py            # App-wide settings
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── mcp_config.yaml
├── .env
└── requirements.txt
```

### Core FastAPI App

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import agent, tasks, mcp
from contextlib import asynccontextmanager
from app.core.agent_factory import create_agent

agent_instance = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent_instance
    agent_instance = create_agent()  # Initialize once at startup
    yield
    # Cleanup if needed

app = FastAPI(title="Biomni Agent Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(agent.router, prefix="/agent", tags=["agent"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(mcp.router, prefix="/mcp", tags=["mcp"])
```

### Request / Response Schemas

```python
# app/schemas/models.py
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

class AgentQueryRequest(BaseModel):
    task: str
    llm_override: Optional[str] = None
    save_pdf: bool = False
    timeout: Optional[int] = 600

class AgentQueryResponse(BaseModel):
    task_id: str
    status: Literal["queued", "running", "completed", "failed"]
    result: Optional[str] = None
    pdf_path: Optional[str] = None
    created_at: datetime
```

### Agent Router (Sync + Async)

```python
# app/routers/agent.py
from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.schemas.models import AgentQueryRequest, AgentQueryResponse
from app.core.task_queue import run_agent_task
import uuid
from datetime import datetime

router = APIRouter()

# Async (recommended for long-running biomedical tasks)
@router.post("/run", response_model=AgentQueryResponse)
async def run_agent(request: AgentQueryRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    background_tasks.add_task(run_agent_task, task_id, request.task, request.save_pdf)
    return AgentQueryResponse(
        task_id=task_id,
        status="queued",
        created_at=datetime.utcnow()
    )

# Sync (for quick tasks, not recommended for complex biomedical analysis)
@router.post("/run/sync", response_model=AgentQueryResponse)
async def run_agent_sync(request: AgentQueryRequest):
    from app.main import agent_instance
    try:
        result = agent_instance.go(request.task)
        return AgentQueryResponse(
            task_id=str(uuid.uuid4()),
            status="completed",
            result=str(result),
            created_at=datetime.utcnow()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

***

## Layer 3 — MCP Integration

MCP is the critical integration layer — it lets Biomni consume your custom tools and also expose itself as a callable service for other agents.[^4][^1]

### Pattern A: Add External MCP Tools to Biomni

This lets Biomni call your own custom tools (e.g., your internal APIs, databases, RAG pipelines) as native tools.[^1]

```yaml
# mcp_config.yaml
mcpServers:
  custom_rag_server:
    command: python
    args: ["-m", "your_rag_mcp_server"]
    env:
      DATABASE_URL: "postgresql://..."

  pubmed_server:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-pubmed"]

  filesystem_server:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/app/data"]
```

```python
# Usage: Biomni agent now has access to your custom tools
from biomni.agent import A1

agent = A1()
agent.add_mcp(config_path="./mcp_config.yaml")
agent.go("Search our internal literature database and find pathways related to BRCA1")
```

### Pattern B: Expose Biomni as an MCP Server

This enables other agents (LangChain, AutoGen, your own FastAPI agents) to call Biomni as a tool.[^1]

```python
# tutorials/examples/expose_biomni_server/ (from Biomni repo)
# Run: python expose_biomni_server.py
# Then configure in other agents' mcp_config.yaml as a remote server
```

### Pattern C: Expose FastAPI Endpoints as MCP Tools (fastapi-mcp)

Use `fastapi-mcp` to auto-convert your FastAPI routes into MCP tools with zero boilerplate.[^4]

```bash
pip install fastapi-mcp
```

```python
# app/routers/mcp.py
from fastapi_mcp import FastApiMCP
from app.main import app

mcp = FastApiMCP(app)
mcp.mount()  # Auto-exposes all FastAPI routes as MCP tools
# Now any MCP-compatible agent can discover and call your /agent/run endpoint
```

***

## Layer 4 — LLM Backend Routing

Biomni supports multiple LLM providers, and the right routing strategy balances cost, latency, and capability.[^1]

### Dual-LLM Strategy (Recommended)

Use a fast, cheap model for DB/retrieval queries and a stronger model for complex reasoning:

```python
# biomni_core/llm_router.py
from biomni.config import default_config
from biomni.agent import A1

def create_production_agent():
    # DB Queries + retrieval = use faster/cheaper model
    default_config.llm = "llama-3.1-8b-instant"   # Groq, fast + cheap
    default_config.source = "Groq"

    # Reasoning agent = use stronger model
    agent = A1(
        llm="llama-3.3-70b-versatile",   # Groq 70B for reasoning
        source="Groq"
    )
    return agent

def create_local_agent():
    # Use Biomni-R0-32B for full local inference (no API costs)
    default_config.llm = "claude-3-5-haiku-20241022"  # for DB queries
    default_config.source = "Anthropic"

    agent = A1(
        llm="biomni/Biomni-R0-32B-Preview",
        source="Custom",
        base_url="http://localhost:30000/v1",  # SGLang server
        api_key="EMPTY"
    )
    return agent
```

### LLM Provider Comparison

| Provider | Model | Best For | Cost |
|----------|-------|----------|------|
| Groq | `llama-3.3-70b-versatile` | Fast reasoning, low latency | Low |
| Groq | `llama-3.1-8b-instant` | DB/retrieval queries | Very Low |
| Anthropic | `claude-sonnet-4-20250514` | Complex multi-step reasoning | Medium |
| Local (SGLang) | `Biomni-R0-32B` | Full offline, best biology | Free (compute) |
| OpenAI | `gpt-4o` | General fallback | Medium-High |

***

## Layer 5 — Async Task Queue

Long-running biomedical tasks (scRNA-seq analysis, CRISPR planning) should never block HTTP threads. Use Celery + Redis.[^3]

```python
# app/core/task_queue.py
from celery import Celery
from biomni.agent import A1
from biomni.config import default_config
import redis

celery_app = Celery("biomni_tasks", broker="redis://redis:6379/0", backend="redis://redis:6379/1")

task_store = {}  # In production: use Redis or PostgreSQL

@celery_app.task(bind=True, max_retries=2, time_limit=1800)
def run_agent_task(self, task_id: str, task_query: str, save_pdf: bool = False):
    task_store[task_id] = {"status": "running"}
    try:
        default_config.llm = "llama-3.3-70b-versatile"
        default_config.source = "Groq"
        agent = A1(path="/app/data")
        result = agent.go(task_query)

        if save_pdf:
            pdf_path = f"/app/outputs/{task_id}.pdf"
            agent.save_conversation_history(pdf_path)
            task_store[task_id] = {"status": "completed", "result": str(result), "pdf": pdf_path}
        else:
            task_store[task_id] = {"status": "completed", "result": str(result)}

    except Exception as e:
        task_store[task_id] = {"status": "failed", "error": str(e)}
        raise self.retry(exc=e, countdown=30)
```

```python
# app/routers/tasks.py — poll for task status
from fastapi import APIRouter, HTTPException
from app.core.task_queue import task_store

router = APIRouter()

@router.get("/{task_id}")
async def get_task_status(task_id: str):
    if task_id not in task_store:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_store[task_id]
```

***

## Docker Sandboxing (REQUIRED)

Biomni executes LLM-generated code with full system privileges — sandboxing is **non-negotiable** for any production deployment.[^1]

```dockerfile
# docker/Dockerfile
FROM continuumio/miniconda3:latest

WORKDIR /app

# Create isolated conda environment
COPY setup.sh .
RUN bash setup.sh

# Install biomni
RUN conda run -n biomni_e1 pip install biomni --upgrade

# Copy app code
COPY app/ ./app/
COPY mcp_config.yaml .
COPY .env .

# Non-root user for extra isolation
RUN useradd -m biomniuser && chown -R biomniuser:biomniuser /app
USER biomniuser

EXPOSE 8000
CMD ["conda", "run", "--no-capture-output", "-n", "biomni_e1", \
     "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# docker/docker-compose.yml
version: "3.9"

services:
  biomni-api:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - biomni_data:/app/data
      - biomni_outputs:/app/outputs
    environment:
      - GROQ_API_KEY=${GROQ_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - BIOMNI_DATA_PATH=/app/data
    depends_on:
      - redis
      - postgres
    # Security: restrict container capabilities
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    read_only: false
    tmpfs:
      - /tmp

  celery-worker:
    build: .
    command: ["conda", "run", "--no-capture-output", "-n", "biomni_e1",
              "celery", "-A", "app.core.task_queue.celery_app", "worker", "--loglevel=info"]
    volumes:
      - biomni_data:/app/data
      - biomni_outputs:/app/outputs
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: biomni_db
      POSTGRES_USER: biomni
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  biomni_data:
  biomni_outputs:
  postgres_data:
```

***

## Evaluation Integration (Biomni-Eval1)

Biomni ships with a benchmark of 433 instances across 10 biological reasoning tasks — wire this in as a CI/CD health check.[^1]

```python
# tests/test_biomni_eval.py
from biomni.eval import BiomniEval1
from biomni.agent import A1

def test_gwas_causal_gene():
    evaluator = BiomniEval1()
    score = evaluator.evaluate('gwas_causal_gene_opentargets', 0, 'BRCA1')
    assert score > 0.7, f"GWAS gene identification score too low: {score}"

def test_rare_disease_diagnosis():
    agent = A1(path="./data")
    evaluator = BiomniEval1()
    # Run subset of 433-instance benchmark
    results = evaluator.run_benchmark(agent, task="rare_disease_diagnosis", max_instances=10)
    print(f"Accuracy: {results['accuracy']:.2%}")
```

***

## Integration with Other Open-Source Agents

Biomni's MCP server exposure makes it composable with the broader agent ecosystem.[^5][^1]

| Agent Framework | Integration Path | Use Case |
|-----------------|-----------------|----------|
| **LangChain / LangGraph** | Biomni as MCP tool in LangGraph node | Multi-agent research pipelines |
| **Smolagents (HuggingFace)** | Call `/agent/run` as a `tool()` | Lightweight orchestration |
| **AutoGen (Microsoft)** | Register Biomni FastAPI endpoint as function tool | Multi-agent collaboration |
| **OpenAI Agents SDK** | Biomni MCP server in `add_mcp()` | Production-grade function calling |
| **CrewAI** | Custom `Tool` wrapping FastAPI `/agent/run` | Role-based agent teams |

### Example: LangGraph + Biomni

```python
# langgraph_biomni.py
import httpx
from langgraph.prebuilt import ToolNode
from langchain_core.tools import tool

@tool
def biomni_analyze(task: str) -> str:
    """Execute a biomedical research task using Biomni agent."""
    response = httpx.post(
        "http://localhost:8000/agent/run/sync",
        json={"task": task},
        timeout=600
    )
    return response.json()["result"]

# Add to your LangGraph graph as a node
tool_node = ToolNode([biomni_analyze])
```

***

## Deployment Strategy

### Development (Local)

```bash
docker-compose up --build
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
```

### Production (Railway / AWS)

- **Railway**: Best for quick deployment — push Docker Compose directly, set env vars in dashboard
- **AWS ECS + Fargate**: Use for autoscaling; mount EFS volume for the 11GB data lake
- **EC2 with GPU (for Biomni-R0)**: Minimum 2x A100 or 4x A6000 for 32B model with `--tp 2`

```bash
# SGLang server for Biomni-R0 (requires 2xGPU)
python -m sglang.launch_server \
  --model-path biomni/Biomni-R0-32B-Preview \
  --port 30000 --host 0.0.0.0 \
  --mem-fraction-static 0.8 \
  --tp 2 --trust-remote-code \
  --json-model-override-args '{"rope_scaling":{"rope_type":"yarn","factor":1.0,"original_max_position_embeddings":32768},"max_position_embeddings":131072}'
```

***

## Security Checklist

Given Biomni's full system privilege execution model, follow this checklist before any production deployment:[^1]

- [ ] Run inside Docker with `cap_drop: ALL`
- [ ] Mount data lake as a named volume, not bind-mounted from host
- [ ] Never expose Biomni's internal agent directly; always route through FastAPI + auth middleware
- [ ] Use API key authentication on all `/agent/*` endpoints
- [ ] Set `BIOMNI_TIMEOUT_SECONDS` to prevent runaway tasks
- [ ] Rotate LLM API keys regularly; store in secrets manager (AWS Secrets Manager / Railway secrets)
- [ ] Audit each integrated tool license before commercial use — some Biomni tools carry non-commercial licenses[^1]
- [ ] Add input validation (Pydantic) to sanitize task strings before passing to agent

***

## Contributing to Biomni-E2

The Biomni team is building E2 as a community-driven environment — contributors with 10+ integrated tools are invited as co-authors on the upcoming top-tier paper. This is a strong opportunity for portfolio and research credit. See the Contributing Guide in the repo and the tool submission form at biomni.stanford.edu.[^1]

---

## References

1. [Biomni: a general-purpose biomedical AI agent - GitHub](https://github.com/snap-stanford/Biomni) - Biomni is a general-purpose biomedical AI agent designed to autonomously execute a wide range of res...

2. [Biomni - A General-Purpose Biomedical AI Agent](https://biomni.stanford.edu) - A general-purpose biomedical AI agent with 150 specialized tools, 59 databases, and 105 software to ...

3. [How to Build Autonomous AI Agents with GPT-4.1 & FastAPI](https://www.omdena.com/blog/autonomous-ai-agents) - Build autonomous AI agents using GPT-4.1 and FastAPI. Learn architecture, tools, and prompting to ma...

4. [FastAPI-MCP: Simplifying the Integration of FastAPI with AI Agents](https://www.infoq.com/news/2025/04/fastapi-mcp/) - A new open-source library, FastAPI-MCP, is making it easier for developers to connect traditional Fa...

5. [11 Open Source AI Agent Frameworks That Will Transform Your ...](https://latenode.com/blog/ai-agents-autonomous-systems/open-source-ai-agent-tools/11-open-source-ai-agent-frameworks-that-will-transform-your-development-2025-complete-guide) - Explore 11 open-source AI agent frameworks that enhance development capabilities with autonomous rea...


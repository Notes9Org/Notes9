#!/usr/bin/env python3
"""
Biomni Python Runner
====================
Spawned as a child process by biomni/server/src/agent/factory.ts.

Communication protocol (mirrors the architecture plan):
  stdin  → single JSON line with task + config
  stdout → single JSON line: { "result": "..." } or { "error": "..." }

The runner uses default_config so ALL internal Biomni LLMs (including
database-query LLMs) are covered — not just the top-level reasoning LLM.
This matches the critical note in the architecture plan.

Setup (run once on the host machine):
  git clone https://github.com/snap-stanford/Biomni.git
  cd Biomni && bash setup.sh
  conda activate biomni_e1
  pip install biomni --upgrade

Then set BIOMNI_PYTHON_PATH in biomni/server/.env to point at the
conda env Python binary, e.g.:
  BIOMNI_PYTHON_PATH=/opt/miniconda3/envs/biomni_e1/bin/python
"""

import sys
import json
import os


def main() -> None:
    # Read the JSON payload from stdin (TypeScript factory.ts writes it)
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)
    except Exception as e:
        _fail(f"Failed to parse input JSON: {e}")
        return

    task: str = payload.get("task", "")
    history: list = payload.get("history", [])
    data_path: str = payload.get("data_path", "./data")
    timeout_seconds: int = int(payload.get("timeout_seconds", 1200))

    # LLM config
    default_llm: str = payload.get("default_llm", "llama-3.1-8b-instant")
    default_source: str = payload.get("default_source", "Groq")
    reasoning_llm: str = payload.get("reasoning_llm", "llama-3.3-70b-versatile")
    reasoning_source: str = payload.get("reasoning_source", "Groq")
    local_base_url: str | None = payload.get("local_base_url")

    if not task:
        _fail("task field is required and must be non-empty")
        return

    # -----------------------------------------------------------------------
    # Import Biomni — this will fail if the conda env isn't activated or
    # the package isn't installed. The TypeScript layer surfaces this error.
    # -----------------------------------------------------------------------
    try:
        from biomni.config import default_config  # type: ignore[import]
        from biomni.agent import A1  # type: ignore[import]
    except ImportError as e:
        _fail(
            f"Cannot import biomni. Make sure the biomni_e1 conda environment is "
            f"activated and 'pip install biomni --upgrade' has been run. "
            f"ImportError: {e}"
        )
        return

    # -----------------------------------------------------------------------
    # Configure LLMs via default_config (covers ALL internal Biomni LLMs)
    # -----------------------------------------------------------------------
    try:
        default_config.llm = default_llm
        default_config.source = default_source
        default_config.timeout_seconds = timeout_seconds

        # Build agent kwargs
        agent_kwargs: dict = {
            "llm": reasoning_llm,
            "source": reasoning_source,
            "path": data_path,
        }

        # Optional: local SGLang / custom OpenAI-compatible server
        if local_base_url:
            agent_kwargs["base_url"] = local_base_url
            agent_kwargs["api_key"] = os.environ.get("LOCAL_LLM_API_KEY", "EMPTY")

        agent = A1(**agent_kwargs)
    except Exception as e:
        _fail(f"Failed to initialize Biomni A1 agent: {e}")
        return

    # -----------------------------------------------------------------------
    # Optionally inject conversation history
    # Biomni A1.go() does not natively accept history, so we prepend prior
    # turns to the task as a formatted context block.
    # -----------------------------------------------------------------------
    full_task = task
    if history:
        history_text = "\n".join(
            f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
            for m in history
        )
        full_task = (
            f"Conversation history:\n{history_text}\n\n"
            f"Current task: {task}"
        )

    # -----------------------------------------------------------------------
    # Run the agent
    # -----------------------------------------------------------------------
    try:
        result = agent.go(full_task)
        _ok(str(result))
    except Exception as e:
        _fail(f"Biomni agent execution failed: {e}")


def _ok(result: str) -> None:
    """Write success JSON to stdout."""
    print(json.dumps({"result": result}), flush=True)


def _fail(error: str) -> None:
    """Write error JSON to stdout (TypeScript reads stdout, not stderr)."""
    print(json.dumps({"error": error}), flush=True)
    # Also log to stderr for server-side debugging
    print(f"[biomni-runner] ERROR: {error}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()

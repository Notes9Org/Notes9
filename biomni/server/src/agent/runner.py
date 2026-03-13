#!/usr/bin/env python3
"""Biomni Python runner.

Reads a JSON payload from stdin and prints a single JSON line to stdout:
  {"result": "..."} or {"error": "..."}

Env overrides:
  BIOMNI_RUNNER_MODULE (e.g. "my_runner")
  BIOMNI_RUNNER_FUNC   (e.g. "run")
"""

import importlib
import json
import os
import sys
from typing import Any, Dict, Optional


def _emit(payload: Dict[str, Any], code: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()
    sys.exit(code)


def _custom_runner(payload: Dict[str, Any]) -> Optional[str]:
    module_name = os.getenv("BIOMNI_RUNNER_MODULE")
    func_name = os.getenv("BIOMNI_RUNNER_FUNC", "run")
    if not module_name:
        return None

    module = importlib.import_module(module_name)
    fn = getattr(module, func_name)
    result = fn(payload)
    if result is None:
        return ""
    if isinstance(result, str):
        return result
    return json.dumps(result, ensure_ascii=True)


def _default_biomni_runner(payload: Dict[str, Any]) -> str:
    task = payload.get("task", "")
    if not task:
        raise ValueError("task is required")

    data_path = payload.get("data_path")
    default_llm = payload.get("default_llm")
    default_source = payload.get("default_source")
    reasoning_llm = payload.get("reasoning_llm")
    reasoning_source = payload.get("reasoning_source")

    # Import late so health checks remain cheap and errors are explicit.
    import biomni  # type: ignore

    agent = None

    # Try common constructor locations across Biomni variants.
    if hasattr(biomni, "Agent"):
        agent_cls = getattr(biomni, "Agent")
        agent = agent_cls(
            data_path=data_path,
            default_llm=default_llm,
            default_source=default_source,
            reasoning_llm=reasoning_llm,
            reasoning_source=reasoning_source,
        )
    elif hasattr(biomni, "agent"):
        agent_obj = getattr(biomni, "agent")
        agent = agent_obj() if callable(agent_obj) else agent_obj

    if agent is None:
        raise RuntimeError(
            "Could not initialize Biomni agent. Set BIOMNI_RUNNER_MODULE/BIOMNI_RUNNER_FUNC for your install."
        )

    # Try common execution methods.
    if hasattr(agent, "go") and callable(getattr(agent, "go")):
        result = agent.go(task)
    elif hasattr(agent, "run") and callable(getattr(agent, "run")):
        result = agent.run(task)
    else:
        raise RuntimeError(
            "Biomni agent has no go()/run() method. Use custom runner env overrides."
        )

    if result is None:
        return ""
    if isinstance(result, str):
        return result

    return json.dumps(result, ensure_ascii=True)


def main() -> None:
    raw = sys.stdin.read()
    if not raw:
        _emit({"error": "Empty stdin payload"}, 1)

    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a JSON object")

        custom_result = _custom_runner(payload)
        if custom_result is not None:
            _emit({"result": custom_result})

        result = _default_biomni_runner(payload)
        _emit({"result": result})
    except Exception as exc:  # noqa: BLE001
        _emit({"error": str(exc)}, 1)


if __name__ == "__main__":
    main()

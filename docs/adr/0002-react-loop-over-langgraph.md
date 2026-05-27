# ADR-0002: Custom ReAct Loop Over LangGraph

**Date**: 2026-05-27
**Status**: accepted
**Deciders**: Notes9 engineering

## Context

The agent needs a multi-turn tool-use loop: call Claude, get a tool_use block, run the tool, feed the result back, repeat until end_turn. LangGraph is the standard framework for this pattern. A custom loop is an alternative.

## Decision

We use a hand-written ReAct loop in `agents/core/agent.py` instead of LangGraph. The loop is ~120 lines: stream tokens from Bedrock, detect tool_use blocks, invoke `tool_gateway`, append results, repeat. LangGraph is not a dependency.

## Alternatives Considered

### Alternative 1: LangGraph
- **Pros**: State machine abstraction; built-in checkpointing; community support; handles edge cases (parallel tool calls, etc.)
- **Cons**: Adds a large dependency; LangGraph's graph/node model maps poorly to a single-agent streaming loop; debugging requires understanding LangGraph internals on top of our own logic; version churn has historically broken prompts
- **Why not**: The loop is simple enough that a custom implementation is more readable and debuggable than a LangGraph graph with one node

### Alternative 2: LangChain AgentExecutor
- **Pros**: Widely documented
- **Cons**: Abstracts away streaming in ways that made SSE emit more complex; tight coupling to LangChain message formats
- **Why not**: Same reasoning as LangGraph — complexity not justified for a single-agent use case

## Consequences

### Positive
- Full control over streaming, token emission, and error handling
- No framework version lock-in
- Easy to read: the entire loop is in one file

### Negative
- We own all edge-case handling (parallel tool calls, tool errors, max-turn enforcement)
- No built-in checkpointing or resume — a server crash mid-turn loses the turn

### Risks
- If the loop logic grows significantly, it may need refactoring into a proper state machine. The current `AGENT_LOOP_V2` flag suggests this evolution is already happening.

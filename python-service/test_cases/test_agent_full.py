#!/usr/bin/env python3
"""
Full agent test script - tests the complete agent graph end-to-end.

Usage:
    python test_agent_full.py "your query here"
    python test_agent_full.py "How many experiments were completed last month?" org-123
    python test_agent_full.py "What protocols mention PCR?" org-123 proj-456
"""
import sys
import os
import json
import time
from pathlib import Path
from dotenv import load_dotenv
from uuid import uuid4

# Add parent directory to Python path
script_dir = Path(__file__).parent
parent_dir = script_dir.parent
sys.path.insert(0, str(parent_dir))

# Load .env
try:
    env_path = parent_dir / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=False)
    else:
        load_dotenv(override=False)
except Exception:
    pass

# Patch websockets before any supabase imports
try:
    from services.websockets_patch import *  # noqa: F401, F403
except ImportError:
    pass  # Patch not critical

from agents.graph.state import AgentState
from agents.graph.build_graph import build_agent_graph
from agents.contracts.request import AgentRequest
from services.trace_service import TraceService


def print_section(title: str, char: str = "="):
    """Print a formatted section header."""
    print(f"\n{char * 60}")
    print(f"{title}")
    print(f"{char * 60}\n")


def print_node_result(node_name: str, state: AgentState, latency_ms: float = None):
    """Print formatted node execution result."""
    print(f"📊 {node_name.upper()} Node")
    print(f"   {'⏱️  Latency: ' + str(round(latency_ms, 2)) + 'ms' if latency_ms else ''}")
    
    if node_name == "normalize":
        normalized = state.get("normalized_query")
        if normalized:
            print(f"   ✅ Intent: {normalized.intent}")
            print(f"   📝 Query: {normalized.normalized_query[:100]}")
            if normalized.entities:
                print(f"   🏷️  Entities: {len(normalized.entities)} extracted")
    
    elif node_name == "router":
        router = state.get("router_decision")
        if router:
            tools = router.tools if hasattr(router, "tools") else router.get("tools", [])
            confidence = router.confidence if hasattr(router, "confidence") else router.get("confidence", 0.0)
            reasoning = router.reasoning if hasattr(router, "reasoning") else router.get("reasoning", "")
            print(f"   🛠️  Tools: {', '.join(tools)}")
            print(f"   📊 Confidence: {confidence:.2f}")
            print(f"   💭 Reasoning: {reasoning[:80]}")
    
    elif node_name == "sql":
        sql_result = state.get("sql_result")
        if sql_result:
            row_count = sql_result.get("row_count", 0)
            has_error = "error" in sql_result
            print(f"   {'❌ Error' if has_error else '✅ Success'}")
            print(f"   📊 Rows: {row_count}")
            if has_error:
                print(f"   ⚠️  {sql_result.get('error', 'Unknown error')[:100]}")
    
    elif node_name == "rag":
        rag_result = state.get("rag_result", [])
        print(f"   ✅ Chunks found: {len(rag_result)}")
        if rag_result:
            avg_sim = sum(c.get("similarity", 0.0) for c in rag_result) / len(rag_result)
            print(f"   📊 Avg similarity: {avg_sim:.3f}")
    
    elif node_name == "summarizer":
        summary = state.get("summary")
        if summary:
            answer = summary.get("answer", "")
            citations = summary.get("citations", [])
            print(f"   ✅ Answer length: {len(answer)} chars")
            print(f"   📚 Citations: {len(citations)}")
    
    elif node_name == "judge":
        judge = state.get("judge_result")
        if judge:
            verdict = judge.get("verdict", "unknown")
            confidence = judge.get("confidence", 0.0)
            issues = judge.get("issues", [])
            print(f"   {'✅ PASS' if verdict == 'pass' else '❌ FAIL'}")
            print(f"   📊 Confidence: {confidence:.2f}")
            if issues:
                print(f"   ⚠️  Issues: {len(issues)}")
                for issue in issues[:3]:
                    print(f"      - {issue[:60]}")
    
    elif node_name == "final":
        final = state.get("final_response")
        if final:
            print(f"   ✅ Answer: {final.answer[:100]}...")
            print(f"   📚 Citations: {len(final.citations)}")
            print(f"   📊 Confidence: {final.confidence:.2f}")
            print(f"   🛠️  Tool used: {final.tool_used}")
    
    print()


def test_agent_full(
    query: str,
    organization_id: str = "cedbb951-4b9f-440a-96ad-0373fe059a1b",  # Default to valid UUID
    project_id: str = None,
    debug: bool = True
):
    """Test the full agent graph end-to-end."""
    print_section("🤖 Notes9 Agent - Full Graph Test", "=")
    
    print(f"📝 Query: {query}")
    print(f"🏢 Organization: {organization_id}")
    if project_id:
        print(f"📁 Project: {project_id}")
    print(f"🐛 Debug mode: {debug}")
    
    run_id = str(uuid4())
    start_time = time.time()
    
    # Create trace service
    trace_service = None
    try:
        trace_service = TraceService()
        trace_service.create_run(
            run_id=run_id,
            organization_id=organization_id,
            created_by="test-user",
            session_id="test-session",
            query=query,
            project_id=project_id
        )
        print(f"✅ Trace logging enabled (run_id: {run_id})")
    except Exception as e:
        print(f"⚠️  Trace logging disabled: {str(e)}")
    
    # Create request
    request = AgentRequest(
        query=query,
        user_id="test-user",
        session_id="test-session",
        scope={
            "organization_id": organization_id,
            **({"project_id": project_id} if project_id else {})
        },
        history=[],
        options={"debug": debug, "max_retries": 2}
    )
    
    # Create initial state
    initial_state: AgentState = {
        "run_id": run_id,
        "request": request.model_dump(),  # Use model_dump() instead of deprecated dict()
        "normalized_query": None,
        "router_decision": None,
        "sql_result": None,
        "rag_result": None,
        "summary": None,
        "judge_result": None,
        "retry_count": 0,
        "final_response": None,
        "trace": []
    }
    
    print_section("🚀 Executing Agent Graph", "-")
    
    try:
        # Build and execute graph
        graph = build_agent_graph()
        final_state = graph.invoke(initial_state)
        
        total_latency_ms = (time.time() - start_time) * 1000
        
        # Print execution summary
        print_section("📊 Execution Summary", "-")
        
        # Print node-by-node results from trace
        trace = final_state.get("trace", [])
        if trace:
            print_section("🔍 Node-by-Node Execution", "-")
            for node_trace in trace:
                node_name = node_trace.get("node", "unknown")
                latency = node_trace.get("latency_ms", 0)
                print_node_result(node_name, final_state, latency)
        else:
            # Fallback: print from state
            print_section("🔍 Node Results", "-")
            if final_state.get("normalized_query"):
                print_node_result("normalize", final_state)
            if final_state.get("router_decision"):
                print_node_result("router", final_state)
            if final_state.get("sql_result"):
                print_node_result("sql", final_state)
            if final_state.get("rag_result"):
                print_node_result("rag", final_state)
            if final_state.get("summary"):
                print_node_result("summarizer", final_state)
            if final_state.get("judge_result"):
                print_node_result("judge", final_state)
        
        # Print final response
        print_section("✅ Final Response", "=")
        final_response = final_state.get("final_response")
        
        if final_response:
            print(f"📝 Answer:\n{final_response.answer}\n")
            print(f"📚 Citations ({len(final_response.citations)}):")
            for i, citation in enumerate(final_response.citations[:5], 1):
                source_type = citation.source_type if hasattr(citation, "source_type") else citation.get("source_type", "unknown")
                source_id = citation.source_id if hasattr(citation, "source_id") else citation.get("source_id", "unknown")
                relevance = citation.relevance if hasattr(citation, "relevance") else citation.get("relevance", 0.0)
                print(f"   [{i}] {source_type} (ID: {source_id[:8]}...) - Relevance: {relevance:.2f}")
            
            print(f"\n📊 Confidence: {final_response.confidence:.2f}")
            print(f"🛠️  Tool used: {final_response.tool_used}")
            print(f"⏱️  Total latency: {round(total_latency_ms, 2)}ms")
            
            # Print debug trace if available
            if debug and final_response.debug:
                print_section("🐛 Debug Trace", "-")
                debug_trace = final_response.debug.get("trace", [])
                print(f"📊 Total nodes executed: {len(debug_trace)}")
                print(f"🔄 Retry count: {final_response.debug.get('retry_count', 0)}")
                print(f"⏱️  Total trace latency: {final_response.debug.get('total_latency_ms', 0)}ms")
        else:
            print("❌ No final response generated")
        
        # Update trace status
        if trace_service:
            try:
                trace_service.update_run_status(
                    run_id=run_id,
                    status="completed",
                    final_confidence=final_response.confidence if final_response else 0.0,
                    tool_used=final_response.tool_used if final_response else "unknown",
                    total_latency_ms=int(total_latency_ms)
                )
            except Exception:
                pass
        
        print_section("✅ Test Complete", "=")
        return final_state
        
    except Exception as e:
        total_latency_ms = (time.time() - start_time) * 1000
        print_section("❌ Error", "=")
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Update trace status
        if trace_service:
            try:
                trace_service.update_run_status(
                    run_id=run_id,
                    status="failed",
                    total_latency_ms=int(total_latency_ms)
                )
            except Exception:
                pass
        
        return None


if __name__ == "__main__":
    # Check required environment variables
    required_vars = ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        print("\nPlease set these in your .env file or environment.")
        sys.exit(1)
    
    # Check if chat model is configured
    chat_model = os.getenv("AZURE_OPENAI_CHAT_MODEL") or os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT")
    if not chat_model:
        print("⚠️  Warning: AZURE_OPENAI_CHAT_MODEL or AZURE_OPENAI_CHAT_DEPLOYMENT not set.")
        print("   Using default: gpt-5.2-chat")
        print("   If this fails, set AZURE_OPENAI_CHAT_DEPLOYMENT to your chat model deployment name.\n")
    
    if len(sys.argv) < 2:
        print("Usage: python test_agent_full.py \"your query here\" [organization_id] [project_id]")
        print("\nExamples:")
        print('  python test_agent_full.py "How many experiments were completed last month?"')
        print('  python test_agent_full.py "What protocols mention PCR?" org-123')
        print('  python test_agent_full.py "Show me completed experiments and their findings" org-123 proj-456')
        sys.exit(1)
    
    query = sys.argv[1]
    # Default to a valid UUID if not provided
    org_id = sys.argv[2] if len(sys.argv) > 2 else "cedbb951-4b9f-440a-96ad-0373fe059a1b"
    project_id = sys.argv[3] if len(sys.argv) > 3 else None
    
    test_agent_full(query, org_id, project_id, debug=True)

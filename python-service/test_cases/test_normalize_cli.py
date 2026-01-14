#!/usr/bin/env python3
"""
Simple CLI tool to test normalize node directly.
Usage:
    python test_normalize_cli.py "your query here"
    python test_normalize_cli.py "How many experiments were completed last month?"
"""
import sys
import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Add parent directory to Python path so we can import agents module
# This allows the script to run from any directory
script_dir = Path(__file__).parent
parent_dir = script_dir.parent
sys.path.insert(0, str(parent_dir))

# Load .env from parent directory (where the .env file is located)
# If .env can't be loaded, environment variables might already be set
try:
    env_path = parent_dir / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=False)  # Don't override existing env vars
    else:
        load_dotenv(override=False)  # Fallback to current directory
except Exception:
    # If .env can't be loaded, continue - env vars might already be set
    pass

from uuid import uuid4
from agents.graph.state import AgentState
from agents.graph.nodes.normalize import normalize_node
from services.trace_service import TraceService

def test_normalize(query: str, organization_id: str = "test-org", project_id: str = None):
    """Test normalize node with a query."""
    print(f"\n🔍 Testing Normalize Node")
    print(f"{'='*60}")
    print(f"Input Query: {query}\n")
    
    run_id = str(uuid4())
    
    # Create run record for trace logging (optional - won't fail if DB unavailable)
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
    except Exception as e:
        print(f"⚠️  Note: Trace logging disabled (DB not available): {str(e)}\n")
    
    # Create minimal state
    state: AgentState = {
        "run_id": run_id,
        "request": {
            "query": query,
            "user_id": "test-user",
            "session_id": "test-session",
            "scope": {
                "organization_id": organization_id,
                **({"project_id": project_id} if project_id else {})
            },
            "history": [],
            "options": {}
        },
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
    
    try:
        # Run normalize node
        result = normalize_node(state)
        normalized = result.get("normalized_query")
        
        if normalized:
            print("✅ Normalization Successful!\n")
            print(f"Intent: {normalized.intent}")
            print(f"Normalized Query: {normalized.normalized_query}")
            print(f"\nEntities:")
            print(json.dumps(normalized.entities, indent=2))
            print(f"\nContext:")
            print(json.dumps(normalized.context, indent=2))
            if normalized.history_summary:
                print(f"\nHistory Summary: {normalized.history_summary}")
        else:
            print("❌ Normalization failed - no output")
            if result.get("final_response"):
                print(f"Error: {result['final_response'].answer}")
                
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    import os
    
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
        print("Usage: python test_normalize_cli.py \"your query here\"")
        print("\nExamples:")
        print('  python test_normalize_cli.py "How many experiments were completed last month?"')
        print('  python test_normalize_cli.py "What are the key findings from experiment X?"')
        print('  python test_normalize_cli.py "Show me completed experiments and their findings"')
        sys.exit(1)
    
    query = sys.argv[1]
    org_id = sys.argv[2] if len(sys.argv) > 2 else "test-org"
    project_id = sys.argv[3] if len(sys.argv) > 3 else None
    
    test_normalize(query, org_id, project_id)

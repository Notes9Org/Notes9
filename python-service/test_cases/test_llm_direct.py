#!/usr/bin/env python3
"""
Direct test of LLM client to verify it works with any GPT model.
Usage:
    python test_llm_direct.py
    python test_llm_direct.py gpt-4
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Add parent directory to Python path so we can import agents module
script_dir = Path(__file__).parent
parent_dir = script_dir.parent
sys.path.insert(0, str(parent_dir))

# Load .env from parent directory
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

def test_llm(model_name=None):
    """Test LLM client directly."""
    print("=" * 60)
    print("🧪 Testing LLM Client Directly")
    print("=" * 60)
    
    try:
        from agents.services.llm_client import LLMClient
        
        # Initialize client
        print("\n1️⃣ Initializing LLM Client...")
        client = LLMClient()
        print(f"   ✅ Client initialized")
        print(f"   📝 Using deployment: {client.default_deployment}")
        print(f"   🌐 Endpoint: {client.config.endpoint}")
        print(f"   📌 API Version: {client.config.api_version}")
        
        # Test with a simple prompt
        print("\n2️⃣ Testing Chat Completion...")
        test_model = model_name or client.default_deployment
        print(f"   📝 Testing with model: {test_model}")
        
        prompt = "Return a JSON object with one field 'test' set to 'success'"
        schema = {
            "type": "object",
            "properties": {
                "test": {"type": "string"}
            }
        }
        
        print(f"   💬 Sending prompt: {prompt[:50]}...")
        result = client.complete_json(prompt, schema, model=test_model)
        
        print("\n3️⃣ Result:")
        print(f"   ✅ Success!")
        print(f"   📦 Response: {result}")
        
        print("\n" + "=" * 60)
        print("✅ LLM Client is working correctly!")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        print("\n" + "=" * 60)
        print("💡 Troubleshooting:")
        print("   1. Check AZURE_OPENAI_ENDPOINT is set correctly")
        print("   2. Check AZURE_OPENAI_API_KEY is set correctly")
        print("   3. Check AZURE_OPENAI_CHAT_DEPLOYMENT matches your deployment name")
        print("   4. Verify the deployment exists in Azure Portal")
        print("=" * 60)
        return False


if __name__ == "__main__":
    model = sys.argv[1] if len(sys.argv) > 1 else None
    success = test_llm(model)
    sys.exit(0 if success else 1)

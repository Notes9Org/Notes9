#!/usr/bin/env python3
"""Check what content exists in the database."""
import sys
import os
from pathlib import Path

script_dir = Path(__file__).parent
parent_dir = script_dir.parent
sys.path.insert(0, str(parent_dir))

# Load .env
try:
    from dotenv import load_dotenv
    try:
        env_path = parent_dir / '.env'
        if env_path.exists():
            load_dotenv(env_path, override=True)
    except (PermissionError, Exception):
        # Fallback to default load
        load_dotenv(override=False)
except ImportError:
    pass

# Patch websockets
try:
    from services.websockets_patch import *  # noqa: F401, F403
except ImportError:
    pass

from services.db import SupabaseService
from services.rag import RAGService
from services.embedder import EmbeddingService

org_id = "cedbb951-4b9f-440a-96ad-0373fe059a1b"

print("=" * 60)
print("🔍 Database Content Check")
print("=" * 60)
print()

# Initialize services
service = SupabaseService()
embedder = EmbeddingService()
rag = RAGService(service)

# 1. Check semantic chunks
print("1️⃣ Checking Semantic Chunks...")
print()
try:
    result = service.client.table('semantic_chunks')\
        .select('id, source_type, source_id, content, organization_id')\
        .eq('organization_id', org_id)\
        .limit(10)\
        .execute()
    
    total_result = service.client.table('semantic_chunks')\
        .select('id', count='exact')\
        .eq('organization_id', org_id)\
        .execute()
    
    print(f"   Total chunks in organization: {total_result.count}")
    print(f"   Sample chunks ({len(result.data)} shown):")
    print()
    
    source_types = {}
    for chunk in result.data:
        stype = chunk.get('source_type', 'unknown')
        source_types[stype] = source_types.get(stype, 0) + 1
        content = chunk.get('content', '')[:100].replace('\n', ' ')
        print(f"   - Type: {stype}")
        print(f"     ID: {chunk.get('source_id', 'N/A')[:20]}...")
        print(f"     Content: {content}...")
        print()
    
    print(f"   Source types found: {list(source_types.keys())}")
    print()
    
except Exception as e:
    print(f"   ❌ Error: {e}")
    print()

# 2. Check similarity scores with actual query
print("2️⃣ Testing RAG Search with Lower Threshold...")
print()
try:
    query = "What experiments or protocols are documented in the system?"
    print(f"   Query: {query}")
    print()
    
    embedding = embedder.embed_text(query)
    print(f"   ✅ Generated embedding (dim: {len(embedding)})")
    print()
    
    # Search with very low threshold to see all results
    results = rag.search_chunks(
        query_embedding=embedding,
        organization_id=org_id,
        match_threshold=0.0,  # Very low to see all
        match_count=10
    )
    
    print(f"   Found {len(results)} chunks (with threshold=0.0):")
    print()
    
    if results:
        for i, r in enumerate(results[:5], 1):
            similarity = r.get('similarity', 0)
            content = r.get('content', '')[:150].replace('\n', ' ')
            source_type = r.get('source_type', 'unknown')
            print(f"   [{i}] Similarity: {similarity:.3f}")
            print(f"       Type: {source_type}")
            print(f"       Content: {content}...")
            print()
        
        # Show how many are above different thresholds
        above_75 = sum(1 for r in results if r.get('similarity', 0) >= 0.75)
        above_70 = sum(1 for r in results if r.get('similarity', 0) >= 0.70)
        above_65 = sum(1 for r in results if r.get('similarity', 0) >= 0.65)
        above_60 = sum(1 for r in results if r.get('similarity', 0) >= 0.60)
        
        print(f"   Threshold analysis:")
        print(f"   - Above 0.75: {above_75} chunks")
        print(f"   - Above 0.70: {above_70} chunks")
        print(f"   - Above 0.65: {above_65} chunks")
        print(f"   - Above 0.60: {above_60} chunks")
        print()
    else:
        print("   ⚠️  No chunks found even with threshold=0.0")
        print()
        
except Exception as e:
    print(f"   ❌ Error: {e}")
    import traceback
    traceback.print_exc()
    print()

# 3. Check experiments table
print("3️⃣ Checking Experiments Table...")
print()
try:
    result = service.client.table('experiments')\
        .select('id, title, status, organization_id')\
        .eq('organization_id', org_id)\
        .limit(5)\
        .execute()
    
    total_result = service.client.table('experiments')\
        .select('id', count='exact')\
        .eq('organization_id', org_id)\
        .execute()
    
    print(f"   Total experiments: {total_result.count}")
    if result.data:
        print(f"   Sample experiments ({len(result.data)} shown):")
        for exp in result.data:
            print(f"   - {exp.get('title', 'Untitled')} (Status: {exp.get('status', 'unknown')})")
    print()
    
except Exception as e:
    print(f"   ❌ Error: {e}")
    print()

# 4. Check protocols table
print("4️⃣ Checking Protocols Table...")
print()
try:
    result = service.client.table('protocols')\
        .select('id, name, organization_id')\
        .eq('organization_id', org_id)\
        .limit(5)\
        .execute()
    
    total_result = service.client.table('protocols')\
        .select('id', count='exact')\
        .eq('organization_id', org_id)\
        .execute()
    
    print(f"   Total protocols: {total_result.count}")
    if result.data:
        print(f"   Sample protocols ({len(result.data)} shown):")
        for proto in result.data:
            print(f"   - {proto.get('name', 'Unnamed')}")
    print()
    
except Exception as e:
    print(f"   ❌ Error: {e}")
    print()

print("=" * 60)
print("✅ Check Complete")
print("=" * 60)

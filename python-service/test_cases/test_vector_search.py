"""Test vector search and hybrid search functionality."""
import os
import sys
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
import structlog

from services.db import SupabaseService
from services.embedder import EmbeddingService
from services.rag import RAGService, parse_embedding

# Configure logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ]
)

load_dotenv()

logger = structlog.get_logger()


class VectorSearchTester:
    """Test vector search and hybrid search functionality."""
    
    def __init__(self):
        self.db = SupabaseService()
        self.rag = RAGService(db_service=self.db)
        self.embedder = EmbeddingService()
        logger.info("Vector search tester initialized")
    
    def search_chunks_vector(
        self,
        query_embedding: List[float],
        match_threshold: float = 0.75,
        match_count: int = 6,
        organization_id: Optional[str] = None,
        project_id: Optional[str] = None,
        experiment_id: Optional[str] = None,
        source_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search semantic chunks using vector similarity.
        Uses Python-based cosine similarity calculation.
        """
        return self.rag.search_chunks(
            query_embedding=query_embedding,
            match_threshold=match_threshold,
            match_count=match_count,
            organization_id=organization_id,
            project_id=project_id,
            experiment_id=experiment_id,
            source_types=source_types
        )
    
    def search_chunks_hybrid(
        self,
        query_embedding: List[float],
        query_text: str,
        vector_weight: float = 0.7,
        text_weight: float = 0.3,
        match_threshold: float = 0.5,
        match_count: int = 10,
        organization_id: Optional[str] = None,
        project_id: Optional[str] = None,
        experiment_id: Optional[str] = None,
        source_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining vector similarity and full-text search.
        Uses Python-based calculation.
        """
        return self.rag.hybrid_search_chunks(
            query_embedding=query_embedding,
            query_text=query_text,
            vector_weight=vector_weight,
            text_weight=text_weight,
            match_threshold=match_threshold,
            match_count=match_count,
            organization_id=organization_id,
            project_id=project_id,
            experiment_id=experiment_id,
            source_types=source_types
        )
    
    def get_sample_chunks(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Get sample chunks from database."""
        try:
            response = self.db.client.table("semantic_chunks")\
                .select("*")\
                .not_.is_("embedding", "null")\
                .limit(limit)\
                .execute()
            
            return response.data if response.data else []
        except Exception as e:
            logger.error("Error getting sample chunks", error=str(e))
            return []
    
    def get_chunk_statistics(self) -> Dict[str, Any]:
        """Get statistics about chunks in database."""
        try:
            # Get total chunks
            total_response = self.db.client.table("semantic_chunks")\
                .select("id", count="exact")\
                .execute()
            
            # Get chunks with embeddings
            with_embeddings_response = self.db.client.table("semantic_chunks")\
                .select("id", count="exact")\
                .not_.is_("embedding", "null")\
                .execute()
            
            # Get chunks by source type
            source_type_response = self.db.client.table("semantic_chunks")\
                .select("source_type")\
                .execute()
            
            source_type_counts = {}
            if source_type_response.data:
                for chunk in source_type_response.data:
                    st = chunk.get("source_type")
                    source_type_counts[st] = source_type_counts.get(st, 0) + 1
            
            return {
                "total_chunks": total_response.count if hasattr(total_response, 'count') else len(total_response.data) if total_response.data else 0,
                "chunks_with_embeddings": with_embeddings_response.count if hasattr(with_embeddings_response, 'count') else len(with_embeddings_response.data) if with_embeddings_response.data else 0,
                "by_source_type": source_type_counts
            }
        except Exception as e:
            logger.error("Error getting statistics", error=str(e))
            return {}
    
    def print_results(self, results: List[Dict[str, Any]], title: str = "Search Results"):
        """Pretty print search results."""
        print(f"\n{'='*80}")
        print(f"  {title}")
        print(f"{'='*80}")
        
        if not results:
            print("  No results found.")
            return
        
        for idx, result in enumerate(results, 1):
            print(f"\n  Result #{idx}:")
            print(f"    Source Type: {result.get('source_type', 'N/A')}")
            print(f"    Source ID: {result.get('source_id', 'N/A')}")
            print(f"    Chunk Index: {result.get('chunk_index', 'N/A')}")
            
            # Mark if it's the original chunk
            if result.get('_is_original'):
                print(f"    ⚠️  (This is the original chunk used for search)")
            
            # Print similarity/score
            if 'similarity' in result:
                print(f"    Similarity: {result['similarity']:.4f}")
            elif 'combined_score' in result:
                print(f"    Combined Score: {result['combined_score']:.4f}")
                print(f"    Vector Similarity: {result.get('vector_similarity', 0):.4f}")
                print(f"    Text Rank: {result.get('text_rank', 0):.4f}")
            
            # Print content preview
            content = result.get('content', '')
            if content:
                preview = content[:150] + "..." if len(content) > 150 else content
                print(f"    Content: {preview}")
            
            # Print metadata
            metadata = result.get('metadata', {})
            if metadata and isinstance(metadata, dict):
                title = metadata.get('title', '')
                if title:
                    print(f"    Title: {title}")
        
        print(f"\n  Total Results: {len(results)}")
        print(f"{'='*80}\n")
    
    def test_vector_search(self, query: str):
        """Test vector search with a text query."""
        print(f"\n🔍 Testing Vector Search")
        print(f"Query: '{query}'")
        
        # Generate embedding for query
        print("  Generating embedding...")
        try:
            query_embedding = self.embedder.embed_text(query)
            print(f"  ✅ Embedding generated ({len(query_embedding)} dimensions)")
        except Exception as e:
            print(f"  ❌ Error generating embedding: {e}")
            return
        
        # Perform vector search (lower threshold for testing)
        print("  Performing vector search...")
        results = self.search_chunks_vector(
            query_embedding=query_embedding,
            match_threshold=0.2,  # Lower threshold for testing
            match_count=5
        )
        
        self.print_results(results, "Vector Search Results")
        return results
    
    def test_hybrid_search(self, query: str):
        """Test hybrid search with a text query."""
        print(f"\n🔍 Testing Hybrid Search")
        print(f"Query: '{query}'")
        
        # Generate embedding for query
        print("  Generating embedding...")
        try:
            query_embedding = self.embedder.embed_text(query)
            print(f"  ✅ Embedding generated ({len(query_embedding)} dimensions)")
        except Exception as e:
            print(f"  ❌ Error generating embedding: {e}")
            return
        
        # Perform hybrid search
        print("  Performing hybrid search...")
        results = self.search_chunks_hybrid(
            query_embedding=query_embedding,
            query_text=query,
            vector_weight=0.7,
            text_weight=0.3,
            match_threshold=0.3,
            match_count=5
        )
        
        self.print_results(results, "Hybrid Search Results")
        return results
    
    def test_with_existing_embedding(self):
        """Test search using an existing chunk's embedding."""
        print(f"\n🔍 Testing with Existing Embedding")
        
        # Get a sample chunk
        print("  Getting sample chunk...")
        sample_chunks = self.get_sample_chunks(limit=1)
        
        if not sample_chunks:
            print("  ❌ No chunks with embeddings found in database")
            return
        
        sample_chunk = sample_chunks[0]
        sample_embedding_raw = sample_chunk.get('embedding')
        sample_content = sample_chunk.get('content', '')[:100]
        
        if not sample_embedding_raw:
            print("  ❌ Sample chunk has no embedding")
            return
        
        # Parse embedding
        sample_embedding = parse_embedding(sample_embedding_raw)
        
        if not sample_embedding:
            print("  ❌ Could not parse sample embedding")
            return
        
        print(f"  ✅ Using sample chunk: {sample_content}...")
        
        # Search for similar chunks (lower threshold since we want to see the match)
        print("  Searching for similar chunks...")
        results = self.search_chunks_vector(
            query_embedding=sample_embedding,
            match_threshold=0.2,  # Lower threshold to see results
            match_count=5
        )
        
        # Show all results, but mark the original
        if results:
            print(f"  Found {len(results)} similar chunk(s)")
            for r in results:
                if r.get('id') == sample_chunk.get('id'):
                    r['_is_original'] = True
        
        self.print_results(results, "Similar Chunks (Vector Search)")
        return results
    
    def run_all_tests(self):
        """Run all test scenarios."""
        print("\n" + "="*80)
        print("  VECTOR SEARCH & HYBRID SEARCH TEST SUITE")
        print("="*80)
        
        # Get statistics
        print("\n📊 Database Statistics:")
        stats = self.get_chunk_statistics()
        print(f"  Total Chunks: {stats.get('total_chunks', 0)}")
        print(f"  Chunks with Embeddings: {stats.get('chunks_with_embeddings', 0)}")
        print(f"  By Source Type: {stats.get('by_source_type', {})}")
        
        if stats.get('chunks_with_embeddings', 0) == 0:
            print("\n  ⚠️  No chunks with embeddings found!")
            print("  Please run the worker to process some jobs first.")
            return
        
        # Test 1: Vector search with text query
        self.test_vector_search("experiment results and findings")
        
        # Test 2: Hybrid search with text query
        self.test_hybrid_search("test experiment scientific")
        
        # Test 3: Search using existing embedding
        self.test_with_existing_embedding()
        
        # Test 4: Vector search with filters
        print(f"\n🔍 Testing Vector Search with Filters")
        query = "Give me the conclusion of attention and multi head attention"
        query_embedding = self.embedder.embed_text(query)
        
        results = self.search_chunks_vector(
            query_embedding=query_embedding,
            match_threshold=0.2,  # Lower threshold for testing
            match_count=5,
            source_types=["lab_note", "report"]
        )
        self.print_results(results, "Filtered Vector Search (lab_note, report only)")
        
        print("\n✅ All tests completed!")
        print("="*80 + "\n")


def main():
    """Main test function."""
    try:
        tester = VectorSearchTester()
        tester.run_all_tests()
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Test suite error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()


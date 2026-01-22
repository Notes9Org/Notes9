"""RAG (Retrieval Augmented Generation) service for semantic search."""
import json
import re
from typing import Optional, List, Dict, Any
import numpy as np
import structlog

from services.db import SupabaseService

logger = structlog.get_logger()


def parse_embedding(embedding) -> Optional[List[float]]:
    """
    Parse embedding from various formats (list, string, etc.)
    Returns list of floats or None if parsing fails.
    """
    if embedding is None:
        return None
    
    # Already a list
    if isinstance(embedding, list):
        try:
            return [float(x) for x in embedding]
        except (ValueError, TypeError):
            return None
    
    # String representation
    if isinstance(embedding, str):
        try:
            # Try JSON parsing first
            parsed = json.loads(embedding)
            if isinstance(parsed, list):
                return [float(x) for x in parsed]
        except (json.JSONDecodeError, ValueError, TypeError):
            pass
        
        # Try parsing as comma-separated or space-separated
        try:
            # Remove brackets if present
            cleaned = embedding.strip('[]')
            # Split by comma or space
            if ',' in cleaned:
                values = cleaned.split(',')
            else:
                values = cleaned.split()
            return [float(x.strip()) for x in values if x.strip()]
        except (ValueError, AttributeError):
            return None
    
    return None


class RAGService:
    """Service for semantic search and retrieval."""
    
    def __init__(self, db_service: Optional[SupabaseService] = None):
        """
        Initialize RAG service.
        
        Args:
            db_service: Optional SupabaseService instance. If not provided, creates a new one.
        """
        self.db = db_service if db_service else SupabaseService()
        logger.info("RAG service initialized")
    
    def search_chunks(
        self,
        query_embedding: List[float],
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        project_id: Optional[str] = None,
        experiment_id: Optional[str] = None,
        source_types: Optional[List[str]] = None,
        match_threshold: float = 0.75,
        match_count: int = 6
    ) -> List[Dict[str, Any]]:
        """
        Search semantic chunks using vector similarity.
        Calculates cosine similarity in Python.
        
        Args:
            query_embedding: Query text embedding vector
            user_id: Filter by user (created_by) - REQUIRED for security
            organization_id: Filter by organization
            project_id: Filter by project
            experiment_id: Filter by experiment
            source_types: Filter by source types (e.g., ['lab_note', 'report'])
            match_threshold: Minimum similarity score (0.0 to 1.0)
            match_count: Maximum number of results to return
            
        Returns:
            List of matching chunks with similarity scores
        """
        try:
            # Build query
            query = self.db.client.table("semantic_chunks")\
                .select("*")\
                .not_.is_("embedding", "null")
            
            # SECURITY: Always filter by user_id (created_by) to ensure users only see their own data
            if user_id:
                query = query.eq("created_by", user_id)
            else:
                logger.warning("RAG search called without user_id - security risk, returning empty results")
                return []
            
            # Apply additional filters
            if organization_id:
                query = query.eq("organization_id", organization_id)
            if project_id:
                query = query.eq("project_id", project_id)
            if experiment_id:
                query = query.eq("experiment_id", experiment_id)
            if source_types:
                query = query.in_("source_type", source_types)
            
            # Fetch chunks (limit to reasonable number for in-memory processing)
            response = query.limit(1000).execute()
            chunks = response.data if response.data else []
            
            if not chunks:
                return []
            
            # Calculate cosine similarity for each chunk
            query_vec = np.array(query_embedding, dtype=np.float32)
            results = []
            
            for chunk in chunks:
                embedding = chunk.get("embedding")
                parsed_embedding = parse_embedding(embedding)
                
                if parsed_embedding is None:
                    logger.debug("Skipping chunk with unparseable embedding", chunk_id=chunk.get("id"))
                    continue
                
                # Ensure dimensions match
                if len(parsed_embedding) != len(query_embedding):
                    logger.warning(
                        "Embedding dimension mismatch",
                        chunk_id=chunk.get("id"),
                        chunk_dim=len(parsed_embedding),
                        query_dim=len(query_embedding)
                    )
                    continue
                
                chunk_vec = np.array(parsed_embedding, dtype=np.float32)
                
                # Calculate cosine similarity
                dot_product = np.dot(query_vec, chunk_vec)
                norm_query = np.linalg.norm(query_vec)
                norm_chunk = np.linalg.norm(chunk_vec)
                
                if norm_query == 0 or norm_chunk == 0:
                    similarity = 0.0
                else:
                    similarity = dot_product / (norm_query * norm_chunk)
                
                # Log all similarities for debugging (not just above threshold)
                if len(results) < 5:  # Log first 5 for debugging
                    logger.debug(
                        "Similarity calculated",
                        chunk_id=chunk.get("id")[:8],
                        similarity=round(similarity, 4),
                        threshold=match_threshold,
                        passes=similarity >= match_threshold
                    )
                
                # Filter by threshold
                if similarity >= match_threshold:
                    chunk["similarity"] = float(similarity)
                    results.append(chunk)
            
            # Sort by similarity (descending) and limit
            results.sort(key=lambda x: x.get("similarity", 0), reverse=True)
            results = results[:match_count]
            
            # Debug: Log top similarities even if below threshold
            if len(chunks) > 0 and len(results) == 0:
                # Calculate similarities for all chunks to see what we're missing
                all_similarities = []
                for chunk in chunks[:10]:  # Check first 10
                    embedding = chunk.get("embedding")
                    parsed_embedding = parse_embedding(embedding)
                    if parsed_embedding and len(parsed_embedding) == len(query_embedding):
                        chunk_vec = np.array(parsed_embedding, dtype=np.float32)
                        dot_product = np.dot(query_vec, chunk_vec)
                        norm_query = np.linalg.norm(query_vec)
                        norm_chunk = np.linalg.norm(chunk_vec)
                        if norm_query > 0 and norm_chunk > 0:
                            sim = dot_product / (norm_query * norm_chunk)
                            all_similarities.append(sim)
                
                if all_similarities:
                    max_sim = max(all_similarities)
                    logger.warning(
                        "No results above threshold",
                        match_threshold=match_threshold,
                        max_similarity_found=round(max_sim, 4),
                        chunks_checked=len(chunks),
                        suggestion=f"Consider lowering threshold to {round(max_sim + 0.05, 2)}"
                    )
            
            logger.info(
                "Vector search completed",
                results_count=len(results),
                match_threshold=match_threshold,
                chunks_checked=len(chunks)
            )
            
            return results
            
        except Exception as e:
            logger.error("Error searching chunks", error=str(e))
            return []
    
    def hybrid_search_chunks(
        self,
        query_embedding: List[float],
        query_text: str,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        project_id: Optional[str] = None,
        experiment_id: Optional[str] = None,
        source_types: Optional[List[str]] = None,
        vector_weight: float = 0.7,
        text_weight: float = 0.3,
        match_threshold: float = 0.5,
        match_count: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining vector similarity and full-text search.
        Calculates both scores in Python and combines them.
        
        Args:
            query_embedding: Query text embedding vector
            query_text: Query text for full-text matching
            user_id: Filter by user (created_by) - REQUIRED for security
            organization_id: Filter by organization
            project_id: Filter by project
            experiment_id: Filter by experiment
            source_types: Filter by source types
            vector_weight: Weight for vector similarity (default 0.7)
            text_weight: Weight for text rank (default 0.3)
            match_threshold: Minimum combined score (0.0 to 1.0)
            match_count: Maximum number of results to return
            
        Returns:
            List of matching chunks with combined scores
        """
        try:
            # Build query for vector search
            query = self.db.client.table("semantic_chunks")\
                .select("*")\
                .not_.is_("embedding", "null")
            
            # SECURITY: Always filter by user_id (created_by) to ensure users only see their own data
            if user_id:
                query = query.eq("created_by", user_id)
            else:
                logger.warning("Hybrid RAG search called without user_id - security risk, returning empty results")
                return []
            
            # Apply additional filters
            if organization_id:
                query = query.eq("organization_id", organization_id)
            if project_id:
                query = query.eq("project_id", project_id)
            if experiment_id:
                query = query.eq("experiment_id", experiment_id)
            if source_types:
                query = query.in_("source_type", source_types)
            
            # Fetch chunks
            response = query.limit(1000).execute()
            chunks = response.data if response.data else []
            
            if not chunks:
                return []
            
            # Prepare query text for full-text matching
            query_words = set(re.findall(r'\b\w+\b', query_text.lower()))
            
            query_vec = np.array(query_embedding, dtype=np.float32)
            results = []
            
            for chunk in chunks:
                embedding = chunk.get("embedding")
                content = chunk.get("content", "").lower()
                
                parsed_embedding = parse_embedding(embedding)
                if parsed_embedding is None:
                    continue
                
                # Calculate vector similarity
                chunk_vec = np.array(parsed_embedding, dtype=np.float32)
                dot_product = np.dot(query_vec, chunk_vec)
                norm_query = np.linalg.norm(query_vec)
                norm_chunk = np.linalg.norm(chunk_vec)
                
                if norm_query == 0 or norm_chunk == 0:
                    vector_sim = 0.0
                else:
                    vector_sim = dot_product / (norm_query * norm_chunk)
                
                # Calculate text rank (simple word overlap)
                content_words = set(re.findall(r'\b\w+\b', content))
                if query_words:
                    text_rank = len(query_words.intersection(content_words)) / len(query_words)
                else:
                    text_rank = 0.0
                
                # Normalize text_rank to 0-1 scale (can be > 1 if many matches)
                text_rank = min(text_rank, 1.0)
                
                # Combine scores
                combined_score = (vector_sim * vector_weight) + (text_rank * text_weight)
                
                # Filter by threshold
                if combined_score >= match_threshold:
                    chunk["vector_similarity"] = float(vector_sim)
                    chunk["text_rank"] = float(text_rank)
                    chunk["combined_score"] = float(combined_score)
                    results.append(chunk)
            
            # Sort by combined score (descending) and limit
            results.sort(key=lambda x: x.get("combined_score", 0), reverse=True)
            results = results[:match_count]
            
            logger.info(
                "Hybrid search completed",
                results_count=len(results),
                query_text=query_text,
                chunks_checked=len(chunks)
            )
            
            return results
            
        except Exception as e:
            logger.error("Error in hybrid search", error=str(e))
            return []


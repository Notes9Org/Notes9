"""Embedding generation service using Azure OpenAI."""
import os
from typing import List, Optional
from dotenv import load_dotenv
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from services.config import AzureOpenAIConfig

load_dotenv()

logger = structlog.get_logger()


class EmbeddingService:
    """Service for generating text embeddings using Azure OpenAI."""
    
    def __init__(self):
        self.config = AzureOpenAIConfig()
        self.client = self.config.create_client()
        self.model = self.config.get_embedding_model()
        self.dimensions = self.config.get_dimensions()
        
        logger.info(
            "Embedding service initialized",
            model=self.model,
            dimensions=self.dimensions,
            provider="Azure OpenAI"
        )
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        
        try:
            response = self.client.embeddings.create(
                model=self.model,
                input=text.strip(),
                dimensions=self.dimensions
            )
            
            return response.data[0].embedding
        except Exception as e:
            logger.error("Error generating embedding", error=str(e), text_length=len(text))
            raise
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    def embed_batch(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        Generate embeddings for multiple texts (batch processing).
        Returns list of embeddings, with None for failed texts.
        """
        if not texts:
            return []
        
        # Filter out empty texts
        valid_texts = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
        if not valid_texts:
            return [None] * len(texts)
        
        try:
            # Prepare texts for API
            text_values = [t for _, t in valid_texts]
            
            # Log request details for debugging
            logger.debug(
                "Creating embeddings",
                model=self.model,
                text_count=len(text_values),
                dimensions=self.dimensions
            )
            
            response = self.client.embeddings.create(
                model=self.model,
                input=text_values,
                dimensions=self.dimensions
            )
            
            # Map embeddings back to original order
            embeddings = {}
            for embedding_data in response.data:
                embeddings[embedding_data.index] = embedding_data.embedding
            
            # Build result list with None for empty texts
            result = []
            valid_idx = 0
            for i, text in enumerate(texts):
                if text and text.strip():
                    result.append(embeddings.get(valid_idx))
                    valid_idx += 1
                else:
                    result.append(None)
            
            logger.info("Batch embeddings generated", total=len(texts), successful=len([e for e in result if e]))
            return result
            
        except Exception as e:
            logger.error("Error generating batch embeddings", error=str(e), count=len(texts))
            # Return all None on error
            return [None] * len(texts)
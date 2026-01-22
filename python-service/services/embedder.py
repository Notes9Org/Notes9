"""Embedding generation service using Azure OpenAI."""
import os
from typing import List, Optional
from dotenv import load_dotenv
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from services.config import get_azure_openai_config

load_dotenv()

logger = structlog.get_logger()


class EmbeddingService:
    """Service for generating text embeddings using Azure OpenAI."""
    
    def __init__(self):
        self.config = get_azure_openai_config()
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
            logger.debug(
                "Generating embedding",
                model=self.model,
                dimensions=self.dimensions,
                text_length=len(text),
                text_preview=text[:100]
            )
            
            response = self.client.embeddings.create(
                model=self.model,
                input=text.strip(),
                dimensions=self.dimensions
            )
            
            if not response.data or len(response.data) == 0:
                raise ValueError("Empty response from embedding API")
            
            embedding = response.data[0].embedding
            
            if not embedding or len(embedding) != self.dimensions:
                raise ValueError(
                    f"Invalid embedding dimensions: expected {self.dimensions}, got {len(embedding) if embedding else 0}"
                )
            
            logger.debug(
                "Embedding generated successfully",
                model=self.model,
                dimensions=len(embedding),
                embedding_norm=sum(x * x for x in embedding) ** 0.5
            )
            
            return embedding
        except Exception as e:
            logger.error(
                "Error generating embedding",
                error=str(e),
                error_type=type(e).__name__,
                text_length=len(text),
                model=self.model,
                dimensions=self.dimensions
            )
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
            
            # Validate response
            if not response.data or len(response.data) != len(text_values):
                raise ValueError(
                    f"Invalid response: expected {len(text_values)} embeddings, got {len(response.data) if response.data else 0}"
                )
            
            # Map embeddings back to original order
            # Azure OpenAI returns embeddings in the same order as input
            # Use list comprehension to extract embeddings in order
            embedding_list = [item.embedding for item in response.data]
            
            # Build result list with None for empty texts
            result = []
            valid_idx = 0
            for i, text in enumerate(texts):
                if text and text.strip():
                    if valid_idx < len(embedding_list):
                        embedding = embedding_list[valid_idx]
                        # Validate embedding dimensions
                        if embedding and len(embedding) == self.dimensions:
                            result.append(embedding)
                        else:
                            logger.warning(
                                "Invalid embedding dimensions",
                                expected=self.dimensions,
                                got=len(embedding) if embedding else 0,
                                index=valid_idx
                            )
                            result.append(None)
                    else:
                        result.append(None)
                    valid_idx += 1
                else:
                    result.append(None)
            
            logger.info("Batch embeddings generated", total=len(texts), successful=len([e for e in result if e]))
            return result
            
        except Exception as e:
            logger.error("Error generating batch embeddings", error=str(e), count=len(texts))
            # Return all None on error
            return [None] * len(texts)
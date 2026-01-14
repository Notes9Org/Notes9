"""Azure OpenAI configuration."""
import os
from typing import Optional
from openai import AzureOpenAI
from dotenv import load_dotenv
import structlog

load_dotenv()

logger = structlog.get_logger()


class AzureOpenAIConfig:
    """Configuration and client factory for Azure OpenAI."""
    
    def __init__(self):
        # Support both endpoint formats:
        # - OpenAI: https://<resource>.openai.azure.com
        # - Cognitive Services: https://<resource>-<region>.cognitiveservices.azure.com
        self.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "")
        self.api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
        self.model_name = os.getenv("AZURE_OPENAI_MODEL_NAME", "text-embedding-3-small")
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "text-embedding-3-small")
        self.dimensions = int(os.getenv("EMBEDDING_DIMENSIONS", "1536"))
        
        # Validate configuration
        if not self.endpoint:
            raise ValueError(
                "AZURE_OPENAI_ENDPOINT must be set. "
                "Format: https://<resource>.openai.azure.com or "
                "https://<resource>-<region>.cognitiveservices.azure.com"
            )
        
        if not self.api_key:
            raise ValueError(
                "AZURE_OPENAI_API_KEY must be set. "
                "Get your API key from Azure Portal: "
                "https://portal.azure.com"
            )
        
        logger.info(
            "Azure OpenAI config initialized",
            endpoint=self.endpoint,
            model=self.model_name,
            deployment=self.deployment,
            api_version=self.api_version,
            dimensions=self.dimensions
        )
    
    def create_client(self) -> AzureOpenAI:
        """Create and return Azure OpenAI client."""
        try:
            # Clean endpoint - remove trailing slash and ensure proper format
            endpoint = self.endpoint.rstrip('/')
            
            # Validate endpoint format
            if not endpoint.startswith('https://'):
                raise ValueError(f"Invalid endpoint format: {endpoint}. Must start with https://")
            
            # Support both endpoint formats:
            # - OpenAI format: https://<resource>.openai.azure.com
            # - Cognitive Services format: https://<resource>-<region>.cognitiveservices.azure.com
            is_valid_endpoint = (
                '.openai.azure.com' in endpoint or 
                '.cognitiveservices.azure.com' in endpoint
            )
            
            if not is_valid_endpoint:
                logger.warning(
                    "Endpoint format may be incorrect",
                    endpoint=endpoint,
                    expected_formats=[
                        "https://<resource>.openai.azure.com",
                        "https://<resource>-<region>.cognitiveservices.azure.com"
                    ]
                )
            
            client = AzureOpenAI(
                api_version=self.api_version,
                azure_endpoint=endpoint,
                api_key=self.api_key
            )
            
            logger.info("Azure OpenAI client created successfully", endpoint=endpoint)
            return client
        except Exception as e:
            logger.error("Error creating Azure OpenAI client", error=str(e), endpoint=self.endpoint)
            raise
    
    def get_embedding_model(self) -> str:
        """Get the deployment name for embeddings."""
        return self.deployment
    
    def get_dimensions(self) -> int:
        """Get embedding dimensions."""
        return self.dimensions
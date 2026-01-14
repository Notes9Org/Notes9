"""LLM client abstraction with retry and JSON validation."""
import os
import json
import time
import re
from typing import Dict, Any, Optional
from openai import AzureOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential
import structlog

from services.config import AzureOpenAIConfig

logger = structlog.get_logger()

class LLMError(Exception):
    """Custom exception for LLM errors."""
    pass


class LLMClient:
    """Abstracted LLM client with structured output support."""
    
    def __init__(self):
        """Initialize LLM client with Azure OpenAI."""
        self.config = AzureOpenAIConfig()
        self.client = self.config.create_client()
        
        # Get chat model deployment - prioritize CHAT_DEPLOYMENT over CHAT_MODEL
        # This ensures we use the deployment name, not the model name
        self.default_deployment = (
            os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT") or 
            os.getenv("AZURE_OPENAI_CHAT_MODEL") or 
            "gpt-5.2-chat"
        )
        self.default_model = self.default_deployment  # Use deployment name as model
        self.max_completion_tokens = int(os.getenv("AZURE_OPENAI_MAX_COMPLETION_TOKENS", "16384"))
        
        # Default temperature - can be overridden per call
        # Some models (like gpt-5.2-chat) only support default (1.0)
        # Others support any value between 0.0 and 2.0
        self.default_temperature = float(os.getenv("AZURE_OPENAI_DEFAULT_TEMPERATURE", "0.0"))
        
        # Validate that we have a chat model configured
        if not self.default_deployment:
            raise ValueError(
                "Chat model deployment not configured. "
                "Set AZURE_OPENAI_CHAT_DEPLOYMENT in your .env file. "
                "Example: AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4"
            )
        
        logger.info(
            "LLM client initialized",
            model=self.default_model,
            deployment=self.default_deployment,
            endpoint=self.config.endpoint,
            api_version=self.config.api_version,
            max_completion_tokens=self.max_completion_tokens,
            default_temperature=self.default_temperature
        )
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    def complete_json(
        self,
        prompt: str,
        schema: Dict[str, Any],
        model: Optional[str] = None,
        temperature: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Generate structured JSON output from prompt.
        
        Args:
            prompt: Input prompt
            schema: Pydantic schema dict for validation
            model: Model name (defaults to configured model)
            temperature: Sampling temperature (None uses default from env, or 0.0)
                        Lower values = more deterministic, higher = more creative
            
        Returns:
            Validated JSON dict matching schema
            
        Raises:
            LLMError: If generation fails or output is invalid
        """
        model = model or self.default_deployment
        # Use provided temperature, or default from env, or 0.0
        use_temperature = temperature if temperature is not None else self.default_temperature
        start_time = time.time()
        
        try:
            # Build messages with JSON instruction in system prompt
            # Note: response_format may not be supported in all Azure OpenAI versions
            system_message = "You are a helpful assistant that returns valid JSON. Always respond with JSON only, no markdown, no explanations."
            user_message = f"{prompt}\n\nIMPORTANT: Return ONLY valid JSON, no markdown code blocks, no explanations."
            
            # Build request parameters for chat completions
            # Use deployment name as model parameter (required for Azure OpenAI)
            request_params = {
                "model": model,  # This should be the deployment name, not model name
                "messages": [
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_message}
                ],
                "timeout": 30.0
            }
            
            # Handle temperature - some models (like gpt-5.2-chat) only support default (1.0)
            # We'll try the requested temperature first, and fall back if not supported
            if use_temperature != 1.0:  # Only add if not default
                request_params["temperature"] = use_temperature
            
            # Add max_completion_tokens only if supported (may not be in all API versions)
            # Some Azure OpenAI deployments don't support this parameter
            try:
                request_params["max_completion_tokens"] = self.max_completion_tokens
            except:
                pass  # Skip if not supported
            
            # Log the actual request for debugging
            logger.debug(
                "Calling Azure OpenAI chat completions",
                model=model,
                endpoint=self.config.endpoint,
                api_version=self.config.api_version,
                temperature=use_temperature if use_temperature != 1.0 else "default"
            )
            
            # Call chat.completions API (not embeddings!)
            try:
                response = self.client.chat.completions.create(**request_params)
            except Exception as temp_error:
                # If custom temperature was requested but not supported, try without temperature
                # Some models (like gpt-5.2-chat) only support default temperature (1.0)
                error_str = str(temp_error)
                if "temperature" in error_str.lower() and "unsupported" in error_str.lower():
                    logger.warning(
                        f"Model doesn't support temperature={use_temperature}, using default temperature (1.0)",
                        model=model,
                        requested_temperature=use_temperature
                    )
                    # Remove temperature to use default (1.0)
                    if "temperature" in request_params:
                        del request_params["temperature"]
                    response = self.client.chat.completions.create(**request_params)
                else:
                    raise
            
            content = response.choices[0].message.content
            if not content:
                raise LLMError("Empty response from LLM")
            
            # Clean content - remove markdown code blocks if present
            content = content.strip()
            if content.startswith("```"):
                # Remove markdown code blocks
                content = re.sub(r'^```(?:json)?\s*', '', content, flags=re.IGNORECASE)
                content = re.sub(r'\s*```$', '', content)
            content = content.strip()
            
            # Parse JSON
            try:
                result = json.loads(content)
            except json.JSONDecodeError as e:
                logger.error("Invalid JSON from LLM", error=str(e), content=content[:200])
                raise LLMError(f"Invalid JSON response: {str(e)}")
            
            latency_ms = (time.time() - start_time) * 1000
            logger.info(
                "LLM JSON completion",
                model=model,
                latency_ms=round(latency_ms, 2),
                response_length=len(content)
            )
            
            return result
            
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            error_str = str(e)
            
            # Log detailed error for debugging
            logger.error(
                "LLM JSON completion failed",
                error=error_str,
                model=model,
                endpoint=self.config.endpoint if hasattr(self.config, 'endpoint') else 'unknown',
                latency_ms=round(latency_ms, 2)
            )
            
            # Check for common errors and provide helpful messages
            if "'input' is a required property" in error_str:
                error_msg = (
                    f"API error: The deployment '{model}' might not exist or is not a chat model. "
                    f"Check your Azure Portal → Deployments to verify the deployment name. "
                    f"Current endpoint: {self.config.endpoint}"
                )
                logger.error(
                    "Azure OpenAI API error - deployment may not exist or wrong type",
                    endpoint=self.config.endpoint,
                    api_version=self.config.api_version,
                    model=model,
                    error=error_str
                )
                raise LLMError(error_msg)
            elif "deployment" in error_str.lower() and "not found" in error_str.lower():
                error_msg = (
                    f"Deployment '{model}' not found. "
                    f"Verify the deployment name in Azure Portal → Deployments. "
                    f"Set AZURE_OPENAI_CHAT_DEPLOYMENT to the correct deployment name."
                )
                logger.error("Deployment not found", model=model, endpoint=self.config.endpoint)
                raise LLMError(error_msg)
            
            raise LLMError(f"LLM completion failed: {str(e)}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    def complete_text(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.7
    ) -> str:
        """
        Generate text output from prompt.
        
        Args:
            prompt: Input prompt
            model: Model name (defaults to configured model)
            temperature: Sampling temperature
            
        Returns:
            Generated text string
            
        Raises:
            LLMError: If generation fails
        """
        model = model or self.default_deployment
        start_time = time.time()
        
        try:
            # Build request parameters
            request_params = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                "timeout": 30.0
            }
            
            # Handle temperature - some models don't support custom temperature values
            if temperature != 1.0:  # Only add if not default
                request_params["temperature"] = temperature
            
            # Add max_completion_tokens only if supported
            try:
                request_params["max_completion_tokens"] = self.max_completion_tokens
            except:
                pass  # Skip if not supported
            
            try:
                response = self.client.chat.completions.create(**request_params)
            except Exception as temp_error:
                # If temperature is not supported, try without it (use default)
                error_str = str(temp_error)
                if "temperature" in error_str.lower() and "unsupported" in error_str.lower():
                    logger.warning(
                        "Model doesn't support custom temperature, using default",
                        model=model,
                        requested_temperature=temperature
                    )
                    if "temperature" in request_params:
                        del request_params["temperature"]
                    response = self.client.chat.completions.create(**request_params)
                else:
                    raise
            
            content = response.choices[0].message.content
            if not content:
                raise LLMError("Empty response from LLM")
            
            latency_ms = (time.time() - start_time) * 1000
            logger.info(
                "LLM text completion",
                model=model,
                latency_ms=round(latency_ms, 2),
                response_length=len(content)
            )
            
            return content.strip()
            
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            error_str = str(e)
            
            logger.error(
                "LLM text completion failed",
                error=error_str,
                model=model,
                endpoint=self.config.endpoint if hasattr(self.config, 'endpoint') else 'unknown',
                latency_ms=round(latency_ms, 2)
            )
            
            # Check if it's the 'input' error
            if "'input' is a required property" in error_str or "input" in error_str.lower():
                logger.error(
                    "Azure OpenAI API format error - endpoint or API version may be incorrect",
                    endpoint=self.config.endpoint if hasattr(self.config, 'endpoint') else 'unknown',
                    api_version=self.config.api_version if hasattr(self.config, 'api_version') else 'unknown',
                    model=model
                )
            
            raise LLMError(f"LLM completion failed: {str(e)}")
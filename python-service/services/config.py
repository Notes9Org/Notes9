"""Centralized configuration management for all services."""
import os
from typing import Optional, Dict, Any
from dotenv import load_dotenv
import structlog
import psycopg2
from psycopg2.extras import RealDictCursor

# Patch websockets before importing supabase (must be at module level)
try:
    from services.websockets_patch import *  # noqa: F401, F403
except ImportError:
    pass  # Patch not critical if websockets not installed

# Load environment variables
load_dotenv()

logger = structlog.get_logger()


class ConfigurationError(Exception):
    """Raised when configuration is invalid or service is unavailable."""
    pass


class DatabaseConfig:
    """PostgreSQL database configuration and connection management."""
    
    def __init__(self):
        """Initialize database configuration from environment variables."""
        # Connection string (preferred method)
        self.database_url = os.getenv("DATABASE_URL")
        
        # Individual credentials
        self.supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
        self.db_host = os.getenv("DB_HOST", "")
        self.db_port = int(os.getenv("DB_PORT", "5432"))
        self.db_user = os.getenv("DB_USER", "postgres")
        self.db_password = os.getenv("DB_PASSWORD")
        self.db_name = os.getenv("DB_NAME", "postgres")
        
        # Auto-detect host from Supabase URL if not set
        if not self.db_host and self.supabase_url:
            if ".supabase.co" in self.supabase_url:
                project_ref = self.supabase_url.replace("https://", "").replace(".supabase.co", "")
                self.db_host = f"db.{project_ref}.supabase.co"
                logger.info("Auto-detected DB_HOST from Supabase URL", host=self.db_host)
        
        # Extract project reference
        self.project_ref = None
        if ".supabase.co" in self.supabase_url:
            self.project_ref = self.supabase_url.replace("https://", "").replace(".supabase.co", "")
        elif ".supabase.co" in self.db_host:
            self.project_ref = self.db_host.replace("db.", "").replace(".pooler.supabase.com", "").replace(".supabase.co", "")
        
        # Determine connection type
        self.use_pooler = self.db_port == 6543
        
        # Validate configuration
        self._validate()
    
    def _validate(self):
        """Validate database configuration."""
        if self.database_url:
            # Connection string provided - that's sufficient
            return
        
        # Need individual credentials
        if not self.db_password:
            raise ConfigurationError(
                "Database service is not available: DB_PASSWORD is required.\n\n"
                "To fix this:\n"
                "1. Get your database password from Supabase Dashboard:\n"
                "   - Go to https://supabase.com/dashboard\n"
                "   - Select your project\n"
                "   - Go to Settings → Database\n"
                "   - Copy the 'Database Password' (or reset it if needed)\n\n"
                "2. Add to your .env file:\n"
                f"   DB_HOST={self.db_host or 'db.your-project.supabase.co'}\n"
                f"   DB_PORT={self.db_port}\n"
                f"   DB_USER={self.db_user}\n"
                "   DB_PASSWORD=your_database_password_here\n"
                f"   DB_NAME={self.db_name}\n\n"
                "Alternatively, you can use a connection string:\n"
                "   DATABASE_URL=postgresql://postgres:password@host:port/database"
            )
        
        if self.use_pooler and not self.project_ref:
            raise ConfigurationError(
                "Database service is not available: Cannot use pooler (port 6543) without project reference.\n\n"
                "To fix this:\n"
                "1. Set NEXT_PUBLIC_SUPABASE_URL in your .env file:\n"
                "   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n"
                "2. Or set DB_HOST with a Supabase host that contains the project reference."
            )
    
    def get_connection(self, autocommit: bool = True) -> psycopg2.extensions.connection:
        """
        Create and return a PostgreSQL connection.
        
        Args:
            autocommit: Enable autocommit mode (default: True for read-only queries)
            
        Returns:
            PostgreSQL connection object
            
        Raises:
            ConfigurationError: If configuration is invalid or connection fails
        """
        # Try connection string first
        if self.database_url:
            try:
                conn = psycopg2.connect(self.database_url, connect_timeout=10)
                if autocommit:
                    conn.autocommit = True
                logger.info("PostgreSQL connection established via DATABASE_URL", autocommit=autocommit)
                return conn
            except Exception as e:
                error_msg = f"Database service is not available: Failed to connect via DATABASE_URL. Error: {str(e)}"
                logger.error(error_msg)
                raise ConfigurationError(error_msg) from e
        
        # Use individual credentials
        db_host = self.db_host
        db_user = self.db_user
        db_password = self.db_password
        db_name = self.db_name
        db_port = self.db_port
        
        # Adjust for pooler
        if self.use_pooler:
            if not self.project_ref:
                raise ConfigurationError(
                    "Database service is not available: Cannot use pooler without project reference."
                )
            
            # Pooler user format: postgres.<project-ref>
            if db_user == "postgres" or not os.getenv("DB_USER"):
                db_user = f"postgres.{self.project_ref}"
            
            # Use explicit pooler host if provided, otherwise try regions
            if ".pooler.supabase.com" in self.db_host:
                db_host = self.db_host
            else:
                db_host = None  # Will try regions
        
        # Try direct connection first (if not pooler or if explicit host provided)
        if not self.use_pooler or db_host:
            try:
                conn = psycopg2.connect(
                    host=db_host or self.db_host,
                    port=db_port,
                    user=db_user,
                    password=db_password,
                    database=db_name,
                    connect_timeout=10,
                    sslmode='require'
                )
                if autocommit:
                    conn.autocommit = True
                logger.info(
                    "PostgreSQL connection established",
                    host=db_host or self.db_host,
                    port=db_port,
                    user=db_user,
                    autocommit=autocommit
                )
                return conn
            except psycopg2.OperationalError as e:
                error_str = str(e)
                if self.use_pooler and db_host:
                    # Explicit pooler host failed, try regions
                    logger.warning("Explicit pooler host failed, trying regions", error=error_str)
                elif not self.use_pooler and self.project_ref:
                    # Direct connection failed, try pooler as fallback
                    logger.warning("Direct connection failed, trying pooler as fallback", error=error_str)
                    return self._try_pooler_regions(db_user, db_password, db_name, autocommit)
                else:
                    raise ConfigurationError(
                        f"Database service is not available: Connection failed. Error: {error_str}\n\n"
                        f"Connection details:\n"
                        f"  Host: {db_host or self.db_host}\n"
                        f"  Port: {db_port}\n"
                        f"  User: {db_user}\n"
                        f"  Database: {db_name}\n\n"
                        "To fix:\n"
                        "1. Verify DB_PASSWORD matches your Supabase database password\n"
                        "2. Get/reset password from Supabase Dashboard → Settings → Database\n"
                        "3. Check network connectivity and firewall settings"
                    ) from e
            except Exception as e:
                raise ConfigurationError(
                    f"Database service is not available: Unexpected error during connection. Error: {str(e)}"
                ) from e
        
        # Try pooler regions
        if self.use_pooler:
            return self._try_pooler_regions(db_user, db_password, db_name, autocommit)
        
        # Should not reach here
        raise ConfigurationError("Database service is not available: Unable to establish connection.")
    
    def _try_pooler_regions(
        self,
        db_user: str,
        db_password: str,
        db_name: str,
        autocommit: bool
    ) -> psycopg2.extensions.connection:
        """Try connecting via pooler regions."""
        if not self.project_ref:
            raise ConfigurationError(
                "Database service is not available: Cannot use pooler without project reference."
            )
        
        pooler_regions = [
            "aws-0-us-east-1",  # US East
            "aws-0-us-west-1",  # US West
            "aws-0-eu-west-1",   # EU West
            "aws-0-ap-south-1", # Asia Pacific
        ]
        
        pooler_port = 6543 if self.use_pooler else 6543
        pooler_user = f"postgres.{self.project_ref}" if db_user == "postgres" else db_user
        
        errors = []
        for region in pooler_regions:
            pooler_host = f"{region}.pooler.supabase.com"
            try:
                logger.info("Trying pooler connection", host=pooler_host, port=pooler_port, user=pooler_user)
                conn = psycopg2.connect(
                    host=pooler_host,
                    port=pooler_port,
                    user=pooler_user,
                    password=db_password,
                    database=db_name,
                    connect_timeout=10,
                    sslmode='require'
                )
                if autocommit:
                    conn.autocommit = True
                logger.info(
                    "PostgreSQL connection established via pooler",
                    host=pooler_host,
                    port=pooler_port,
                    user=pooler_user,
                    autocommit=autocommit
                )
                return conn
            except Exception as e:
                errors.append(f"{pooler_host}: {str(e)}")
                logger.debug("Pooler connection failed for region", region=region, error=str(e))
                continue
        
        # All pooler attempts failed
        error_msg = (
            f"Database service is not available: All pooler connection attempts failed.\n\n"
            f"Tried regions: {', '.join(pooler_regions)}\n"
            f"Errors:\n" + "\n".join(f"  - {err}" for err in errors) + "\n\n"
            "To fix:\n"
            "1. Verify DB_PASSWORD matches your Supabase database password\n"
            "2. Check your Supabase project region\n"
            "3. Try using direct connection (port 5432) instead of pooler (port 6543)\n"
            "4. Check network connectivity and firewall settings"
        )
        raise ConfigurationError(error_msg)


class SupabaseConfig:
    """Supabase REST API configuration."""
    
    def __init__(self):
        """Initialize Supabase configuration."""
        self.url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not self.url or not self.service_key:
            raise ConfigurationError(
                "Supabase service is not available: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n\n"
                "To fix this:\n"
                "1. Get your Supabase URL and service role key from:\n"
                "   - Go to https://supabase.com/dashboard\n"
                "   - Select your project\n"
                "   - Go to Settings → API\n"
                "   - Copy 'Project URL' and 'service_role' key\n\n"
                "2. Add to your .env file:\n"
                "   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n"
                "   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here"
            )
    
    def get_client(self):
        """Get Supabase client (imported here to avoid circular imports)."""
        try:
            from supabase import create_client, Client
            return create_client(self.url, self.service_key)
        except Exception as e:
            raise ConfigurationError(
                f"Supabase service is not available: Failed to create client. Error: {str(e)}"
            ) from e


class AzureOpenAIConfig:
    """Azure OpenAI configuration."""
    
    def __init__(self):
        """Initialize Azure OpenAI configuration."""
        self.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "")
        self.api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
        self.model_name = os.getenv("AZURE_OPENAI_MODEL_NAME", "text-embedding-3-small")
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "text-embedding-3-small")
        self.dimensions = int(os.getenv("EMBEDDING_DIMENSIONS", "1536"))
        
        # Chat model configuration
        self.chat_deployment = (
            os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT") or 
            os.getenv("AZURE_OPENAI_CHAT_MODEL") or 
            "gpt-5.2-chat"
        )
        self.max_completion_tokens = int(os.getenv("AZURE_OPENAI_MAX_COMPLETION_TOKENS", "16384"))
        self.default_temperature = float(os.getenv("AZURE_OPENAI_DEFAULT_TEMPERATURE", "0.0"))
        
        # Validate configuration
        self._validate()
    
    def _validate(self):
        """Validate Azure OpenAI configuration."""
        if not self.endpoint:
            raise ConfigurationError(
                "Azure OpenAI service is not available: AZURE_OPENAI_ENDPOINT must be set.\n\n"
                "Format: https://<resource>.openai.azure.com or "
                "https://<resource>-<region>.cognitiveservices.azure.com\n\n"
                "To fix this:\n"
                "1. Get your endpoint from Azure Portal:\n"
                "   - Go to https://portal.azure.com\n"
                "   - Navigate to your Azure OpenAI resource\n"
                "   - Copy the 'Endpoint' URL\n\n"
                "2. Add to your .env file:\n"
                "   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com"
            )
        
        if not self.api_key:
            raise ConfigurationError(
                "Azure OpenAI service is not available: AZURE_OPENAI_API_KEY must be set.\n\n"
                "To fix this:\n"
                "1. Get your API key from Azure Portal:\n"
                "   - Go to https://portal.azure.com\n"
                "   - Navigate to your Azure OpenAI resource\n"
                "   - Go to 'Keys and Endpoint'\n"
                "   - Copy one of the keys\n\n"
                "2. Add to your .env file:\n"
                "   AZURE_OPENAI_API_KEY=your_api_key_here"
            )
        
        if not self.chat_deployment:
            raise ConfigurationError(
                "Azure OpenAI service is not available: Chat model deployment not configured.\n\n"
                "To fix this:\n"
                "1. Set AZURE_OPENAI_CHAT_DEPLOYMENT in your .env file:\n"
                "   AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4\n"
                "2. Or set AZURE_OPENAI_CHAT_MODEL:\n"
                "   AZURE_OPENAI_CHAT_MODEL=gpt-4"
            )
    
    def create_client(self):
        """Create and return Azure OpenAI client."""
        try:
            from openai import AzureOpenAI
            
            endpoint = self.endpoint.rstrip('/')
            
            if not endpoint.startswith('https://'):
                raise ConfigurationError(
                    f"Azure OpenAI service is not available: Invalid endpoint format: {endpoint}. Must start with https://"
                )
            
            client = AzureOpenAI(
                api_version=self.api_version,
                azure_endpoint=endpoint,
                api_key=self.api_key
            )
            
            logger.info("Azure OpenAI client created successfully", endpoint=endpoint)
            return client
        except Exception as e:
            raise ConfigurationError(
                f"Azure OpenAI service is not available: Failed to create client. Error: {str(e)}"
            ) from e


class AppConfig:
    """Application-level configuration."""
    
    def __init__(self):
        """Initialize application configuration."""
        self.environment = os.getenv("ENVIRONMENT", "development")
        self.log_format = os.getenv("LOG_FORMAT", "console").lower()
        self.cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
        self.host = os.getenv("HOST", "0.0.0.0")
        self.port = int(os.getenv("PORT", "8000"))
        self.workers = int(os.getenv("WORKERS", "1"))
        self.log_level = os.getenv("LOG_LEVEL", "info").lower()
        self.reload = os.getenv("RELOAD", "false").lower() == "true"
        
        # Agent configuration
        self.rag_similarity_threshold = float(os.getenv("RAG_SIMILARITY_THRESHOLD", "0.30"))
        self.normalize_temperature = float(os.getenv("NORMALIZE_TEMPERATURE", "0.0"))
        
        # Worker configuration
        self.chunk_worker_batch_size = int(os.getenv("CHUNK_WORKER_BATCH_SIZE", "10"))
        self.chunk_worker_poll_interval = int(os.getenv("CHUNK_WORKER_POLL_INTERVAL", "5"))
        self.chunk_size = int(os.getenv("CHUNK_SIZE", "1000"))
        self.chunk_overlap = int(os.getenv("CHUNK_OVERLAP", "200"))


# Global configuration instances (lazy initialization)
_db_config: Optional[DatabaseConfig] = None
_supabase_config: Optional[SupabaseConfig] = None
_azure_openai_config: Optional[AzureOpenAIConfig] = None
_app_config: Optional[AppConfig] = None


def get_database_config() -> DatabaseConfig:
    """Get or create database configuration."""
    global _db_config
    if _db_config is None:
        _db_config = DatabaseConfig()
    return _db_config


def get_supabase_config() -> SupabaseConfig:
    """Get or create Supabase configuration."""
    global _supabase_config
    if _supabase_config is None:
        _supabase_config = SupabaseConfig()
    return _supabase_config


def get_azure_openai_config() -> AzureOpenAIConfig:
    """Get or create Azure OpenAI configuration."""
    global _azure_openai_config
    if _azure_openai_config is None:
        _azure_openai_config = AzureOpenAIConfig()
    return _azure_openai_config


def get_app_config() -> AppConfig:
    """Get or create application configuration."""
    global _app_config
    if _app_config is None:
        _app_config = AppConfig()
    return _app_config

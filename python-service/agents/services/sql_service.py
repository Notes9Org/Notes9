"""SQL service with LLM-generated queries for safe execution."""
import os
import time
import re
from typing import Dict, Any, Optional, List, Tuple
import structlog
import psycopg2
from psycopg2.extras import RealDictCursor

from services.db import SupabaseService
from agents.services.llm_client import LLMClient, LLMError
from agents.services.db_schema import DB_SCHEMA

logger = structlog.get_logger()


class SQLService:
    """Service for generating and executing SQL queries using LLM."""
    
    def __init__(self, db_service: Optional[SupabaseService] = None, llm_client: Optional[LLMClient] = None):
        """
        Initialize SQL service.
        
        Args:
            db_service: Optional SupabaseService instance. If not provided, creates a new one.
            llm_client: Optional LLMClient instance. If not provided, creates a new one.
        """
        self.db = db_service if db_service else SupabaseService()
        self.llm_client = llm_client if llm_client else LLMClient()
        
        # PostgreSQL connection for raw SQL execution
        self._pg_conn = None
        
        logger.info("SQL service initialized")
    
    def _get_pg_connection(self):
        """Get or create PostgreSQL connection."""
        if self._pg_conn is None or self._pg_conn.closed:
            # Method 1: Try connection string first (DATABASE_URL)
            database_url = os.getenv("DATABASE_URL")
            if database_url:
                try:
                    self._pg_conn = psycopg2.connect(database_url, connect_timeout=10)
                    logger.info("PostgreSQL connection established via DATABASE_URL")
                    return self._pg_conn
                except Exception as e:
                    logger.warning("Failed to connect via DATABASE_URL, trying individual credentials", error=str(e))
            
            # Method 2: Use individual credentials
            # Extract connection details from Supabase URL
            # Format: https://<project-ref>.supabase.co
            supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
            
            # Parse host from URL (e.g., https://xxx.supabase.co -> db.xxx.supabase.co)
            project_ref = None
            if ".supabase.co" in supabase_url:
                project_ref = supabase_url.replace("https://", "").replace(".supabase.co", "")
            else:
                # Try to extract project_ref from DB_HOST if it's a Supabase host
                db_host_env = os.getenv("DB_HOST", "")
                if ".supabase.co" in db_host_env:
                    project_ref = db_host_env.replace("db.", "").replace(".pooler.supabase.com", "").replace(".supabase.co", "")
            
            db_port = int(os.getenv("DB_PORT", "5432"))
            db_user_env = os.getenv("DB_USER", "postgres")
            db_password = os.getenv("DB_PASSWORD")
            db_name = os.getenv("DB_NAME", "postgres")
            
            # Determine if we're using pooler or direct connection
            use_pooler = db_port == 6543
            
            if use_pooler:
                # Pooler connection: use pooler host, not db host
                if not project_ref:
                    raise ValueError(
                        "Cannot use pooler (port 6543) without project_ref. "
                        "Set NEXT_PUBLIC_SUPABASE_URL or DB_HOST with Supabase host."
                    )
                
                # Pooler user must be postgres.<project-ref>
                if db_user_env == "postgres" or not os.getenv("DB_USER"):
                    db_user = f"postgres.{project_ref}"
                    logger.info("Using pooler user format", user=db_user, project_ref=project_ref, port=db_port)
                else:
                    db_user = db_user_env
                    logger.info("Using explicit DB_USER for pooler", user=db_user, port=db_port)
                
                # For pooler, ignore DB_HOST if it's a direct DB host (db.*.supabase.co)
                # Only use DB_HOST if it's explicitly a pooler host
                db_host_env = os.getenv("DB_HOST", "")
                if ".pooler.supabase.com" in db_host_env:
                    # User explicitly set pooler host - use it
                    db_host = db_host_env
                    logger.info("Using explicit pooler host from DB_HOST", host=db_host)
                else:
                    # Ignore DB_HOST if it's a direct DB host - we'll try pooler regions
                    db_host = None
                    logger.info("Port 6543 detected - will use pooler hosts, ignoring direct DB host", db_host_env=db_host_env)
            else:
                # Direct connection: use db host
                if ".supabase.co" in supabase_url:
                    db_host = f"db.{project_ref}.supabase.co"
                else:
                    db_host = os.getenv("DB_HOST", "localhost")
                db_user = db_user_env
            
            if not db_password:
                error_msg = (
                    "DB_PASSWORD environment variable is required for SQL execution.\n"
                    "\n"
                    "To fix this:\n"
                    "1. Get your database password from Supabase Dashboard:\n"
                    "   - Go to https://supabase.com/dashboard\n"
                    "   - Select your project\n"
                    "   - Go to Settings → Database\n"
                    "   - Copy the 'Database Password' (or reset it if needed)\n"
                    "\n"
                    "2. Add to your .env file in python-service/:\n"
                    f"   DB_HOST={db_host}\n"
                    f"   DB_PORT={db_port}\n"
                    f"   DB_USER={db_user}\n"
                    f"   DB_PASSWORD=your_database_password_here\n"
                    f"   DB_NAME={db_name}\n"
                    "\n"
                    "Alternatively, you can use a connection string:\n"
                    "   DATABASE_URL=postgresql://postgres:password@host:port/database\n"
                )
                raise ValueError(error_msg)
            
            # Try connection based on port
            if use_pooler:
                # Pooler connection: use pooler host, not db host
                pooler_host_explicit = os.getenv("DB_HOST", "")
                if ".pooler.supabase.com" in pooler_host_explicit:
                    # User explicitly set pooler host
                    db_host = pooler_host_explicit
                    logger.info("Using explicit pooler host from DB_HOST", host=db_host)
                    try:
                        self._pg_conn = psycopg2.connect(
                            host=db_host,
                            port=db_port,
                            user=db_user,
                            password=db_password,
                            database=db_name,
                            connect_timeout=10,
                            sslmode='require'
                        )
                        logger.info("PostgreSQL connection established via pooler", host=db_host, port=db_port, user=db_user)
                        return self._pg_conn
                    except Exception as e:
                        error_str = str(e)
                        logger.warning("Explicit pooler host failed, trying other regions", error=error_str, host=db_host)
                
                # Try multiple pooler regions
                if not project_ref:
                    raise ValueError(
                        "Cannot use pooler (port 6543) without project_ref. "
                        "Set NEXT_PUBLIC_SUPABASE_URL or ensure DB_HOST contains project reference."
                    )
                
                pooler_regions = [
                    "aws-0-us-east-1",  # US East
                    "aws-0-us-west-1",  # US West
                    "aws-0-eu-west-1",   # EU West
                    "aws-0-ap-south-1", # Asia Pacific
                ]
                
                for region in pooler_regions:
                    pooler_host = f"{region}.pooler.supabase.com"
                    try:
                        logger.info("Trying pooler connection", host=pooler_host, port=db_port, user=db_user)
                        self._pg_conn = psycopg2.connect(
                            host=pooler_host,
                            port=db_port,
                            user=db_user,
                            password=db_password,
                            database=db_name,
                            connect_timeout=10,
                            sslmode='require'
                        )
                        logger.info("PostgreSQL connection established via pooler", host=pooler_host, port=db_port, user=db_user)
                        return self._pg_conn
                    except Exception as pooler_error:
                        logger.debug("Pooler connection failed for region", region=region, error=str(pooler_error))
                        continue
                
                # All pooler attempts failed
                error_str = f"All pooler connection attempts failed for project {project_ref}"
                logger.error("All pooler connection attempts failed", project_ref=project_ref)
            else:
                # Direct connection (port 5432)
                try:
                    # Supabase requires SSL connections
                    self._pg_conn = psycopg2.connect(
                        host=db_host,
                        port=db_port,
                        user=db_user,
                        password=db_password,
                        database=db_name,
                                connect_timeout=10,
                                sslmode='require'  # Supabase requires SSL
                            )
                    logger.info("PostgreSQL connection established", host=db_host, port=db_port, user=db_user, database=db_name)
                except psycopg2.OperationalError as e:
                    error_str = str(e)
                    logger.warning("Direct connection failed, trying connection pooler as fallback", error=error_str, host=db_host, port=db_port)
                    
                    # If direct connection failed and we have project_ref, try pooler as fallback
                    if project_ref:
                        # Common pooler regions to try
                        pooler_regions = [
                            "aws-0-us-east-1",  # US East
                            "aws-0-us-west-1",  # US West
                            "aws-0-eu-west-1",   # EU West
                            "aws-0-ap-south-1", # Asia Pacific
                        ]
                        
                        pooler_port = 6543
                        pooler_user = f"postgres.{project_ref}"  # Pooler requires this format
                        
                        for region in pooler_regions:
                            pooler_host = f"{region}.pooler.supabase.com"
                            try:
                                logger.info("Trying pooler connection", host=pooler_host, port=pooler_port, user=pooler_user)
                                self._pg_conn = psycopg2.connect(
                                    host=pooler_host,
                                    port=pooler_port,
                                    user=pooler_user,
                                    password=db_password,
                                    database=db_name,
                                    connect_timeout=10,
                                    sslmode='require'
                                )
                                logger.info("PostgreSQL connection established via pooler", host=pooler_host, port=pooler_port, user=pooler_user)
                                return self._pg_conn
                            except Exception as pooler_error:
                                logger.debug("Pooler connection failed for region", region=region, error=str(pooler_error))
                                continue
                        
                        logger.error("All pooler connection attempts failed", project_ref=project_ref)
                    
                    # If we get here, all connection attempts failed
                    if "password authentication failed" in error_str.lower() or "no such user" in error_str.lower():
                        helpful_msg = (
                            f"Database connection failed.\n"
                            f"\n"
                            f"Connection details:\n"
                            f"  Host: {db_host}\n"
                            f"  Port: {db_port}\n"
                            f"  User: {db_user}\n"
                            f"  Database: {db_name}\n"
                            f"\n"
                            f"To fix:\n"
                            f"1. Verify DB_PASSWORD in your .env file matches your Supabase database password\n"
                            f"2. Get/reset password from Supabase Dashboard → Settings → Database\n"
                            f"3. For pooler (port 6543), user must be 'postgres.<project-ref>'\n"
                            f"4. Check your Supabase project region and use the correct pooler host\n"
                            f"\n"
                            f"Current error: {error_str}"
                        )
                        logger.error("Database connection failed", error=helpful_msg)
                        raise ValueError(helpful_msg) from e
                    else:
                        raise
        
        return self._pg_conn
    
    def _validate_sql_safety(self, sql: str, scope: Dict[str, Optional[str]]) -> Tuple[bool, str]:
        """
        Validate SQL query is safe to execute.
        
        Returns:
            (is_safe, error_message)
        """
        sql_upper = sql.upper().strip()
        
        # Check for dangerous operations
        dangerous_keywords = [
            "DROP", "DELETE", "TRUNCATE", "ALTER", "CREATE", "INSERT", 
            "UPDATE", "GRANT", "REVOKE", "EXEC", "EXECUTE"
        ]
        
        for keyword in dangerous_keywords:
            if f" {keyword} " in sql_upper or sql_upper.startswith(keyword):
                return False, f"Dangerous operation detected: {keyword}. Only SELECT queries are allowed."
        
        # Must be a SELECT query
        if not sql_upper.startswith("SELECT"):
            return False, "Only SELECT queries are allowed."
        
        # Check for organization_id filter (required for security)
        organization_id = scope.get("organization_id")
        if not organization_id:
            return False, "organization_id is required in scope for security"
        
        # Verify query includes organization_id filter
        # This is a basic check - the LLM should be instructed to include it
        # Check for organization_id in WHERE clause or JOIN condition
        has_org_filter = "ORGANIZATION_ID" in sql_upper
        if not has_org_filter:
            logger.warning("SQL query may not include organization_id filter", sql=sql[:200])
        
        return True, ""
    
    def generate_sql(
        self,
        query: str,
        normalized_query: Optional[str] = None,
        entities: Optional[Dict[str, Any]] = None,
        scope: Optional[Dict[str, Optional[str]]] = None
    ) -> str:
        """
        Generate SQL query using LLM based on user query and database schema.
        
        Args:
            query: Original user query
            normalized_query: Normalized query text
            entities: Extracted entities from normalization
            scope: Access scope (organization_id, project_id, experiment_id, user_id)
            
        Returns:
            Generated SQL query string
        """
        organization_id = scope.get("organization_id") if scope else None
        project_id = scope.get("project_id") if scope else None
        experiment_id = scope.get("experiment_id") if scope else None
        
        if not organization_id:
            raise ValueError("organization_id is required in scope")
        
        # Validate organization_id is a valid UUID format
        import re
        uuid_pattern = re.compile(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            re.IGNORECASE
        )
        if not uuid_pattern.match(str(organization_id)):
            raise ValueError(
                f"organization_id must be a valid UUID format, got: {organization_id}. "
                f"Example: 'cedbb951-4b9f-440a-96ad-0373fe059a1b'"
            )
        
        # Extract experiment_ids from entities if present
        experiment_ids_from_entities = []
        if entities and isinstance(entities, dict):
            # Check for experiment_ids (plural) or experiment_id (singular)
            if "experiment_ids" in entities and isinstance(entities["experiment_ids"], list):
                experiment_ids_from_entities = entities["experiment_ids"]
            elif "experiment_id" in entities:
                exp_id = entities["experiment_id"]
                if isinstance(exp_id, list):
                    experiment_ids_from_entities = exp_id
                elif exp_id:
                    experiment_ids_from_entities = [exp_id]
        
        # Use experiment_id from entities if not in scope
        if not experiment_id and experiment_ids_from_entities:
            experiment_id = experiment_ids_from_entities[0]  # Use first one
        
        # Build prompt for LLM
        entities_text = ""
        if entities:
            entities_text = "\n".join([f"- {k}: {v}" for k, v in entities.items()])
        
        # Add explicit note about experiment IDs if found
        experiment_id_note = ""
        if experiment_ids_from_entities:
            experiment_id_note = f"\n\nIMPORTANT: The query mentions specific experiment ID(s): {experiment_ids_from_entities}\nYou MUST filter by these experiment IDs in your WHERE clause.\nWhen filtering by specific experiment_id, use: (p.organization_id = '{organization_id}'::uuid OR p.organization_id IS NULL) to allow experiments in projects without organization_id."
        
        # Check if querying by specific project_id
        project_id_note = ""
        if project_id or (entities and isinstance(entities, dict) and ("project_id" in entities or "project_ids" in entities)):
            project_id_note = f"\n\nIMPORTANT: The query mentions specific project ID(s).\nWhen filtering by specific project_id, use: (organization_id = '{organization_id}'::uuid OR organization_id IS NULL) to allow projects without organization_id."
        
        # Check if querying by experiment names
        experiment_names_note = ""
        if entities and isinstance(entities, dict):
            experiment_names = entities.get("experiment_names", [])
            if experiment_names and isinstance(experiment_names, list) and len(experiment_names) > 0:
                names_list = ", ".join([f"'{name}'" for name in experiment_names[:3]])
                experiment_names_note = f"\n\nIMPORTANT: The query mentions experiment name(s): {names_list}\nYou MUST filter by experiment name using flexible matching that handles spaces, underscores, and case variations.\n\nFor each experiment name, create a pattern that matches both spaces and underscores:\n- Use: REPLACE(LOWER(e.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<experiment_name>'), '_', ' ') || '%'\n- OR use multiple ILIKE conditions: (e.name ILIKE '%<experiment_name>%' OR e.name ILIKE '%<experiment_name_with_underscores>%')\n\nExample (handles 'Vaccine production' matching 'Vaccine_Production'):\n  SELECT e.* FROM experiments e\n  JOIN projects p ON e.project_id = p.id\n  WHERE (p.organization_id = '{organization_id}'::uuid OR p.organization_id IS NULL)\n    AND (REPLACE(LOWER(e.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<experiment_name>'), '_', ' ') || '%'\n         OR e.name ILIKE '%<experiment_name>%')"
        
        # Check if querying by project names
        project_names_note = ""
        if entities and isinstance(entities, dict):
            project_names = entities.get("project_names", [])
            if project_names and isinstance(project_names, list) and len(project_names) > 0:
                names_list = ", ".join([f"'{name}'" for name in project_names[:3]])
                project_names_note = f"\n\nIMPORTANT: The query mentions project name(s): {names_list}\nYou MUST filter by project name using flexible matching that handles spaces, underscores, and case variations.\n\nFor each project name, create a pattern that matches both spaces and underscores:\n- Use: REPLACE(LOWER(p.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'\n- OR use multiple ILIKE conditions: (p.name ILIKE '%<project_name>%' OR p.name ILIKE '%<project_name_with_underscores>%')\n\nExample for querying projects table directly (handles 'Vaccine production' matching 'Vaccine_Production'):\n  SELECT * FROM projects\n  WHERE (REPLACE(LOWER(name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'\n         OR name ILIKE '%<project_name>%')\n    AND (organization_id = '{organization_id}'::uuid OR organization_id IS NULL)\n\nExample for querying through experiments:\n  SELECT e.* FROM experiments e\n  JOIN projects p ON e.project_id = p.id\n  WHERE (p.organization_id = '{organization_id}'::uuid OR p.organization_id IS NULL)\n    AND (REPLACE(LOWER(p.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'\n         OR p.name ILIKE '%<project_name>%')"
        
        # Check if querying by person names
        person_names_note = ""
        if entities and isinstance(entities, dict):
            person_names = entities.get("person_names", [])
            if person_names and isinstance(person_names, list) and len(person_names) > 0:
                # Format person names for the prompt
                names_list = ", ".join([f"'{name}'" for name in person_names[:3]])  # Limit to first 3
                person_names_note = f"\n\nIMPORTANT: The query mentions person name(s): {names_list}\nYou MUST join with the profiles table to find experiments/projects by person name.\n\nFor queries about experiments:\n- Join: JOIN profiles pr ON (e.created_by = pr.id OR e.assigned_to = pr.id)\n- Filter by name using ILIKE for case-insensitive matching:\n  * If name has space (e.g., 'John Doe'): Split and match both first_name and last_name, OR match full name\n  * If single word: Match against first_name OR last_name\n  * Use: (pr.first_name ILIKE '%<first_part>%' AND pr.last_name ILIKE '%<second_part>%') OR (CONCAT(pr.first_name, ' ', pr.last_name) ILIKE '%<full_name>%')\n\nExample for 'John Doe':\n  SELECT e.* FROM experiments e\n  JOIN projects p ON e.project_id = p.id\n  JOIN profiles pr ON e.created_by = pr.id\n  WHERE (p.organization_id = '{organization_id}'::uuid OR p.organization_id IS NULL)\n    AND ((pr.first_name ILIKE '%John%' AND pr.last_name ILIKE '%Doe%')\n         OR CONCAT(pr.first_name, ' ', pr.last_name) ILIKE '%John Doe%')"
        
        prompt = f"""Generate a PostgreSQL SELECT query to answer the following question about a lab management system.

User Query: {query}
{f"Normalized Query: {normalized_query}" if normalized_query else ""}

Extracted Entities:
{entities_text if entities_text else "None"}

Access Scope:
- organization_id: {organization_id} (REQUIRED - must filter by this)
{f"- project_id: {project_id}" if project_id else ""}
{f"- experiment_id: {experiment_id}" if experiment_id else ""}
{experiment_id_note}
{experiment_names_note}
{project_id_note}
{project_names_note}
{person_names_note}

Database Schema:
{DB_SCHEMA}

CRITICAL REQUIREMENTS:
1. Query MUST be a SELECT statement only (read-only)
2. For security, filter by organization_id when available:
   - If querying by specific project_id or experiment_id (from entities/scope), you have two options:
     a) Use: (p.organization_id = '{organization_id}'::uuid OR p.organization_id IS NULL) - allows NULL org
     b) OR skip organization_id filter entirely when querying by specific ID - user explicitly requested this resource
   - For general queries (no specific IDs), use: p.organization_id = '{organization_id}'::uuid
   - When querying projects table directly by id, you can skip organization_id filter if the query is for a specific project_id
3. If querying experiments, samples, or lab_notes, join through projects to get organization_id
4. Use proper JOINs to access related tables
5. Return only the columns needed to answer the query
6. Use appropriate WHERE clauses based on entities and scope
7. Use proper PostgreSQL syntax - organization_id is UUID type, cast string literals with ::uuid
8. Do NOT include any DROP, DELETE, UPDATE, INSERT, ALTER, or other write operations
9. Do NOT include comments in the SQL

Example JOIN patterns:
- To get a specific experiment by ID (allows NULL organization_id):
  SELECT e.* FROM experiments e 
  JOIN projects p ON e.project_id = p.id 
  WHERE e.id = '<experiment_id>'::uuid
    AND (p.organization_id = '{organization_id}'::uuid OR p.organization_id IS NULL)
  
- To get experiments for an organization (general query):
  SELECT e.* FROM experiments e 
  JOIN projects p ON e.project_id = p.id 
  WHERE p.organization_id = '{organization_id}'::uuid
  
- To get a specific project by ID (when project_id is explicitly provided, you can skip organization_id filter):
  SELECT * FROM projects
  WHERE id = '<project_id>'::uuid
  
  OR if you want to be more restrictive:
  SELECT * FROM projects
  WHERE id = '<project_id>'::uuid
    AND (organization_id = '{organization_id}'::uuid OR organization_id IS NULL)
  
- To get samples for an organization:
  SELECT s.* FROM samples s
  JOIN experiments e ON s.experiment_id = e.id
  JOIN projects p ON e.project_id = p.id
  WHERE p.organization_id = '{organization_id}'::uuid

- To get experiments created by a person (by name):
  SELECT e.* FROM experiments e
  JOIN projects p ON e.project_id = p.id
  JOIN profiles pr ON e.created_by = pr.id
  WHERE (p.organization_id = '{organization_id}'::uuid OR p.organization_id IS NULL)
    AND (pr.first_name ILIKE '%<first_name>%' OR pr.last_name ILIKE '%<last_name>%' 
         OR CONCAT(pr.first_name, ' ', pr.last_name) ILIKE '%<full_name>%')

- To get experiments assigned to a person (by name):
  SELECT e.* FROM experiments e
  JOIN projects p ON e.project_id = p.id
  JOIN profiles pr ON e.assigned_to = pr.id
  WHERE (p.organization_id = '{organization_id}'::uuid OR p.organization_id IS NULL)
    AND (pr.first_name ILIKE '%<first_name>%' OR pr.last_name ILIKE '%<last_name>%'
         OR CONCAT(pr.first_name, ' ', pr.last_name) ILIKE '%<full_name>%')

- To get experiment by name (handles spaces, underscores, case variations):
  SELECT e.* FROM experiments e
  JOIN projects p ON e.project_id = p.id
  WHERE (p.organization_id = '{organization_id}'::uuid OR p.organization_id IS NULL)
    AND (REPLACE(LOWER(e.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<experiment_name>'), '_', ' ') || '%'
         OR e.name ILIKE '%<experiment_name>%')

- To get project by name (handles spaces, underscores, case variations):
  SELECT * FROM projects
  WHERE (REPLACE(LOWER(name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'
         OR name ILIKE '%<project_name>%')
    AND (organization_id = '{organization_id}'::uuid OR organization_id IS NULL)

- To get project status by name (handles spaces, underscores, case variations):
  SELECT status FROM projects
  WHERE (REPLACE(LOWER(name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'
         OR name ILIKE '%<project_name>%')
    AND (organization_id = '{organization_id}'::uuid OR organization_id IS NULL)

Return ONLY the SQL query, no explanations, no markdown, just the SQL statement."""

        try:
            # Use text completion for SQL (not JSON)
            sql = self.llm_client.complete_text(
                prompt=prompt,
                temperature=0.0  # Deterministic for SQL
            )
            
            # Clean up SQL (remove markdown code blocks if present)
            sql = sql.strip()
            if sql.startswith("```"):
                # Remove markdown code blocks
                sql = re.sub(r'^```(?:sql)?\s*', '', sql, flags=re.IGNORECASE)
                sql = re.sub(r'\s*```$', '', sql)
            sql = sql.strip()
            
            # Remove trailing semicolon if present (we'll add it if needed)
            if sql.endswith(';'):
                sql = sql[:-1]
            
            logger.info("SQL generated", query_length=len(sql), sql_preview=sql[:100], sql_full=sql)
            
            return sql
            
        except LLMError as e:
            logger.error("SQL generation failed", error=str(e))
            raise ValueError(f"Failed to generate SQL: {str(e)}")
    
    def execute_sql(
        self,
        sql: str,
        scope: Dict[str, Optional[str]]
    ) -> Dict[str, Any]:
        """
        Execute SQL query safely.
        
        Args:
            sql: SQL query to execute
            scope: Access scope for validation
            
        Returns:
            Dict with data, row_count, execution_time_ms, or error
        """
        start_time = time.time()
        
        try:
            # Validate SQL safety
            is_safe, error_msg = self._validate_sql_safety(sql, scope)
            if not is_safe:
                raise ValueError(f"SQL safety validation failed: {error_msg}")
            
            # Get PostgreSQL connection
            conn = self._get_pg_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Execute query
            cursor.execute(sql)
            
            # Fetch results
            rows = cursor.fetchall()
            
            # Convert to list of dicts
            data = [dict(row) for row in rows]
            row_count = len(data)
            
            cursor.close()
            
            execution_time_ms = (time.time() - start_time) * 1000
            
            logger.info(
                "SQL executed successfully",
                row_count=row_count,
                execution_time_ms=round(execution_time_ms, 2),
                sql_full=sql
            )
            
            return {
                "data": data,
                "row_count": row_count,
                "execution_time_ms": round(execution_time_ms, 2)
            }
            
        except psycopg2.Error as e:
            execution_time_ms = (time.time() - start_time) * 1000
            logger.error(
                "SQL execution failed (PostgreSQL error)",
                error=str(e),
                execution_time_ms=round(execution_time_ms, 2)
            )
            return {
                "data": [],
                "row_count": 0,
                "error": f"PostgreSQL error: {str(e)}",
                "execution_time_ms": round(execution_time_ms, 2)
            }
        except Exception as e:
            execution_time_ms = (time.time() - start_time) * 1000
            logger.error(
                "SQL execution failed",
                error=str(e),
                execution_time_ms=round(execution_time_ms, 2)
            )
            return {
                "data": [],
                "row_count": 0,
                "error": str(e),
                "execution_time_ms": round(execution_time_ms, 2)
            }
    
    def generate_and_execute(
        self,
        query: str,
        normalized_query: Optional[str] = None,
        entities: Optional[Dict[str, Any]] = None,
        scope: Optional[Dict[str, Optional[str]]] = None
    ) -> Dict[str, Any]:
        """
        Generate SQL and execute it in one call.
        
        Args:
            query: Original user query
            normalized_query: Normalized query text
            entities: Extracted entities
            scope: Access scope
            
        Returns:
            Dict with data, row_count, execution_time_ms, or error
        """
        try:
            # Generate SQL
            sql = self.generate_sql(
                query=query,
                normalized_query=normalized_query,
                entities=entities,
                scope=scope
            )
            
            # Execute SQL
            result = self.execute_sql(sql, scope)
            
            # Add generated SQL to result for debugging
            result["generated_sql"] = sql
            
            return result
            
        except Exception as e:
            logger.error("Generate and execute failed", error=str(e))
            return {
                "data": [],
                "row_count": 0,
                "error": str(e),
                "execution_time_ms": 0
            }
    
    def __del__(self):
        """Close PostgreSQL connection on cleanup."""
        try:
            if hasattr(self, '_pg_conn') and self._pg_conn and not self._pg_conn.closed:
                self._pg_conn.close()
        except Exception:
            # Ignore errors during cleanup (Python may be shutting down)
            pass
    
    def execute_template(
        self,
        template_name: str,
        params: Dict[str, Any],
        scope: Dict[str, Optional[str]]
    ) -> Dict[str, Any]:
        """
        Execute SQL query using predefined template.
        
        Args:
            template_name: Name of SQL template
            params: Template parameters
            scope: Access scope (organization_id, project_id, experiment_id, user_id)
            
        Returns:
            Dict with data, row_count, execution_time_ms, or error
        """
        start_time = time.time()
        
        try:
            # Enforce scope filters (required for security)
            organization_id = scope.get("organization_id")
            project_id = scope.get("project_id")
            user_id = scope.get("user_id")
            
            if not organization_id:
                raise ValueError("organization_id is required in scope")
            
            # Route to appropriate template
            if template_name == "count_experiments":
                result = self._count_experiments(organization_id, project_id, params)
            elif template_name == "count_samples":
                result = self._count_samples(organization_id, project_id, params)
            elif template_name == "experiment_status_summary":
                result = self._experiment_status_summary(organization_id, project_id, params)
            elif template_name == "sample_type_distribution":
                result = self._sample_type_distribution(organization_id, project_id, params)
            elif template_name == "date_range_aggregates":
                result = self._date_range_aggregates(organization_id, project_id, params)
            else:
                raise ValueError(f"Unknown template: {template_name}")
            
            execution_time_ms = (time.time() - start_time) * 1000
            result["execution_time_ms"] = round(execution_time_ms, 2)
            
            logger.info(
                "SQL template executed",
                template=template_name,
                row_count=result.get("row_count", 0),
                execution_time_ms=execution_time_ms
            )
            
            return result
            
        except Exception as e:
            execution_time_ms = (time.time() - start_time) * 1000
            logger.error(
                "SQL template execution failed",
                template=template_name,
                error=str(e),
                execution_time_ms=execution_time_ms
            )
            return {
                "data": [],
                "row_count": 0,
                "error": str(e),
                "execution_time_ms": round(execution_time_ms, 2)
            }
    
    def _count_experiments(
        self,
        organization_id: str,
        project_id: Optional[str],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Count experiments with optional filters."""
        query = self.db.client.table("experiments")\
            .select("id", count="exact")\
            .eq("project.organization_id", organization_id)
        
        if project_id:
            query = query.eq("project_id", project_id)
        
        # Apply status filter if provided
        if params.get("status"):
            query = query.eq("status", params["status"])
        
        # Apply date range if provided
        if params.get("start_date"):
            query = query.gte("created_at", params["start_date"])
        if params.get("end_date"):
            query = query.lte("created_at", params["end_date"])
        
        response = query.execute()
        
        return {
            "data": [{"count": response.count}],
            "row_count": 1
        }
    
    def _count_samples(
        self,
        organization_id: str,
        project_id: Optional[str],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Count samples with optional filters."""
        # Need to join through experiments to get organization_id
        query = self.db.client.table("samples")\
            .select("id", count="exact")\
            .eq("experiment.project.organization_id", organization_id)
        
        if project_id:
            query = query.eq("experiment.project_id", project_id)
        
        # Apply filters
        if params.get("status"):
            query = query.eq("status", params["status"])
        if params.get("sample_type"):
            query = query.eq("sample_type", params["sample_type"])
        
        response = query.execute()
        
        return {
            "data": [{"count": response.count}],
            "row_count": 1
        }
    
    def _experiment_status_summary(
        self,
        organization_id: str,
        project_id: Optional[str],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Group experiments by status."""
        # Fetch all experiments and group in Python (Supabase doesn't support GROUP BY easily)
        query = self.db.client.table("experiments")\
            .select("id,status")\
            .eq("project.organization_id", organization_id)
        
        if project_id:
            query = query.eq("project_id", project_id)
        
        response = query.execute()
        experiments = response.data if response.data else []
        
        # Group by status
        status_counts = {}
        for exp in experiments:
            status = exp.get("status", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
        
        # Format as list
        data = [{"status": k, "count": v} for k, v in status_counts.items()]
        
        return {
            "data": data,
            "row_count": len(data)
        }
    
    def _sample_type_distribution(
        self,
        organization_id: str,
        project_id: Optional[str],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Group samples by type."""
        query = self.db.client.table("samples")\
            .select("id,sample_type")\
            .eq("experiment.project.organization_id", organization_id)
        
        if project_id:
            query = query.eq("experiment.project_id", project_id)
        
        response = query.execute()
        samples = response.data if response.data else []
        
        # Group by type
        type_counts = {}
        for sample in samples:
            sample_type = sample.get("sample_type", "unknown")
            type_counts[sample_type] = type_counts.get(sample_type, 0) + 1
        
        data = [{"sample_type": k, "count": v} for k, v in type_counts.items()]
        
        return {
            "data": data,
            "row_count": len(data)
        }
    
    def _date_range_aggregates(
        self,
        organization_id: str,
        project_id: Optional[str],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Count entities by date ranges."""
        entity_type = params.get("entity_type", "experiments")
        start_date = params.get("start_date")
        end_date = params.get("end_date")
        
        if not start_date or not end_date:
            return {"data": [], "row_count": 0}
        
        if entity_type == "experiments":
            query = self.db.client.table("experiments")\
                .select("id", count="exact")\
                .eq("project.organization_id", organization_id)\
                .gte("created_at", start_date)\
                .lte("created_at", end_date)
            
            if project_id:
                query = query.eq("project_id", project_id)
            
            response = query.execute()
            
            return {
                "data": [{"count": response.count, "date_range": f"{start_date} to {end_date}"}],
                "row_count": 1
            }
        
        return {"data": [], "row_count": 0}
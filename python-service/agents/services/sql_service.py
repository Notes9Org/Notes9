"""SQL service with LLM-generated queries for safe execution."""
import time
import re
from typing import Dict, Any, Optional, List, Tuple
import structlog
import psycopg2
from psycopg2.extras import RealDictCursor

from services.db import SupabaseService
from services.config import get_database_config, ConfigurationError
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
        self._db_config = get_database_config()
        
        logger.info("SQL service initialized")
    
    def _get_pg_connection(self, force_new: bool = False):
        """
        Get or create PostgreSQL connection with autocommit enabled for read-only queries.
        
        Args:
            force_new: If True, always create a new connection (useful after errors)
        """
        # If forcing new connection, close existing one
        if force_new:
            try:
                if self._pg_conn and not self._pg_conn.closed:
                    self._pg_conn.close()
            except Exception:
                pass
            self._pg_conn = None
        
        # Check if connection exists and is valid
        if self._pg_conn is not None and not self._pg_conn.closed:
            # Test connection with a simple query to ensure it's in good state
            try:
                # First ensure autocommit is enabled
                if not self._pg_conn.autocommit:
                    self._pg_conn.autocommit = True
                
                # Test with a simple query - if this fails, connection is in bad state
                test_cursor = self._pg_conn.cursor()
                test_cursor.execute("SELECT 1")
                test_cursor.fetchone()
                test_cursor.close()
                return self._pg_conn
            except (psycopg2.OperationalError, psycopg2.InterfaceError, psycopg2.InternalError) as e:
                # Connection is broken or in bad state, create new one
                logger.warning("Connection test failed, creating new connection", error=str(e))
                try:
                    self._pg_conn.close()
                except Exception:
                    pass
                self._pg_conn = None
            except Exception as e:
                # Any other error - connection might be in bad state
                logger.warning("Connection test failed with unexpected error, creating new connection", error=str(e))
                try:
                    self._pg_conn.close()
                except Exception:
                    pass
                self._pg_conn = None
        
        # Create new connection using config
        if self._pg_conn is None or (hasattr(self._pg_conn, 'closed') and self._pg_conn.closed):
            try:
                self._pg_conn = self._db_config.get_connection(autocommit=True)
                return self._pg_conn
            except ConfigurationError as e:
                # Re-raise configuration errors as-is (they already have helpful messages)
                raise
            except Exception as e:
                # Wrap other errors
                raise ConfigurationError(
                    f"Database service is not available: Failed to establish connection. Error: {str(e)}"
                ) from e
        
        return self._pg_conn
    
    def _validate_sql_safety(self, sql: str, scope: Dict[str, Optional[str]]) -> Tuple[bool, str]:
        """
        Validate SQL query is safe to execute.
        
        Validates that query is read-only (SELECT only).
        Note: User_id filtering is enforced in generate_sql, not validated here.
        
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
        
        # NO ORGANIZATION_ID VALIDATION - Users have complete access to all data
        
        return True, ""
    
    def generate_sql(
        self,
        query: str,
        user_id: Optional[str] = None,
        normalized_query: Optional[str] = None,
        entities: Optional[Dict[str, Any]] = None,
        scope: Optional[Dict[str, Optional[str]]] = None
    ) -> str:
        """
        Generate SQL query using LLM based on user query and database schema.
        
        Args:
            query: Original user query
            user_id: User ID for filtering (REQUIRED for security - filters by created_by)
            normalized_query: Normalized query text
            entities: Extracted entities from normalization (used for query generation)
            scope: Access scope (deprecated - ignored, not used for filtering)
            
        Returns:
            Generated SQL query string
        """
        # SECURITY: Always filter by user_id (created_by) to ensure users only see their own data
        if not user_id:
            raise ValueError("user_id is required for SQL generation - security requirement")
        
        # Build prompt for LLM
        entities_text = ""
        if entities:
            entities_text = "\n".join([f"- {k}: {v}" for k, v in entities.items()])
        
        # Extract entities for query generation (not for filtering)
        experiment_ids_from_entities = []
        if entities and isinstance(entities, dict):
            if "experiment_ids" in entities and isinstance(entities["experiment_ids"], list):
                experiment_ids_from_entities = entities["experiment_ids"]
            elif "experiment_id" in entities:
                exp_id = entities["experiment_id"]
                if isinstance(exp_id, list):
                    experiment_ids_from_entities = exp_id
                elif exp_id:
                    experiment_ids_from_entities = [exp_id]
        
        # Add notes about entities if found (for query generation, not filtering)
        experiment_id_note = ""
        if experiment_ids_from_entities:
            ids_list = ", ".join([f"'{eid}'" for eid in experiment_ids_from_entities[:3]])
            uuid_list = ", ".join([f"'{eid}'::uuid" for eid in experiment_ids_from_entities])
            experiment_id_note = f"\n\nIMPORTANT: The query mentions specific experiment ID(s): {ids_list}\nYou MUST filter by these experiment IDs in your WHERE clause using: e.id IN ({uuid_list})"
        
        # Check if querying by specific project_id from entities
        project_id_note = ""
        project_ids_from_entities = []
        if entities and isinstance(entities, dict):
            if "project_ids" in entities and isinstance(entities["project_ids"], list):
                project_ids_from_entities = entities["project_ids"]
            elif "project_id" in entities:
                proj_id = entities["project_id"]
                if isinstance(proj_id, list):
                    project_ids_from_entities = proj_id
                elif proj_id:
                    project_ids_from_entities = [proj_id]
        
        if project_ids_from_entities:
            ids_list = ", ".join([f"'{pid}'" for pid in project_ids_from_entities[:3]])
            uuid_list = ", ".join([f"'{pid}'::uuid" for pid in project_ids_from_entities])
            project_id_note = f"\n\nIMPORTANT: The query mentions specific project ID(s): {ids_list}\nYou MUST filter by these project IDs in your WHERE clause using: p.id IN ({uuid_list})"
        
        # Check if querying by experiment names
        experiment_names_note = ""
        if entities and isinstance(entities, dict):
            experiment_names = entities.get("experiment_names", [])
            if experiment_names and isinstance(experiment_names, list) and len(experiment_names) > 0:
                names_list = ", ".join([f"'{name}'" for name in experiment_names[:3]])
                experiment_names_note = f"\n\nIMPORTANT: The query mentions experiment name(s): {names_list}\nYou MUST filter by experiment name using flexible matching that handles spaces, underscores, and case variations.\n\nFor each experiment name, create a pattern that matches both spaces and underscores:\n- Use: REPLACE(LOWER(e.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<experiment_name>'), '_', ' ') || '%'\n- OR use multiple ILIKE conditions: (e.name ILIKE '%<experiment_name>%' OR e.name ILIKE '%<experiment_name_with_underscores>%')\n\nExample (handles 'Vaccine production' matching 'Vaccine_Production'):\n  SELECT e.* FROM experiments e\n  JOIN projects p ON e.project_id = p.id\n  WHERE (REPLACE(LOWER(e.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<experiment_name>'), '_', ' ') || '%'\n         OR e.name ILIKE '%<experiment_name>%')"
        
        # Check if querying by project names
        project_names_note = ""
        if entities and isinstance(entities, dict):
            project_names = entities.get("project_names", [])
            if project_names and isinstance(project_names, list) and len(project_names) > 0:
                names_list = ", ".join([f"'{name}'" for name in project_names[:3]])
                project_names_note = f"\n\nIMPORTANT: The query mentions project name(s): {names_list}\nYou MUST filter by project name using flexible matching that handles spaces, underscores, and case variations.\n\nFor each project name, create a pattern that matches both spaces and underscores:\n- Use: REPLACE(LOWER(p.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'\n- OR use multiple ILIKE conditions: (p.name ILIKE '%<project_name>%' OR p.name ILIKE '%<project_name_with_underscores>%')\n\nExample for querying projects table directly:\n  SELECT * FROM projects\n  WHERE (REPLACE(LOWER(name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'\n         OR name ILIKE '%<project_name>%')\n\nExample for querying through experiments:\n  SELECT e.* FROM experiments e\n  JOIN projects p ON e.project_id = p.id\n  WHERE (REPLACE(LOWER(p.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'\n         OR p.name ILIKE '%<project_name>%')"
        
        # Check if querying by person names
        person_names_note = ""
        if entities and isinstance(entities, dict):
            person_names = entities.get("person_names", [])
            if person_names and isinstance(person_names, list) and len(person_names) > 0:
                names_list = ", ".join([f"'{name}'" for name in person_names[:3]])
                person_names_note = f"\n\nIMPORTANT: The query mentions person name(s): {names_list}\nYou MUST join with the profiles table to find experiments/projects by person name.\n\nFor queries about experiments:\n- Join: JOIN profiles pr ON (e.created_by = pr.id OR e.assigned_to = pr.id)\n- Filter by name using ILIKE for case-insensitive matching:\n  * If name has space (e.g., 'John Doe'): Split and match both first_name and last_name, OR match full name\n  * If single word: Match against first_name OR last_name\n  * Use: (pr.first_name ILIKE '%<first_part>%' AND pr.last_name ILIKE '%<second_part>%') OR (CONCAT(pr.first_name, ' ', pr.last_name) ILIKE '%<full_name>%')\n\nExample for 'John Doe':\n  SELECT e.* FROM experiments e\n  JOIN projects p ON e.project_id = p.id\n  JOIN profiles pr ON e.created_by = pr.id\n  WHERE ((pr.first_name ILIKE '%John%' AND pr.last_name ILIKE '%Doe%')\n         OR CONCAT(pr.first_name, ' ', pr.last_name) ILIKE '%John Doe%')"
        
        prompt = f"""Generate a PostgreSQL SELECT query to answer the following question about a lab management system.

User Query: {query}
{f"Normalized Query: {normalized_query}" if normalized_query else ""}
User ID (for security filtering): {user_id}

Extracted Entities:
{entities_text if entities_text else "None"}

{experiment_id_note}
{experiment_names_note}
{project_id_note}
{project_names_note}
{person_names_note}

Database Schema:
{DB_SCHEMA}

CRITICAL REQUIREMENTS:
1. Query MUST be a SELECT statement only (read-only)
2. SECURITY: ALWAYS filter by user_id (created_by) - Users can ONLY see their own data
   - For experiments: WHERE e.created_by = '{user_id}'::uuid
   - For projects: WHERE p.created_by = '{user_id}'::uuid
   - For samples: WHERE s.created_by = '{user_id}'::uuid
   - For lab_notes: WHERE ln.created_by = '{user_id}'::uuid
   - For protocols: WHERE pr.created_by = '{user_id}'::uuid
   - For reports: WHERE r.generated_by = '{user_id}'::uuid
   - For literature_reviews: WHERE lr.created_by = '{user_id}'::uuid
   - For semantic_chunks: WHERE sc.created_by = '{user_id}'::uuid
   - If querying multiple tables, ensure ALL are filtered by the user's created_by
3. Generate queries based on the query intent and extracted entities
4. If querying experiments, samples, or lab_notes, join through projects as needed
5. Use proper JOINs to access related tables
6. Return only the columns needed to answer the query
7. Use appropriate WHERE clauses based on entities mentioned in the query
8. Use proper PostgreSQL syntax - UUIDs should be cast with ::uuid
9. Do NOT include any DROP, DELETE, UPDATE, INSERT, ALTER, or other write operations
10. Do NOT include comments in the SQL
11. Do NOT filter by organization_id, project_id, or experiment_id unless explicitly mentioned in the query

Example JOIN patterns:
- To get a specific experiment by ID (MUST filter by user):
  SELECT e.* FROM experiments e 
  JOIN projects p ON e.project_id = p.id 
  WHERE e.id = '<experiment_id>'::uuid
    AND e.created_by = '{user_id}'::uuid
  
- To get all experiments for the user (MUST filter by user):
  SELECT e.* FROM experiments e 
  JOIN projects p ON e.project_id = p.id
  WHERE e.created_by = '{user_id}'::uuid
  
- To get a specific project by ID (MUST filter by user):
  SELECT * FROM projects
  WHERE id = '<project_id>'::uuid
    AND created_by = '{user_id}'::uuid
  
- To get all samples for the user (MUST filter by user):
  SELECT s.* FROM samples s
  JOIN experiments e ON s.experiment_id = e.id
  JOIN projects p ON e.project_id = p.id
  WHERE s.created_by = '{user_id}'::uuid

- To get experiments created by a person (by name):
  SELECT e.* FROM experiments e
  JOIN projects p ON e.project_id = p.id
  JOIN profiles pr ON e.created_by = pr.id
  WHERE (pr.first_name ILIKE '%<first_name>%' OR pr.last_name ILIKE '%<last_name>%' 
         OR CONCAT(pr.first_name, ' ', pr.last_name) ILIKE '%<full_name>%')

- To get experiments assigned to a person (by name):
  SELECT e.* FROM experiments e
  JOIN projects p ON e.project_id = p.id
  JOIN profiles pr ON e.assigned_to = pr.id
  WHERE (pr.first_name ILIKE '%<first_name>%' OR pr.last_name ILIKE '%<last_name>%'
         OR CONCAT(pr.first_name, ' ', pr.last_name) ILIKE '%<full_name>%')

- To get experiment by name (handles spaces, underscores, case variations):
  SELECT e.* FROM experiments e
  JOIN projects p ON e.project_id = p.id
  WHERE (REPLACE(LOWER(e.name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<experiment_name>'), '_', ' ') || '%'
         OR e.name ILIKE '%<experiment_name>%')

- To get project by name (handles spaces, underscores, case variations):
  SELECT * FROM projects
  WHERE (REPLACE(LOWER(name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'
         OR name ILIKE '%<project_name>%')

- To get project status by name (handles spaces, underscores, case variations):
  SELECT status FROM projects
  WHERE (REPLACE(LOWER(name), '_', ' ') ILIKE '%' || REPLACE(LOWER('<project_name>'), '_', ' ') || '%'
         OR name ILIKE '%<project_name>%')

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
        
        SECURITY: SQL should already be filtered by user_id (created_by) from generate_sql.
        Only validates that query is read-only (SELECT only).
        
        Args:
            sql: SQL query to execute (should already include user_id filtering)
            scope: Access scope (deprecated - not used for filtering)
            
        Returns:
            Dict with data, row_count, execution_time_ms, or error
        """
        start_time = time.time()
        
        try:
            # Validate SQL safety (only checks for read-only, no filtering)
            is_safe, error_msg = self._validate_sql_safety(sql, scope)
            if not is_safe:
                raise ValueError(f"SQL safety validation failed: {error_msg}")
            
            # Get PostgreSQL connection (autocommit is enabled, so no transaction issues)
            # Always get a fresh connection to avoid any state issues from previous queries
            conn = self._get_pg_connection(force_new=False)
            
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Execute query (autocommit mode means each query runs in its own transaction)
            cursor.execute(sql)
            
            # Fetch results
            rows = cursor.fetchall()
            
            # Convert to list of dicts
            data = [dict(row) for row in rows]
            row_count = len(data)
            
            cursor.close()
            
            # No need to commit - autocommit is enabled
            
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
            
            # CRITICAL: Reset connection on error to prevent transaction state issues
            # Even with autocommit, a failed query can leave the connection in a bad state
            try:
                if hasattr(self, '_pg_conn') and self._pg_conn and not self._pg_conn.closed:
                    try:
                        # Try to rollback any aborted transaction
                        self._pg_conn.rollback()
                    except Exception:
                        pass
                    self._pg_conn.close()
            except Exception:
                pass
            self._pg_conn = None
            
            # Log the error details for debugging
            error_str = str(e)
            if "transaction is aborted" in error_str.lower():
                logger.warning(
                    "Connection had aborted transaction - connection will be reset",
                    error=error_str
                )
                # Raise as ConfigurationError with helpful message
                raise ConfigurationError(
                    f"Database service is not available: Connection has aborted transaction. "
                    f"This usually means the connection is in a bad state. Error: {error_str}"
                ) from e
            
            logger.error(
                "SQL execution failed (PostgreSQL error)",
                error=str(e),
                execution_time_ms=round(execution_time_ms, 2)
            )
            
            # Raise as ConfigurationError for other database errors
            raise ConfigurationError(
                f"Database service is not available: SQL execution failed. Error: {error_str}"
            ) from e
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
        user_id: Optional[str] = None,
        normalized_query: Optional[str] = None,
        entities: Optional[Dict[str, Any]] = None,
        scope: Optional[Dict[str, Optional[str]]] = None
    ) -> Dict[str, Any]:
        """
        Generate SQL and execute it in one call.
        
        Args:
            query: Original user query
            user_id: User ID for filtering (REQUIRED for security)
            normalized_query: Normalized query text
            entities: Extracted entities
            scope: Access scope (deprecated)
            
        Returns:
            Dict with data, row_count, execution_time_ms, or error
        """
        try:
            # Generate SQL
            sql = self.generate_sql(
                query=query,
                user_id=user_id,
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
    
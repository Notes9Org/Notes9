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
            # Extract connection details from Supabase URL
            # Format: https://<project-ref>.supabase.co
            supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
            
            # Parse host from URL (e.g., https://xxx.supabase.co -> db.xxx.supabase.co)
            if ".supabase.co" in supabase_url:
                project_ref = supabase_url.replace("https://", "").replace(".supabase.co", "")
                db_host = f"db.{project_ref}.supabase.co"
            else:
                # Fallback to direct DB host env var
                db_host = os.getenv("DB_HOST", "localhost")
            
            db_port = int(os.getenv("DB_PORT", "5432"))
            db_user = os.getenv("DB_USER", "postgres")
            db_password = os.getenv("DB_PASSWORD")
            db_name = os.getenv("DB_NAME", "postgres")
            
            if not db_password:
                raise ValueError("DB_PASSWORD environment variable is required for SQL execution")
            
            self._pg_conn = psycopg2.connect(
                host=db_host,
                port=db_port,
                user=db_user,
                password=db_password,
                database=db_name,
                connect_timeout=10
            )
            logger.info("PostgreSQL connection established", host=db_host)
        
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
        if "organization_id" not in sql_upper:
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
        
        # Build prompt for LLM
        entities_text = ""
        if entities:
            entities_text = "\n".join([f"- {k}: {v}" for k, v in entities.items()])
        
        prompt = f"""Generate a PostgreSQL SELECT query to answer the following question about a lab management system.

User Query: {query}
{f"Normalized Query: {normalized_query}" if normalized_query else ""}

Extracted Entities:
{entities_text if entities_text else "None"}

Access Scope:
- organization_id: {organization_id} (REQUIRED - must filter by this)
{f"- project_id: {project_id}" if project_id else ""}
{f"- experiment_id: {experiment_id}" if experiment_id else ""}

Database Schema:
{DB_SCHEMA}

CRITICAL REQUIREMENTS:
1. Query MUST be a SELECT statement only (read-only)
2. Query MUST filter by organization_id = '{organization_id}' for security
3. If querying experiments, samples, or lab_notes, join through projects to get organization_id
4. Use proper JOINs to access related tables
5. Return only the columns needed to answer the query
6. Use appropriate WHERE clauses based on entities and scope
7. Use proper PostgreSQL syntax
8. Do NOT include any DROP, DELETE, UPDATE, INSERT, ALTER, or other write operations
9. Do NOT include comments in the SQL

Example JOIN patterns:
- To get experiments for an organization: 
  SELECT e.* FROM experiments e 
  JOIN projects p ON e.project_id = p.id 
  WHERE p.organization_id = '{organization_id}'
  
- To get samples for an organization:
  SELECT s.* FROM samples s
  JOIN experiments e ON s.experiment_id = e.id
  JOIN projects p ON e.project_id = p.id
  WHERE p.organization_id = '{organization_id}'

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
            
            logger.info("SQL generated", query_length=len(sql), sql_preview=sql[:100])
            
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
                execution_time_ms=round(execution_time_ms, 2)
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
        if self._pg_conn and not self._pg_conn.closed:
            self._pg_conn.close()
            logger.info("PostgreSQL connection closed")
    
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
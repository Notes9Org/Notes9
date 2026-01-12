import os
from typing import Optional, List, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv
import structlog

load_dotenv()

logger = structlog.get_logger()


class SupabaseService:

    def __init__(self):
        self.url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not self.url or not self.service_key:
            raise ValueError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

        self.client: Client = create_client(self.url, self.service_key)
        logger.info("Supabase client initialized", url=self.url)

    def get_pending_jobs(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get pending chunk jobs from the database"""
        try:
            response = self.client.table("chunk_jobs")\
                .select("*")\
                .eq("status", "pending")\
                .order("created_at", desc=False)\
                .limit(limit)\
                .execute()
            
            return response.data if response.data else []
        except Exception as e:
            logger.error("Error getting pending jobs", error=str(e))
            return []
    
    def update_job_status(self, job_id: str, status: str, error_message: Optional[str] = None) -> bool:
        """Update the status of a chunk job"""
        try:
            update_data = {
                "status": status,
                "processed_at": "now()",
            }
            if error_message:
                # Get current retry count
                current_job = self.client.table("chunk_jobs").select("retry_count").eq("id", job_id).single().execute()

                update_data["error_message"] = error_message
                update_data["retry_count"] = (current_job.data.get("retry_count", 0) + 1)
            
            self.client.table("chunk_jobs").update(update_data).eq("id", job_id).execute()
            logger.info("Job status updated", job_id=job_id, status=status)
            return True
        
        except Exception as e:
            logger.error("Error updating job status", error=str(e), job_id=job_id)
            return False

    def delete_chunks(self, source_type: str, source_id: str) -> bool:
        """Delete all chunks for a given source"""
        try:
            self.client.table("semantic_chunks").delete().eq("source_type", source_type).eq("source_id", source_id).execute()
            logger.info("Chunks deleted", source_type=source_type, source_id=source_id)
            return True
        except Exception as e:
            logger.error("Error deleting chunks", error=str(e), source_type=source_type, source_id=source_id)
            return False
    
    def insert_chunks(self, chunks: List[Dict[str, Any]]) -> bool:
        """Insert a list of chunks into the database"""
        if not chunks:
            return True
        try:
            batch_size = 100
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i+batch_size]
                self.client.table("semantic_chunks").insert(batch).execute()
                logger.info("Chunks inserted", chunks=batch)
            return True
        except Exception as e:
            logger.error("Error inserting chunks", error=str(e), chunks=chunks)
            return False
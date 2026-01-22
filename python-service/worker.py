"""Worker process to process pending chunk jobs into semantic chunks."""
import os
import time
import sys
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
import structlog

from services.db import SupabaseService
from services.chunker import extract_plain_text, chunk_text
from services.embedder import EmbeddingService

load_dotenv()

# Configure logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ]
)

logger = structlog.get_logger()


class ChunkWorker:
    """Worker to process chunk jobs and create semantic chunks."""
    
    def __init__(self):
        self.db = SupabaseService()
        self.embedder = EmbeddingService()
        from services.config import get_app_config
        app_config = get_app_config()
        self.batch_size = app_config.chunk_worker_batch_size
        self.poll_interval = app_config.chunk_worker_poll_interval
        self.chunk_size = app_config.chunk_size
        self.chunk_overlap = app_config.chunk_overlap
    
    def process_job(self, job: Dict[str, Any]) -> bool:
        """Process a single chunk job."""
        job_id = job["id"]
        source_type = job["source_type"]
        source_id = job["source_id"]
        operation = job["operation"]
        payload = job.get("payload", {})
        
        logger.info(
            "Processing job",
            job_id=job_id,
            source_type=source_type,
            source_id=source_id,
            operation=operation
        )
        
        try:
            # Update status to processing
            self.db.update_job_status(job_id, "processing")
            
            # Handle delete operation
            if operation == "delete":
                success = self.db.delete_chunks(source_type, source_id)
                if success:
                    self.db.update_job_status(job_id, "completed")
                    logger.info("Delete job completed", job_id=job_id)
                    return True
                else:
                    self.db.update_job_status(job_id, "failed", "Failed to delete chunks")
                    return False
            
            # Handle create/update operations
            content = payload.get("content", "")
            if not content or len(content.strip()) < 50:
                self.db.update_job_status(
                    job_id,
                    "completed",
                    "Content too short or empty, skipping"
                )
                logger.info("Job skipped - content too short", job_id=job_id)
                return True
            
            # Extract plain text from content
            plain_text = extract_plain_text(content)
            if not plain_text or len(plain_text.strip()) < 50:
                self.db.update_job_status(
                    job_id,
                    "completed",
                    "Extracted text too short, skipping"
                )
                logger.info("Job skipped - extracted text too short", job_id=job_id)
                return True
            
            # Chunk the text
            text_chunks = chunk_text(
                plain_text,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap
            )
            
            if not text_chunks:
                self.db.update_job_status(
                    job_id,
                    "completed",
                    "No chunks generated"
                )
                logger.info("Job skipped - no chunks generated", job_id=job_id)
                return True
            
            logger.info(
                "Text chunked",
                job_id=job_id,
                chunk_count=len(text_chunks)
            )
            
            # Generate embeddings for all chunks
            embeddings = self.embedder.embed_batch(text_chunks)
            
            # Validate embeddings result
            if embeddings is None:
                self.db.update_job_status(
                    job_id,
                    "failed",
                    "Embedding service returned None"
                )
                logger.error("Embeddings returned None", job_id=job_id)
                return False
            
            # Ensure embeddings list matches text_chunks length
            if len(embeddings) != len(text_chunks):
                logger.warning(
                    "Embeddings length mismatch",
                    job_id=job_id,
                    text_chunks_len=len(text_chunks),
                    embeddings_len=len(embeddings)
                )
            
            # Filter out chunks that failed to get embeddings
            valid_chunks = []
            for i in range(len(text_chunks)):
                if i < len(embeddings) and embeddings[i] is not None:
                    valid_chunks.append({
                        "chunk_text": text_chunks[i],
                        "embedding": embeddings[i],
                        "index": i
                    })
            
            if not valid_chunks:
                self.db.update_job_status(
                    job_id,
                    "failed",
                    "Failed to generate embeddings for any chunks"
                )
                logger.error("No valid embeddings generated", job_id=job_id)
                return False
            
            logger.info(
                "Embeddings generated",
                job_id=job_id,
                total_chunks=len(text_chunks),
                valid_chunks=len(valid_chunks)
            )
            
            # Delete existing chunks for this source (for update operations)
            if operation == "update":
                self.db.delete_chunks(source_type, source_id)
            
            # Prepare chunks for insertion
            chunks_to_insert = []
            for chunk_data in valid_chunks:
                chunk_record = {
                    "source_type": source_type,
                    "source_id": source_id,
                    "chunk_index": chunk_data["index"],
                    "content": chunk_data["chunk_text"],
                    "embedding": chunk_data["embedding"],
                    "organization_id": payload.get("organization_id"),
                    "project_id": payload.get("project_id"),
                    "experiment_id": payload.get("experiment_id"),
                    "created_by": payload.get("created_by"),
                    "metadata": {
                        "title": payload.get("title", ""),
                        "source_type": source_type
                    }
                }
                chunks_to_insert.append(chunk_record)
            
            # Insert chunks into database
            success = self.db.insert_chunks(chunks_to_insert)
            
            if success:
                self.db.update_job_status(job_id, "completed")
                logger.info(
                    "Job completed successfully",
                    job_id=job_id,
                    chunks_inserted=len(chunks_to_insert)
                )
                return True
            else:
                self.db.update_job_status(
                    job_id,
                    "failed",
                    "Failed to insert chunks into database"
                )
                logger.error("Failed to insert chunks", job_id=job_id)
                return False
                
        except Exception as e:
            error_msg = str(e)
            logger.error(
                "Error processing job",
                job_id=job_id,
                error=error_msg,
                exc_info=True
            )
            self.db.update_job_status(job_id, "failed", error_msg)
            return False
    
    def run_once(self) -> int:
        """Process one batch of pending jobs. Returns number of jobs processed."""
        jobs = self.db.get_pending_jobs(limit=self.batch_size)
        
        if not jobs:
            return 0
        
        logger.info("Found pending jobs", count=len(jobs))
        
        processed = 0
        for job in jobs:
            if self.process_job(job):
                processed += 1
        
        return processed
    
    def retry_failed_jobs(self, max_retries: Optional[int] = None, limit: Optional[int] = None) -> int:
        """Reset failed jobs to pending status for retry. Returns number of jobs reset."""
        logger.info("Retrying failed jobs", max_retries=max_retries, limit=limit)
        
        if limit:
            # Get specific number of failed jobs
            failed_jobs = self.db.get_failed_jobs(limit=limit, max_retries=max_retries)
            if not failed_jobs:
                logger.info("No failed jobs found to retry")
                return 0
            
            job_ids = [job["id"] for job in failed_jobs]
            count = self.db.reset_jobs_to_pending(job_ids)
        else:
            # Reset all failed jobs
            count = self.db.reset_all_failed_jobs_to_pending(max_retries=max_retries)
        
        logger.info("Failed jobs reset to pending", count=count)
        return count
    
    def run_continuous(self):
        """Run worker continuously, polling for new jobs."""
        logger.info(
            "Worker started",
            batch_size=self.batch_size,
            poll_interval=self.poll_interval
        )
        
        try:
            while True:
                processed = self.run_once()
                
                if processed == 0:
                    logger.debug("No jobs to process, sleeping", interval=self.poll_interval)
                    time.sleep(self.poll_interval)
                else:
                    logger.info("Batch processed", count=processed)
                    
        except KeyboardInterrupt:
            logger.info("Worker stopped by user")
        except Exception as e:
            logger.error("Worker error", error=str(e), exc_info=True)
            raise


def main():
    """Main entry point for the worker."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Process chunk jobs into semantic chunks")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process one batch and exit (default: run continuously)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=None,
        help="Number of jobs to process per batch"
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=None,
        help="Seconds to wait between polls when no jobs found"
    )
    parser.add_argument(
        "--retry-failed",
        action="store_true",
        help="Reset failed jobs to pending status for retry"
    )
    parser.add_argument(
        "--retry-limit",
        type=int,
        default=None,
        help="Limit number of failed jobs to retry (default: all)"
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=None,
        help="Only retry jobs with retry_count <= this value (default: all)"
    )
    
    args = parser.parse_args()
    
    worker = ChunkWorker()
    
    # Override config from command line
    if args.batch_size:
        worker.batch_size = args.batch_size
    if args.poll_interval:
        worker.poll_interval = args.poll_interval
    
    # Handle retry failed jobs
    if args.retry_failed:
        count = worker.retry_failed_jobs(
            max_retries=args.max_retries,
            limit=args.retry_limit
        )
        logger.info("Retry operation completed", jobs_reset=count)
        sys.exit(0 if count >= 0 else 1)
    
    if args.once:
        # Process one batch and exit
        processed = worker.run_once()
        logger.info("One-time run completed", jobs_processed=processed)
        sys.exit(0 if processed >= 0 else 1)
    else:
        # Run continuously
        worker.run_continuous()


if __name__ == "__main__":
    main()

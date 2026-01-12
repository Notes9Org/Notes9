"""Background worker to process chunk jobs."""
import asyncio
import os
import sys
import time
from typing import Dict, Any
from dotenv import load_dotenv
import structlog

from services.db import SupabaseService
from services.chunker import extract_plain_text, chunk_text
from services.embedder import EmbeddingService

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ]
)

load_dotenv()

logger = structlog.get_logger()

# Configuration
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))  # seconds
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "10"))  # jobs to process per cycle


class ChunkWorker:
    """Worker to process semantic chunk jobs."""
    
    def __init__(self):
        self.db = SupabaseService()
        self.embedder = EmbeddingService()
        self.running = True
        
        logger.info(
            "Chunk Worker initialized",
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            poll_interval=POLL_INTERVAL,
            max_retries=MAX_RETRIES
        )
    
    def process_job(self, job: Dict[str, Any]) -> bool:
        """Process a single chunk job. Returns True if successful."""
        job_id = job["id"]
        operation = job["operation"]
        source_type = job["source_type"]
        source_id = job["source_id"]
        payload = job.get("payload", {})
        
        logger.info("Processing job", job_id=job_id, operation=operation, source_type=source_type, source_id=source_id)
        
        try:
            # Mark job as processing
            self.db.update_job_status(job_id, "processing")
            
            if operation == "delete":
                # Delete chunks for this source
                success = self.db.delete_chunks(source_type, source_id)
                if success:
                    self.db.update_job_status(job_id, "completed")
                    logger.info("Job completed - deleted chunks", job_id=job_id, source_type=source_type, source_id=source_id)
                    return True
                else:
                    raise Exception("Failed to delete chunks")
                
            else:  # create or update
                # Extract content from payload
                content = payload.get("content", "")
                if not content:
                    raise ValueError("No content in payload")
                
                # Extract plain text
                plain_text = extract_plain_text(content)
                if not plain_text or len(plain_text.strip()) < 50:
                    raise ValueError(f"Content too short after extraction: {len(plain_text)} chars")
                
                # Delete existing chunks (for update case)
                self.db.delete_chunks(source_type, source_id)
                
                # Chunk the text
                chunks = chunk_text(plain_text, CHUNK_SIZE, CHUNK_OVERLAP)
                if not chunks:
                    raise ValueError("No chunks generated from text")
                
                logger.info("Text chunked", job_id=job_id, chunk_count=len(chunks))
                
                # Generate embeddings for all chunks
                embeddings = self.embedder.embed_batch(chunks)
                
                # Prepare chunks for insertion
                chunk_records = []
                for idx, (chunk_text_content, embedding) in enumerate(zip(chunks, embeddings)):
                    if embedding is None:
                        logger.warning("Skipping chunk with failed embedding", job_id=job_id, chunk_index=idx)
                        continue
                    
                    chunk_record = {
                        "source_type": source_type,
                        "source_id": source_id,
                        "chunk_index": idx,
                        "content": chunk_text_content,
                        "embedding": embedding,
                        "organization_id": payload.get("organization_id"),
                        "project_id": payload.get("project_id"),
                        "experiment_id": payload.get("experiment_id"),
                        "user_id": payload.get("user_id"),
                        "metadata": {
                            "title": payload.get("title", ""),
                            "chunk_size": len(chunk_text_content),
                            "total_chunks": len(chunks)
                        }
                    }
                    chunk_records.append(chunk_record)
                
                # Insert chunks into database
                if chunk_records:
                    success = self.db.insert_chunks(chunk_records)
                    if success:
                        self.db.update_job_status(job_id, "completed")
                        logger.info(
                            "Job completed - chunks inserted",
                            job_id=job_id,
                            source_type=source_type,
                            source_id=source_id,
                            chunk_count=len(chunk_records)
                        )
                        return True
                    else:
                        raise Exception("Failed to insert chunks")
                else:
                    raise ValueError("No valid chunks to insert after embedding generation")
        
        except Exception as e:
            error_msg = str(e)
            logger.error("Error processing job", job_id=job_id, error=error_msg, operation=operation)
            
            # Check retry count
            retry_count = job.get("retry_count", 0)
            if retry_count < MAX_RETRIES:
                # Reset to pending for retry
                self.db.update_job_status(job_id, "pending", error_message=error_msg)
                logger.info("Job queued for retry", job_id=job_id, retry_count=retry_count + 1)
            else:
                # Mark as failed after max retries
                self.db.update_job_status(job_id, "failed", error_message=error_msg)
                logger.error("Job failed after max retries", job_id=job_id, retry_count=retry_count)
            
            return False
    
    def run(self):
        """Main worker loop."""
        logger.info("🚀 Chunk Worker started")
        
        while self.running:
            try:
                # Get pending jobs
                jobs = self.db.get_pending_jobs(limit=BATCH_SIZE)
                
                if jobs:
                    logger.info("📦 Processing jobs", count=len(jobs))
                    for job in jobs:
                        self.process_job(job)
                        # Small delay between jobs to avoid rate limits
                        time.sleep(0.5)
                else:
                    # No jobs, wait before next poll
                    logger.debug("⏳ No pending jobs, waiting...", interval=POLL_INTERVAL)
                    time.sleep(POLL_INTERVAL)
            
            except KeyboardInterrupt:
                logger.info("🛑 Worker stopped by user")
                self.running = False
                break
            
            except Exception as e:
                logger.error("Worker error", error=str(e))
                time.sleep(POLL_INTERVAL)
        
        logger.info("👋 Chunk Worker stopped")


if __name__ == "__main__":
    worker = ChunkWorker()
    try:
        worker.run()
    except KeyboardInterrupt:
        worker.running = False
        sys.exit(0)
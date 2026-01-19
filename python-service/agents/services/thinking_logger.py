"""Service for logging agent thinking and reasoning for future reference."""
import time
import json
from typing import Dict, Any, Optional, List
import structlog
from services.trace_service import TraceService

logger = structlog.get_logger()


class ThinkingLogger:
    """Service for logging agent thinking, reasoning, and decision-making process."""
    
    def __init__(self, trace_service: Optional[TraceService] = None):
        """
        Initialize thinking logger.
        
        Args:
            trace_service: Optional TraceService instance for persistent logging.
        """
        self.trace_service = trace_service if trace_service else TraceService()
        logger.info("Thinking logger initialized")
    
    def log_thinking(
        self,
        run_id: str,
        node_name: str,
        thinking_type: str,
        content: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Log agent thinking/reasoning for a specific node.
        
        Args:
            run_id: UUID string for the run
            node_name: Name of the node (normalize, router, sql, etc.)
            thinking_type: Type of thinking (reasoning, decision, analysis, validation, etc.)
            content: Thinking content as dictionary
            metadata: Optional additional metadata
            
        Returns:
            True if successful, False otherwise
        """
        try:
            payload = {
                "thinking_type": thinking_type,
                "content": content,
                "timestamp": time.time(),
                "metadata": metadata or {}
            }
            
            # Log to trace service as a "thinking" event
            self.trace_service.log_event(
                run_id=run_id,
                node_name=node_name,
                event_type="thinking",
                payload=payload
            )
            
            # Also log to structlog for immediate visibility
            logger.info(
                "agent_thinking",
                run_id=run_id,
                node_name=node_name,
                thinking_type=thinking_type,
                content_summary=str(content)[:200]
            )
            
            return True
            
        except Exception as e:
            logger.error(
                "Failed to log thinking",
                run_id=run_id,
                node_name=node_name,
                error=str(e)
            )
            return False
    
    def log_reasoning(
        self,
        run_id: str,
        node_name: str,
        reasoning: str,
        factors: Optional[List[str]] = None,
        conclusion: Optional[str] = None
    ) -> bool:
        """
        Log reasoning process.
        
        Args:
            run_id: UUID string for the run
            node_name: Name of the node
            reasoning: Reasoning text
            factors: List of factors considered
            conclusion: Conclusion reached
            
        Returns:
            True if successful, False otherwise
        """
        return self.log_thinking(
            run_id=run_id,
            node_name=node_name,
            thinking_type="reasoning",
            content={
                "reasoning": reasoning,
                "factors": factors or [],
                "conclusion": conclusion
            }
        )
    
    def log_decision(
        self,
        run_id: str,
        node_name: str,
        decision: str,
        alternatives: Optional[List[str]] = None,
        rationale: Optional[str] = None,
        confidence: Optional[float] = None
    ) -> bool:
        """
        Log a decision made by the agent.
        
        Args:
            run_id: UUID string for the run
            node_name: Name of the node
            decision: Decision made
            alternatives: Alternative options considered
            rationale: Rationale for the decision
            confidence: Confidence level (0.0-1.0)
            
        Returns:
            True if successful, False otherwise
        """
        return self.log_thinking(
            run_id=run_id,
            node_name=node_name,
            thinking_type="decision",
            content={
                "decision": decision,
                "alternatives": alternatives or [],
                "rationale": rationale,
                "confidence": confidence
            }
        )
    
    def log_analysis(
        self,
        run_id: str,
        node_name: str,
        analysis: str,
        data_summary: Optional[Dict[str, Any]] = None,
        insights: Optional[List[str]] = None
    ) -> bool:
        """
        Log analysis performed by the agent.
        
        Args:
            run_id: UUID string for the run
            node_name: Name of the node
            analysis: Analysis description
            data_summary: Summary of data analyzed
            insights: Key insights discovered
            
        Returns:
            True if successful, False otherwise
        """
        return self.log_thinking(
            run_id=run_id,
            node_name=node_name,
            thinking_type="analysis",
            content={
                "analysis": analysis,
                "data_summary": data_summary or {},
                "insights": insights or []
            }
        )
    
    def log_validation(
        self,
        run_id: str,
        node_name: str,
        validation_type: str,
        criteria: List[str],
        result: str,
        issues: Optional[List[str]] = None
    ) -> bool:
        """
        Log validation process.
        
        Args:
            run_id: UUID string for the run
            node_name: Name of the node
            validation_type: Type of validation (factual, citation, scope, completeness)
            criteria: Validation criteria checked
            result: Validation result (pass/fail)
            issues: List of issues found
            
        Returns:
            True if successful, False otherwise
        """
        return self.log_thinking(
            run_id=run_id,
            node_name=node_name,
            thinking_type="validation",
            content={
                "validation_type": validation_type,
                "criteria": criteria,
                "result": result,
                "issues": issues or []
            }
        )


# Singleton instance
_thinking_logger: Optional[ThinkingLogger] = None


def get_thinking_logger() -> ThinkingLogger:
    """Get or create thinking logger singleton."""
    global _thinking_logger
    if _thinking_logger is None:
        _thinking_logger = ThinkingLogger()
    return _thinking_logger

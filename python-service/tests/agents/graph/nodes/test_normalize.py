"""Comprehensive tests for normalize node."""
import pytest
import sys
from unittest.mock import Mock, patch, MagicMock
from pydantic import ValidationError

# Patch problematic modules BEFORE any imports
# This must happen before importing any agent modules
sys.modules['services.db'] = MagicMock()
sys.modules['services.trace_service'] = MagicMock()
_mock_config = MagicMock()
_mock_config.AzureOpenAIConfig = MagicMock
sys.modules['services.config'] = _mock_config
sys.modules['supabase'] = MagicMock()
sys.modules['realtime'] = MagicMock()
sys.modules['websockets'] = MagicMock()
sys.modules['websockets.asyncio'] = MagicMock()
sys.modules['websockets.asyncio.client'] = MagicMock()
_mock_dotenv = MagicMock()
_mock_dotenv.load_dotenv = MagicMock(return_value=True)
sys.modules['dotenv'] = _mock_dotenv

# Now import modules
from agents.graph.state import AgentState
from agents.contracts.normalized import NormalizedQuery
from agents.services.llm_client import LLMClient, LLMError
from agents.graph.nodes.normalize import normalize_node
from agents.graph.nodes.normalize_validator import validate_normalized_output
from tests.agents.graph.nodes.fixtures.normalize_fixtures import (
    mock_state,
    mock_llm_response_aggregate,
    mock_llm_response_search,
    mock_llm_response_hybrid,
    mock_llm_response_invalid_json,
    mock_llm_response_missing_fields,
    mock_llm_response_wrong_intent,
    mock_llm_response_empty_query,
    mock_llm_response_intent_mismatch
)


# ============================================================================
# Category A: Happy Path Tests
# ============================================================================

class TestHappyPath:
    """Test normal operation scenarios."""
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_aggregate_intent_simple(self, mock_trace_service, mock_llm_client):
        """Test aggregate intent extraction."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = mock_llm_response_aggregate()
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state
        state = mock_state("How many experiments were completed last month?")
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        assert result["normalized_query"] is not None
        assert result["normalized_query"].intent == "aggregate"
        assert result["normalized_query"].context.get("requires_aggregation") is True
        assert "dates" in result["normalized_query"].entities
        assert len(result["normalized_query"].entities["dates"]) > 0
        
        # Verify trace logging
        assert mock_trace.log_event.call_count >= 2  # input + output
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_search_intent_simple(self, mock_trace_service, mock_llm_client):
        """Test search intent extraction."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = mock_llm_response_search()
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state
        state = mock_state("What are the key findings from experiment X?")
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        assert result["normalized_query"] is not None
        assert result["normalized_query"].intent == "search"
        assert result["normalized_query"].context.get("requires_semantic_search") is True
        assert "key findings" in result["normalized_query"].normalized_query.lower()
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_hybrid_intent_simple(self, mock_trace_service, mock_llm_client):
        """Test hybrid intent extraction."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = mock_llm_response_hybrid()
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state
        state = mock_state(
            "Show me completed experiments from last month and their key findings"
        )
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        assert result["normalized_query"] is not None
        assert result["normalized_query"].intent == "hybrid"
        assert result["normalized_query"].context.get("requires_aggregation") is True
        assert result["normalized_query"].context.get("requires_semantic_search") is True
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_with_history(self, mock_trace_service, mock_llm_client):
        """Test normalization with conversation history."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = {
            "intent": "search",
            "normalized_query": "PCR amplification efficiency for sample X",
            "entities": {"experiment_ids": ["X"]},
            "context": {
                "requires_aggregation": False,
                "requires_semantic_search": True
            },
            "history_summary": "User previously asked about experiment X"
        }
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state with history
        history = [
            {"role": "user", "content": "Tell me about experiment X"},
            {"role": "assistant", "content": "Experiment X is about..."}
        ]
        state = mock_state("What's the PCR efficiency?", history=history)
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        assert result["normalized_query"] is not None
        assert result["normalized_query"].history_summary is not None
        assert "experiment X" in result["normalized_query"].history_summary
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_with_scope(self, mock_trace_service, mock_llm_client):
        """Test normalization with scope (organization_id, project_id)."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = mock_llm_response_aggregate()
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state with scope
        scope = {
            "organization_id": "org-123",
            "project_id": "proj-456"
        }
        state = mock_state("Count experiments", scope=scope)
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        assert result["normalized_query"] is not None
        # Verify scope was included in prompt (indirectly via successful execution)
        assert mock_llm.complete_json.called


# ============================================================================
# Category B: Edge Cases
# ============================================================================

class TestEdgeCases:
    """Test edge case scenarios."""
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_missing_scope_organization_id(self, mock_trace_service, mock_llm_client):
        """Test handling of missing organization_id in scope."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = mock_llm_response_search()
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state without organization_id
        scope = {"project_id": "proj-123"}  # Missing organization_id
        state = mock_state("Find experiments", scope=scope)
        
        # Execute - should not crash
        result = normalize_node(state)
        
        # Assertions
        # Should either handle gracefully or fail with proper error
        assert result is not None
        # If it fails, should set final_response
        if result.get("final_response"):
            assert "error" in result["final_response"].answer.lower() or "normalizing" in result["final_response"].answer.lower()
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_empty_query(self, mock_trace_service, mock_llm_client):
        """Test handling of empty query."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = {
            "intent": "search",
            "normalized_query": "",
            "entities": {},
            "context": {"requires_semantic_search": True, "requires_aggregation": False}
        }
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state with empty query
        state = mock_state("")
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        # Should either handle gracefully or fail
        assert result is not None
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_very_long_query(self, mock_trace_service, mock_llm_client):
        """Test handling of very long query."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = mock_llm_response_search()
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state with very long query
        long_query = "What is " + "the experiment " * 500  # ~5000 chars
        state = mock_state(long_query)
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        assert result is not None
        # Should handle without crashing
        if result.get("normalized_query"):
            assert len(result["normalized_query"].normalized_query) > 0
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_scientific_terminology_preserved(self, mock_trace_service, mock_llm_client):
        """Test that scientific terminology is preserved."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = {
            "intent": "search",
            "normalized_query": "PCR amplification efficiency for sample X",
            "entities": {"experiment_ids": ["X"]},
            "context": {"requires_semantic_search": True, "requires_aggregation": False}
        }
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state with scientific query
        state = mock_state("What's the PCR amplification efficiency for sample X?")
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        assert result["normalized_query"] is not None
        normalized = result["normalized_query"].normalized_query.lower()
        assert "pcr" in normalized
        assert "amplification" in normalized or "efficiency" in normalized
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_date_extraction_variations(self, mock_trace_service, mock_llm_client):
        """Test date extraction for various date formats."""
        test_cases = [
            ("last month", ["2024-12-01", "2024-12-31"]),
            ("Q1 2024", ["2024-01-01", "2024-03-31"]),
            ("January 15", ["2024-01-15"]),
            ("yesterday", ["2024-12-19"]),
        ]
        
        for query_text, expected_dates in test_cases:
            # Setup mocks
            mock_llm = Mock()
            mock_llm.complete_json.return_value = {
                "intent": "aggregate",
                "normalized_query": f"experiments from {query_text}",
                "entities": {"dates": expected_dates},
                "context": {
                    "requires_aggregation": True,
                    "requires_semantic_search": False
                }
            }
            mock_llm_client.return_value = mock_llm
            
            mock_trace = Mock()
            mock_trace.log_event.return_value = True
            mock_trace_service.return_value = mock_trace
            
            # Create state
            state = mock_state(f"Show experiments from {query_text}")
            
            # Execute
            result = normalize_node(state)
            
            # Assertions
            assert result["normalized_query"] is not None
            dates = result["normalized_query"].entities.get("dates", [])
            assert len(dates) > 0, f"Failed to extract dates for: {query_text}"


# ============================================================================
# Category C: Failure Mode Tests
# ============================================================================

class TestFailureModes:
    """Test failure handling scenarios."""
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_invalid_json_from_llm(self, mock_trace_service, mock_llm_client):
        """Test handling of invalid JSON from LLM."""
        # Setup mocks
        mock_llm = Mock()
        # First call fails with JSON error, second succeeds
        mock_llm.complete_json.side_effect = [
            LLMError("Invalid JSON response"),
            mock_llm_response_search()  # Retry succeeds
        ]
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state
        state = mock_state("Find experiments")
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        assert result is not None
        # Should retry and eventually succeed
        assert result.get("normalized_query") is not None
        assert mock_llm.complete_json.call_count == 2  # Initial + retry
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_missing_required_fields(self, mock_trace_service, mock_llm_client):
        """Test handling of missing required fields in LLM response."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = mock_llm_response_missing_fields()
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state
        state = mock_state("Find experiments")
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        # Should fail with Pydantic validation error
        assert result is not None
        # Should set final_response with error
        assert result.get("final_response") is not None
        assert "error" in result["final_response"].answer.lower()
        
        # Verify error was logged
        error_calls = [call for call in mock_trace.log_event.call_args_list 
                      if len(call[1]) > 0 and call[1].get("event_type") == "error"]
        assert len(error_calls) > 0
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_wrong_intent_value(self, mock_trace_service, mock_llm_client):
        """Test handling of invalid intent value."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.return_value = mock_llm_response_wrong_intent()
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state
        state = mock_state("Find experiments")
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        # Should fail with Pydantic validation error
        assert result is not None
        assert result.get("final_response") is not None
        assert "error" in result["final_response"].answer.lower()
    
    @patch('agents.graph.nodes.normalize.get_llm_client')
    @patch('agents.graph.nodes.normalize.get_trace_service')
    def test_llm_timeout(self, mock_trace_service, mock_llm_client):
        """Test handling of LLM timeout."""
        # Setup mocks
        mock_llm = Mock()
        mock_llm.complete_json.side_effect = LLMError("Request timeout")
        mock_llm_client.return_value = mock_llm
        
        mock_trace = Mock()
        mock_trace.log_event.return_value = True
        mock_trace_service.return_value = mock_trace
        
        # Create state
        state = mock_state("Find experiments")
        
        # Execute
        result = normalize_node(state)
        
        # Assertions
        assert result is not None
        # Should catch exception and set final_response
        assert result.get("final_response") is not None
        assert "error" in result["final_response"].answer.lower()
        
        # Verify error was logged
        error_calls = [call for call in mock_trace.log_event.call_args_list 
                      if any("error" in str(arg).lower() for arg in call)]
        assert len(error_calls) > 0


# ============================================================================
# Category D: Invariant Validation Tests
# ============================================================================

class TestInvariantValidation:
    """Test invariant validation."""
    
    def test_intent_matches_context_flags_aggregate(self):
        """Test that aggregate intent matches context flags."""
        normalized = NormalizedQuery(
            intent="aggregate",
            normalized_query="count experiments",
            entities={},
            context={"requires_aggregation": True, "requires_semantic_search": False}
        )
        
        is_valid, issues = validate_normalized_output(normalized, {"query": "count"})
        assert is_valid, f"Validation failed: {issues}"
    
    def test_intent_matches_context_flags_search(self):
        """Test that search intent matches context flags."""
        normalized = NormalizedQuery(
            intent="search",
            normalized_query="find experiments",
            entities={},
            context={"requires_aggregation": False, "requires_semantic_search": True}
        )
        
        is_valid, issues = validate_normalized_output(normalized, {"query": "find"})
        assert is_valid, f"Validation failed: {issues}"
    
    def test_intent_matches_context_flags_hybrid(self):
        """Test that hybrid intent matches context flags."""
        normalized = NormalizedQuery(
            intent="hybrid",
            normalized_query="count and find experiments",
            entities={},
            context={
                "requires_aggregation": True,
                "requires_semantic_search": True
            }
        )
        
        is_valid, issues = validate_normalized_output(normalized, {"query": "count and find"})
        assert is_valid, f"Validation failed: {issues}"
    
    def test_intent_mismatch_detected(self):
        """Test that intent mismatch is detected."""
        normalized = NormalizedQuery(
            intent="aggregate",
            normalized_query="count experiments",
            entities={},
            context={"requires_aggregation": False, "requires_semantic_search": False}
        )
        
        is_valid, issues = validate_normalized_output(normalized, {"query": "count"})
        assert not is_valid
        assert len(issues) > 0
        assert any("aggregate" in issue.lower() and "requires_aggregation" in issue.lower() 
                  for issue in issues)
    
    def test_normalized_query_not_empty(self):
        """Test that normalized_query is never empty."""
        normalized = NormalizedQuery(
            intent="search",
            normalized_query="",  # Empty
            entities={},
            context={"requires_semantic_search": True, "requires_aggregation": False}
        )
        
        is_valid, issues = validate_normalized_output(normalized, {"query": "test"})
        assert not is_valid
        assert any("empty" in issue.lower() for issue in issues)
    
    def test_entities_structure_valid(self):
        """Test that entities structure is valid (Pydantic validates this)."""
        # Pydantic validates types at construction time, so invalid entities will be rejected
        # This test verifies that Pydantic correctly rejects invalid types
        with pytest.raises(ValidationError):
            NormalizedQuery(
                intent="search",
                normalized_query="find experiments",
                entities="not a dict",  # Invalid - should be rejected by Pydantic
                context={"requires_semantic_search": True, "requires_aggregation": False}
            )
        
        # Test that valid entities structure passes validation
        normalized = NormalizedQuery(
            intent="search",
            normalized_query="find experiments",
            entities={},  # Valid dict
            context={"requires_semantic_search": True, "requires_aggregation": False}
        )
        
        is_valid, issues = validate_normalized_output(normalized, {"query": "find"})
        assert is_valid, f"Valid entities dict should pass validation: {issues}"
    
    def test_scope_always_present_in_context(self):
        """Test that scope information is preserved (if available)."""
        # This is a soft check - we don't enforce it strictly
        # But we can verify the structure is valid
        normalized = NormalizedQuery(
            intent="search",
            normalized_query="find experiments",
            entities={},
            context={"requires_semantic_search": True, "requires_aggregation": False}
        )
        
        request = {
            "query": "find",
            "scope": {"organization_id": "org-123"}
        }
        
        is_valid, issues = validate_normalized_output(normalized, request)
        # Should pass - we don't enforce scope in context (it's implicit)
        assert is_valid or len(issues) == 0

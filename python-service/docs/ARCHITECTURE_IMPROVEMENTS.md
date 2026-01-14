# Architecture Improvements Plan

## Executive Summary

This document outlines architectural improvements based on production-readiness review. The current implementation is **strong** with excellent LangGraph usage, deterministic routing, and LLM-as-Judge validation. The primary improvement needed is moving from **direct LLM SQL generation** to **SQL Intent pattern** for enhanced safety and maintainability.

---

## ✅ What's Working Exceptionally Well (DO NOT CHANGE)

### 1. LangGraph Implementation
- ✅ Correct use of stateful DAG
- ✅ Clean node separation
- ✅ Bounded retry loop
- ✅ Graph compiled once (singleton) → performance optimized

### 2. Deterministic Router
- ✅ Explainable, testable, debuggable
- ✅ No LLM-based routing (avoids common mistake)
- ✅ Enterprise-grade approach

### 3. LLM-as-Judge
- ✅ Fact consistency checking
- ✅ Citation coverage validation
- ✅ Scope leakage detection
- ✅ Confidence scoring

### 4. Observability & Debug Trace
- ✅ Node-level latency tracking
- ✅ Tool usage logging
- ✅ Router decisions captured
- ✅ Judge verdicts recorded
- ✅ Can answer "why did the agent say this?"

---

## ⚠️ Critical Improvement: SQL Intent Pattern

### Current Risk: Dynamic SQL Generation

**Problem:**
- LLM generates raw SQL, then validates it
- Schema drift → silent failures
- Prompt injection via user query
- JOIN hallucinations
- Hard-to-reproduce bugs
- Security audits will flag this

**Solution: Move from "LLM SQL" → "LLM SQL Intent"**

### Implementation Plan

#### Step 1: Add SQLIntent Schema ✅ (Created)

```python
class SQLIntent(BaseModel):
    operation: Literal["count", "sum", "avg", "list", "group_by"]
    table: Literal["experiments", "samples", ...]
    filters: Dict[str, Any]
    group_by: Optional[List[str]]
    order_by: Optional[List[Dict[str, str]]]
    limit: Optional[int]
    time_range: Optional[Dict[str, str]]
    select_columns: Optional[List[str]]
```

#### Step 2: Update SQL Service

**Current Flow:**
```
Query → LLM → Raw SQL → Validate → Execute
```

**New Flow:**
```
Query → LLM → SQLIntent → Template Selection → Safe SQL → Execute
```

**Benefits:**
- ✅ No hallucinated JOINs
- ✅ Full control over SQL structure
- ✅ Easy unit tests
- ✅ Auditor-friendly
- ✅ Schema changes handled in code, not prompts

#### Step 3: SQL Template Library

Create template functions for each operation:

```python
def build_count_query(intent: SQLIntent, scope: Dict) -> str:
    """Build COUNT query from intent."""
    # Template-based, safe SQL generation
    pass

def build_list_query(intent: SQLIntent, scope: Dict) -> str:
    """Build SELECT query from intent."""
    pass

def build_group_by_query(intent: SQLIntent, scope: Dict) -> str:
    """Build GROUP BY query from intent."""
    pass
```

#### Step 4: Update LLM Prompt

**Old Prompt:**
```
"Generate a PostgreSQL SELECT query..."
```

**New Prompt:**
```
"Generate a structured SQL intent JSON. Do NOT write SQL.
Map the user query to:
- operation: count|sum|avg|list|group_by
- table: experiments|samples|...
- filters: {status: 'in_progress', ...}
- group_by: ['status'] (if needed)
..."
```

---

## 🔧 System Prompt Improvements

### 4.1 Normalizer Prompt - Tighten Intent Taxonomy

**Current:**
```python
intent: "aggregate" | "search" | "hybrid"
```

**Recommended:**
```python
intent:
- "quantitative"          # Counts, sums, averages
- "qualitative"           # Semantic search, descriptions
- "quantitative_with_explanation"  # Numbers + context
- "comparison"            # Compare entities
- "anomaly_detection"     # Find outliers
```

**Benefits:**
- Router logic becomes clearer
- Judge reasoning improves
- Future agents (statistics, forecasting) plug in cleanly

### 4.2 SQL Prompt - Remove Schema Dump

**Current:**
- Full DB schema in prompt (274 lines)
- Increases token cost
- Breaks when schema grows

**Recommended:**
```
Allowed tables:
experiments(id, status, project_id, organization_id, created_at)
samples(id, sample_type, status, experiment_id, ...)
...

Relationships:
experiments.project_id → projects.id
projects.organization_id → organizations.id
```

**Benefits:**
- Reduced token cost
- Easier to maintain
- Schema knowledge in code, not prompts

### 4.3 Summarizer Prompt - Force Uncertainty

**Add Rule:**
```
If evidence is insufficient, explicitly say "insufficient evidence".
Do NOT speculate.
```

**Benefits:**
- Reduces confident hallucinations
- Better user experience
- Judge can catch overconfidence

---

## 🔄 Retry Logic Enhancement

### Current Behavior
```
Judge fails → Retry → Router again → Full re-execution
```

### Improved Behavior
```
Judge fails → Retry → Inject judge issues → Summarizer refines only answer
```

**Implementation:**
```python
# In retry_node
state["retry_context"] = {
    "judge_issues": state["judge"]["issues"],
    "suggested_revision": state["judge"].get("suggested_revision")
}

# In summarizer_node
if state.get("retry_context"):
    # Use existing SQL/RAG results
    # Only refine the answer based on judge feedback
```

**Benefits:**
- Avoids unnecessary SQL/RAG reruns
- Faster retries
- Lower cost
- Better user experience

---

## 📊 RAG Layer Enhancement

### Current (Strong)
- ✅ Similarity threshold (0.75)
- ✅ Dedup by experiment_id
- ✅ Scope filtering
- ✅ Top-k cap (6)

### Future Enhancement: Citation Grounding Score

**Add:**
```python
def calculate_citation_grounding(answer: str, citations: List[Citation]) -> float:
    """
    Calculate % of answer sentences backed by citations.
    
    Returns:
        0.0-1.0 score indicating how well-grounded the answer is
    """
    # Parse answer into sentences
    # Check each sentence has citation
    # Return percentage
```

**Feed to Judge:**
```python
grounding_score = calculate_citation_grounding(summary["answer"], summary["citations"])
judge_input["citation_grounding"] = grounding_score
```

**Benefits:**
- Better confidence calibration
- Judge can catch unsupported claims
- Improves answer quality

---

## 📈 Confidence Score Calibration

### Current
- Some heuristic boosts
- Judge confidence used
- Fine for initial version

### Future: Calibration System

**Track:**
- Overconfidence vs underconfidence
- Calibrate against golden set
- A/B test different confidence formulas

**Implementation:**
```python
class ConfidenceCalibrator:
    """Calibrate confidence scores against ground truth."""
    
    def calibrate(self, predicted: float, actual: bool) -> float:
        """Adjust confidence based on historical accuracy."""
        pass
    
    def track_prediction(self, confidence: float, was_correct: bool):
        """Track prediction for calibration."""
        pass
```

**Benefits:**
- Confidence becomes a product feature
- Better user trust
- Data-driven improvements

---

## 🔒 Security & Compliance Enhancements

### Current (Strong)
- ✅ Tenant isolation
- ✅ Read-only SQL
- ✅ Scope enforcement
- ✅ Vector filtering

### Future Additions

#### 1. Prompt Injection Detection
```python
def detect_prompt_injection(text: str) -> bool:
    """Detect potential prompt injection in user queries."""
    # Check for SQL keywords in unexpected places
    # Check for instruction-like patterns
    # Check for encoding tricks
    pass
```

#### 2. Audit Log Persistence
```python
class AuditLogger:
    """Immutable audit log for compliance."""
    
    def log_query(self, request: AgentRequest, response: FinalResponse):
        """Log all queries and responses."""
        # Store in immutable storage
        # Include: user_id, query, response, confidence, tool_used
        pass
```

**Benefits:**
- Compliance ready
- Security incident investigation
- User behavior analysis

---

## 📋 Implementation Priority

### Phase 1: Critical (Immediate)
1. ✅ **SQL Intent Pattern** - Highest priority
   - Create SQLIntent schema
   - Update SQL service to use templates
   - Update LLM prompt to generate intent, not SQL

### Phase 2: High (Next Sprint)
2. **Retry Logic Enhancement**
   - Add retry_context to state
   - Update summarizer to use existing results
   
3. **Normalizer Intent Taxonomy**
   - Expand intent types
   - Update router logic

### Phase 3: Medium (Future)
4. **System Prompt Optimization**
   - Reduce schema dump
   - Add uncertainty enforcement
   
5. **Citation Grounding Score**
   - Implement calculation
   - Feed to judge

### Phase 4: Nice to Have
6. **Confidence Calibration**
   - Build calibration system
   - Track predictions
   
7. **Security Enhancements**
   - Prompt injection detection
   - Audit log persistence

---

## 🎯 Success Metrics

### SQL Intent Pattern
- ✅ Zero SQL injection vulnerabilities
- ✅ 100% test coverage of SQL templates
- ✅ Reduced token cost (no schema dump)
- ✅ Faster SQL generation (intent → template is faster)

### Retry Logic
- ✅ 50% reduction in retry latency
- ✅ 30% reduction in LLM calls during retries

### Confidence Calibration
- ✅ Confidence scores within 10% of actual accuracy
- ✅ User trust metrics improve

---

## 📚 References

- SQL Intent Pattern: Inspired by LangChain's SQL agent improvements
- Confidence Calibration: "Predictive Uncertainty Quantification" (Guo et al., 2017)
- Prompt Injection: OWASP LLM Top 10

---

## ✅ Next Steps

1. **Review this document** with team
2. **Prioritize Phase 1** (SQL Intent Pattern)
3. **Create implementation tickets**
4. **Set up monitoring** for confidence scores
5. **Plan security audit** after SQL Intent implementation

---

**Last Updated:** 2025-01-20
**Status:** Planning Phase
**Owner:** Engineering Team

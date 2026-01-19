# Query Suggestions for Semantic Chunks

Based on your `semantic_chunks` table schema and actual content (neural networks/transformers), here are recommended queries:

## ✅ Recommended Queries (Will Match Your Content)

### 1. Transformer Architecture Queries
```bash
python test_cases/test_agent_full.py "Explain the transformer architecture" cedbb951-4b9f-440a-96ad-0373fe059a1b

python test_cases/test_agent_full.py "How does self-attention work in transformers?" cedbb951-4b9f-440a-96ad-0373fe059a1b

python test_cases/test_agent_full.py "What is the attention mechanism in neural networks?" cedbb951-4b9f-440a-96ad-0373fe059a1b
```

### 2. Neural Network Queries
```bash
python test_cases/test_agent_full.py "Explain recurrent neural networks and LSTM" cedbb951-4b9f-440a-96ad-0373fe059a1b

python test_cases/test_agent_full.py "What are the differences between RNN and transformer models?" cedbb951-4b9f-440a-96ad-0373fe059a1b

python test_cases/test_agent_full.py "How do convolutional neural networks work?" cedbb951-4b9f-440a-96ad-0373fe059a1b
```

### 3. Training and Performance Queries
```bash
python test_cases/test_agent_full.py "What training data was used for the transformer model?" cedbb951-4b9f-440a-96ad-0373fe059a1b

python test_cases/test_agent_full.py "Explain the training process for transformer models" cedbb951-4b9f-440a-96ad-0373fe059a1b

python test_cases/test_agent_full.py "What are the computational requirements for training transformers?" cedbb951-4b9f-440a-96ad-0373fe059a1b
```

### 4. General Content Queries
```bash
python test_cases/test_agent_full.py "What information is available about neural network architectures?" cedbb951-4b9f-440a-96ad-0373fe059a1b

python test_cases/test_agent_full.py "Summarize the key concepts in the lab notes" cedbb951-4b9f-440a-96ad-0373fe059a1b

python test_cases/test_agent_full.py "What research topics are covered in the documentation?" cedbb951-4b9f-440a-96ad-0373fe059a1b
```

## 🔍 Schema-Based Queries

### Queries Using Source Type
```bash
# Query about lab notes specifically
python test_cases/test_agent_full.py "What lab notes discuss attention mechanisms?" cedbb951-4b9f-440a-96ad-0373fe059a1b

# Query about specific source types
python test_cases/test_agent_full.py "What information is in the lab notes about transformers?" cedbb951-4b9f-440a-96ad-0373fe059a1b
```

### Queries Using Organization/Project Scope
```bash
# Organization-scoped query
python test_cases/test_agent_full.py "What neural network research is documented in this organization?" cedbb951-4b9f-440a-96ad-0373fe059a1b

# If you have a project_id
python test_cases/test_agent_full.py "What experiments are documented in this project?" cedbb951-4b9f-440a-96ad-0373fe059a1b your-project-id-here

# If you have an experiment_id
python test_cases/test_agent_full.py "What information is available about this experiment?" cedbb951-4b9f-440a-96ad-0373fe059a1b your-project-id your-experiment-id
```

## 📊 SQL-Based Queries (For Counting/Listing)

### Count Queries (Will Route to SQL)
```bash
# Count chunks
python test_cases/test_agent_full.py "How many semantic chunks are in the database?" cedbb951-4b9f-440a-96ad-0373fe059a1b

# Count by source type
python test_cases/test_agent_full.py "How many lab notes are documented?" cedbb951-4b9f-440a-96ad-0373fe059a1b

# Count by organization
python test_cases/test_agent_full.py "How many chunks belong to this organization?" cedbb951-4b9f-440a-96ad-0373fe059a1b
```

## 🎯 Best Queries to Start With

Based on your actual content, these should work best:

```bash
# 1. Most likely to match (high similarity expected)
python test_cases/test_agent_full.py "Explain self-attention mechanism" cedbb951-4b9f-440a-96ad-0373fe059a1b

# 2. Good match for transformer content
python test_cases/test_agent_full.py "What is the transformer model architecture?" cedbb951-4b9f-440a-96ad-0373fe059a1b

# 3. General query about available content
python test_cases/test_agent_full.py "What neural network architectures are discussed?" cedbb951-4b9f-440a-96ad-0373fe059a1b
```

## ⚙️ Before Running

Make sure you've set the threshold in `.env`:

```bash
RAG_SIMILARITY_THRESHOLD=0.30
```

This will allow matches with similarity ~0.30 (which is what your content scores).

## 📝 Query Format

All queries follow this format:

```bash
python test_cases/test_agent_full.py "your query here" organization_id [project_id] [experiment_id]
```

**Required:**
- Query (in quotes)
- Organization ID

**Optional:**
- Project ID
- Experiment ID

# ADR-0003: AWS Bedrock as Primary LLM Provider

**Date**: 2026-05-27
**Status**: accepted
**Deciders**: Notes9 engineering

## Context

The agent needs to call Claude models. Two paths exist: direct Anthropic API (`api.anthropic.com`) or AWS Bedrock (managed inference). Notes9 already uses AWS for ECS, ECR, S3, Transcribe, and CloudWatch RUM, so both paths are viable.

## Decision

AWS Bedrock Converse API is the primary Claude inference path. The Anthropic SDK (`ANTHROPIC_API_KEY`) is wired as a fallback path for when Bedrock rate-limits or returns a `ContentFilteredError`. Embeddings use Bedrock Cohere embed-v4.

## Alternatives Considered

### Alternative 1: Anthropic API directly as primary
- **Pros**: First-party; newer models available sooner; simpler auth (one API key)
- **Cons**: Separate billing and quota management outside AWS; no IAM-based access control; harder to use with existing AWS VPC networking
- **Why not**: AWS infrastructure is already in place; Bedrock OIDC auth aligns with the no-static-keys CI/CD goal

### Alternative 2: OpenAI / other provider
- **Pros**: GPT-4o has strong tool-use performance
- **Cons**: Different model; would require re-validating all prompt behaviour; not a drop-in replacement for Claude's extended thinking
- **Why not**: Not evaluated; Claude's citation discipline and long-context behaviour are load-bearing for the ELN use case

## Consequences

### Positive
- Single AWS bill; IAM roles in production (no static keys needed)
- Bedrock handles request signing, retries, and regional failover
- Access to Nova Micro for cheap entity extraction without a separate API account

### Negative
- Bedrock model IDs differ from Anthropic IDs (`us.anthropic.claude-sonnet-4-6` vs `claude-sonnet-4-6`)
- New Claude model versions lag 2–4 weeks behind direct Anthropic availability on Bedrock
- `ContentFilteredError` behaviour differs slightly from direct API

### Risks
- Bedrock regional availability: if `us-east-1` has an outage, the fallback is the Anthropic direct path, which requires the `ANTHROPIC_API_KEY` secret to be populated and valid.

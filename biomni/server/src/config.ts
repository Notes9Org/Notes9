/**
 * Biomni Server Configuration
 *
 * Reads environment variables and validates required settings.
 * Mirrors the pattern from collaboration/server/src/config.ts
 */

import 'dotenv/config';

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  // LLM provider settings
  anthropicApiKey: string | undefined;
  groqApiKey: string | undefined;
  openaiApiKey: string | undefined;
  // Biomni agent settings
  biomniDataPath: string;
  biomniTimeoutSeconds: number;
  // LLM routing
  defaultLlm: string;
  defaultLlmSource: 'Anthropic' | 'Groq' | 'OpenAI' | 'Custom';
  reasoningLlm: string;
  reasoningLlmSource: 'Anthropic' | 'Groq' | 'OpenAI' | 'Custom';
  // Optional: local SGLang server for Biomni-R0
  localLlmBaseUrl: string | undefined;
  // Auth
  biomniApiKey: string | undefined;
  // CORS allowed origins (comma-separated)
  allowedOrigins: string[];
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return ['*'];
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

export const serverConfig: ServerConfig = {
  port: parseInt(process.env.PORT ?? '3002', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,

  biomniDataPath: process.env.BIOMNI_DATA_PATH ?? './data',
  biomniTimeoutSeconds: parseInt(process.env.BIOMNI_TIMEOUT_SECONDS ?? '1200', 10),

  // default_config LLM (used for DB queries / retrieval inside Biomni)
  defaultLlm: process.env.BIOMNI_DEFAULT_LLM ?? 'llama-3.1-8b-instant',
  defaultLlmSource: (process.env.BIOMNI_DEFAULT_LLM_SOURCE as ServerConfig['defaultLlmSource']) ?? 'Groq',

  // Reasoning agent LLM
  reasoningLlm: process.env.BIOMNI_REASONING_LLM ?? 'llama-3.3-70b-versatile',
  reasoningLlmSource: (process.env.BIOMNI_REASONING_LLM_SOURCE as ServerConfig['reasoningLlmSource']) ?? 'Groq',

  localLlmBaseUrl: process.env.BIOMNI_LOCAL_LLM_BASE_URL,

  biomniApiKey: process.env.BIOMNI_API_KEY,

  allowedOrigins: parseOrigins(process.env.BIOMNI_ALLOWED_ORIGINS),
};

/** Warn about missing keys — we don't hard-crash so the server can still
 *  run in stub/mock mode during development before the conda env is ready. */
export function validateConfig(): void {
  const warnings: string[] = [];

  if (!serverConfig.anthropicApiKey && !serverConfig.groqApiKey && !serverConfig.openaiApiKey) {
    warnings.push(
      'No LLM API keys found (ANTHROPIC_API_KEY / GROQ_API_KEY / OPENAI_API_KEY). ' +
        'Biomni agent will fail unless a local LLM server is configured.'
    );
  }

  if (serverConfig.defaultLlmSource === 'Groq' && !serverConfig.groqApiKey) {
    warnings.push('BIOMNI_DEFAULT_LLM_SOURCE=Groq but GROQ_API_KEY is missing.');
  }

  if (serverConfig.reasoningLlmSource === 'Anthropic' && !serverConfig.anthropicApiKey) {
    warnings.push('BIOMNI_REASONING_LLM_SOURCE=Anthropic but ANTHROPIC_API_KEY is missing.');
  }

  if (serverConfig.nodeEnv === 'production' && !serverConfig.biomniApiKey) {
    warnings.push('BIOMNI_API_KEY is not set — API endpoints are unprotected in production!');
  }

  for (const warning of warnings) {
    console.warn(`[Config] WARNING: ${warning}`);
  }
}

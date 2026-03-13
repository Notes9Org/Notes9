/**
 * Biomni Server Configuration
 *
 * Reads environment variables and validates required settings.
 */
import 'dotenv/config';

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return ['*'];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseBool(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const serverConfig = {
  port: parsePositiveInt(process.env.PORT, 3002, 1, 65535),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  googleApiKey: process.env.GOOGLE_API_KEY,

  biomniDataPath: process.env.BIOMNI_DATA_PATH ?? './data',
  biomniTimeoutSeconds: parsePositiveInt(
    process.env.BIOMNI_TIMEOUT_SECONDS,
    1200,
    1,
    3600
  ),

  // Gemini model settings (Google only)
  geminiModel: process.env.BIOMNI_GEMINI_MODEL ?? 'gemini-2.0-flash',
  geminiReasoningModel:
    process.env.BIOMNI_GEMINI_REASONING_MODEL ?? 'gemini-2.0-pro',

  llmSource: 'Google' as const,

  // Auth/CORS
  biomniApiKey: process.env.BIOMNI_API_KEY,
  allowedOrigins: parseOrigins(process.env.BIOMNI_ALLOWED_ORIGINS),
  maxRequestBytes: parsePositiveInt(
    process.env.BIOMNI_MAX_REQUEST_BYTES,
    1_048_576,
    1024,
    10 * 1_048_576
  ),

  // S3 cache for BIOMNI_DATA_PATH=s3://bucket/prefix
  biomniS3CacheDir: process.env.BIOMNI_S3_LOCAL_CACHE_DIR ?? '/tmp/biomni-data',
  biomniS3CacheTtlSeconds: parsePositiveInt(
    process.env.BIOMNI_S3_CACHE_TTL_SECONDS,
    900,
    0,
    24 * 3600
  ),
  biomniS3ForceSync: parseBool(process.env.BIOMNI_S3_SYNC_ON_EVERY_TASK, false),
  biomniS3MaxFiles: parsePositiveInt(process.env.BIOMNI_S3_MAX_FILES, 0, 0, 1_000_000),
};

export function validateConfig(): void {
  const warnings: string[] = [];

  if (!serverConfig.googleApiKey) {
    warnings.push('GOOGLE_API_KEY is missing. Biomni Gemini calls will fail.');
  }

  if (serverConfig.nodeEnv === 'production' && !serverConfig.biomniApiKey) {
    warnings.push('BIOMNI_API_KEY is not set. API endpoints are unprotected in production.');
  }

  if (serverConfig.nodeEnv === 'production' && serverConfig.allowedOrigins.includes('*')) {
    warnings.push(
      'BIOMNI_ALLOWED_ORIGINS=* allows all origins in production. Restrict to trusted origins.'
    );
  }

  if (serverConfig.biomniDataPath.startsWith('s3://')) {
    warnings.push(
      `BIOMNI_DATA_PATH is S3-backed (${serverConfig.biomniDataPath}). Server will sync data to local cache: ${serverConfig.biomniS3CacheDir}`
    );
  }

  for (const warning of warnings) {
    console.warn(`[Config] WARNING: ${warning}`);
  }
}

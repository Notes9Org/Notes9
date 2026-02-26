/**
 * Server Configuration
 * 
 * Centralized configuration management with validation.
 * Uses environment variables with sensible defaults.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from server folder
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

function getEnvVar(key: string, required: boolean = true, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value ?? '';
}

function getIntEnvVar(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer`);
  }
  return parsed;
}

export const serverConfig = {
  // Supabase
  supabaseUrl: getEnvVar('SUPABASE_URL'),
  supabaseServiceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),

  // Server
  port: getIntEnvVar('PORT', 3001),
  nodeEnv: getEnvVar('NODE_ENV', false, 'development'),
  isDevelopment: getEnvVar('NODE_ENV', false, 'development') === 'development',
  isProduction: getEnvVar('NODE_ENV', false, 'development') === 'production',

  // Security
  jwtSecret: getEnvVar('JWT_SECRET', false, ''),

  // Rate limiting
  maxConnectionsPerUser: getIntEnvVar('MAX_CONNECTIONS_PER_USER', 10),
  maxDocumentsPerUser: getIntEnvVar('MAX_DOCUMENTS_PER_USER', 50),

  // Logging
  logLevel: getEnvVar('LOG_LEVEL', false, 'info'),

  // Persistence
  persistInterval: getIntEnvVar('PERSIST_INTERVAL', 5000),
  maxDocumentSize: getIntEnvVar('MAX_DOCUMENT_SIZE', 10 * 1024 * 1024), // 10MB
} as const;

// Validate critical configuration on startup
export function validateConfig(): void {
  if (!serverConfig.supabaseUrl.startsWith('https://')) {
    throw new Error('SUPABASE_URL must start with https://');
  }
  if (!serverConfig.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  }
  console.log('[Config] Configuration validated successfully');
}

// Configuration for local development and testing

/**
 * Enable mock dependencies for local testing
 * 
 * ⚠️ IMPORTANT: Set this to FALSE before committing to production!
 * 
 * When true: Uses mock Supabase client for UI development/testing
 * When false: Uses real Supabase client (requires env variables)
 */
const ENABLE_MOCK_MODE = false // 👈 Change this to control mock mode

export const USE_MOCK_DEPENDENCIES = true // 👈 Set to true for local development
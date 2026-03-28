import { Resend } from 'resend';

/**
 * If the API key is missing during build, we provide a placeholder to avoid 
 * the library's constructor throwing an error and crashing the build.
 * The contact API route has its own runtime check for the key.
 */
const apiKey = process.env.RESEND_API_KEY || 're_placeholder_for_build';

if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === 'production') {
  console.warn('RESEND_API_KEY is missing in production build context.');
}

export const resend = new Resend(apiKey);

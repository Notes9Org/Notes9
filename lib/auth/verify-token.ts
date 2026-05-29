import { jwtVerify, type JWTPayload } from "jose"

/**
 * Verifies a Supabase access token locally against SUPABASE_JWT_SECRET.
 *
 * Returns the verified JWT payload on success, or null when verification
 * fails (bad signature, expired, algorithm mismatch).
 *
 * Algorithm is pinned to HS256 to prevent alg-confusion / alg:none attacks.
 *
 * Safe to call from Edge runtime — imports only jose, no Node-only APIs,
 * no next/headers.
 */
export async function verifyAccessTokenLocally(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] }
    )
    return payload
  } catch {
    return null
  }
}

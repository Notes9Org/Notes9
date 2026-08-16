import jwt from "jsonwebtoken";
import { canAccessDocument } from "./database.js";

/**
 * User context extracted from a valid JWT token.
 * Returned on successful authentication and attached to the connection.
 */
export interface UserContext {
  userId: string;
  email: string;
  name: string;
}

/**
 * Expected shape of the Supabase JWT payload fields we care about.
 */
interface JwtPayload {
  sub: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
  exp?: number;
}

/**
 * Hocuspocus onAuthenticate hook.
 *
 * Extracts the JWT from the WebSocket handshake token, validates its signature
 * against the JWT_SECRET environment variable, checks expiration, and returns
 * user context on success. Throws on failure, which causes Hocuspocus to reject
 * the connection.
 *
 * SEC-002 / N9-1: also verifies (via `canAccessDocument`) that the
 * authenticated user may access `documentName` before returning context —
 * without this, a valid JWT for *any* user was sufficient to read/write
 * *any* paper, since the collaboration server's Supabase client uses the
 * service-role key and RLS never runs. This check must happen inside
 * `onAuthenticate` because it is the only hook that runs before Hocuspocus's
 * `fetch`/`store` (database.ts) can read or write document content.
 */
export async function onAuthenticate({
  token,
  documentName,
}: {
  token: string;
  documentName: string;
}): Promise<UserContext> {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not configured");
  }

  if (!token) {
    throw new Error("Authentication token is required");
  }

  let decoded: JwtPayload;

  try {
    // jwt.verify performs the HMAC signature check internally. jsonwebtoken
    // (v9) compares HMAC digests using Node's crypto, which is constant-time
    // with respect to the secret, so this is not vulnerable to timing attacks
    // on signature comparison. No additional constant-time guard is needed here.
    decoded = jwt.verify(token, secret) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error("Token has expired");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid token");
    }
    throw new Error("Authentication failed");
  }

  const userId = decoded.sub;
  if (!userId) {
    throw new Error("Token payload missing user ID (sub)");
  }

  const email = decoded.email ?? "";
  const name =
    decoded.user_metadata?.full_name ??
    decoded.user_metadata?.name ??
    email.split("@")[0] ??
    "Anonymous";

  const allowed = await canAccessDocument(userId, documentName);
  if (!allowed) {
    // Deliberately generic: don't reveal whether the document exists,
    // whether documentName was malformed, or whether it's an access
    // problem — all three collapse to the same rejection.
    throw new Error("Access to document denied");
  }

  return { userId, email, name };
}

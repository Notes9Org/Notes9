import jwt from "jsonwebtoken";

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
 */
export function onAuthenticate({ token }: { token: string }): UserContext {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not configured");
  }

  if (!token) {
    throw new Error("Authentication token is required");
  }

  let decoded: JwtPayload;

  try {
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

  return { userId, email, name };
}

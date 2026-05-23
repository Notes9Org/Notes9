import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import { onAuthenticate, type UserContext } from "../../collaboration-server/src/auth.js";

const TEST_SECRET = "test-jwt-secret-for-unit-tests";

function createToken(
  payload: Record<string, unknown>,
  options?: jwt.SignOptions
): string {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "1h", ...options });
}

describe("onAuthenticate - JWT authentication hook", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should accept a valid token and return user context", () => {
    const token = createToken({
      sub: "user-123",
      email: "alice@example.com",
      user_metadata: { full_name: "Alice Smith" },
    });

    const result = onAuthenticate({ token });

    expect(result).toEqual<UserContext>({
      userId: "user-123",
      email: "alice@example.com",
      name: "Alice Smith",
    });
  });

  it("should fall back to user_metadata.name when full_name is missing", () => {
    const token = createToken({
      sub: "user-456",
      email: "bob@example.com",
      user_metadata: { name: "Bob Jones" },
    });

    const result = onAuthenticate({ token });

    expect(result.name).toBe("Bob Jones");
  });

  it("should fall back to email prefix when user_metadata has no name", () => {
    const token = createToken({
      sub: "user-789",
      email: "charlie@example.com",
    });

    const result = onAuthenticate({ token });

    expect(result.name).toBe("charlie");
  });

  it("should reject an expired token", () => {
    const token = createToken(
      { sub: "user-123", email: "test@example.com" },
      { expiresIn: "-1s" }
    );

    expect(() => onAuthenticate({ token })).toThrow("Token has expired");
  });

  it("should reject a token with invalid signature", () => {
    const token = jwt.sign(
      { sub: "user-123", email: "test@example.com" },
      "wrong-secret",
      { expiresIn: "1h" }
    );

    expect(() => onAuthenticate({ token })).toThrow("Invalid token");
  });

  it("should reject a malformed token", () => {
    expect(() => onAuthenticate({ token: "not-a-jwt" })).toThrow(
      "Invalid token"
    );
  });

  it("should reject an empty token", () => {
    expect(() => onAuthenticate({ token: "" })).toThrow(
      "Authentication token is required"
    );
  });

  it("should throw when JWT_SECRET is not configured", () => {
    vi.stubEnv("JWT_SECRET", "");

    const token = createToken({ sub: "user-123" });

    expect(() => onAuthenticate({ token })).toThrow(
      "JWT_SECRET environment variable is not configured"
    );
  });

  it("should reject a token missing the sub claim", () => {
    const token = createToken({ email: "test@example.com" });

    expect(() => onAuthenticate({ token })).toThrow(
      "Token payload missing user ID (sub)"
    );
  });

  it("should return empty email when email is not in the token", () => {
    const token = createToken({
      sub: "user-no-email",
      user_metadata: { full_name: "No Email User" },
    });

    const result = onAuthenticate({ token });

    expect(result.email).toBe("");
    expect(result.userId).toBe("user-no-email");
    expect(result.name).toBe("No Email User");
  });
});

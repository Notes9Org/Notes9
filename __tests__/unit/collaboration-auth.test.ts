import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import { onAuthenticate, type UserContext } from "../../collaboration-server/src/auth.js";
import { canAccessDocument } from "../../collaboration-server/src/database.js";

// SEC-002 gave onAuthenticate a second job: after the signature checks out it
// asks canAccessDocument whether this user may open this paper. That call goes
// to Supabase over the network, so it is mocked here — these tests are about
// the hook's own logic, and a suite that needs a live database to assert
// "expired token is rejected" is a suite that stops running.
vi.mock("../../collaboration-server/src/database.js", () => ({
  canAccessDocument: vi.fn(),
}));

const TEST_SECRET = "test-jwt-secret-for-unit-tests";

// Any UUID will do: canAccessDocument is mocked, and the real one's UUID check
// is its own concern. Using a well-formed one keeps the fixture honest about
// what the hook is actually handed at runtime.
const TEST_DOC = "11111111-1111-4111-8111-111111111111";

function createToken(
  payload: Record<string, unknown>,
  options?: jwt.SignOptions
): string {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "1h", ...options });
}

describe("onAuthenticate - JWT authentication hook", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    // Default to "allowed" so the token tests below exercise the token paths.
    // The authorization branch gets its own test rather than riding along here.
    vi.mocked(canAccessDocument).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("should accept a valid token and return user context", async () => {
    const token = createToken({
      sub: "user-123",
      email: "alice@example.com",
      user_metadata: { full_name: "Alice Smith" },
    });

    const result = await onAuthenticate({ token, documentName: TEST_DOC });

    expect(result).toEqual<UserContext>({
      userId: "user-123",
      email: "alice@example.com",
      name: "Alice Smith",
    });
  });

  it("should fall back to user_metadata.name when full_name is missing", async () => {
    const token = createToken({
      sub: "user-456",
      email: "bob@example.com",
      user_metadata: { name: "Bob Jones" },
    });

    const result = await onAuthenticate({ token, documentName: TEST_DOC });

    expect(result.name).toBe("Bob Jones");
  });

  it("should fall back to email prefix when user_metadata has no name", async () => {
    const token = createToken({
      sub: "user-789",
      email: "charlie@example.com",
    });

    const result = await onAuthenticate({ token, documentName: TEST_DOC });

    expect(result.name).toBe("charlie");
  });

  it("should reject an expired token", async () => {
    const token = createToken(
      { sub: "user-123", email: "test@example.com" },
      { expiresIn: "-1s" }
    );

    await expect(
      onAuthenticate({ token, documentName: TEST_DOC })
    ).rejects.toThrow("Token has expired");
  });

  it("should reject a token with invalid signature", async () => {
    const token = jwt.sign(
      { sub: "user-123", email: "test@example.com" },
      "wrong-secret",
      { expiresIn: "1h" }
    );

    await expect(
      onAuthenticate({ token, documentName: TEST_DOC })
    ).rejects.toThrow("Invalid token");
  });

  it("should reject a malformed token", async () => {
    await expect(
      onAuthenticate({ token: "not-a-jwt", documentName: TEST_DOC })
    ).rejects.toThrow("Invalid token");
  });

  it("should reject an empty token", async () => {
    await expect(
      onAuthenticate({ token: "", documentName: TEST_DOC })
    ).rejects.toThrow("Authentication token is required");
  });

  it("should throw when JWT_SECRET is not configured", async () => {
    vi.stubEnv("JWT_SECRET", "");

    const token = createToken({ sub: "user-123" });

    await expect(
      onAuthenticate({ token, documentName: TEST_DOC })
    ).rejects.toThrow("JWT_SECRET environment variable is not configured");
  });

  it("should reject a token missing the sub claim", async () => {
    const token = createToken({ email: "test@example.com" });

    await expect(
      onAuthenticate({ token, documentName: TEST_DOC })
    ).rejects.toThrow("Token payload missing user ID (sub)");
  });

  it("should return empty email when email is not in the token", async () => {
    const token = createToken({
      sub: "user-no-email",
      user_metadata: { full_name: "No Email User" },
    });

    const result = await onAuthenticate({ token, documentName: TEST_DOC });

    expect(result.email).toBe("");
    expect(result.userId).toBe("user-no-email");
    expect(result.name).toBe("No Email User");
  });

  // SEC-002 / N9-1. Before this check, a valid JWT for any user opened any
  // paper: the collaboration server uses the service-role key, so RLS never
  // runs and onAuthenticate is the only hook that sees the request before
  // database.ts reads or writes content. These three tests are the whole
  // guard, so they assert the authorization outcome, not just that a call
  // was made.
  describe("document authorization (SEC-002)", () => {
    it("rejects a valid token when the user may not access the document", async () => {
      vi.mocked(canAccessDocument).mockResolvedValue(false);

      const token = createToken({ sub: "user-123", email: "mallory@example.com" });

      await expect(
        onAuthenticate({ token, documentName: TEST_DOC })
      ).rejects.toThrow("Access to document denied");
    });

    it("checks access for the token's own subject, not a caller-supplied id", async () => {
      const token = createToken({ sub: "user-123", email: "alice@example.com" });

      await onAuthenticate({ token, documentName: TEST_DOC });

      expect(canAccessDocument).toHaveBeenCalledWith("user-123", TEST_DOC);
    });

    it("does not consult the database when the token itself is bad", async () => {
      await expect(
        onAuthenticate({ token: "not-a-jwt", documentName: TEST_DOC })
      ).rejects.toThrow("Invalid token");

      expect(canAccessDocument).not.toHaveBeenCalled();
    });
  });
});

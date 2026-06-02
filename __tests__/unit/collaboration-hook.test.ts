import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// --- Mocks ---

// Mock the HocuspocusProvider
const mockProviderDestroy = vi.fn();
const mockAwarenessGetStates = vi.fn<() => Map<number, Record<string, unknown>>>(() => new Map());
const mockAwareness = {
  clientID: 1,
  getStates: mockAwarenessGetStates,
};

let providerConstructorArgs: Record<string, unknown> | null = null;
let providerEventHandlers: Record<string, (...args: unknown[]) => void> = {};

vi.mock("@hocuspocus/provider", () => {
  return {
    HocuspocusProvider: class MockHocuspocusProvider {
      destroy: typeof mockProviderDestroy;
      awareness: typeof mockAwareness;

      constructor(opts: Record<string, unknown>) {
        this.destroy = mockProviderDestroy;
        this.awareness = mockAwareness;
        providerConstructorArgs = opts;
        providerEventHandlers = {
          onConnect: opts.onConnect as () => void,
          onDisconnect: opts.onDisconnect as () => void,
          onClose: opts.onClose as () => void,
          onAuthenticationFailed: opts.onAuthenticationFailed as (...args: unknown[]) => void,
          onAwarenessChange: opts.onAwarenessChange as () => void,
          onStatus: opts.onStatus as (...args: unknown[]) => void,
        };
      }
    },
  };
});

// Mock Y.Doc
const mockYDocDestroy = vi.fn();
vi.mock("yjs", () => {
  return {
    Doc: class MockDoc {
      destroy = mockYDocDestroy;
    },
  };
});

// Mock Supabase client
const mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: "test-jwt-token" } },
  error: null,
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
    },
  })),
}));

// Mock colors utility
vi.mock("../../lib/collaboration/colors", () => ({
  getCollaboratorColor: vi.fn((userId: string) => `#color-${userId}`),
}));

// Import hook after mocks are set up
import { useCollaboration } from "../../lib/collaboration/use-collaboration";

describe("useCollaboration hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerConstructorArgs = null;
    providerEventHandlers = {};
    vi.stubEnv("NEXT_PUBLIC_COLLABORATION_URL", "wss://collab.test.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("provider creation", () => {
    it("creates provider with correct document name (paperId) when enabled", () => {
      renderHook(() =>
        useCollaboration({ paperId: "paper-abc-123", enabled: true })
      );

      expect(providerConstructorArgs).not.toBeNull();
      expect(providerConstructorArgs!.name).toBe("paper-abc-123");
      expect(providerConstructorArgs!.url).toBe("wss://collab.test.com");
    });

    it("passes a token function to the provider for authentication", () => {
      renderHook(() =>
        useCollaboration({ paperId: "paper-xyz", enabled: true })
      );

      expect(providerConstructorArgs).not.toBeNull();
      expect(typeof providerConstructorArgs!.token).toBe("function");
    });

    it("token function returns the Supabase access token", async () => {
      renderHook(() =>
        useCollaboration({ paperId: "paper-xyz", enabled: true })
      );

      const tokenFn = providerConstructorArgs!.token as () => Promise<string>;
      const token = await tokenFn();
      expect(token).toBe("test-jwt-token");
    });
  });

  describe("disabled state", () => {
    it("returns disconnected status when enabled=false", () => {
      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: false })
      );

      expect(result.current.status).toBe("disconnected");
      expect(result.current.provider).toBeNull();
      expect(result.current.ydoc).toBeNull();
      expect(result.current.collaborators).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it("does not create a provider when enabled=false", () => {
      renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: false })
      );

      expect(providerConstructorArgs).toBeNull();
    });
  });

  describe("missing collaboration URL", () => {
    it("returns disconnected status with error when URL is not set", () => {
      vi.stubEnv("NEXT_PUBLIC_COLLABORATION_URL", "");

      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      expect(result.current.status).toBe("disconnected");
      expect(result.current.error).toBe("Collaboration URL not configured");
      expect(result.current.provider).toBeNull();
      expect(result.current.ydoc).toBeNull();
    });
  });

  describe("cleanup on unmount", () => {
    it("calls provider.destroy() and ydoc.destroy() on unmount", () => {
      const { unmount } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      unmount();

      expect(mockProviderDestroy).toHaveBeenCalledTimes(1);
      expect(mockYDocDestroy).toHaveBeenCalledTimes(1);
    });

    it("cleans up when switching from enabled to disabled", () => {
      const { rerender } = renderHook(
        (props) => useCollaboration(props),
        { initialProps: { paperId: "paper-123", enabled: true } }
      );

      rerender({ paperId: "paper-123", enabled: false });

      expect(mockProviderDestroy).toHaveBeenCalled();
      expect(mockYDocDestroy).toHaveBeenCalled();
    });
  });

  describe("status transitions", () => {
    it("starts with connecting status when enabled", () => {
      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      // The hook sets status to 'connecting' immediately when creating the provider
      expect(result.current.status).toBe("connecting");
    });

    it("transitions to connected when onConnect fires", () => {
      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      act(() => {
        providerEventHandlers.onConnect();
      });

      expect(result.current.status).toBe("connected");
      expect(result.current.error).toBeNull();
    });

    it("transitions to disconnected when onDisconnect fires", () => {
      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      act(() => {
        providerEventHandlers.onConnect();
      });
      expect(result.current.status).toBe("connected");

      act(() => {
        providerEventHandlers.onDisconnect();
      });
      expect(result.current.status).toBe("disconnected");
    });

    it("transitions based on onStatus event", () => {
      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      act(() => {
        providerEventHandlers.onStatus({ status: "connected" });
      });
      expect(result.current.status).toBe("connected");

      act(() => {
        providerEventHandlers.onStatus({ status: "connecting" });
      });
      expect(result.current.status).toBe("connecting");

      act(() => {
        providerEventHandlers.onStatus({ status: "disconnected" });
      });
      expect(result.current.status).toBe("disconnected");
    });

    it("sets error on authentication failure", () => {
      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      act(() => {
        providerEventHandlers.onAuthenticationFailed({ reason: "Token expired" });
      });

      expect(result.current.status).toBe("disconnected");
      expect(result.current.error).toBe("Authentication failed: Token expired");
    });
  });

  describe("collaborator list updates", () => {
    it("updates collaborators from awareness protocol", () => {
      const awarenessStates = new Map([
        [
          2,
          {
            user: { userId: "user-a", name: "Alice" },
            cursor: { anchor: 10, head: 15 },
          },
        ],
        [
          3,
          {
            user: { userId: "user-b", name: "Bob", color: "#FF0000" },
            cursor: null,
          },
        ],
      ]);

      mockAwarenessGetStates.mockReturnValue(awarenessStates);

      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      act(() => {
        providerEventHandlers.onAwarenessChange();
      });

      expect(result.current.collaborators).toHaveLength(2);
      expect(result.current.collaborators).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: "user-a",
            name: "Alice",
            cursor: { anchor: 10, head: 15 },
          }),
          expect.objectContaining({
            userId: "user-b",
            name: "Bob",
            color: "#FF0000",
            cursor: null,
          }),
        ])
      );
    });

    it("excludes the local client from collaborators list", () => {
      // Local client ID is 1 (set in mockAwareness.clientID)
      const awarenessStates = new Map([
        [1, { user: { userId: "local-user", name: "Me" }, cursor: null }],
        [2, { user: { userId: "remote-user", name: "Other" }, cursor: null }],
      ]);

      mockAwarenessGetStates.mockReturnValue(awarenessStates);

      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      act(() => {
        providerEventHandlers.onAwarenessChange();
      });

      expect(result.current.collaborators).toHaveLength(1);
      expect(result.current.collaborators[0].userId).toBe("remote-user");
    });

    it("skips awareness states without user info", () => {
      const awarenessStates = new Map([
        [2, { cursor: { anchor: 5, head: 5 } }], // No user field
        [3, { user: { userId: "user-c", name: "Charlie" }, cursor: null }],
      ]);

      mockAwarenessGetStates.mockReturnValue(awarenessStates);

      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      act(() => {
        providerEventHandlers.onAwarenessChange();
      });

      expect(result.current.collaborators).toHaveLength(1);
      expect(result.current.collaborators[0].name).toBe("Charlie");
    });

    it("uses getCollaboratorColor when user has no color set", () => {
      const awarenessStates = new Map([
        [2, { user: { userId: "user-no-color", name: "NoColor" }, cursor: null }],
      ]);

      mockAwarenessGetStates.mockReturnValue(awarenessStates);

      const { result } = renderHook(() =>
        useCollaboration({ paperId: "paper-123", enabled: true })
      );

      act(() => {
        providerEventHandlers.onAwarenessChange();
      });

      expect(result.current.collaborators[0].color).toBe("#color-user-no-color");
    });

    it("clears collaborators when disabled", () => {
      const awarenessStates = new Map([
        [2, { user: { userId: "user-a", name: "Alice" }, cursor: null }],
      ]);
      mockAwarenessGetStates.mockReturnValue(awarenessStates);

      const { result, rerender } = renderHook(
        (props) => useCollaboration(props),
        { initialProps: { paperId: "paper-123", enabled: true } }
      );

      act(() => {
        providerEventHandlers.onAwarenessChange();
      });
      expect(result.current.collaborators).toHaveLength(1);

      rerender({ paperId: "paper-123", enabled: false });

      expect(result.current.collaborators).toEqual([]);
    });
  });
});

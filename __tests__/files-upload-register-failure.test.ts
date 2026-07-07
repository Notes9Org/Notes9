/**
 * /api/files/upload — chat_attachments registration failure contract.
 *
 * When the insert into chat_attachments fails (e.g. RLS denial) the route
 * deletes the just-uploaded storage object; the response must then be an
 * ERROR (500), not 200 + attachmentWarning, so the client's uploadFile()
 * null-return path drops the attachment chip. If the cleanup itself fails,
 * the file still exists and the soft 200 + attachmentWarning contract holds.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/limits/guards", () => ({
  enforceLimits: vi.fn(() => null),
  checkBodyBytes: vi.fn(() => null),
}));

vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn(async () => ({ mime: "application/pdf", ext: "pdf" })),
}));

const storageRemove = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
const attachmentInsertSingle = vi.fn(
  async (): Promise<{ data: { id: string } | null; error: { message: string } | null }> => ({
    data: { id: "att-1" },
    error: null,
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "chat_attachments") throw new Error(`unexpected table ${table}`);
      return {
        insert: () => ({
          select: () => ({ single: attachmentInsertSingle }),
        }),
      };
    },
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: "https://signed.example/user/chat-attachments/test.pdf" },
          error: null,
        })),
        remove: storageRemove,
      }),
    },
  })),
}));

import { POST } from "@/app/api/files/upload/route";

function makeRequest(): Request {
  const file = {
    name: "test.pdf",
    type: "application/pdf",
    size: 1234,
    slice: () => ({ arrayBuffer: async () => new ArrayBuffer(8) }),
    arrayBuffer: async () => new ArrayBuffer(8),
  };
  const formData = {
    get: (key: string) => {
      if (key === "file") return file;
      if (key === "session_id") return "sess-1";
      return null;
    },
  };
  return { formData: async () => formData } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/files/upload — registration outcome contract", () => {
  it("returns 200 with chatAttachmentId when registration succeeds", async () => {
    const res = (await POST(makeRequest())) as unknown as {
      status: number;
      json: () => Promise<Record<string, unknown>>;
    };
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chatAttachmentId).toBe("att-1");
    expect(body.attachmentWarning).toBeNull();
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("returns 500 (not 200 + warning) when registration fails and the object was removed", async () => {
    attachmentInsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'new row violates row-level security policy for table "chat_attachments"' },
    });
    const res = (await POST(makeRequest())) as unknown as {
      status: number;
      json: () => Promise<Record<string, unknown>>;
    };
    expect(storageRemove).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/could not be registered and was removed/i);
    // No dead signed URL may leak out of the failure response.
    expect(body.url).toBeUndefined();
    expect(body.chatAttachmentId).toBeUndefined();
  });

  it("keeps the 200 + attachmentWarning soft-fail when registration fails but cleanup also fails", async () => {
    attachmentInsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "rls denial" },
    });
    storageRemove.mockResolvedValueOnce({ error: { message: "remove failed" } });
    const res = (await POST(makeRequest())) as unknown as {
      status: number;
      json: () => Promise<Record<string, unknown>>;
    };
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chatAttachmentId).toBeNull();
    expect(body.attachmentWarning).toMatch(/could not be registered for AI access/i);
    // File still exists in storage, so the signed URL remains valid and is returned.
    expect(body.url).toContain("https://");
  });
});

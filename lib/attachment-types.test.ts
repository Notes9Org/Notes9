import { describe, it, expect } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  EXTENSION_TO_MIME,
  OOXML_MIME_TYPES,
  TEXT_SNIFF_MIME_TYPES,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_ACCEPT_LIST,
  normalizeDeclaredMime,
  resolveAttachmentMime,
  isAcceptedAttachment,
  isAllowedMimeType,
} from "./attachment-types";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("normalizeDeclaredMime", () => {
  it("lowercases and strips charset params", () => {
    expect(normalizeDeclaredMime("TEXT/Plain; charset=utf-8")).toBe("text/plain");
  });
  it("handles null/undefined/empty", () => {
    expect(normalizeDeclaredMime(undefined)).toBe("");
    expect(normalizeDeclaredMime(null)).toBe("");
    expect(normalizeDeclaredMime("")).toBe("");
  });
});

describe("resolveAttachmentMime, the core 'sometimes fails' fix", () => {
  it("prefers a valid declared MIME", () => {
    expect(resolveAttachmentMime({ type: "application/pdf", name: "x.pdf" })).toBe("application/pdf");
  });

  it("recovers .docx when the browser reports a BLANK type", () => {
    // The exact real-world failure: OS reports file.type === "" for Office docs.
    expect(resolveAttachmentMime({ type: "", name: "Report.docx" })).toBe(DOCX);
  });

  it("recovers .xlsx when the browser reports application/octet-stream", () => {
    expect(resolveAttachmentMime({ type: "application/octet-stream", name: "data.XLSX" })).toBe(XLSX);
  });

  it("recovers by extension case-insensitively", () => {
    expect(resolveAttachmentMime({ type: "", name: "NOTES.MD" })).toBe("text/markdown");
    expect(resolveAttachmentMime({ type: "", name: "a.JPEG" })).toBe("image/jpeg");
  });

  it("returns null for an unsupported type with no matching extension", () => {
    expect(resolveAttachmentMime({ type: "application/x-msdownload", name: "virus.exe" })).toBeNull();
    expect(resolveAttachmentMime({ type: "", name: "archive.zip" })).toBeNull();
  });

  it("does NOT trust a bogus declared MIME but falls back to a good extension", () => {
    // Declared type is junk, but the extension is legit → resolve by extension.
    expect(resolveAttachmentMime({ type: "totally/bogus", name: "sheet.xlsx" })).toBe(XLSX);
  });
});

describe("isAcceptedAttachment", () => {
  it("accepts all supported extensions even with blank MIME", () => {
    for (const ext of Object.keys(EXTENSION_TO_MIME)) {
      expect(isAcceptedAttachment({ type: "", name: `file${ext}` })).toBe(true);
    }
  });
  it("rejects unknown files", () => {
    expect(isAcceptedAttachment({ type: "", name: "file.bin" })).toBe(false);
  });
});

describe("isAllowedMimeType (type guard used to narrow the send payload)", () => {
  it("accepts every allowed type incl. the newly-added ones", () => {
    for (const m of ["application/pdf", "text/plain", "text/markdown", "application/json"]) {
      expect(isAllowedMimeType(m)).toBe(true);
    }
  });
  it("rejects unknown types, including svg (stored-XSS vector, deliberately not allowed)", () => {
    expect(isAllowedMimeType("application/zip")).toBe(false);
    expect(isAllowedMimeType("image/svg+xml")).toBe(false);
    expect(isAllowedMimeType("")).toBe(false);
  });
});

describe("allow-list invariants (keeps the 4 layers consistent)", () => {
  it("every EXTENSION_TO_MIME target is in ALLOWED_MIME_TYPES", () => {
    for (const mime of Object.values(EXTENSION_TO_MIME)) {
      expect(ALLOWED_MIME_TYPES).toContain(mime);
    }
  });
  it("OOXML and TEXT_SNIFF sets are subsets of ALLOWED_MIME_TYPES", () => {
    for (const m of [...OOXML_MIME_TYPES, ...TEXT_SNIFF_MIME_TYPES]) {
      expect(ALLOWED_MIME_TYPES).toContain(m);
    }
  });
  it("OOXML and TEXT_SNIFF are disjoint (a type can't be both sniff strategies)", () => {
    for (const m of OOXML_MIME_TYPES) {
      expect(TEXT_SNIFF_MIME_TYPES).not.toContain(m);
    }
  });
  it("the full user-facing coverage set is present", () => {
    for (const m of [
      "application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp",
      "text/csv", "text/plain", "text/markdown",
      "application/json", XLSX, DOCX,
    ]) {
      expect(ALLOWED_MIME_TYPES).toContain(m);
    }
  });
  it("does NOT include svg (stored-XSS vector, deliberately not allowed)", () => {
    expect(ALLOWED_MIME_TYPES).not.toContain("image/svg+xml");
  });
  it("ATTACHMENT_ACCEPT contains both MIME types and extension tokens", () => {
    expect(ATTACHMENT_ACCEPT).toContain("application/pdf");
    expect(ATTACHMENT_ACCEPT).toContain(".docx");
    expect(ATTACHMENT_ACCEPT_LIST).toContain(".xlsx");
    expect(ATTACHMENT_ACCEPT_LIST).toContain("image/png");
  });
});

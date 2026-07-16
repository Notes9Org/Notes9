/**
 * NCBI PMC "cloudpmc-viewer" proof-of-work solver.
 *
 * pmc.ncbi.nlm.nih.gov gates article PDFs behind a JS proof-of-work: the client
 * must find a nonce whose sha256(challenge + nonce) hex digest starts with
 * `difficulty` zero characters, then present it in the cloudpmc-viewer-pow cookie.
 * These tests lock the solver contract (deterministic, no network).
 */
import { createHash } from "crypto";
import { describe, it, expect } from "vitest";

import { solvePmcPow } from "../lib/literature-pdf-import";

describe("solvePmcPow", () => {
  it("returns a nonce whose sha256(challenge+nonce) has `difficulty` leading zeros", () => {
    const challenge = "VwR3BQDkAGp3AwNhAmR0ZwHkBPV:abcdef";
    for (const difficulty of [1, 2, 3, 4]) {
      const nonce = solvePmcPow(challenge, difficulty);
      const hex = createHash("sha256").update(challenge + nonce).digest("hex");
      expect(hex.startsWith("0".repeat(difficulty))).toBe(true);
    }
  });

  it("returns the SMALLEST such nonce (no earlier nonce also clears the target)", () => {
    const challenge = "test-challenge-42";
    const difficulty = 3;
    const nonce = solvePmcPow(challenge, difficulty);
    const target = "0".repeat(difficulty);
    for (let n = 0; n < nonce; n++) {
      const hex = createHash("sha256").update(challenge + n).digest("hex");
      expect(hex.startsWith(target)).toBe(false);
    }
  });
});

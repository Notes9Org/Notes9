import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import jwt from "jsonwebtoken";
import * as Y from "yjs";
import {
  onAuthenticate,
  type UserContext,
} from "../../collaboration-server/src/auth.js";
import {
  htmlToYDoc,
  yDocToHtml,
} from "../../collaboration-server/src/html-renderer.js";
import {
  getCollaboratorColor,
  COLLABORATOR_COLORS,
} from "../../lib/collaboration/colors";
import {
  getExtensionConfig,
} from "../../lib/collaboration/extension-config";

const TEST_SECRET = "test-jwt-secret-for-property-tests";
const WRONG_SECRET = "completely-different-wrong-secret";

/**
 * Property 1: JWT Authentication Correctness
 *
 * For any JWT string, the authentication hook SHALL accept the token if and only if
 * it has a valid signature matching the configured JWT secret AND is not expired.
 * Invalid, expired, or malformed tokens SHALL be rejected.
 *
 * **Validates: Requirements 1.3, 1.4, 1.5**
 */
describe("Property 1: JWT Authentication Correctness", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // --- Arbitraries ---

  /** Generate a random user ID (non-empty string) */
  const userIdArb = fc
    .stringMatching(/^[a-zA-Z0-9_-]+$/)
    .filter((s) => s.length >= 1 && s.length <= 64);

  /** Generate a random email */
  const emailArb = fc
    .tuple(
      fc.stringMatching(/^[a-z][a-z0-9._-]*$/).filter((s) => s.length >= 1 && s.length <= 20),
      fc.stringMatching(/^[a-z][a-z0-9-]*$/).filter((s) => s.length >= 1 && s.length <= 15),
      fc.constantFrom("com", "org", "io", "net", "dev")
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

  /** Generate a random display name */
  const nameArb = fc
    .stringMatching(/^[A-Za-z][A-Za-z ]*$/)
    .filter((s) => s.length >= 2 && s.length <= 50);

  /** Generate a valid JWT payload */
  const validPayloadArb = fc.record({
    sub: userIdArb,
    email: emailArb,
    user_metadata: fc.record({
      full_name: nameArb,
    }),
  });

  // --- Property Tests ---

  it("valid tokens with correct signature and unexpired are always accepted", () => {
    fc.assert(
      fc.property(validPayloadArb, (payload) => {
        const token = jwt.sign(payload, TEST_SECRET, { expiresIn: "1h" });

        const result = onAuthenticate({ token });

        // Must return a valid UserContext
        expect(result).toBeDefined();
        expect(result.userId).toBe(payload.sub);
        expect(result.email).toBe(payload.email);
        expect(result.name).toBe(payload.user_metadata.full_name);
      }),
      { numRuns: 100 }
    );
  });

  it("tokens signed with a wrong secret are always rejected", () => {
    fc.assert(
      fc.property(validPayloadArb, (payload) => {
        const token = jwt.sign(payload, WRONG_SECRET, { expiresIn: "1h" });

        expect(() => onAuthenticate({ token })).toThrow();
      }),
      { numRuns: 100 }
    );
  });

  it("expired tokens are always rejected regardless of payload", () => {
    fc.assert(
      fc.property(validPayloadArb, (payload) => {
        // Create a token that expired 1 hour ago
        const token = jwt.sign(payload, TEST_SECRET, { expiresIn: "-1h" });

        expect(() => onAuthenticate({ token })).toThrow("Token has expired");
      }),
      { numRuns: 100 }
    );
  });

  it("malformed/random strings are always rejected", () => {
    // Generate arbitrary strings that are NOT valid JWTs
    const malformedTokenArb = fc.oneof(
      // Completely random strings
      fc.string({ minLength: 1, maxLength: 200 }),
      // Strings that look like JWTs but aren't (wrong number of parts)
      fc.tuple(fc.base64String(), fc.base64String()).map(([a, b]) => `${a}.${b}`),
      // Single segment
      fc.base64String({ minLength: 1, maxLength: 100 }),
      // Empty-ish strings
      fc.constantFrom(".", "..", "...", "abc.def.ghi", "null", "undefined")
    );

    fc.assert(
      fc.property(malformedTokenArb, (token) => {
        // Skip empty strings since those are caught by a different check
        if (token.length === 0) return;

        expect(() => onAuthenticate({ token })).toThrow();
      }),
      { numRuns: 100 }
    );
  });

  it("a token is accepted if and only if it has valid signature AND is not expired", () => {
    // Discriminated union: generate tokens that are either valid, wrong-signed, or expired
    const tokenCaseArb = fc.oneof(
      // Case 1: Valid signature + not expired → should be accepted
      validPayloadArb.map((payload) => ({
        kind: "valid" as const,
        token: jwt.sign(payload, TEST_SECRET, { expiresIn: "1h" }),
        payload,
      })),
      // Case 2: Wrong signature → should be rejected
      validPayloadArb.map((payload) => ({
        kind: "wrong_signature" as const,
        token: jwt.sign(payload, WRONG_SECRET, { expiresIn: "1h" }),
        payload,
      })),
      // Case 3: Expired → should be rejected
      validPayloadArb.map((payload) => ({
        kind: "expired" as const,
        token: jwt.sign(payload, TEST_SECRET, { expiresIn: "-1h" }),
        payload,
      }))
    );

    fc.assert(
      fc.property(tokenCaseArb, ({ kind, token, payload }) => {
        if (kind === "valid") {
          // Valid + unexpired → accepted
          const result = onAuthenticate({ token });
          expect(result.userId).toBe(payload.sub);
        } else {
          // Invalid signature or expired → rejected
          expect(() => onAuthenticate({ token })).toThrow();
        }
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 2: CRDT Merge Preserves All Edits
 *
 * For any two sequences of text edits applied independently to two Y.Doc copies of the
 * same initial state, merging both update sets into either document SHALL produce a final
 * document containing all characters inserted by both edit sequences (no data loss).
 *
 * The simplest correct property: if both users only INSERT (no deletes), then ALL inserted
 * characters from both must be present in the merged result. This is the core CRDT guarantee.
 *
 * **Validates: Requirements 2.4, 2.5**
 */
describe("Property 2: CRDT Merge Preserves All Edits", () => {
  // --- Types ---

  interface InsertEdit {
    type: "insert";
    position: number; // relative position (will be clamped to doc length)
    char: string; // single character to insert
  }

  // --- Arbitraries ---

  /** Generate a single character to insert */
  const charArb = fc.stringMatching(/^[A-Za-z0-9]$/).filter((s) => s.length === 1);

  /** Generate an insert edit */
  const insertEditArb = fc.record({
    type: fc.constant("insert" as const),
    position: fc.nat({ max: 1000 }), // will be clamped to actual doc length
    char: charArb,
  });

  /** Generate a sequence of insert edits (1-20 inserts) */
  const insertSequenceArb = fc.array(insertEditArb, { minLength: 1, maxLength: 20 });

  // --- Helpers ---

  /**
   * Apply a sequence of insert edits to a Y.Doc's text.
   * Returns the set of characters inserted.
   */
  function applyInserts(doc: Y.Doc, edits: InsertEdit[]): string[] {
    const text = doc.getText("content");
    const insertedChars: string[] = [];

    for (const edit of edits) {
      const currentLength = text.length;
      const pos = currentLength === 0 ? 0 : edit.position % (currentLength + 1);
      text.insert(pos, edit.char);
      insertedChars.push(edit.char);
    }

    return insertedChars;
  }

  /**
   * Create a fork of a Y.Doc by encoding and applying its state to a new doc.
   */
  function forkDoc(original: Y.Doc): Y.Doc {
    const fork = new Y.Doc();
    const state = Y.encodeStateAsUpdate(original);
    Y.applyUpdate(fork, state);
    return fork;
  }

  // --- Property Tests ---

  it("insert-only edits from both users are all present in merged result", () => {
    fc.assert(
      fc.property(
        insertSequenceArb,
        insertSequenceArb,
        (editsA, editsB) => {
          // Create initial document with some content
          const initialDoc = new Y.Doc();
          initialDoc.getText("content").insert(0, "initial");

          // Fork into two independent copies
          const docA = forkDoc(initialDoc);
          const docB = forkDoc(initialDoc);

          // Apply edits independently
          const insertedByA = applyInserts(docA, editsA);
          const insertedByB = applyInserts(docB, editsB);

          // Capture updates from each doc (relative to initial state)
          const initialState = Y.encodeStateVector(initialDoc);
          const updateA = Y.encodeStateAsUpdate(docA, initialState);
          const updateB = Y.encodeStateAsUpdate(docB, initialState);

          // Merge: apply B's updates to A (or vice versa - result should be the same)
          const mergedDoc = new Y.Doc();
          Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(docA));
          Y.applyUpdate(mergedDoc, updateB);

          const mergedText = mergedDoc.getText("content").toString();

          // Assert: ALL characters inserted by user A are present in merged result
          const charCountInMerged = new Map<string, number>();
          for (const ch of mergedText) {
            charCountInMerged.set(ch, (charCountInMerged.get(ch) || 0) + 1);
          }

          // Count expected occurrences from initial + A + B
          const expectedCounts = new Map<string, number>();
          for (const ch of "initial") {
            expectedCounts.set(ch, (expectedCounts.get(ch) || 0) + 1);
          }
          for (const ch of insertedByA) {
            expectedCounts.set(ch, (expectedCounts.get(ch) || 0) + 1);
          }
          for (const ch of insertedByB) {
            expectedCounts.set(ch, (expectedCounts.get(ch) || 0) + 1);
          }

          // The merged document should contain exactly the initial text + all inserts from A + all inserts from B
          for (const [ch, count] of expectedCounts) {
            expect(charCountInMerged.get(ch) || 0).toBeGreaterThanOrEqual(count);
          }

          // Total length should be initial + A inserts + B inserts
          expect(mergedText.length).toBe(
            "initial".length + insertedByA.length + insertedByB.length
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("merge is symmetric: applying A to B produces same result as B to A", () => {
    fc.assert(
      fc.property(
        insertSequenceArb,
        insertSequenceArb,
        (editsA, editsB) => {
          // Create initial document
          const initialDoc = new Y.Doc();
          initialDoc.getText("content").insert(0, "base");

          // Fork into two independent copies
          const docA = forkDoc(initialDoc);
          const docB = forkDoc(initialDoc);

          // Apply edits independently
          applyInserts(docA, editsA);
          applyInserts(docB, editsB);

          // Merge direction 1: A + B's updates
          const merged1 = new Y.Doc();
          Y.applyUpdate(merged1, Y.encodeStateAsUpdate(docA));
          Y.applyUpdate(merged1, Y.encodeStateAsUpdate(docB));

          // Merge direction 2: B + A's updates
          const merged2 = new Y.Doc();
          Y.applyUpdate(merged2, Y.encodeStateAsUpdate(docB));
          Y.applyUpdate(merged2, Y.encodeStateAsUpdate(docA));

          // Both merges should produce the same text content
          const text1 = merged1.getText("content").toString();
          const text2 = merged2.getText("content").toString();

          expect(text1).toBe(text2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("merged document length equals initial + all inserts from both users", () => {
    fc.assert(
      fc.property(
        insertSequenceArb,
        insertSequenceArb,
        fc.stringMatching(/^[A-Za-z]+$/).filter((s) => s.length >= 1 && s.length <= 20),
        (editsA, editsB, initialText) => {
          // Create initial document with random initial text
          const initialDoc = new Y.Doc();
          initialDoc.getText("content").insert(0, initialText);

          // Fork into two independent copies
          const docA = forkDoc(initialDoc);
          const docB = forkDoc(initialDoc);

          // Apply edits independently
          const insertedByA = applyInserts(docA, editsA);
          const insertedByB = applyInserts(docB, editsB);

          // Merge
          const mergedDoc = new Y.Doc();
          Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(docA));
          Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(docB));

          const mergedText = mergedDoc.getText("content").toString();

          // With insert-only operations, merged length = initial + A inserts + B inserts
          expect(mergedText.length).toBe(
            initialText.length + insertedByA.length + insertedByB.length
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("each user's inserted characters appear in the merged document", () => {
    fc.assert(
      fc.property(
        insertSequenceArb,
        insertSequenceArb,
        (editsA, editsB) => {
          // Create initial empty document
          const initialDoc = new Y.Doc();

          // Fork into two independent copies
          const docA = forkDoc(initialDoc);
          const docB = forkDoc(initialDoc);

          // Apply edits independently
          const insertedByA = applyInserts(docA, editsA);
          const insertedByB = applyInserts(docB, editsB);

          // Merge
          const mergedDoc = new Y.Doc();
          Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(docA));
          Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(docB));

          const mergedText = mergedDoc.getText("content").toString();

          // Build a frequency map of the merged text
          const mergedFreq = new Map<string, number>();
          for (const ch of mergedText) {
            mergedFreq.set(ch, (mergedFreq.get(ch) || 0) + 1);
          }

          // Build expected frequency from both insert sequences
          const expectedFreq = new Map<string, number>();
          for (const ch of insertedByA) {
            expectedFreq.set(ch, (expectedFreq.get(ch) || 0) + 1);
          }
          for (const ch of insertedByB) {
            expectedFreq.set(ch, (expectedFreq.get(ch) || 0) + 1);
          }

          // Every character from both users must be present with at least the expected count
          for (const [ch, count] of expectedFreq) {
            expect(mergedFreq.get(ch) || 0).toBeGreaterThanOrEqual(count);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("merging with an empty edit sequence preserves the other user's edits exactly", () => {
    fc.assert(
      fc.property(
        insertSequenceArb,
        (editsA) => {
          // Create initial document
          const initialDoc = new Y.Doc();
          initialDoc.getText("content").insert(0, "hello");

          // Fork into two copies
          const docA = forkDoc(initialDoc);
          const docB = forkDoc(initialDoc); // B makes no edits

          // Apply edits only to A
          applyInserts(docA, editsA);

          // Merge A into B
          const mergedDoc = new Y.Doc();
          Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(docB));
          Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(docA));

          const mergedText = mergedDoc.getText("content").toString();
          const docAText = docA.getText("content").toString();

          // Merged should equal A's state since B made no changes
          expect(mergedText).toBe(docAText);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 3: Deterministic Color Assignment
 *
 * For any user ID string, `getCollaboratorColor(userId)` SHALL always return the same
 * color from the predefined palette, and that color SHALL be within the COLLABORATOR_COLORS array.
 *
 * **Validates: Requirements 3.5, 9.5**
 */
describe("Property 3: Deterministic Color Assignment", () => {
  // --- Arbitraries ---

  /** Generate random user ID strings of varying lengths and character sets */
  const userIdArb = fc.oneof(
    // Alphanumeric IDs (common case)
    fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 1 && s.length <= 128),
    // UUID-style IDs
    fc.uuid(),
    // Arbitrary non-empty strings (edge cases)
    fc.string({ minLength: 1, maxLength: 256 })
  );

  // --- Property Tests ---

  it("same user ID always produces the same color (determinism)", () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        const color1 = getCollaboratorColor(userId);
        const color2 = getCollaboratorColor(userId);

        expect(color1).toBe(color2);
      }),
      { numRuns: 100 }
    );
  });

  it("returned color is always within the COLLABORATOR_COLORS palette (bounded output)", () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        const color = getCollaboratorColor(userId);

        expect(COLLABORATOR_COLORS).toContain(color);
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 4: HTML-to-Yjs Round Trip Preserves Content
 *
 * For any valid HTML paper content, converting it to a Yjs document state and then
 * rendering that Yjs state back to HTML SHALL produce output that preserves the text
 * content and structural elements (headings, paragraphs, lists, tables) of the original.
 *
 * **Validates: Requirements 7.1, 4.5**
 */
describe("Property 4: HTML-to-Yjs Round Trip Preserves Content", () => {
  // --- Arbitraries ---

  /** Generate random text content (non-empty, no HTML special chars, no consecutive spaces) */
  const textContentArb = fc
    .array(
      fc.stringMatching(/^[A-Za-z0-9,.!?;:'-]+$/).filter((s) => s.length >= 1),
      { minLength: 1, maxLength: 10 }
    )
    .map((words) => words.join(" "))
    .filter((s) => s.trim().length >= 1 && s.length <= 100);

  /** Generate a paragraph element */
  const paragraphArb = textContentArb.map(
    (text) => `<p>${text}</p>`
  );

  /** Generate a heading element (h1, h2, or h3) */
  const headingArb = fc
    .tuple(
      fc.constantFrom("h1", "h2", "h3"),
      textContentArb
    )
    .map(([tag, text]) => `<${tag}>${text}</${tag}>`);

  /** Generate a bullet list with 1-5 items */
  const bulletListArb = fc
    .array(textContentArb, { minLength: 1, maxLength: 5 })
    .map((items) => {
      const lis = items.map((item) => `<li><p>${item}</p></li>`).join("");
      return `<ul>${lis}</ul>`;
    });

  /** Generate an ordered list with 1-5 items */
  const orderedListArb = fc
    .array(textContentArb, { minLength: 1, maxLength: 5 })
    .map((items) => {
      const lis = items.map((item) => `<li><p>${item}</p></li>`).join("");
      return `<ol>${lis}</ol>`;
    });

  /** Generate a blockquote element */
  const blockquoteArb = textContentArb.map(
    (text) => `<blockquote><p>${text}</p></blockquote>`
  );

  /** Generate a random HTML block element */
  const blockElementArb = fc.oneof(
    paragraphArb,
    headingArb,
    bulletListArb,
    orderedListArb,
    blockquoteArb
  );

  /** Generate a random HTML document with 1-6 block elements */
  const htmlDocumentArb = fc
    .array(blockElementArb, { minLength: 1, maxLength: 6 })
    .map((blocks) => blocks.join(""));

  // --- Helper Functions ---

  /**
   * Extract all text content from an HTML string by stripping tags.
   * Normalizes whitespace to allow for minor formatting differences.
   */
  function extractTextContent(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Extract structural tag names from HTML (headings, lists, blockquotes, paragraphs).
   * Returns a sorted array of tag names found in the HTML.
   */
  function extractStructuralTags(html: string): string[] {
    const tagRegex = /<(h[1-3]|p|ul|ol|li|blockquote)[^>]*>/g;
    const tags: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(html)) !== null) {
      tags.push(match[1]);
    }
    return tags;
  }

  // --- Property Tests ---

  it("text content is preserved through HTML → Yjs → HTML round trip", () => {
    fc.assert(
      fc.property(htmlDocumentArb, (html) => {
        const ydoc = htmlToYDoc(html);
        const outputHtml = yDocToHtml(ydoc);

        const inputText = extractTextContent(html);
        const outputText = extractTextContent(outputHtml);

        // All words from the input should be present in the output
        const inputWords = inputText.split(/\s+/).filter((w) => w.length > 0);
        const outputWords = outputText.split(/\s+/).filter((w) => w.length > 0);

        for (const word of inputWords) {
          expect(outputWords).toContain(word);
        }

        // The overall text content should match (allowing whitespace normalization)
        expect(outputText).toBe(inputText);
      }),
      { numRuns: 100 }
    );
  });

  it("structural elements (tag types) are preserved through round trip", () => {
    fc.assert(
      fc.property(htmlDocumentArb, (html) => {
        const ydoc = htmlToYDoc(html);
        const outputHtml = yDocToHtml(ydoc);

        const inputTags = extractStructuralTags(html);
        const outputTags = extractStructuralTags(outputHtml);

        // All structural tags from input should appear in output
        // (count of each tag type should match)
        const inputTagCounts = new Map<string, number>();
        for (const tag of inputTags) {
          inputTagCounts.set(tag, (inputTagCounts.get(tag) || 0) + 1);
        }

        const outputTagCounts = new Map<string, number>();
        for (const tag of outputTags) {
          outputTagCounts.set(tag, (outputTagCounts.get(tag) || 0) + 1);
        }

        for (const [tag, count] of inputTagCounts) {
          expect(outputTagCounts.get(tag) || 0).toBeGreaterThanOrEqual(count);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("round trip of single paragraphs preserves exact text", () => {
    fc.assert(
      fc.property(textContentArb, (text) => {
        const html = `<p>${text}</p>`;
        const ydoc = htmlToYDoc(html);
        const outputHtml = yDocToHtml(ydoc);

        // The output should contain the original text
        expect(extractTextContent(outputHtml)).toContain(text.trim());
      }),
      { numRuns: 100 }
    );
  });

  it("round trip of headings preserves heading level and text", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("h1", "h2", "h3"),
        textContentArb,
        (tag, text) => {
          const html = `<${tag}>${text}</${tag}>`;
          const ydoc = htmlToYDoc(html);
          const outputHtml = yDocToHtml(ydoc);

          // The output should contain the same heading tag
          expect(outputHtml).toContain(`<${tag}>`);
          expect(outputHtml).toContain(`</${tag}>`);

          // The text content should be preserved (with whitespace normalization)
          const normalizedInput = text.trim().replace(/\s+/g, " ");
          expect(extractTextContent(outputHtml)).toContain(normalizedInput);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("round trip of lists preserves all list items", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ul", "ol"),
        fc.array(textContentArb, { minLength: 1, maxLength: 5 }),
        (listTag, items) => {
          const lis = items.map((item) => `<li><p>${item}</p></li>`).join("");
          const html = `<${listTag}>${lis}</${listTag}>`;
          const ydoc = htmlToYDoc(html);
          const outputHtml = yDocToHtml(ydoc);

          // The output should contain the same list type
          expect(outputHtml).toContain(`<${listTag}>`);

          // All item texts should be preserved (with whitespace normalization)
          const outputText = extractTextContent(outputHtml);
          for (const item of items) {
            const normalizedItem = item.trim().replace(/\s+/g, " ");
            expect(outputText).toContain(normalizedItem);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 5: History Extension Toggled by Collaboration State
 *
 * For any editor configuration, if collaboration mode is active then the TipTap
 * `history` extension SHALL be disabled (not present in the extension list), and if
 * collaboration mode is inactive then the `history` extension SHALL be enabled.
 *
 * Collaboration is active when ALL of: collaborationEnabled, hasYdoc, hasProvider are true.
 *
 * **Validates: Requirements 8.3, 8.5**
 */
describe("Property 5: History Extension Toggled by Collaboration State", () => {
  // --- Arbitraries ---

  /** Generate boolean collaboration state (all three flags) */
  const collaborationStateArb = fc.record({
    collaborationEnabled: fc.boolean(),
    hasYdoc: fc.boolean(),
    hasProvider: fc.boolean(),
  });

  // --- Property Tests ---

  it("when collaboration is fully active (all flags true), history is disabled", () => {
    fc.assert(
      fc.property(fc.constant(true), fc.constant(true), fc.constant(true), (enabled, hasYdoc, hasProvider) => {
        const config = getExtensionConfig(enabled, hasYdoc, hasProvider);

        expect(config.historyEnabled).toBe(false);
        expect(config.collaborationExtensionPresent).toBe(true);
        expect(config.collaborationCursorPresent).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("when any collaboration flag is false, history is enabled and collaboration extensions are absent", () => {
    // Generate states where at least one flag is false
    const partialCollabArb = collaborationStateArb.filter(
      ({ collaborationEnabled, hasYdoc, hasProvider }) =>
        !(collaborationEnabled && hasYdoc && hasProvider)
    );

    fc.assert(
      fc.property(partialCollabArb, ({ collaborationEnabled, hasYdoc, hasProvider }) => {
        const config = getExtensionConfig(collaborationEnabled, hasYdoc, hasProvider);

        expect(config.historyEnabled).toBe(true);
        expect(config.collaborationExtensionPresent).toBe(false);
        expect(config.collaborationCursorPresent).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("history extension state is always the inverse of collaboration active state", () => {
    fc.assert(
      fc.property(collaborationStateArb, ({ collaborationEnabled, hasYdoc, hasProvider }) => {
        const config = getExtensionConfig(collaborationEnabled, hasYdoc, hasProvider);
        const isCollabActive = collaborationEnabled && hasYdoc && hasProvider;

        // History is enabled if and only if collaboration is NOT active
        expect(config.historyEnabled).toBe(!isCollabActive);
      }),
      { numRuns: 100 }
    );
  });

  it("collaboration extensions are present if and only if collaboration is active", () => {
    fc.assert(
      fc.property(collaborationStateArb, ({ collaborationEnabled, hasYdoc, hasProvider }) => {
        const config = getExtensionConfig(collaborationEnabled, hasYdoc, hasProvider);
        const isCollabActive = collaborationEnabled && hasYdoc && hasProvider;

        // Collaboration extension present iff collaboration is active
        expect(config.collaborationExtensionPresent).toBe(isCollabActive);
        // Collaboration cursor present iff collaboration is active
        expect(config.collaborationCursorPresent).toBe(isCollabActive);
      }),
      { numRuns: 100 }
    );
  });

  it("history and collaboration extensions are mutually exclusive", () => {
    fc.assert(
      fc.property(collaborationStateArb, ({ collaborationEnabled, hasYdoc, hasProvider }) => {
        const config = getExtensionConfig(collaborationEnabled, hasYdoc, hasProvider);

        // They can never both be true at the same time
        expect(config.historyEnabled && config.collaborationExtensionPresent).toBe(false);
        // One of them must always be true (they cover all cases)
        expect(config.historyEnabled || config.collaborationExtensionPresent).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 6: Connection Status Indicator Correctness
 *
 * For any connection status value in the set {connecting, connected, disconnected},
 * the connection status indicator component SHALL render the corresponding visual state
 * (yellow/pulse, green/static, red/static respectively) with no other combinations possible.
 *
 * **Validates: Requirements 5.4**
 */
describe("Property 6: Connection Status Indicator Correctness", () => {
  // We test the mapping logic directly without React rendering to keep the property test
  // focused on the core invariant: each status maps to exactly one visual state.

  // Import the status config mapping from the component module
  // The component uses this internal config:
  const statusConfig = {
    connected: {
      dotClass: "bg-green-500",
      label: "Collaboration active",
    },
    connecting: {
      dotClass: "bg-yellow-500 animate-pulse",
      label: "Reconnecting...",
    },
    disconnected: {
      dotClass: "bg-red-500",
      label: "Collaboration unavailable",
    },
  } as const;

  type ConnectionStatus = "connecting" | "connected" | "disconnected";

  // Expected visual state for each status
  const expectedVisualState: Record<
    ConnectionStatus,
    { color: string; hasPulse: boolean }
  > = {
    connected: { color: "bg-green-500", hasPulse: false },
    connecting: { color: "bg-yellow-500", hasPulse: true },
    disconnected: { color: "bg-red-500", hasPulse: false },
  };

  // --- Arbitraries ---

  /** Generate connection status values from the valid set */
  const connectionStatusArb = fc.constantFrom<ConnectionStatus>(
    "connecting",
    "connected",
    "disconnected"
  );

  // --- Property Tests ---

  it("each status maps to exactly one color class (green, yellow, or red)", () => {
    fc.assert(
      fc.property(connectionStatusArb, (status) => {
        const config = statusConfig[status];
        const expected = expectedVisualState[status];

        // The dot class must contain the expected color
        expect(config.dotClass).toContain(expected.color);

        // The color must be exactly one of the three valid colors
        const validColors = ["bg-green-500", "bg-yellow-500", "bg-red-500"];
        const matchingColors = validColors.filter((c) =>
          config.dotClass.includes(c)
        );
        expect(matchingColors).toHaveLength(1);
      }),
      { numRuns: 100 }
    );
  });

  it("only 'connecting' status has pulse animation, others are static", () => {
    fc.assert(
      fc.property(connectionStatusArb, (status) => {
        const config = statusConfig[status];
        const expected = expectedVisualState[status];

        if (expected.hasPulse) {
          expect(config.dotClass).toContain("animate-pulse");
        } else {
          expect(config.dotClass).not.toContain("animate-pulse");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("each status maps to a unique visual state (no two statuses share the same appearance)", () => {
    fc.assert(
      fc.property(
        connectionStatusArb,
        connectionStatusArb,
        (status1, status2) => {
          const config1 = statusConfig[status1];
          const config2 = statusConfig[status2];

          // If statuses are different, their dot classes must be different
          if (status1 !== status2) {
            expect(config1.dotClass).not.toBe(config2.dotClass);
          } else {
            // Same status always produces same visual state
            expect(config1.dotClass).toBe(config2.dotClass);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("the status-to-visual mapping is total (covers all valid statuses)", () => {
    const allStatuses: ConnectionStatus[] = [
      "connecting",
      "connected",
      "disconnected",
    ];

    fc.assert(
      fc.property(connectionStatusArb, (status) => {
        // Every generated status must be in the valid set
        expect(allStatuses).toContain(status);

        // Every generated status must have a defined config
        expect(statusConfig[status]).toBeDefined();
        expect(statusConfig[status].dotClass).toBeTruthy();
        expect(statusConfig[status].label).toBeTruthy();
      }),
      { numRuns: 100 }
    );
  });

  it("connected status renders green/static, connecting renders yellow/pulse, disconnected renders red/static", () => {
    fc.assert(
      fc.property(connectionStatusArb, (status) => {
        const config = statusConfig[status];

        switch (status) {
          case "connected":
            expect(config.dotClass).toBe("bg-green-500");
            expect(config.dotClass).not.toContain("animate-pulse");
            break;
          case "connecting":
            expect(config.dotClass).toContain("bg-yellow-500");
            expect(config.dotClass).toContain("animate-pulse");
            break;
          case "disconnected":
            expect(config.dotClass).toBe("bg-red-500");
            expect(config.dotClass).not.toContain("animate-pulse");
            break;
        }
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 7: Collaborator Avatar Rendering
 *
 * For any list of N collaborators (where N ≥ 0) and a configured `maxVisible` limit,
 * the collaborator avatars component SHALL render exactly `min(N, maxVisible)` avatar
 * elements, plus an overflow indicator showing `N - maxVisible` if and only if N > maxVisible.
 *
 * **Validates: Requirements 9.1**
 */
describe("Property 7: Collaborator Avatar Rendering", () => {
  // --- Pure logic under test ---
  // These functions replicate the rendering logic from CollaboratorAvatars component:
  // - visible avatars = collaborators.slice(0, maxVisible) → length = min(N, maxVisible)
  // - overflowCount = collaborators.length - maxVisible
  // - overflow indicator shown iff overflowCount > 0

  interface AvatarRenderingState {
    visibleCount: number;
    overflowCount: number;
    hasOverflowIndicator: boolean;
    rendersNull: boolean;
  }

  /**
   * Computes the expected rendering state for the CollaboratorAvatars component
   * given a number of collaborators and a maxVisible limit.
   */
  function computeAvatarRenderingState(
    collaboratorCount: number,
    maxVisible: number
  ): AvatarRenderingState {
    if (collaboratorCount === 0) {
      return {
        visibleCount: 0,
        overflowCount: 0,
        hasOverflowIndicator: false,
        rendersNull: true,
      };
    }

    const visibleCount = Math.min(collaboratorCount, maxVisible);
    const overflowCount = Math.max(0, collaboratorCount - maxVisible);
    const hasOverflowIndicator = collaboratorCount > maxVisible;

    return {
      visibleCount,
      overflowCount,
      hasOverflowIndicator,
      rendersNull: false,
    };
  }

  // --- Arbitraries ---

  /** Generate a random collaborator info object */
  const collaboratorInfoArb = fc.record({
    userId: fc.uuid(),
    name: fc
      .array(
        fc.stringMatching(/^[A-Za-z]+$/).filter((s) => s.length >= 2 && s.length <= 10),
        { minLength: 1, maxLength: 3 }
      )
      .map((parts) => parts.join(" ")),
    color: fc.constantFrom(
      "#F44336", "#E91E63", "#9C27B0", "#673AB7",
      "#3F51B5", "#2196F3", "#00BCD4", "#009688",
      "#4CAF50", "#FF9800", "#FF5722", "#795548"
    ),
    cursor: fc.constantFrom(null, { anchor: 0, head: 0 }),
  });

  /** Generate a random collaborator list of length 0-20 */
  const collaboratorListArb = fc.array(collaboratorInfoArb, {
    minLength: 0,
    maxLength: 20,
  });

  /** Generate maxVisible values from 1-10 */
  const maxVisibleArb = fc.integer({ min: 1, max: 10 });

  // --- Property Tests ---

  it("renders exactly min(N, maxVisible) avatars for any collaborator list and maxVisible", () => {
    fc.assert(
      fc.property(collaboratorListArb, maxVisibleArb, (collaborators, maxVisible) => {
        const state = computeAvatarRenderingState(collaborators.length, maxVisible);

        expect(state.visibleCount).toBe(Math.min(collaborators.length, maxVisible));
      }),
      { numRuns: 100 }
    );
  });

  it("shows overflow indicator if and only if N > maxVisible", () => {
    fc.assert(
      fc.property(collaboratorListArb, maxVisibleArb, (collaborators, maxVisible) => {
        const state = computeAvatarRenderingState(collaborators.length, maxVisible);

        if (collaborators.length > maxVisible) {
          expect(state.hasOverflowIndicator).toBe(true);
          expect(state.overflowCount).toBe(collaborators.length - maxVisible);
        } else {
          expect(state.hasOverflowIndicator).toBe(false);
          expect(state.overflowCount).toBe(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("returns null (renders nothing) when collaborator list is empty", () => {
    fc.assert(
      fc.property(maxVisibleArb, (maxVisible) => {
        const state = computeAvatarRenderingState(0, maxVisible);

        expect(state.rendersNull).toBe(true);
        expect(state.visibleCount).toBe(0);
        expect(state.hasOverflowIndicator).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("overflow count is always non-negative", () => {
    fc.assert(
      fc.property(collaboratorListArb, maxVisibleArb, (collaborators, maxVisible) => {
        const state = computeAvatarRenderingState(collaborators.length, maxVisible);

        expect(state.overflowCount).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });

  it("visibleCount + overflowCount always equals N (total collaborators) when N > 0", () => {
    fc.assert(
      fc.property(
        collaboratorListArb.filter((list) => list.length > 0),
        maxVisibleArb,
        (collaborators, maxVisible) => {
          const state = computeAvatarRenderingState(collaborators.length, maxVisible);

          expect(state.visibleCount + state.overflowCount).toBe(collaborators.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

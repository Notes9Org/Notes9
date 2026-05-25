import { describe, it, expect } from "vitest";
import {
  getExtensionConfig,
  ExtensionConfig,
} from "../../lib/collaboration/extension-config";

describe("getExtensionConfig", () => {
  describe("collaboration mode active (all flags true)", () => {
    it("disables history when collaborationEnabled, hasYdoc, and hasProvider are all true", () => {
      const config: ExtensionConfig = getExtensionConfig(true, true, true);
      expect(config.historyEnabled).toBe(false);
    });

    it("includes collaboration extension when all flags are true", () => {
      const config = getExtensionConfig(true, true, true);
      expect(config.collaborationExtensionPresent).toBe(true);
    });

    it("includes collaboration cursor extension when all flags are true", () => {
      const config = getExtensionConfig(true, true, true);
      expect(config.collaborationCursorPresent).toBe(true);
    });
  });

  describe("non-collaboration mode (collaborationEnabled is false)", () => {
    it("keeps history enabled when collaborationEnabled is false", () => {
      const config = getExtensionConfig(false, true, true);
      expect(config.historyEnabled).toBe(true);
    });

    it("does not include collaboration extension", () => {
      const config = getExtensionConfig(false, true, true);
      expect(config.collaborationExtensionPresent).toBe(false);
    });

    it("does not include collaboration cursor extension", () => {
      const config = getExtensionConfig(false, true, true);
      expect(config.collaborationCursorPresent).toBe(false);
    });
  });

  describe("missing ydoc (hasYdoc is false)", () => {
    it("keeps history enabled when hasYdoc is false", () => {
      const config = getExtensionConfig(true, false, true);
      expect(config.historyEnabled).toBe(true);
    });

    it("does not include collaboration extensions when hasYdoc is false", () => {
      const config = getExtensionConfig(true, false, true);
      expect(config.collaborationExtensionPresent).toBe(false);
      expect(config.collaborationCursorPresent).toBe(false);
    });
  });

  describe("missing provider (hasProvider is false)", () => {
    it("keeps history enabled when hasProvider is false", () => {
      const config = getExtensionConfig(true, true, false);
      expect(config.historyEnabled).toBe(true);
    });

    it("does not include collaboration extensions when hasProvider is false", () => {
      const config = getExtensionConfig(true, true, false);
      expect(config.collaborationExtensionPresent).toBe(false);
      expect(config.collaborationCursorPresent).toBe(false);
    });
  });

  describe("all flags false", () => {
    it("keeps history enabled when all flags are false", () => {
      const config = getExtensionConfig(false, false, false);
      expect(config.historyEnabled).toBe(true);
    });

    it("does not include any collaboration extensions when all flags are false", () => {
      const config = getExtensionConfig(false, false, false);
      expect(config.collaborationExtensionPresent).toBe(false);
      expect(config.collaborationCursorPresent).toBe(false);
    });
  });

  describe("collaboration extensions require ALL three flags", () => {
    it("only enables collaboration when all three flags are true", () => {
      // All combinations where at least one flag is false should NOT have collaboration
      const falseConfigs = [
        getExtensionConfig(false, false, false),
        getExtensionConfig(true, false, false),
        getExtensionConfig(false, true, false),
        getExtensionConfig(false, false, true),
        getExtensionConfig(true, true, false),
        getExtensionConfig(true, false, true),
        getExtensionConfig(false, true, true),
      ];

      for (const config of falseConfigs) {
        expect(config.historyEnabled).toBe(true);
        expect(config.collaborationExtensionPresent).toBe(false);
        expect(config.collaborationCursorPresent).toBe(false);
      }

      // Only when all three are true
      const trueConfig = getExtensionConfig(true, true, true);
      expect(trueConfig.historyEnabled).toBe(false);
      expect(trueConfig.collaborationExtensionPresent).toBe(true);
      expect(trueConfig.collaborationCursorPresent).toBe(true);
    });
  });
});

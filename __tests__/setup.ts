import "@testing-library/jest-dom/vitest"

// jsdom does not implement navigator.sendBeacon. The telemetry client
// (lib/telemetry/track.ts) feature-detects it, and its tests spy on it via
// vi.spyOn(navigator, 'sendBeacon') — which throws if the property is absent.
// Provide a writable/configurable stub so spies can attach and be restored.
if (
  typeof navigator !== "undefined" &&
  typeof navigator.sendBeacon !== "function"
) {
  Object.defineProperty(navigator, "sendBeacon", {
    value: () => true,
    writable: true,
    configurable: true,
  })
}

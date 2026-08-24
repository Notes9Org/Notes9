import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "__tests__/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["__tests__/setup.ts"],
    // The data-analysis workspace tests render a ~4,900-line component; one file
    // takes ~18s wall-clock on its own. Under full-suite parallel contention they
    // exceed the 5s default and fail as timeouts rather than on any assertion --
    // they pass in isolation and in pairs. Raised so the gate reports real defects
    // instead of machine load. A genuinely hung test still fails, 15s later.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})

import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // `server-only` has no browser/node entry Vite can resolve, so any test
      // that transitively imports a server module dies at transform time.
      // Reuse the no-op shim Next itself aliases to outside RSC builds.
      "server-only": "next/dist/compiled/server-only/empty.js",
    },
  },
  test: {
    environment: "jsdom",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["__tests__/setup.ts"],
  },
})

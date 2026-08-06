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
  },
})

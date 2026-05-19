/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * Expose CHAT_API_URL to the browser so client-side SSE calls can reach the
   * backend directly, bypassing Vercel function timeouts entirely.
   */
  env: {
    NEXT_PUBLIC_CHAT_API_URL: process.env.CHAT_API_URL || '',
  },
  /**
   * Default is ~10MB; protocol template uploads allow up to 15MB. Without this,
   * larger POST bodies can fail in dev/proxy with a client-side "Failed to fetch".
   */
  experimental: {
    proxyClientMaxBodySize: "20mb",
    serverActions: {
      bodySizeLimit: "20mb",
    },
    /**
     * Tree-shake barrel-exporting packages. `lucide-react` alone exports ~1.5k
     * icons; without this, importing five icons pulls the entire module on the
     * first request that touches it. Same story for date-fns / radix-icons /
     * recharts. Effect: lighter route chunks, faster cold compiles.
     */
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-icons",
      "recharts",
    ],
  },
  /**
   * Empty for now. If a future dep drags in something Turbopack's NFT tracer
   * can't handle (typically a `node:`-prefixed builtin), list the offender
   * here — but only packages that resolve cleanly via Node's `require()`
   * (no CSS / ESM-only sub-imports). seqviz / molstar / pdfjs-dist /
   * @univerjs/* have been verified as INCOMPATIBLE with this list.
   */
  serverExternalPackages: [],
  turbopack: {
    resolveAlias: {
      fs: { browser: "./lib/stubs/empty-module.js" },
      path: { browser: "./lib/stubs/empty-module.js" },
      /**
       * Browser-channel stubs for Node built-ins that sometimes get pulled
       * into client bundles via heavy libs (mermaid → langium, etc.). Without
       * stubs the browser build either fails or ships a useless polyfill.
       * The `node:` prefix and unprefixed form must both be aliased.
       */
      worker_threads: { browser: "./lib/stubs/empty-module.js" },
      "node:worker_threads": { browser: "./lib/stubs/empty-module.js" },
      "node:fs": { browser: "./lib/stubs/empty-module.js" },
      "node:path": { browser: "./lib/stubs/empty-module.js" },
    },
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
}

export default nextConfig

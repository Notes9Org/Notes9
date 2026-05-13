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
  },
  turbopack: {
    resolveAlias: {
      fs: { browser: "./lib/stubs/empty-module.js" },
      path: { browser: "./lib/stubs/empty-module.js" },
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

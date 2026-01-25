/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Ensure ai package is properly bundled for client components
  transpilePackages: ['ai', '@ai-sdk/react', '@ai-sdk/google', '@ai-sdk/mcp'],
  experimental: {
    turbo: {
      root: process.cwd(),
    },
  },
}

export default nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Note: API route body size is NOT configured here for Next.js 16.
  // Large file uploads bypass the server entirely via direct-to-storage
  // signed URLs (see /api/v2/upload/prepare). The server-upload fallback
  // route sets its own segment config for the rare cases it's needed.
}

export default nextConfig

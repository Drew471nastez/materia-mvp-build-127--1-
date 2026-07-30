/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'skgtqglupjcnfhfscink.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
      {
        protocol: 'https',
        hostname: 'i.pinimg.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  serverExternalPackages: ['pdfkit', 'fontkit', 'linebreak', 'png-js', 'sharp'],
  // Note: Vercel serverless functions have a 4.5MB body size limit.
  // Large file uploads bypass the server via direct-to-storage signed URLs
  // (see /api/v2/upload/prepare). Chunked uploads (/api/v2/upload/chunk)
  // use 2MB chunks to stay safely under the platform body size limit.

  // Cache headers for public pages — CDN edge + browser stale-while-revalidate
  async headers() {
    return [
      {
        // Public product pages
        source: '/p/:slug*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        // Blog pages — short CDN cache so new posts appear quickly
        source: '/blog/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
      {
        // Explore / marketplace
        source: '/explore/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
      {
        // Creator store pages
        source: '/u/:username*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        // Link-in-bio pages
        source: '/l/:slug*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        // Marketplace feed (homepage) — short CDN cache; it is a live product feed
        // now, not the old static landing page, so the previous 1h s-maxage is wrong
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
      {
        // Static assets in public/ — 1 year immutable
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Android App Links verification — must be 200 + application/json, no redirects
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        // iOS Universal Links verification — must be 200 + application/json, no redirects, no auth
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ]
  },

  // Marketing pages retired by the marketplace pivot — everything funnels to the feed on "/".
  // `permanent: false` (307) on purpose: the pivot is still settling, and a 308 would be
  // cached by browsers indefinitely, making a rollback impossible to push to existing users.
  // Note /explore is deliberately NOT redirected — the native app treats it as a Discover
  // route (lib/isDiscoverMode.ts) and "/" is intercepted to /native-start in proxy.ts.
  // /legal/terms, /legal/privacy and /blog are untouched.
  async redirects() {
    return [
      { source: '/pricing', destination: '/', permanent: false },
      { source: '/features', destination: '/', permanent: false },
      { source: '/faq', destination: '/', permanent: false },
    ]
  },
}

export default nextConfig

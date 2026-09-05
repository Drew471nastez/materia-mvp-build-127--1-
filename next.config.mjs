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
      // Editorial artwork for the home hero. A host that is not listed here is
      // not "unoptimised" — next/image REFUSES it and the browser paints its own
      // broken-image glyph, which on the first thing anybody sees is the worst
      // possible place for one.
      { protocol: 'https', hostname: 'contentful.depop.com' },
      { protocol: 'https', hostname: 'unfazed.ro' },
      { protocol: 'https', hostname: 'assets.depop.com' },
      // Avatars that arrive with an OAuth identity rather than an upload.
      //
      // A host that is not listed here is not "unoptimised" — next/image REFUSES
      // it, the request 400s, and the browser paints its own broken-image glyph:
      // a grey box with a question mark in it, sitting where somebody's face
      // should be, on every screen that shows them. Every account created with
      // Google or Apple has its picture on one of these.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh4.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh5.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh6.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'gravatar.com' },
      { protocol: 'https', hostname: 'www.gravatar.com' },
      { protocol: 'https', hostname: 'secure.gravatar.com' },
      { protocol: 'https', hostname: 'appleid.cdn-apple.com' },
      { protocol: 'https', hostname: 'pbs.twimg.com' },
    ],
    // AVIF first, WebP behind it. AVIF is roughly 30% smaller than WebP at
    // matched quality on photographs, and every browser that misses it falls
    // through to WebP rather than to the original JPEG.
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,

    // The size ladder every srcset is built from. Two changes from the default,
    // both about not sending pixels nobody can see:
    //
    // 2048 and 3840 are gone. Nothing here is ever laid out that wide — the
    // widest thing on the site is a phone photo at full bleed — so those rungs
    // only ever existed to be picked by a high-DPI device and then thrown away.
    //
    // And the top of the ladder is now finely spaced instead of jumping 1200 ->
    // 1920. That gap was the real cost: a 430pt phone at 3x needs about 1290px,
    // finds nothing between, and takes 1920 — 2.2x the pixels it asked for. With
    // rungs at 1280 and 1440 the same device lands within a whisker of what it
    // needs. Same picture, roughly half the bytes.
    deviceSizes: [384, 640, 750, 828, 1080, 1200, 1280, 1440, 1600, 1920],
    // Finer small end, for avatars, thumbnails and the draggable photo tiles in
    // the listing form — none of which should be pulling a 640px file.
    imageSizes: [24, 32, 48, 64, 96, 128, 192, 256, 384],

    // Quality levels the optimizer will honour. Anything not listed here is
    // rejected, so this doubles as the list of what we've actually decided on:
    // 68 for photography, 75 where an image carries fine detail or text.
    qualities: [60, 65, 68, 70, 75],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },

    // How long the client router may reuse a page it already has.
    //
    // `dynamic` defaults to ZERO, which means a force-dynamic route is thrown
    // away the moment you leave it — so pressing back from a listing refetched
    // the entire feed from the server and rebuilt it from nothing. That is the
    // reload-flash on the way back: not an animation problem at all, but the
    // feed genuinely being fetched and remounted a second time, replaying its
    // own entry as it went.
    //
    // Three minutes for dynamic pages. Back and forth within a browsing session
    // is instant and comes off the cache; anything older is refetched. Fresh
    // data still arrives by every other route into the page — a reload, a new
    // session, or the feed's own pull-to-refresh.
    staleTimes: {
      dynamic: 180,
      static: 300,
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

  /**
   * ===========================================================================
   *  NOTHING IS RETIRED HERE ANY MORE
   * ===========================================================================
   *
   * This block held five 307s the marketplace pivot put in: /pricing, /features
   * and /faq funnelled to the feed on "/", and the Website Builder was made
   * unreachable by direct URL.
   *
   * All five are gone now that Storelib sells digital products again. Pricing,
   * features and an FAQ are not optional decoration for a platform people
   * subscribe to -- the landing page has a PricingSection and a FaqSection on
   * it, and both linked at pages that bounced you back to the page you were
   * already on. The Website Builder is a seller tool that belongs to this
   * product, not to a clothing marketplace.
   *
   * Every route was still there the whole time; only the redirect was removed.
   * That is because whoever wrote this block chose `permanent: false` on purpose
   * -- a 308 would have been cached by browsers indefinitely and this would have
   * been a much worse day.
   */
  async redirects() {
    return []
  },
}

export default nextConfig

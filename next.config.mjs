/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * THE COVER'S BROWSER. @sparticuz/chromium reads a compressed Chromium out
   * of its own bin/ folder at run time, and puppeteer-core loads it with
   * dynamic requires — neither survives being bundled, so both are in the
   * serverExternalPackages list below. The binary is read by path, not imported,
   * which the build's file tracing cannot see, so it is named for every
   * route that launches it (lib/website-builder/cover-shot.ts): the cover
   * route, and the routes that make a website or export one, which take its
   * first photograph themselves (lib/website-builder/cover-take.ts). Named for
   * the cover route alone, every photograph those routes took failed in
   * production ("the input directory ... does not exist"), and an imported
   * website showed a drawing until the Website page asked the cover route.
   */
  outputFileTracingIncludes: {
    /*
      A GLOB, NOT A ROUTE. Next matches these keys with picomatch, and in a
      glob `[installId]` is a character class — one letter out of that set —
      so the route's own name never matched it and the browser was left out
      of the function: 503 files traced, the binary not among them, and a
      cover route that would have failed on its first call. `*` is one path
      segment, which is what was meant.
    */
    /*
      ONE COPY OF THE BROWSER. The package finds its binary next to its own
      module file (`import.meta.url`), which Node resolves to the real path
      under .pnpm. The symlinked node_modules/@sparticuz path traced a second
      copy of the same 67MB into the function, for nothing.
    */
    '/api/website-builder/themes/*/cover': [
      './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**',
    ],
    '/api/website-builder/themes/add': [
      './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**',
    ],
    '/api/website-builder/themes/import': [
      './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**',
    ],
    '/api/website-builder/themes/*/duplicate': [
      './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**',
    ],
    '/api/website-builder/themes/*/export': [
      './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**',
    ],
    /*
      THE INVOICE'S TYPEFACE. lib/checkout/invoice.ts reads Inter from
      lib/checkout/fonts by path, which tracing cannot see, for every route
      that draws one: the download, and the three that email the receipt
      PDF with a paid order (a product, and a basket on its return).
    */
    '/api/checkout/invoice': ['./lib/checkout/fonts/**'],
    '/api/checkout/confirm-payment': ['./lib/checkout/fonts/**'],
    '/api/checkout/cart/complete': ['./lib/checkout/fonts/**'],
    '/api/stripe/webhook': ['./lib/checkout/fonts/**'],
    /* The same receipt PDF for a checkout paid on Airwallex (lib/payments). */
    '/api/payments/airwallex/webhook': ['./lib/checkout/fonts/**'],
    '/api/payments/airwallex/return': ['./lib/checkout/fonts/**'],
    /* The OnePage share image draws its words in the same Inter, read by path. */
    '/*/links/share.png': ['./lib/checkout/fonts/**'],
    /* A shared community link's picture, the same Inter (app/(marketing)/community/[slug]/share.png). */
    '/community/*/share.png': ['./lib/checkout/fonts/**'],
  },
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
    /**
     * Next 16 only serves the qualities listed here — the default is `[75]`
     * alone, and `q` anything else returns 400 rather than an image.
     *
     * 88 is for the cover and the avatar: the pictures a creator chose to
     * represent themselves, where AVIF at 88 is indistinguishable from the
     * original at any zoom a visitor will use and still a fraction of its
     * size. 75 stays for everything else. PORTRAIT_QUALITY in
     * lib/images/optimized-url.ts is the other half of this pair.
     */
    qualities: [75, 88],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    /**
     * ═══════════════════════════════════════════════════════════════════════
     *  A TAB BAR IS ONLY A TAB BAR IF THE TABS ARE STILL THERE WHEN YOU COME BACK
     * ═══════════════════════════════════════════════════════════════════════
     * Since Next 15 the client router keeps a DYNAMIC page's payload for zero
     * seconds. Every /app page is dynamic, so pressing Orders, then Home, then
     * Orders again fetched Orders twice from scratch and showed its
     * loading.tsx skeleton both times — on the phone, inside the app, where
     * the bar at the bottom promises the opposite. "If I already loaded the
     * page, why does every switch load it as a new thing and show the
     * skeleton."
     *
     * Five minutes. A page you were on inside the last five minutes comes
     * back as it was, instantly, with no skeleton; a page older than that is
     * fetched again. Pull to refresh and router.refresh() still replace it on
     * demand, and a mutation's revalidatePath still clears it. This is the
     * client's cache only: the server renders on demand as before.
     */
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
  // `esbuild` ships a per-platform native binary and is loaded at runtime by
  // the Sites agent's run_build tool; bundling it breaks the binary lookup.
  //
  // `typescript` is here for the same reason and was ALSO a devDependency,
  // which is worse: run_build typechecks the generated project before a run is
  // allowed to finish, and a production install without dev packages would
  // have had no compiler — so the gate would have reported "could not check"
  // for every run and quietly stopped gating anything. It is a dependency now.
  serverExternalPackages: ['pdfkit', 'fontkit', 'linebreak', 'png-js', 'sharp', 'esbuild', 'typescript', '@sparticuz/chromium', 'puppeteer-core'],
  // Note: Vercel serverless functions have a 4.5MB body size limit.
  // Large file uploads bypass the server via direct-to-storage signed URLs
  // (see /api/v2/upload/prepare). Chunked uploads (/api/v2/upload/chunk)
  // use 2MB chunks to stay safely under the platform body size limit.

  async rewrites() {
    return {
      beforeFiles: [{ source: "/@:handle", destination: "/member/:handle" }],
    }
  },

  // Cache headers for public pages — CDN edge + browser stale-while-revalidate
  async headers() {
    return [
      {
        /**
         * The Sites preview runs in an iframe that is `sandbox="allow-scripts"`
         * WITHOUT `allow-same-origin` — deliberately, because those two
         * together would let generated code read the editor's Supabase session
         * (see lib/sites/preview-document.ts).
         *
         * The consequence is that the frame's origin is the string "null", so
         * its module imports of OUR OWN React build are cross-origin requests
         * and Chrome blocks them with no ACAO header. Symptom: a preview that
         * builds successfully and renders nothing.
         *
         * These four files are public React, byte for byte — there is nothing
         * here to protect, and the alternative (relaxing the sandbox) trades a
         * real boundary for a header.
         */
        source: '/sites/vendor/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
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
        /**
         * Creator store pages — NOT PUBLICLY CACHEABLE ANY MORE.
         *
         * This page renders per-viewer content: the creator sees an "Edit
         * profile" control, a menu, and a three-dot menu on every card, all
         * decided from their session. `public, s-maxage=300` told the CDN it
         * could hand one rendering to everybody — which at best meant an edit
         * took five minutes to appear, and at worst meant the owner's
         * rendering being served to visitors.
         *
         * It also made `router.refresh()` after saving a profile a no-op:
         * the RSC payload came back from the edge unchanged, which is why
         * changes did not show without a hard reload.
         *
         * `private` keeps it out of shared caches while still letting the
         * browser reuse it within a page session.
         */
        source: '/u/:username*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, must-revalidate' },
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
        // Landing page
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=7200' },
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
      {
        // Apple Pay on the web: Stripe's own association file, which Apple
        // fetches when the domain is registered and again as it re-verifies.
        // Plain text, 200, no redirect, or Apple Pay never appears at checkout.
        source: '/.well-known/apple-developer-merchantid-domain-association',
        headers: [
          { key: 'Content-Type', value: 'text/plain' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ]
  },
}

export default nextConfig

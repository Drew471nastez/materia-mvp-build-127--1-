import { readFileSync } from "node:fs"
/**
 * ===========================================================================
 *  CREATOR PAGES, PRODUCT PAGES AND EXPLORE AT THE EDGE, FOR EVERYBODY (round 49)
 * ===========================================================================
 * Load-tested on a local production build with a Supabase stub (round 48),
 * /<handle> and /<handle>/<product> were the platform's bottleneck: every
 * visit a full render, about 20 a second per instance, 11 database round
 * trips each. Round 48 let the CDN hold a stranger's copy and sent everybody
 * else to a personal address by a rewrite in the proxy; on Vercel the CDN
 * keys its copy on the address the browser asked for, so signed in visitors
 * and buyers were served the stranger's copy, and it was reverted (244bdca).
 *
 * ROUND 49 DOES NOT SEPARATE ANYBODY: THE PAGES ARE THE SAME FOR EVERYBODY.
 * Their render reads no cookie and no request header (tests/cdnpages-r49
 * pins it, and scripts/check-creator-page-cache.mjs measures the bytes on a
 * production build): the owner's Edit, a buyer's Download and Contact, the
 * guest buyer's copy, a team member's controls and Explore's For you are
 * asked for by the browser after the page loads, from private routes. Each
 * language of a creator page is its own address (?lang=, the proxy sends a
 * visitor there: lib/markets/creator-page-language-step). So one copy per
 * address is right for every visitor, and the CDN may hold it whoever asked.
 *
 * Vercel-CDN-Cache-Control, not Cache-Control: on Vercel a dynamic page's
 * own `private, no-cache` wins over a Cache-Control set here (measured live
 * in round 48), and Vercel's CDN reads Vercel-CDN-Cache-Control first and
 * never passes it on, so browsers still revalidate every time. Sixty
 * seconds, served stale for five minutes while it is drawn again, and taken
 * down at once by a save: Vercel-Cache-Tag names the handle, and
 * lib/storefront/creator-page-purge expires that tag and the path.
 *
 * Never held: a React Server Components request (the `rsc` header: a client
 * side move or a prefetch, whose payload depends on the router state the
 * browser sends), the editor's canvas (?embedded=1), whose save must show at
 * once, and a scheme being tried in Edit profile (?scheme=). Only on
 * storelib.com: a creator's subdomain or own domain has rules of its own
 * (proxy.ts). Vercel does not store a response that sets a cookie.
 */
const RESERVED_FIRST_SEGMENTS = (() => {
  try {
    const src = readFileSync(new URL("./lib/routes/reserved-segments.ts", import.meta.url), "utf8")
    const names = [...src.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1].toLowerCase())
    return names.length > 50 ? names : null
  } catch {
    return null
  }
})()
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/* (?:/|$), not $: inside the address's pattern a $ is the end of the whole path, and /p/<slug> would have passed as a handle "p". */
const HANDLE_SEGMENT = RESERVED_FIRST_SEGMENTS ? `(?!(?:${RESERVED_FIRST_SEGMENTS.map(reEscape).join("|")})(?:/|$))[^/.]+` : null
const STORELIB_HOSTS = "(?:www\\.)?storelib\\.com|localhost|127\\.0\\.0\\.1"
/*
 * FIVE MINUTES FRESH, A DAY SERVED STALE (round 54). It was a minute and five: a page nobody opened in the last six
 * minutes was a MISS and a whole render, and most creator pages, product pages and OnePages are opened less often than
 * that, so production saw a 35% CDN hit rate. Now a page anybody opened in the last day is answered at once from the
 * CDN and drawn again behind that visitor, and a page in demand is drawn at most once every five minutes, not every
 * minute. A save still takes the copy down at once by its tag (lib/storefront/creator-page-purge, lib/onepage/public-cache);
 * the five minutes only bound what no tag names (a count, a review's stars). tests/cdn-r54 pins the lifetime.
 */
export const EDGE_PAGE = "public, s-maxage=300, stale-while-revalidate=86400"
/* A OnePage's name as its one spelling (lowercase, lib/onepage/username isResolvableOnePageName), never a file the host answers (robots.txt, sitemap.xml). */
const ONEPAGE_NAME_SEGMENT = "[a-z0-9](?:[a-z0-9_-]|\\.(?!(?:txt|xml|ico|png|jpe?g|svg|webp|webmanifest|json|js|css|map)$))*"
const NEVER_HELD = [
  { type: 'header', key: 'rsc' },
  { type: 'query', key: 'embedded' },
  { type: 'query', key: 'scheme' },
]
/* Next anchors `has` values as ^value$, so the alternatives are grouped: unanchored, "localhost" would match any host containing it. */
const edgeRule = (source, tag) => ({
  source,
  has: [{ type: 'host', value: `(?:${STORELIB_HOSTS})` }],
  missing: NEVER_HELD,
  headers: [
    { key: 'Vercel-CDN-Cache-Control', value: EDGE_PAGE },
    { key: 'Vercel-Cache-Tag', value: tag },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * THE PROXY DROPS A TRAILING SLASH, NOT NEXT (lib/seo/one-hop.ts), so
   * www.storelib.com/pricing/ is one 308 to storelib.com/pricing rather than
   * two hops. Every path the proxy's matcher leaves out is a file under
   * /_next or an image, which never ends in a slash.
   */
  skipTrailingSlashRedirect: true,
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
    '/api/website-builder/themes/create': [
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
    /* Storelib AI looks at the page it built, at two widths (lib/website-builder/agent/visual-check.ts). */
    '/api/website-builder/themes/*/agent': [
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
    /* The OnePage share image draws its words in the same Inter, read by path. */
    '/*/links/share.png': ['./lib/checkout/fonts/**'],
    /* A shared community link's picture, the same Inter (app/(marketing)/community/[slug]/share.png). */
    '/community/*/share.png': ['./lib/checkout/fonts/**'],
    /* A shared profile's picture, the same Inter (app/(marketing)/member/[username]/share.png). */
    '/member/*/share.png': ['./lib/checkout/fonts/**'],
    /* A shared community post's picture, the same Inter (app/(marketing)/community/[slug]/(member)/post/[postId]/share.png). */
    '/community/*/post/*/share.png': ['./lib/checkout/fonts/**'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      /* Storelib's own address for a public file (lib/storage/media-url.ts). */
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'storelib.com',
        pathname: '/media/**',
      },
      /*
        Supabase only for its storage files. Without a pathname any address on
        any Supabase project could be pushed through Storelib's optimizer, and
        each one is a billed image transformation; Storelib's own pictures are
        all under /storage/v1/ (object/public, object/sign, render).
      */
      {
        protocol: 'https',
        hostname: 'skgtqglupjcnfhfscink.supabase.co',
        pathname: '/storage/v1/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/**',
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
     *
     * 90 is a published website's pictures (SITE_PICTURE_QUALITY there): the
     * creator's own photographs, re-encoded once at the width the screen
     * needs and never visibly softer than what they uploaded.
     */
    qualities: [75, 88, 90],
  },
  experimental: {
    // Load the large server graph once during route-data/prerender work instead
    // of duplicating it across workers. Runtime routes and checks are unchanged.
    cpus: 1,
    /*
     * TURBOPACK DOES NOT MINIFY; scripts/minify-after-build.mjs DOES (round 53).
     * Vercel's 8 GB Standard build machine ran out of memory: Turbopack holds the
     * app's compiled graph until it exits, and minifying inside it was the last
     * ~340 MB (cold `pnpm build`, 4 CPUs: 8.26 GB peak minifying, 7.92 GB not;
     * the compile 40 s faster). The build's last step minifies every chunk under
     * .next/static and .next/server with esbuild in its own process, after
     * Turbopack has exited, so what ships is minified as before.
     */
    turbopackMinify: false,
    /**
     * NO SOURCE MAPS FROM TURBOPACK'S PRODUCTION BUILD.
     *
     * Measured on a 4 CPU machine (Vercel's Standard build size), cold
     * `pnpm build`: with Turbopack's source maps on (its default) the build
     * peaked at 8.5 GB and compiled in 2.6 to 3.3 minutes, which is what
     * Standard's 8 GB machine ran out of memory on; with them off it peaks at
     * 7.0 GB and compiles in 2.3 minutes. What they made was 6,144 .map files
     * (374 MB) for the server bundles only: the browser's were never shipped
     * (productionBrowserSourceMaps is off), so nobody's page changes. The
     * cost is that a server error's stack in Vercel's runtime logs names the
     * built chunk and line, not the source file. `next dev` is untouched.
     */
    turbopackSourceMaps: false,
    /**
     * AND NONE READ IN. With the maps above off nothing uses the source maps
     * that packages ship beside their code, so Turbopack does not read and
     * parse them either. Measured on the full cold build: 80 MB less at the
     * peak and 20 s off the compile. Nothing it writes changes.
     */
    turbopackInputSourceMaps: false,
    /**
     * A MEMORY TARGET FOR TURBOPACK, off unless STORELIB_TURBOPACK_MEMORY_MB is
     * set (round AR). Measured on 4 CPUs, cold `pnpm build`, whole process
     * tree: 8,160 MB with none, 8,244 MB at 3 GB and 8,194 MB at 2 GB, and a
     * build capped at 7.5 GB was killed at the end of compiling either way. It
     * does not lower the peak, so it is not on; the build machine was raised
     * instead. Kept as a switch for the next measurement.
     */
    turbopackMemoryLimit: (() => {
      const mb = Number(process.env.STORELIB_TURBOPACK_MEMORY_MB ?? 0)
      return Number.isFinite(mb) && mb > 0 ? Math.round(mb * 1024 * 1024) : undefined
    })(),
    /**
     * AN ADDRESS NO ROUTE MATCHES (round 52): Storelib's pages and the
     * published websites each have a root layout (app/(storelib)/layout.tsx,
     * app/(site)/layout.tsx), so that 404 is app/global-not-found.tsx.
     */
    globalNotFound: true,
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
  //
  // `sass` compiles a theme's SCSS in one route (lib/storelib-theme/compat/scss.ts).
  // Bundled, it was one 5.9 MB module the build parsed and minified for that
  // route; Node loads it from node_modules as it is, and the trace ships it.
  //
  // Measured and NOT added (wave 12, cold `pnpm build`, 4 CPUs, whole cgroup):
  // firebase-admin, stripe, openai, @anthropic-ai/sdk, web-push and
  // sanitize-html as externals peaked at 8,157 and 8,956 MB in two runs against
  // 8,927 MB without them: inside the run-to-run noise, and killed under a
  // 7 GiB cap with or without STORELIB_TURBOPACK_MEMORY_MB=3500. And
  // experimental.turbopackClientSideNestedAsyncChunking: false hangs Next
  // 16.1.7's build (no CPU at about 6 GB, never finishes).
  serverExternalPackages: ['pdfkit', 'fontkit', 'linebreak', 'png-js', 'sharp', 'esbuild', 'typescript', 'sass', '@sparticuz/chromium', 'puppeteer-core'],
  // Note: Vercel serverless functions have a 4.5MB body size limit.
  // Large file uploads bypass the server via direct-to-storage signed URLs
  // (see /api/v2/upload/prepare). Chunked uploads (/api/v2/upload/chunk)
  // use 2MB chunks to stay safely under the platform body size limit.

  async rewrites() {
    /*
      STORELIB'S OWN ADDRESS FOR A PUBLIC FILE (lib/storage/media-url.ts).
      /media/<bucket>/<path> is the storage bucket's public object, passed
      straight through, so no page, input or email shows the storage host.
    */
    const storage = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
    return {
      beforeFiles: [
        { source: "/@:handle", destination: "/member/:handle" },
        /* The app links files, built from env vars (lib/platform/app-links.ts): before the public folder, which no longer holds them. */
        { source: "/.well-known/apple-app-site-association", destination: "/api/app-links/apple-app-site-association" },
        { source: "/.well-known/assetlinks.json", destination: "/api/app-links/assetlinks" },
        ...(storage ? [{ source: "/media/:path*", destination: `${storage}/storage/v1/object/public/:path*` }] : []),
      ],
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
        /**
         * Product pages, the /p/<slug> address. NOT PUBLICLY CACHEABLE, for the
         * reason /u/ below is not: the page is drawn for whoever asks. A
         * signed in buyer's copy says Download and lists the files they own,
         * and since round 39 a browser that bought as a guest gets the same
         * from its signed cookie (lib/receipts/guest-access.ts). With
         * `public, s-maxage=300` the CDN could hand one buyer's copy to
         * everybody for five minutes. The nested address
         * (/<handle>/<product>) never had a shared lifetime.
         */
        source: '/p/:slug*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, must-revalidate' },
        ],
      },
      {
        // Blog pages — short CDN cache so new posts appear quickly
        source: '/blog/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
      /*
        Creator pages, product pages and Explore: one copy for everybody (round 49, EDGE_PAGE above).
        The tag is the address's own handle; lib/storefront/creator-page-purge expires `creator-page-<handle>`.
      */
      ...(HANDLE_SEGMENT
        ? [
            edgeRule(`/:handle(${HANDLE_SEGMENT})`, 'creator-page-:handle'),
            edgeRule(`/:handle(${HANDLE_SEGMENT})/:product((?!links$)[^/.]+)`, 'creator-page-:handle'),
          ]
        : []),
      edgeRule('/explore/:path*', 'explore'),
      /*
        OnePages, storelib.me/<name>: one copy for everybody (round 51, lib/onepage/edge). storelib.me reads no session and
        writes no cookie (proxy.ts), and the page reads nothing of the visitor's. Here and not in the proxy: Next takes the
        `rsc` header off the request the proxy sees, so only a rule here can leave a client side move out (measured on a
        production build, scripts/check-public-delivery-r51). The tag is the name; lib/onepage/public-cache expires it.
      */
      {
        source: `/:name(${ONEPAGE_NAME_SEGMENT})`,
        has: [{ type: 'host', value: 'storelib\\.me' }],
        missing: [{ type: 'header', key: 'rsc' }],
        headers: [
          { key: 'Vercel-CDN-Cache-Control', value: EDGE_PAGE },
          { key: 'Vercel-Cache-Tag', value: 'onepage-:name' },
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
        /**
         * Link-in-bio pages. NOT PUBLICLY CACHEABLE (round 40). A shared
         * lifetime of five minutes, served stale for ten more, meant a link
         * scheduled to start at 6:00 could reach a visitor at 6:15, and one
         * set to end stayed up as long; it also held back every edit and
         * every view count for as long. storelib.me/<handle>, the address
         * handed out, never had a shared lifetime (it is rendered from
         * /<handle>/links), so /l/ now answers the same way.
         */
        source: '/l/:slug*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, must-revalidate' },
        ],
      },
      {
        /*
          Landing page, ON storelib.com ONLY (round 51). Without the host this rule
          matched every host's `/`: a website subdomain whose site lives at its own
          domain answered its 302 there with this rule's hour, so after the creator
          removed the domain the CDN kept sending visitors to it for up to three
          hours (measured on a production build, scripts/check-public-delivery-r51).
          A website's `/` is the website's (proxy.ts), a OnePage host has no `/`.
        */
        source: '/',
        has: [{ type: 'host', value: `(?:${STORELIB_HOSTS})` }],
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=7200' },
        ],
      },
      {
        /*
          STORELIB'S TAB ICON (app/(storelib)/icon.png and apple-icon.png, round 54). Next names the file with a hash in
          its query (/icon-1p7opv.png?icon.370c8acb.png) and sends it `max-age=0, must-revalidate`, so a phone browser
          asked for it again on every page, three times on a creator page (scripts/check-cdn-r54.mjs). A new picture is a
          new query, so a day in the browser and a week at the CDN are safe.
        */
        source: '/:icon(icon|apple-icon)-:hash([a-z0-9]+).png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800' },
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
        // Country flags. The sprite's address carries its hash (lib/account/flag-sprite.ts), so a week in the cache is safe; the single flags change about never.
        source: '/flags/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' },
        ],
      },
      {
        // Integration logos (public/integrations). Without this they were served max-age=0, so every card waited on a revalidation before its logo painted. A file only changes with a deploy, and a day in the cache with a week's revalidation is safe.
        source: '/integrations/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
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

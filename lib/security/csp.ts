/**
 * ===========================================================================
 *  THE SECOND WALL BEHIND THE HTML CLEANING
 * ===========================================================================
 * lib/website-builder/sanitize.ts decides what markup a creator may put on a
 * page, and tests/raw-html-surface.test.ts makes sure it is pointed at every
 * place that puts any there. That is the wall. This is what stands behind it
 * for the day the wall is wrong: a Content Security Policy tells the BROWSER
 * what it is allowed to run, so script that got past the allow list still
 * does not execute.
 *
 * It matters most for exactly the thing being built. A shared theme is a
 * stranger's markup on somebody else's storefront, served from storelib.com,
 * in front of buyers who are typing card details.
 *
 * ---------------------------------------------------------------------------
 *  WHY IT IS REPORT-ONLY, AND WHAT TURNS IT ON
 * ---------------------------------------------------------------------------
 * A policy that is too tight does not degrade, it breaks: Stripe stops
 * loading, Supabase calls fail, fonts vanish, embeds go blank, and it happens
 * to everybody at once on the deploy. The only way to know a policy fits an
 * app is to watch a real one run under it.
 *
 * So it ships as `Content-Security-Policy-Report-Only`. Browsers evaluate it
 * exactly as they would the real thing and refuse nothing, sending what they
 * WOULD have refused to /api/csp-report instead. Nothing can break.
 *
 * To turn it on, once the reports have been quiet for a while across real
 * traffic including a checkout and an embed:
 *
 *   in vercel.json, rename the header
 *     "Content-Security-Policy-Report-Only"  ->  "Content-Security-Policy"
 *
 * That is the whole switch. Nothing else changes.
 *
 * ---------------------------------------------------------------------------
 *  WHAT IS IN IT AND WHY
 * ---------------------------------------------------------------------------
 * Every host here is one this codebase actually talks to, found by reading
 * it rather than by copying a policy from somewhere. Two admissions:
 *
 *   'unsafe-inline' in script-src   Next.js hydrates through inline script
 *                                   tags. Removing this needs a per-request
 *                                   nonce threaded through the framework,
 *                                   which is its own change; until then the
 *                                   policy's value is in what it blocks
 *                                   everywhere else, chiefly a script
 *                                   loading FROM somewhere.
 *   'unsafe-eval'                   monaco-editor and esbuild-wasm, which
 *                                   are how the code editor works.
 *                                   The section-script sandbox also needs it:
 *                                   the srcdoc frame in section-sandbox.tsx
 *                                   inherits this policy, and runs a
 *                                   section's checked script with indirect
 *                                   eval. Removing it stops every section
 *                                   script silently.
 *
 * `object-src 'none'` and `base-uri 'self'` carry real weight on their own:
 * they close <object> plugin injection and the `<base href>` trick that
 * repoints every relative URL on a page at somebody else's server.
 */

/** Where a browser sends what it would have refused. */
export const CSP_REPORT_PATH = "/api/csp-report"

/**
 * The policy, as a list so it reads as one rule per line. Order does not
 * matter to a browser; it matters to whoever reads this next.
 */
const DIRECTIVES: [string, string[]][] = [
  ["default-src", ["'self'"]],

  /* Closes <base href>, which silently repoints every relative URL on a page. */
  ["base-uri", ["'self'"]],
  /* No <object>, <embed> or <applet>. Nothing here uses them. */
  ["object-src", ["'none'"]],
  /* A form on this site posts to this site. */
  ["form-action", ["'self'"]],
  /*
    'self' rather than 'none' because the builder previews a site in an
    iframe of the same origin. X-Frame-Options: DENY is still set alongside
    this and is the stricter of the two, so if a preview ever does break,
    that header is the one to look at first.
  */
  ["frame-ancestors", ["'self'"]],

  ["script-src", [
    "'self'",
    "'unsafe-inline'",  // Next.js hydration; see the note above
    "'unsafe-eval'",    // monaco-editor, esbuild-wasm, and the section-script sandbox
    "https://js.stripe.com",
    "https://connect-js.stripe.com",  // Stripe's embedded onboarding and account forms (Settings → Payments, Payouts)
    "https://*.airwallex.com",        // Airwallex.js and its forms, for Storelib Payments on Airwallex
    "https://cdnjs.cloudflare.com",   // pdf.js, for reading a PDF in the browser
    "https://va.vercel-scripts.com",  // @vercel/analytics
    "https://vercel.live",            // the preview comment toolbar
    /* A store's own analytics and ad pixels on its website, by ID only (lib/store/tracking.ts). */
    "https://www.googletagmanager.com",
    "https://connect.facebook.net",
    "https://analytics.tiktok.com",
    "https://s.pinimg.com",
    "https://www.clarity.ms",
    "https://*.clarity.ms",
    "https://*.klaviyo.com",
    "https://klaviyo.com",
    "https://omnisnippet1.com",
    "https://*.omnisnippet1.com",
    "https://*.omnisend.com",
  ]],

  /* Tailwind and every inline style attribute in the product. */
  ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],
  ["font-src", ["'self'", "data:", "https://fonts.gstatic.com"]],

  /*
    Any https image. A creator's own uploads live on Supabase, but sections
    also take a URL somebody pastes, and narrowing this would break real
    sites for no security gain: an image cannot execute.
  */
  ["img-src", ["'self'", "data:", "blob:", "https:"]],
  ["media-src", ["'self'", "data:", "blob:", "https:"]],

  ["connect-src", [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",            // realtime
    "https://api.stripe.com",
    "https://fonts.googleapis.com",   // Inter for Stripe's embedded forms (their fonts CSS is fetched from this page)
    "https://*.airwallex.com",
    "https://*.vercel-insights.com",
    "https://va.vercel-scripts.com",
    /*
      Community videos go from the creator's browser straight to the video
      provider when one is connected (lib/video, lib/video/upload-client.ts),
      never through Storelib's server. Listed here whether or not one is
      configured, because this policy is one static header (vercel.json):
      Mux hands out Google Cloud Storage upload addresses, Cloudflare Stream
      its upload hosts, Bunny Stream its TUS endpoint.
    */
    "https://storage.googleapis.com",
    "https://*.mux.com",
    "https://upload.videodelivery.net",
    "https://upload.cloudflarestream.com",
    "https://video.bunnycdn.com",
    /* Where those pixels report (lib/store/tracking.ts TRACKER_HOSTS). */
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://googleads.g.doubleclick.net",
    "https://www.google.com",
    "https://www.facebook.com",
    "https://analytics.tiktok.com",
    "https://ct.pinterest.com",
    "https://www.clarity.ms",
    "https://*.clarity.ms",
    "https://c.bing.com",
    "https://*.klaviyo.com",
    "https://klaviyo.com",
    "https://omnisnippet1.com",
    "https://*.omnisnippet1.com",
    "https://*.omnisend.com",
  ]],

  /* Stripe's and Airwallex's own frames, and the embed providers the sanitiser allows. */
  ["frame-src", [
    "'self'",
    "https://js.stripe.com",
    "https://connect-js.stripe.com",
    "https://hooks.stripe.com",
    "https://*.airwallex.com",
    "https://www.youtube.com",
    "https://youtube.com",
    "https://www.youtube-nocookie.com",
    "https://player.vimeo.com",
    /* A Loom video by link in a community post or comment (lib/communities/post-media.ts loomFromUrl). */
    "https://www.loom.com",
    "https://open.spotify.com",
    "https://w.soundcloud.com",
    "https://www.google.com",
    "https://maps.google.com",
    "https://www.openstreetmap.org",
    "https://maps.apple.com",
  ]],

  /* pdf.js runs its parser in a worker made from a blob. */
  ["worker-src", ["'self'", "blob:"]],

  ["report-uri", [CSP_REPORT_PATH]],
]

/** The header value. One string, built once, compared against vercel.json. */
export const CONTENT_SECURITY_POLICY = DIRECTIVES
  .map(([name, values]) => `${name} ${values.join(" ")}`)
  .join("; ")

/**
 * The header name while it is being watched rather than enforced. Renaming
 * this in vercel.json to `Content-Security-Policy` is what turns it on.
 */
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only"

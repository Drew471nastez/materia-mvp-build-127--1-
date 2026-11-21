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
 * The share of reports that reach the route and its log. The policy is on
 * every page of every host (creator sites and imported themes included, which
 * is where it matters most), so the same violation arrives thousands of times
 * a day and each one used to be a function call. One in twenty still shows
 * every kind of violation that happens with any regularity; the proxy answers
 * the rest with the route's own 204.
 */
export const CSP_REPORT_SAMPLE_RATE = 0.05

/** Whether a report is kept, given a number in [0, 1): Math.random() in the proxy. */
export function keepsCspReport(roll: number): boolean {
  return roll < CSP_REPORT_SAMPLE_RATE
}

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
    "https://cdnjs.cloudflare.com",   // pdf.js, for reading a PDF in the browser
    "https://va.vercel-scripts.com",  // @vercel/analytics
    "https://vercel.live",            // the preview comment toolbar
    "https://platform.twitter.com",   // a post embedded in a product description (components/store-builder/description-rich-editor.tsx loads widgets.js)
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

  /*
    Tailwind and every inline style attribute in the product. cdnjs because
    imported themes load Font Awesome's stylesheet and fonts from it: every
    report on storelib.com on Nov 1 2026 that was not an extension was one of
    those (Vercel logs, "[csp] would have blocked https://cdnjs.cloudflare.com/
    ajax/libs/font-awesome/5.15.4/... (font-src)"). Script from cdnjs was
    already allowed above, for pdf.js; a stylesheet or a font carries none.
  */
  ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"]],
  ["font-src", ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"]],

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

  /* Stripe's own frames, and the embed providers the sanitiser allows. */
  ["frame-src", [
    "'self'",
    "https://js.stripe.com",
    "https://connect-js.stripe.com",
    "https://hooks.stripe.com",
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
    /* The OnePage's players and booking pages (lib/onepage/creator-blocks, components/onepage/extra-blocks): TikTok's video, Apple Music's player, Calendly and Cal.com. */
    "https://www.tiktok.com",
    "https://embed.music.apple.com",
    "https://calendly.com",
    "https://cal.com",
    "https://app.cal.com",
    "https://cal.eu",
    /* The OnePage's embed block (lib/onepage/creator-blocks embedSource EMBED_FRAME_HOSTS): each service's own public embed page. */
    "https://www.instagram.com",
    "https://platform.twitter.com",
    "https://*.typeform.com",
    "https://docs.google.com",
    "https://tally.so",
    "https://*.substack.com",
    "https://embed.podcasts.apple.com",
    "https://player.twitch.tv",
    "https://clips.twitch.tv",
    "https://www.mixcloud.com",
    "https://player-widget.mixcloud.com",
    "https://bandcamp.com",
    "https://widget.deezer.com",
    "https://calendar.google.com",
    /* Round AR3: a Canva design's own embed (lib/onepage/creator-blocks embedSource). */
    "https://www.canva.com",
    /* The OnePage's app blocks (lib/onepage/app-blocks APP_FRAME_HOSTS): Threads, Facebook, Pinterest, Reddit and Audiomack's own public embeds. */
    "https://www.threads.net",
    "https://www.facebook.com",
    "https://assets.pinterest.com",
    "https://embed.reddit.com",
    "https://audiomack.com",
    /* Round AR: a Luma event's or calendar's own embed, and Trustpilot's TrustBox frame (lib/onepage/reviews-block). */
    "https://lu.ma",
    "https://widget.trustpilot.com",
    /* The blog's embed block (lib/blog/embed.ts): a Figma file and a CodePen demo. */
    "https://www.figma.com",
    "https://codepen.io",
  ]],

  /* pdf.js runs its parser in a worker made from a blob. */
  ["worker-src", ["'self'", "blob:"]],

  ["report-uri", [CSP_REPORT_PATH]],
]

/**
 * The same directives, ENFORCED, with its reports marked so the proxy keeps
 * every one of them (a refused load on the dashboard is a bug to fix, not
 * noise to sample) and the route logs them as blocked rather than "would
 * have". See CSP_ENFORCED_PATHS for where it is sent.
 */
export const CSP_ENFORCED_REPORT_PATH = `${CSP_REPORT_PATH}?enforced=1`

/**
 * THE APP'S WEBVIEW FRAME LIST (proxy.ts, Capacitor only, ENFORCED). Stripe.js
 * v3 only by the frame patterns it needs, so its controller frame (which
 * navigates the WebView away from checkout) is refused; every other host the
 * frame-src above allows, so a OnePage's players, booking pages and embeds
 * (open.spotify.com, w.soundcloud.com, www.youtube.com, calendly.com,
 * www.tiktok.com...) load in the app as they do in a browser. The list used
 * to stop at Stripe, YouTube's nocookie host, Vimeo and Loom, so in the app
 * a OnePage's Spotify, SoundCloud, TikTok, Calendly and Instagram frames,
 * on the live page and in the editor's preview, were blank.
 */
export const NATIVE_FRAME_SRC: readonly string[] = [
  "'self'",
  "https://js.stripe.com/v3/elements-*",
  "https://js.stripe.com/v3/payment-request-*",
  "https://js.stripe.com/v3/three-ds-*",
  "https://js.stripe.com/v3/link-*",
  ...(DIRECTIVES.find(([name]) => name === "frame-src")?.[1] ?? []).filter((h) => h !== "'self'" && h !== "https://js.stripe.com"),
]
export const NATIVE_FRAME_POLICY = `frame-src ${NATIVE_FRAME_SRC.join(" ")}`

/** The header value. One string, built once, compared against vercel.json. */
export const CONTENT_SECURITY_POLICY = DIRECTIVES
  .map(([name, values]) => `${name} ${values.join(" ")}`)
  .join("; ")

/** The enforced copy: identical directives, its own report address. */
export const ENFORCED_CONTENT_SECURITY_POLICY = DIRECTIVES
  .map(([name, values]) => `${name} ${name === "report-uri" ? CSP_ENFORCED_REPORT_PATH : values.join(" ")}`)
  .join("; ")

/*
 * ===========================================================================
 *  WHERE IT IS ENFORCED (round 48)
 * ===========================================================================
 * On storelib.com and www only, and only on the pages whose content is
 * Storelib's own: the dashboard (/app), the admin console (/admin) and the
 * sign in, sign up and reset pages. The report only copy in vercel.json goes
 * on being sent everywhere, these pages included, so nothing about the
 * review loop changes.
 *
 * Left report only, on purpose:
 *  - creator subdomains, custom domains and storelib.me: a creator's theme,
 *    an imported theme's own CDN, a store's pixels and any embed a creator
 *    pastes. A host missing from the list is a blank site for its buyers.
 *  - /website-builder: the editor draws imported themes in srcdoc frames,
 *    which inherit the parent's policy, and those themes load from any CDN
 *    their author picked (Font Awesome was the evidence above; the next
 *    theme will name another).
 *  - the checkout, /p, creator pages and OnePages: creator content and embeds
 *    on storelib.com itself.
 *
 * Why not nonces. Next.js puts a nonce on its own inline scripts only when
 * the page is rendered for the request (the docs: "every page must be
 * dynamically rendered"), and /login, /signup and the reset page are served
 * from the CDN today. Hashes do not work either: Next's inline hydration
 * script differs per page and per build, and a hash in script-src turns
 * 'unsafe-inline' off. So script-src keeps 'unsafe-inline' and the enforced
 * policy's value is everything else: no script, frame or connection to a
 * host that is not listed, no <object>, no <base>, no form posting away, no
 * framing by another site.
 *
 * Sent by the proxy rather than vercel.json, joined to any policy the proxy
 * already set (the Capacitor frame list, a framed page's frame-ancestors) as
 * a second policy: a browser enforces both, and the narrower wins.
 */

/** First path segments where the policy is enforced. */
const ENFORCED_FIRST_SEGMENTS = new Set([
  "app",
  "admin",
  "login",
  "signup",
  "reset-password",
  "verify-email",
  "auth",
])

/** Whether this host and path get the enforced policy. */
export function enforcesCsp(host: string | null, pathname: string, mainDomain = "storelib.com"): boolean {
  const bare = (host || "").split(":")[0].toLowerCase()
  if (bare !== mainDomain && bare !== `www.${mainDomain}`) return false
  const first = pathname.split("/")[1]?.toLowerCase() ?? ""
  return ENFORCED_FIRST_SEGMENTS.has(first)
}

/** The Content-Security-Policy value with the enforced policy joined to what is already there. */
export function withEnforcedCsp(existing: string | null): string {
  return existing ? `${existing}, ${ENFORCED_CONTENT_SECURITY_POLICY}` : ENFORCED_CONTENT_SECURITY_POLICY
}

/**
 * The header name while it is being watched rather than enforced. Renaming
 * this in vercel.json to `Content-Security-Policy` is what turns it on.
 */
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only"

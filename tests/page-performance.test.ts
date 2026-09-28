/**
 * ===========================================================================
 *  THE WAITING, AND WHAT STOPS IT COMING BACK
 * ===========================================================================
 *
 * Every check here guards a fix for something that was slow for the same
 * reason: independent work issued in series. `await` reads top to bottom, so
 * the sequential version is always the one somebody writes by accident, and on
 * a server component it is paid before the first byte of HTML leaves the
 * server — which is why it shows up as a page that sits on a skeleton rather
 * than as a slow component.
 *
 * These are structural assertions, not timings: a timing test on a machine with
 * no database would measure nothing. What is asserted is the shape that makes
 * the page fast, and each one names the page it belongs to so a failure says
 * where to look.
 *
 * Run with:  pnpm test:push
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { parseVideoUrl } from "@/lib/social/video"
import { OFFERED_SOCIAL_PLATFORM_KEYS, resolveSocialInput } from "@/lib/social/platforms"
import { toPublicHttpUrl } from "@/lib/url/public-url"
import { isOptimizableImage, optimizedImageUrl, PORTRAIT_QUALITY } from "@/lib/images/optimized-url"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))

// ---------------------------------------------------------------------------
section("Independent work is issued together, not in series")
// ---------------------------------------------------------------------------

check(
  "billing asks Stripe for everything at once",
  (() => {
    /**
     * Four calls — subscriptions, customer, payment methods, invoices — ran one
     * after another, and the comments beside them already said "independent of
     * subscription". allSettled rather than all, so one endpoint failing cannot
     * blank the other three.
     */
    /**
     * The loader moved to lib/billing/overview.ts when billing stopped being
     * a page and became a settings tab. The rule did not move with it by
     * accident — it is checked here, where the work now lives.
     */
    const src = code("lib/billing/overview.ts")
    const sequential = src.match(/await\s+stripe\./g)?.length ?? 0
    return /Promise\.allSettled\(/.test(src) && sequential === 0
  })(),
  "        lib/billing/overview.ts",
)

check(
  "the product page batches the lookups that only need the product",
  (() => {
    // creator, shop config, default product template and the product-specific
    // config all key off product.id / product.creator_id and read nothing from
    // each other. They were four round trips before any HTML.
    //
    // The table names moved to lib/commerce/product-page-data.ts when the
    // three files that render this page stopped each querying them for
    // themselves. The batch is still the page's; the rule follows the work.
    const src = code("app/(marketing)/p/[slug]/page.tsx")
    const loaders = code("lib/commerce/product-page-data.ts")
    return (
      /Promise\.all\(\[/.test(src) &&
      /loadStoreConfig\(product\.creator_id, "shop"\)/.test(src) &&
      /loadStoreConfig\(product\.creator_id, "product"\)/.test(src) &&
      /loadProductPageConfig\(product\.creator_id, product\.id\)/.test(src) &&
      /store_builder_configs/.test(loaders) &&
      /product_page_configs/.test(loaders)
    )
  })(),
  "        app/(marketing)/p/[slug]/page.tsx",
)

check(
  "the creator storefront fetches its products and its config together",
  (() => {
    // Both key off creator.id alone. The profile → creator hop above them is
    // genuinely sequential and is deliberately NOT asserted away.
    const src = code("app/(marketing)/u/[username]/page.tsx")
    return /Promise\.all\(\[/.test(src) && /getPublishedConfig\(creator\.id, "shop"\),/.test(src)
  })(),
  "        app/(marketing)/u/[username]/page.tsx",
)

// ---------------------------------------------------------------------------
section("A fast page shows no skeleton at all")
// ---------------------------------------------------------------------------

/**
 * loading.tsx is rendered by Next.js the instant a navigation starts, so an
 * undeferred skeleton flashes even when the page was ready in 50ms. The
 * `skeleton-deferred` class holds it invisible for 200ms and fades it in after,
 * so only a genuinely slow page ever shows one.
 *
 * These render a full-screen solid colour rather than a skeleton and are meant
 * to paint immediately — delaying them shows a white gap during native cold
 * start, which is worse than the thing being guarded against.
 */
const INSTANT_BY_DESIGN = new Set([
  "app/native-start/loading.tsx",
  "app/auth/auth-code-error/loading.tsx",
  "app/(auth)/signup/loading.tsx",
  "app/(auth)/login/loading.tsx",
  "app/(auth)/welcome/loading.tsx",
])

function loadingFiles(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`
    if (entry === "node_modules" || entry.startsWith(".")) continue
    if (statSync(join(root, rel)).isDirectory()) out = out.concat(loadingFiles(rel))
    else if (entry === "loading.tsx") out.push(rel)
  }
  return out
}

check(
  "every skeleton loading screen is deferred",
  (() => {
    const offenders = loadingFiles("app").filter((f) => {
      if (INSTANT_BY_DESIGN.has(f)) return false
      const src = read(f)
      // A file that renders no skeleton has nothing to defer.
      if (!/Skeleton|animate-pulse/.test(src)) return false
      if (src.includes("skeleton-deferred")) return false
      /* A loading file that draws a shared outline (the product editor's is
         drawn by both of its addresses) is deferred when that outline is. */
      const shared = [...src.matchAll(/from "(\.{1,2}\/[^"]+)"/g)].map((m) => join(dirname(f), m[1]) + ".tsx")
      return !shared.some((file) => existsSync(join(root, file)) && read(file).includes("skeleton-deferred"))
    })
    if (offenders.length) console.log("        " + offenders.join("\n        "))
    return offenders.length === 0
  })(),
)

/**
 * NO LOADING BOUNDARY BETWEEN /app PAGES. A loading.tsx under /app is a
 * Suspense boundary Next.js swaps in on the first frame of a navigation, so
 * the page you were on disappeared into a blank or a skeleton even when the
 * next one was a moment away. "Skeleton loading is not needed on normal
 * navigation; only if a page takes extremely long." Without one the router
 * holds the old page until the new one is ready, and the shell shows its
 * spinner only if that takes a while (components/app/app-stage.tsx). Products is
 * looked after with that page and keeps its own for now.
 */
check(
  "no /app page has a route loading boundary, so the page you are on stays while the next one loads",
  (() => {
    const offenders = loadingFiles("app/app").filter((f) => !f.startsWith("app/app/products/"))
    if (offenders.length) console.log("        " + offenders.join("\n        "))
    return offenders.length === 0
  })(),
)

check(
  "and a slow page waits on the shell's spinner, not on an outline of itself: past a second on a computer, half a second on a phone",
  (() => {
    const stage = read("components/app/app-stage.tsx")
    const nav = read("lib/ui/app-navigation.ts")
    return (
      /export const NAV_SPINNER_AFTER_MS = 1000/.test(nav) &&
      /export const NAV_PHONE_SPINNER_AFTER_MS = 500/.test(nav) &&
      /export const NAV_BAR_AFTER_MS = 300/.test(nav) &&
      /<PageSpinner \/>/.test(stage) &&
      !/RouteSkeleton/.test(stage) &&
      !existsSync(join(root, "components/app/route-skeletons.tsx"))
    )
  })(),
)

check(
  "the deferral is actually defined, and respects reduced motion",
  (() => {
    const css = read("app/globals.css")
    return (
      /\.skeleton-deferred\s*\{/.test(css) &&
      /animation:\s*skeleton-reveal[^;]*200ms/.test(css) &&
      /prefers-reduced-motion/.test(css)
    )
  })(),
  "        app/globals.css",
)

// ---------------------------------------------------------------------------
section("The chrome does not repaint itself on every navigation")
// ---------------------------------------------------------------------------

check(
  "the header renders from the last known session instead of a placeholder",
  (() => {
    // `loading` started true unconditionally, so the grey pills were painted on
    // every load for everybody and replaced once getUser() returned.
    /* Changed on purpose: seeding useState from the snapshot made the server
       and a returning visitor's browser draw different headers in the same
       hydration pass (a React hydration warning and a redraw). The snapshot
       is now applied in a layout effect, after hydration and before paint,
       so the first paint is still the right header and the two renders agree. */
    const src = code("components/platform/platform-header-client.tsx")
    return (
      /useLayoutEffect\(\(\) => \{\s*const seed = readAuthSnapshot\(\)/.test(src) &&
      /setLoading\(false\)\s*\}, \[\]\)/.test(src) &&
      !/useState[^(]*\(\(\) => [^)]*readAuthSnapshot/.test(src) &&
      /writeAuthSnapshot\(/.test(src) &&
      /clearAuthSnapshot\(\)/.test(src)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "the snapshot is a rendering hint and never an authorisation",
  (() => {
    // Nothing may be GATED on it — the real getUser() still decides. If this
    // ever guards a fetch or an admin path, it has become a security boundary
    // built on localStorage.
    const src = code("lib/auth/auth-snapshot.ts")
    return !/service_role|createAdminClient|accessToken|access_token/.test(src)
  })(),
  "        lib/auth/auth-snapshot.ts",
)

check(
  "the wishlist badge is in the first painted HTML, not added at hydration",
  (() => {
    /**
     * The red bubble arrived after the page had settled.
     *
     * The first attempt at this seeded React state from localStorage, and it did
     * not work -- it moved the delay from "after the fetch" to "after
     * hydration". The SERVER still rendered the badge as absent, so the page
     * still painted without it. localStorage is invisible to the server.
     *
     * The count is mirrored into a COOKIE, read in the marketing layout, and
     * passed down as a prop, so it is server-rendered into the first paint. Both
     * sides seed from that same prop, which is also what keeps hydration
     * matching.
     *
     * It is client-written, so the server clamps it to a plain non-negative
     * integer and the real list is still fetched and still wins. A count is a
     * decoration; it is never an authorisation.
     */
    const header = code("components/platform/platform-header-client.tsx")
    const conditional = code("components/marketing/conditional-header.tsx")
    const layout = code("app/(marketing)/layout.tsx")

    const missing: string[] = []
    if (!/useState\(initialWishlistCount\)/.test(header))
      missing.push("header: badge not seeded from the server prop")
    if (!/document\.cookie = `storelib_wishlist_count=/.test(header))
      missing.push("header: count not mirrored into a cookie")
    if (!/localStorage/.test(header) === false && /_sl_wishlist_count/.test(header))
      missing.push("header: still using localStorage, which the server cannot read")
    if ((header.match(/setWishlistCount\(/g)?.length ?? 0) > 2)
      missing.push("header: more than one writer for the badge")
    if (!/initialWishlistCount=\{initialWishlistCount\}/.test(conditional))
      missing.push("conditional-header: prop not threaded through")
    /* The read moved to lib/platform/header-props when /library started
       drawing this header too: two layouts, one copy of the function. */
    const headerProps = code("lib/platform/header-props.ts")
    if (!/cookies\(\)/.test(headerProps) || !/storelib_wishlist_count/.test(headerProps))
      missing.push("header-props: not reading the cookie server-side")
    if (!/Number\.isInteger\(n\) && n >= 0/.test(headerProps))
      missing.push("header-props: client-written cookie not clamped")
    if (!/readWishlistCount\(\)/.test(layout))
      missing.push("marketing layout: no longer asks for the count")
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the slowest hop in the dashboard is prefetched before it is clicked",
  (() => {
    const src = code("components/shared/prefetch-links.tsx")
    return /"\/app\/settings":\s*\["\/app\/settings\/billing"\]/.test(src)
  })(),
  "        components/shared/prefetch-links.tsx",
)

// ---------------------------------------------------------------------------
section("Native: feedback that works, and no route out to the marketing site")
// ---------------------------------------------------------------------------

check(
  "nothing calls navigator.vibrate directly",
  (() => {
    /**
     * navigator.vibrate IS NOT IMPLEMENTED ON iOS -- not Safari, not the
     * WKWebView the app runs in. It does not throw; the property is absent, so
     * the usual `"vibrate" in navigator` guard reads false and the call is
     * skipped in silence. Feedback then works on Android and does nothing at all
     * on an iPhone, with no error anywhere.
     *
     * That is how it came to be wrong in three separate places -- the dashboard
     * chart, the analytics chart and the OnePage link reorder. lib/native-bridge
     * hapticTap() is the one way to ask for a tap: Capacitor Haptics when native
     * (the only thing that reaches the Taptic Engine), navigator.vibrate on the
     * web. This is the build failure that stops a fourth one being written.
     */
    const roots = ["app", "components", "hooks"]
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir))) {
        if (entry === "node_modules" || entry.startsWith(".")) continue
        const rel = `${dir}/${entry}`
        if (statSync(join(root, rel)).isDirectory()) walk(rel)
        /**
         * `code`, not `read`. This asks whether anything CALLS it, and the
         * files that correctly use hapticTap explain in a comment WHY they do
         * not call navigator.vibrate — which is prose, not a call, and used to
         * fail this. See tests/_source: the same trap, a fifth time.
         */
        else if (/\.(ts|tsx)$/.test(entry) && /navigator\.vibrate/.test(code(rel))) offenders.push(rel)
      }
    }
    roots.forEach(walk)
    if (offenders.length) console.log("        " + offenders.join("\n        "))
    return offenders.length === 0
  })(),
  "        use hapticTap() from lib/native-bridge instead",
)

check(
  "hapticTap reaches the Taptic Engine when native, and falls back on the web",
  (() => {
    const src = code("lib/native-bridge.ts")
    const fn = src.slice(src.indexOf("export function hapticTap"))
    return (
      /isNativeApp\(\)/.test(fn) &&
      /triggerHaptic\(strength\)/.test(fn) &&
      /navigator\.vibrate/.test(fn)
    )
  })(),
  "        lib/native-bridge.ts",
)

check(
  "the chart scrub asks for a haptic on BOTH charts",
  (() => {
    // The dashboard chart was fixed first and the analytics chart -- the one on
    // the screen actually named -- was missed, because each carried its own copy
    // of the same guarded vibrate call.
    const dash = code("components/app/dashboard-client.tsx")
    /*
      The analytics chart moved to its own module — components/app/analytics-chart —
      so the page no longer contains the scrub that asks for the tap. This
      pointed at the page and went red for a chart that had not changed
      behaviour at all, only address.
    */
    /*
      And both charts now draw one layer, components/app/chart-scrub, which
      is where the taps are asked for: one place, so neither chart can miss
      them again.
    */
    const layer = code("components/app/chart-scrub.tsx")
    return /hapticTap\(r\.index < 0 \? "medium" : "light"\)/.test(layer) &&
           /import \{ hapticTap \} from "@\/lib\/native-bridge"/.test(layer) &&
           /<ChartScrub\b/.test(dash) &&
           /<ChartScrub\b/.test(code("components/app/analytics-chart.tsx"))
  })(),
  "        chart-scrub.tsx, drawn by dashboard-client.tsx and analytics-chart.tsx",
)

check(
  "the native app cannot land on the marketing site, header or no header",
  (() => {
    /**
     * Two gates, deliberately. proxy.ts redirects on the "Capacitor" User-Agent,
     * which is best because nothing renders at all -- but it depends on that
     * header arriving, and appendUserAgent is native-side config a cached
     * response never reaches. The boot script in <head> repeats the decision
     * from the runtime bridge, synchronously, before <body> paints.
     *
     * /native-start must NOT be in either list or the app redirect-loops on
     * launch.
     */
    const proxy = code("proxy.ts")
    const layout = read("app/layout.tsx")
    const serverGate =
      /NATIVE_BLOCKED\s*=\s*\["\/pricing", "\/features", "\/faq", "\/blog"\]/.test(proxy) &&
      /url\.pathname = "\/native-start"/.test(proxy) &&
      // Scoped to the array literal itself. An unanchored search here matches
      // the `url.pathname = "/native-start"` two lines below and passes for the
      // wrong reason.
      !(proxy.match(/NATIVE_BLOCKED\s*=\s*\[[^\]]*\]/)?.[0] ?? "").includes("native-start")
    const clientGate =
      /location\.replace\('\/native-start'\)/.test(layout) &&
      /pricing\|features\|faq\|blog/.test(layout)
    return serverGate && clientGate
  })(),
  "        proxy.ts + app/layout.tsx boot script",
)

check(
  "the native launch screen can never redirect into a loop",
  (() => {
    /**
     * THE OUTAGE THIS EXISTS FOR.
     *
     * cacheNativeHome() was called with whatever `next` the login URL carried,
     * so "/" could be stored as the app's home. /native-start then sent the app
     * to "/", and once "/" also redirected back to /native-start for native, the
     * two ping-ponged at a few requests per second and the app never left its
     * launch screen. Production logs showed /native-start and / at 150 and 147
     * hits in twenty minutes -- one to one, which is what a loop looks like.
     *
     * Three layers have to agree, and all three are asserted, because any one of
     * them alone still leaves a device that cached "/" under an older build
     * looping on first launch after the update.
     */
    const bridge = code("lib/native-bridge.ts")
    const start = code("app/native-start/page.tsx")
    const offline = read("out/index.html")

    const sanitiserRejectsRoot =
      /NATIVE_HOME_ALLOWED\s*=\s*\["\/app", "\/library", "\/dashboard", "\/creator-page", "\/store-builder"\]/.test(bridge) &&
      // Protocol-relative "//host" leaves the app entirely, so a leading "/"
      // alone must not be accepted.
      /startsWith\("\/\/"\)/.test(bridge)
    const sanitisedOnWrite = /const destination = sanitizeNativeHome\(rawDestination\)/.test(bridge)
    const sanitisedOnRead = /value \? sanitizeNativeHome\(value\) : null/.test(bridge)
    const startGuards =
      /sanitizeNativeHome\(url\)/.test(start) &&
      /target === "\/native-start"/.test(start)
    const offlineGuards = /ALLOWED\s*=\s*\['\/app', '\/library', '\/dashboard', '\/creator-page', '\/store-builder'\]/.test(offline)

    const missing: string[] = []
    if (!sanitiserRejectsRoot) missing.push("lib/native-bridge.ts: sanitizeNativeHome allowlist")
    if (!sanitisedOnWrite) missing.push("lib/native-bridge.ts: cacheNativeHome does not sanitise")
    if (!sanitisedOnRead) missing.push("lib/native-bridge.ts: getCachedNativeHome does not sanitise")
    if (!startGuards) missing.push("app/native-start/page.tsx: safeRedirect unguarded")
    if (!offlineGuards) missing.push("out/index.html: offline fallback unguarded")
    /**
     * "Store Builder" became "Creator Page", and a rename that breaks the old
     * address is a removal. /store-builder is in bookmarks and in links people
     * have sent each other, so it still answers.
     */
    if (!existsSync(join(root, "app/store-builder/page.tsx")))
      missing.push("the old /store-builder address no longer answers")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the badge hangs off the heart, not off the tap target",
  (() => {
    // The link is a 44px tap target with a 20px heart centred in it, so a badge
    // positioned against the LINK sat ~12px clear of the glyph and read as
    // floating loose. It was always so; shrinking the bubble made it obvious.
    const src = code("components/platform/platform-header-client.tsx")
    // Both badges are the one CountBadge now, each inside the heart's own wrapper.
    const wrappers = src.match(/<span className="relative inline-flex">\s*<Heart[^>]*\/>\s*\{wishlistCount > 0 && \(\s*(?:\/\*[\s\S]*?\*\/\s*)?<CountBadge /g)?.length ?? 0
    const badges = src.match(/bg-red-500/g)?.length ?? 0
    return wrappers === 2 && badges === 1
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "the homepage header is decided on the server, and never leaks to a seller domain",
  (() => {
    /**
     * "/" was excluded from the header's synchronous check because it is
     * ambiguous ON THE CLIENT — a seller's custom domain also has a "/". So the
     * homepage rendered no header at all until an effect ran, and the whole
     * thing appeared after hydration.
     *
     * The ambiguity is only client-side: the server has the Host header. It
     * answers now, which is what puts the homepage header in the first paint.
     *
     * The safety half matters more than the speed half. If this ever renders
     * platform chrome on a seller subdomain or a custom domain, somebody's shop
     * grows a Storelib header — so the answer must be BOTH checks, not just one.
     */
    const layout = code("app/(marketing)/layout.tsx")
    const header = code("components/marketing/conditional-header.tsx")
    return (
      /* The host test lives in lib/platform/header-props now; the layout
         still has to ask for it and thread it through. */
      /extractUsernameFromHost\(host\) === null && !isCustomDomain\(host\)/.test(code("lib/platform/header-props.ts")) &&
      /isPlatformDomain\(\)/.test(layout) &&
      /onPlatformDomain=\{onPlatformDomain\}/.test(layout) &&
      /pathname === "\/" && onPlatformDomain/.test(header)
    )
  })(),
  "        app/(marketing)/layout.tsx + conditional-header.tsx",
)

check(
  "the pull-to-refresh spinner sits under the announcement bar and disturbs nothing",
  (() => {
    /**
     * The bar used to be INSIDE the sliding content, so a pull pushed the purple
     * bar down the screen and opened a white gap between it and the header, with
     * the spinner floating in that gap above the bar, over nothing.
     *
     * The bar is anchored now and only what is below it moves, so the gap opens
     * UNDER the bar. Three things have to hold, and the order is one of them:
     * the bar must be rendered BEFORE the indicator's positioning context, or
     * "topOffset from the top" means the top of the page again.
     */
    const dash = read("components/app/dashboard-client.tsx")
    const indicator = code("components/app/pull-to-refresh-indicator.tsx")

    /* Where Home renders its strip (AnnouncementBar), not where the strip is defined. */
    const barAt = dash.indexOf("<AnnouncementBar slides=")
    const indicatorAt = dash.indexOf("<PullToRefreshIndicator")
    const slideAt = dash.indexOf("ref={contentRef}")

    const missing: string[] = []
    if (barAt < 0 || indicatorAt < 0 || slideAt < 0) missing.push("dashboard: bar, indicator or slide wrapper not found")
    else {
      if (!(barAt < indicatorAt)) missing.push("dashboard: spinner renders above the announcement bar")
      // The bar must not be inside the thing that moves.
      if (!(barAt < slideAt)) missing.push("dashboard: announcement bar is inside the sliding wrapper again")
    }
    // Out of flow and untappable, so it can never displace or swallow a control.
    if (!/absolute[^"]*pointer-events-none/.test(indicator))
      missing.push("indicator: not absolute + pointer-events-none")
    /**
     * NO PHASE MAY PLACE THE RING ABOVE ITS ANCHOR — INCLUDING THE EXIT.
     *
     * The exit used to slide it to -(size + 8) while the opacity was still
     * fading, so at the END of a refresh it visibly rose over the purple bar.
     * Parking off-screen was meant to stop it peeking; opacity 0 already does
     * that, and the cost was an animation crossing the one element it had to
     * stay clear of.
     *
     * Both clamps now live in the hook, which paints every frame: the drag
     * offset and the resting one.
     */
    const hook = code("hooks/use-pull-to-refresh.ts")
    if (!/Math\.max\(\(offset - RING_SIZE\) \/ 2, 0\)/.test(hook))
      missing.push("hook: the drag offset is not clamped to its anchor")
    if (!/const restingY = Math\.max\(\(refreshHold - RING_SIZE\) \/ 2, 0\)/.test(hook))
      missing.push("hook: the resting offset is not clamped to its anchor")
    if (/offScreen/.test(hook) || /offScreen/.test(indicator))
      missing.push("indicator: the off-screen exit is back")
    /**
     * THE EXIT MUST CHANGE NOTHING BUT OPACITY AND SCALE.
     *
     * When the refresh finished, three things changed in the same instant while
     * the ring was still visible for another 260ms: the spin animation was
     * removed so the SVG snapped its rotation back to zero (the ring appearing
     * to "go back in a circle"), the arc collapsed from three-quarters to
     * nothing, and it slid up toward the bar. Clamping the offset did not fix
     * any of that, because none of it was a position bug.
     *
     * The exit paints the ring at `restingY` — the same place the refresh left
     * it — keeps the spinner's arc, and keeps the rotation the pull ended on.
     * Only the opacity and the scale move.
     */
    const exit = /paintRing\(\{\s*y: restingY,\s*opacity: 1 - u,/.test(hook)
    if (!exit) missing.push("hook: the exit no longer holds the ring where the refresh left it")
    if (!/dash: endDash,/.test(hook))
      missing.push("hook: the arc collapses when the refresh ends")
    if (!/turn: heldTurnRef\.current \?\? PULL_TURN_DEG/.test(hook))
      missing.push("hook: the rotation is not held through the fade")
    // The ring must centre in the SAME gap the page holds open.
    if (!/refreshHold/.test(indicator) || !/refreshHold=\{REFRESH_HOLD\}/.test(dash))
      missing.push("dashboard/indicator: refresh gap not shared, positions can drift")
    if (!/const REFRESH_HOLD = PULL_TO_REFRESH\.refreshHold/.test(dash))
      missing.push("dashboard: the hold distance is a second literal again")
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "a pull to refresh does not render the dashboard",
  (() => {
    /**
     * ========================================================================
     *  THE REASON IT COULD NOT HOLD A FRAME RATE
     * ========================================================================
     * The hook held the pull distance and the phase in React state and wrote
     * both on EVERY touchmove. DashboardClient is 1400 lines of charts, cards
     * and lists, so every frame of a drag re-rendered all of it and then
     * recomputed a translateY and a transition string from the result.
     *
     * Measured with scripts/check-pull-refresh.mjs, at 390px with the CPU
     * throttled 4x, over a 150px pull delivered in 48 moves across 640ms:
     *
     *                      before        after
     *   dashboard renders      16            0
     *   React elements       9168            0
     *   frames drawn           32           39
     *   longest frame gap    50ms       16.8ms
     *   gaps over 16.7ms   10 of 31      3 of 38
     *   forced layouts          1            0
     *
     * So: no state at all during the gesture. The hook writes the two elements
     * itself, one write per frame, coalesced through rAF.
     */
    const hook = code("hooks/use-pull-to-refresh.ts")
    const dash = code("components/app/dashboard-client.tsx")
    const indicator = code("components/app/pull-to-refresh-indicator.tsx")
    const bad: string[] = []

    if (/useState/.test(hook)) bad.push("hook: React state is back in the gesture")
    if (/setPullDistance/.test(hook)) bad.push("hook: a distance setter is back in the gesture")
    if (!/return \{ contentRef, indicatorRef, phaseRef \}/.test(hook))
      bad.push("hook: it returns something other than refs, so the caller subscribes again")
    // The phase is a ref and a callback, so a caller can know without subscribing.
    if (!/phaseRef/.test(hook)) bad.push("hook: no way left to read the phase")
    // One write per frame, not one per move.
    if (!/if \(!queued\) queued = requestAnimationFrame\(draw\)/.test(hook))
      bad.push("hook: touchmove paints directly again instead of coalescing to a frame")
    if (!/style\.transform = `translate3d\(0, \$\{y\}px, 0\)`/.test(hook))
      bad.push("hook: the content wrapper is not moved on the compositor")
    // The indicator must be markup only: no prop it recomputes per frame.
    if (/pullDistance/.test(indicator)) bad.push("indicator: it takes a per-frame prop again")
    if (/useState|useEffect/.test(indicator)) bad.push("indicator: it has state again")
    // And the dashboard must not compute a transform for it.
    if (/contentTranslateY|contentTransition/.test(dash))
      bad.push("dashboard: the pull is being rendered again")
    // The arc is the one per-frame attribute, and it goes to the node.
    if (!/arc\.setAttribute\("stroke-dasharray"/.test(hook))
      bad.push("hook: the arc is not written to the DOM directly")

    if (bad.length) console.log("        " + bad.join("\n        "))
    return bad.length === 0
  })(),
)

check(
  "the pull has iOS resistance, an iOS settle, and a tick when it arms",
  (() => {
    /**
     * RESISTANCE. It was `Math.min(dy * 0.45, maxPull)`: a straight line to a
     * dead stop. UIScrollView's rubber band instead, which starts near 1:1 and
     * gets progressively heavier without ever reaching its limit, so the page
     * never goes rigid under a finger that is still moving.
     *
     * Measured (scripts/check-pull-refresh.mjs, offsets read off the element):
     *
     *   finger    before     after
     *     20px      9px    15.2px
     *     40px     18px    26.3px
     *     60px     27px    34.8px
     *     80px     36px    41.5px
     *    120px     54px    51.4px
     *    200px     90px    63.5px   (the old one is pinned at its limit here)
     *
     * The threshold moved with the curve: 48px of offset, reached at 105px of
     * finger, where the old 60px took 133px.
     *
     * SETTLE. One cubic ease became a spring stepped in rAF: 15 frames, 233ms,
     * 0.44px of overshoot, measured.
     *
     * HAPTICS. A light tick crossing into range, a softer one falling back out,
     * once per crossing rather than once per frame. Same hapticTap the chart
     * scrub and the phone nav call.
     */
    const hook = code("hooks/use-pull-to-refresh.ts")
    const bad: string[] = []

    if (/Math\.min\(dy \* 0\.45/.test(hook)) bad.push("the linear resistance is back")
    if (!/\(1 - 1 \/ \(\(travel \* tension\) \/ limit \+ 1\)\) \* limit/.test(hook))
      bad.push("the rubber band curve is gone")
    if (!/rubberBand\(pendingDy, maxPull, tension\)/.test(hook))
      bad.push("the drag does not use the rubber band")

    // A spring, stepped in frames, on transform only.
    if (!/SPRING_STIFFNESS|SPRING_DAMPING/.test(hook)) bad.push("the settle is not a spring any more")
    if (!/v \+= \(-SPRING_STIFFNESS \* \(x - to\) - SPRING_DAMPING \* v\) \* h/.test(hook))
      bad.push("the spring is not integrated per frame")
    // Reduced motion gets there without any of it.
    if (!/prefers-reduced-motion: reduce/.test(hook)) bad.push("prefers-reduced-motion is not respected")
    if (!/if \(reducedMotion\(\)\) \{/.test(hook)) bad.push("the settle runs its spring even with reduced motion")

    // One tick per crossing: the haptic sits behind the change of `armed`.
    if (!/import \{ hapticTap \} from "@\/lib\/native-bridge"/.test(read("hooks/use-pull-to-refresh.ts")))
      bad.push("no haptics, or not through the one function that owns the platform difference")
    if (!/if \(past !== armed\) \{[\s\S]{0,400}hapticTap\(past \? "light" : "soft"\)/.test(hook))
      bad.push("the haptic is not once per crossing")
    if ((hook.match(/hapticTap\(/g) ?? []).length !== 1)
      bad.push("something else fires a haptic: nothing on release, nothing when the refresh ends")

    // A refresh that returns instantly still looks deliberate.
    if (!/minSpin: \d+/.test(hook)) bad.push("no minimum spinner time")
    if (!/const rest = minSpin - \(performance\.now\(\) - started\)/.test(hook))
      bad.push("the minimum spinner time is not held")

    // The compositor layer is only held while something moves.
    if (/willChange: "transform"/.test(code("components/app/dashboard-client.tsx")))
      bad.push("dashboard: will-change is permanent again")
    if (/willChange/.test(code("components/app/pull-to-refresh-indicator.tsx")))
      bad.push("indicator: will-change is permanent again")
    if (!/setLifted\(false\)/.test(hook)) bad.push("will-change is never taken off")

    // Still true, and still the point: the listener only blocks at the top,
    // and a touch inside a sheet is not ours.
    if (!/new IntersectionObserver/.test(hook)) bad.push("the touchmove listener is bound everywhere again")
    if (!/\[data-dashboard-sheet\]/.test(hook)) bad.push("touches inside a sheet are intercepted again")
    if (!/e\.preventDefault\(\)/.test(hook)) bad.push("nothing stops the native rubber band any more")

    if (bad.length) console.log("        " + bad.join("\n        "))
    return bad.length === 0
  })(),
)

check(
  "the creator storefront's subscribe bar sticks on scroll up, and stays toggleable",
  (() => {
    /**
     * THIS TOOK FOUR ATTEMPTS. THE HISTORY IS THE POINT.
     *
     *   1. Flipped the default in lib/store-builder/defaults.ts. Nothing
     *      changed — the storefront page never reads that file, it builds its
     *      own settings object.
     *   2. Changed the page's fallback to `?? true`. Nothing changed — the
     *      builder writes the toggle out on every save whether or not anyone
     *      touched it, and it defaulted to off, so nearly every stored config
     *      holds an explicit `false`. `false ?? true` is `false`.
     *   3. Hardcoded `true` in the page. The bar stuck — and the builder's
     *      toggle stopped meaning anything, which was not acceptable.
     *   4. `stickyBarChoiceMade`: the flag the builder sets the first time a
     *      creator actually moves the switch. Absent -> platform default (on).
     *      Present -> the stored value is honoured exactly, `false` included.
     *
     * So the assertion is a property, not a shape: an untouched config must
     * come out sticky, and a config the creator switched off must come out
     * off. Both are evaluated below against the real expression lifted from
     * the page, so a future edit that breaks either one fails here.
     */
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const bar = code("components/store-builder/subscribe-bar.tsx")
    const sidebar = code("components/store-builder/sections-sidebar.tsx")
    const preview = code("components/store-builder/preview-canvas.tsx")
    const migrations = readdirSync(join(root, "supabase/migrations"))
      .map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8"))
      .join("\n")

    const missing: string[] = []

    /**
     * THE PAGE'S OWN EXPRESSION IS LIFTED OUT AND RUN. Not a copy of it.
     *
     * The first version of this check declared its own `decide()` alongside
     * and asserted that — which passes no matter what the page does. I proved
     * that by reverting the page to the naive `?? true` and to the hardcoded
     * `true`, and it stayed green through both. A test that restates the
     * logic tests nothing; that is the same class of mistake as asserting a
     * code shape instead of a property, which is what let attempt 3 through.
     *
     * So: extract `stickyDefaults` from the source, strip the TS annotation,
     * evaluate it, and put the four cases that matter through the real thing.
     */
    const decl = page.match(/const stickyDefaults = \(saved[^)]*\) =>[\s\S]*?\n\n/)?.[0]
    if (!decl) {
      missing.push("storefront: stickyDefaults is gone — the sticky decision moved or was inlined")
    } else {
      const src = decl.replace(/saved\?: [^)]*\)/, "saved)").trim()
      // eslint-disable-next-line no-new-func
      const decide = new Function(`${src}; return stickyDefaults`)() as (
        saved?: Record<string, unknown>,
      ) => { enableStickyBar: boolean }

      const sticky = (saved?: Record<string, unknown>) => decide(saved).enableStickyBar

      if (sticky(undefined) !== true) missing.push("a storefront with no saved config is not sticky")
      if (sticky({}) !== true) missing.push("an untouched saved config is not sticky")
      if (sticky({ enableStickyBar: false }) !== true)
        missing.push("a legacy stored false (no explicit choice) still wins — the whole bug")
      if (sticky({ enableStickyBar: false, stickyBarChoiceMade: true }) !== false)
        missing.push("a creator who switched sticky off is being overridden — the toggle is dead again")
      if (sticky({ enableStickyBar: true, stickyBarChoiceMade: true }) !== true)
        missing.push("a creator who switched sticky on is being overridden")
    }

    if (/enableStickyBar:\s*(savedSettings\.enableStickyBar \?\? )?false/.test(page))
      missing.push("storefront: sticky can be false again — a stored false will win")
    // The bar itself: both branches of the builder pin `visible`, so a stale
    // `visible: false` in somebody's saved config cannot hide it any more.
    if (/visible:\s*savedSettings\.visible/.test(page))
      missing.push("storefront: the bar reads a `visible` the builder can no longer set")
    if ((page.match(/visible:\s*true/g)?.length ?? 0) < 2)
      missing.push("storefront: both subscribe-settings branches must render the bar")

    // ── The toggle must still exist and still record the choice ─────────────
    if (!/stickyBarChoiceMade:\s*true/.test(sidebar))
      missing.push("store builder: the sticky toggle no longer records that a choice was made")
    if (!/label="Enable Sticky Bar"/.test(sidebar))
      missing.push("store builder: the sticky toggle is gone — creators must be able to switch it off")

    // ── The bar itself is not optional any more ─────────────────────────────
    if (/description="Display newsletter signup bar above the header"/.test(sidebar))
      missing.push("store builder: the subscribe-bar visibility toggle is back")
    if (/subscribeBarSettings\?\.visible &&/.test(preview))
      missing.push("store builder preview: still gates the bar on a `visible` that can no longer be set")

    // ── The migration that normalises the legacy rows ───────────────────────
    if (!/stickyBarChoiceMade/.test(migrations))
      missing.push("no migration backfills the legacy stored false")

    // ── And the bar must still actually do something with it ────────────────
    if (!/fixed left-0 right-0/.test(bar))
      missing.push("subscribe bar: sticky mode no longer pins the bar")
    if (!/!isVisible && settings\.enableStickyOnScrollUp && "-translate-y-full"/.test(bar))
      missing.push("subscribe bar: no longer hides on scroll down")
    /**
     * THE SCROLL HANDLER IS SHARED NOW. It was thirty lines inside this bar
     * and nowhere else, so Storelib's other top bar — the creator bar on a
     * product page — was pinned and never moved. Both use the hook, and the
     * three details that keep it from twitching are checked where they live.
     */
    const reveal = code("lib/store-builder/use-reveal-on-scroll-up.ts")
    if (!/useRevealOnScrollUp\(/.test(bar))
      missing.push("subscribe bar: no longer uses the shared reveal-on-scroll-up")
    if (!/useRevealOnScrollUp\(\)/.test(code("components/store-builder/discover-sticky-wrapper.tsx")))
      missing.push("the product page's creator bar is pinned again — it never gets out of the way")
    // Smoothed, not per-event: this used to setState on every scroll frame.
    if (!/requestAnimationFrame\(evaluate\)/.test(reveal))
      missing.push("reveal-on-scroll-up: scroll handler is no longer frame-throttled")
    if (!/const DELTA = 6/.test(reveal))
      missing.push("reveal-on-scroll-up: jitter is treated as a direction again")
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "BodyScrollRestorer cannot slam Radix overlays shut",
  (() => {
    /**
     * THE BUG: EVERY <Select> ON THE PLATFORM WAS BROKEN, FOR MONTHS.
     *
     * Opening a Radix Select mounts its content through react-remove-scroll,
     * which puts `data-scroll-locked` on <html>. BodyScrollRestorer's
     * MutationObserver fired on that; its `hasOpenOverlay()` knew only about
     * dialogs and sheets, so it decided the lock was orphaned and ran
     * `repair()` — which dispatches a synthetic window `resize`. Radix Select
     * registers `window.addEventListener("resize", close)`. Click a select,
     * it opens, and one microtask later this component closed it again.
     *
     * Dropdowns and popovers survived because they reposition on resize
     * rather than closing, which is exactly why it looked select-specific.
     *
     * Verified in a real browser before and after: trigger `data-state`
     * stayed "closed" on click before the fix, "open" after.
     */
    const restorer = code("components/body-scroll-restorer.tsx")
    const select = code("components/ui/select.tsx")
    const missing: string[] = []

    // Every layer that legitimately locks scroll has to be recognised.
    for (const marker of [
      "data-radix-popper-content-wrapper",
      "select-content",
      "dialog-content",
      "sheet-content",
    ]) {
      if (!restorer.includes(marker))
        missing.push(`overlay detection no longer covers ${marker} — its layers will be force-closed`)
    }

    // repair() must be inert when nothing is stuck or a LIVE overlay owns the
    // lock — and must still act when the page is inert with no live overlay.
    if (!/if \(!isScrollLocked\(\) \|\| hasOpenOverlay\(\)\) return/.test(restorer))
      missing.push("repair() runs unconditionally again — it will fire a resize into a working page")
    if (!/if \(isInteractionBlocked\(\) && !hasLiveOverlay\(\)\)/.test(restorer))
      missing.push("an inert page with a leaked overlay node can never be repaired — clicks stay dead")

    // The synthetic resize is the actual weapon; it must stay behind repair().
    const dispatches = restorer.match(/dispatchEvent\(new Event\("resize"\)\)/g)?.length ?? 0
    if (dispatches !== 1)
      missing.push(`expected exactly one synthetic resize behind the guard, found ${dispatches}`)

    // The other half of the store-builder report: 93px-wide selects.
    if (/flex w-fit items-center justify-between/.test(select))
      missing.push("SelectTrigger is back to w-fit — every select in the app shrinks to its text")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "avatars do not flash their initials before the photo",
  (() => {
    /**
     * THE BUG: the profile avatar in the store-builder canvas flashed grey
     * initials and popped, sometimes repeatedly.
     *
     * Three separate causes, all of them ours:
     *
     *   1. `<Avatar key={avatarKey}>` in the shop header, keyed on the avatar
     *      URL. A key change is a REMOUNT, and a remount resets Radix's image
     *      loading state — so the avatar dropped back to initials and popped
     *      to the photo every time the URL changed. Changing `src` already
     *      re-runs the loader; the key bought nothing and cost a flash.
     *   2. `delayMs={0}` on the fallback — the explicit opposite of what stops
     *      a flash. It says "show the initials immediately", so every mount
     *      painted initials first even when the image was already cached.
     *   3. Radix swaps to the fallback the instant `src` changes, so picking a
     *      new avatar blinked initials for the whole download. AvatarImage now
     *      decodes the new src on a detached Image and only then moves the DOM
     *      src across.
     *
     * Verified in a real browser by counting the animation frames in which a
     * fallback element existed: 0 on mount and 0 across a src change, while a
     * broken URL and a missing image both still fall back to initials.
     */
    const avatar = code("components/ui/avatar.tsx")
    const header = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    /*
      The default delay, read out of the source rather than pattern-matched —
      and followed through the constant it now lives in. The literal moved to
      FALLBACK_DELAY_MS because a second thing depends on it: the avatar's
      fade-in is played only when the picture arrived LATER than this, which
      is the difference between a cross-fade that has something to fade out of
      and one that replays on every back navigation. Two copies of 600 would
      be two chances for those to disagree, so this resolves the name.
    */
    const delay = Number(
      avatar.match(/delayMs = (\d+)/)?.[1] ??
        (/delayMs = FALLBACK_DELAY_MS/.test(avatar) ? avatar.match(/const FALLBACK_DELAY_MS = (\d+)/)?.[1] : undefined) ??
        0,
    )
    if (!(delay > 0))
      missing.push(`AvatarFallback's default delayMs is ${delay || "unset"} — initials paint before every image`)

    // And the fade must stay tied to that same number rather than a new literal.
    if (/animate-in fade-in/.test(avatar) && !/initialsWereShown && "animate-in fade-in/.test(avatar))
      missing.push("the avatar's fade is unconditional again — it replays on every back navigation")

    // The src only moves once the replacement has decoded.
    if (!/new window\.Image\(\)/.test(avatar) || !/setShown\(src\)/.test(avatar))
      missing.push("AvatarImage no longer preloads — changing an avatar will blink to initials again")
    if (!/src=\{shown\}/.test(avatar))
      missing.push("AvatarImage renders the incoming src directly, so Radix sees a loading state again")

    // And the store-builder header must not force a remount or re-arm the flash.
    if (/key=\{avatarKey\}/.test(header))
      missing.push("the shop-header avatar is keyed on its URL again — every change remounts and flashes")
    if (/delayMs=\{0\}/.test(header))
      missing.push("the shop-header avatar shows its fallback immediately again")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the store-builder canvas does not slice the corners off a selection ring",
  (() => {
    /**
     * The canvas is `rounded-[20px] overflow-hidden` and its sections are
     * square. Clipping is not rounding: a selected section draws `ring-inset`,
     * which is a box-shadow following the SECTION's radius, so at each canvas
     * corner the clip cut the ring's square corner clean off and the outline
     * stopped dead, leaving a bare notch. Reproduced and photographed at 3x
     * before and after.
     *
     * Giving the first and last sections the canvas's own radius makes the
     * ring trace the same curve the clip does. All three canvas shells — the
     * two skeletons and the real one — carry it, so the loading state and what
     * replaces it have the same silhouette and the swap is not a visible
     * change of shape.
     */
    const canvas = code("components/store-builder/preview-canvas.tsx")
    const shells = canvas.match(/rounded-\[20px\]/g)?.length ?? 0
    const rounded = canvas.match(/\[&>\*:first-child\]:rounded-t-\[20px\] \[&>\*:last-child\]:rounded-b-\[20px\]/g)?.length ?? 0
    const missing: string[] = []
    if (rounded < 3)
      missing.push(`only ${rounded} of the 3 canvas shells round their edge sections — rings will be clipped square`)
    if (shells < 3) missing.push("a canvas shell lost its own radius")
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "no store-builder component is declared inside another one's render",
  (() => {
    /**
     * THE BUG BEHIND "the avatar flashes and glitches randomly when I click".
     *
     * subscribe-bar.tsx declared `const MobileContent = () => (…)` and
     * `const DesktopContent = () => (…)` in its render body and rendered them
     * as `<MobileContent />`. A function declared in a render body is a NEW
     * component type on every render, and React reconciles by type — so every
     * re-render of the bar unmounted the entire subtree and mounted a fresh
     * one. The avatar's <img> was destroyed and recreated each time, and every
     * click anywhere in the builder re-renders the canvas.
     *
     * Proven in a browser both ways, by tagging the <img> node and forcing two
     * re-renders: the tagged node was GONE with the inner components, and
     * survives without them.
     *
     * The same shape was in product-creator-bar.tsx (three layouts, another
     * avatar), sticky-add-to-cart.tsx, and the rich-text editor's 13 toolbar
     * buttons. Elements and plain values reconcile in place; components
     * declared per-render never can.
     *
     * The check is deliberately whole-directory: this is a defect class, not
     * four bugs, and the next one will arrive in a file that is not listed.
     */
    const dir = "components/store-builder"
    const offenders: string[] = []

    for (const file of readdirSync(join(root, dir))) {
      if (!file.endsWith(".tsx")) continue
      const src = code(`${dir}/${file}`)
      const lines = src.split("\n")
      for (let i = 0; i < lines.length; i++) {
        // Indented => nested inside something (a render body). A capitalised
        // binding is a component by convention.
        const m = lines[i].match(/^\s+(?:const|let)\s+([A-Z][A-Za-z0-9_]*)\s*=/)
        if (!m) continue
        const name = m[1]

        // Is the right-hand side a FUNCTION EXPRESSION? `const Icon = tab.icon`
        // holds a component someone else declared and keeps a stable identity —
        // that is fine and must not be flagged. Only a function written here is
        // a new type per render.
        const rhs = lines[i].slice(lines[i].indexOf("=") + 1).trim()
        const inlineFn = /^(async\s+)?(\(|function\b|[A-Za-z_$][\w$]*\s*=>)/.test(rhs) && /=>|\bfunction\b/.test(rhs)
        // Props destructured across lines put the arrow further down, which is
        // exactly how the toolbar button was written.
        const opensParams = /^(async\s+)?\(\{?$/.test(rhs)
        const continued =
          opensParams &&
          lines.slice(i + 1, i + 12).some((l) => /^\s*\}?\)\s*(:[^=]*)?=>/.test(l) || /\bfunction\b/.test(l))
        if (!inlineFn && !continued) continue

        // A stable identity is fine: memoised, or picked out of a map/import.
        if (/useMemo|useCallback|React\.memo|\bmemo\(/.test(lines[i])) continue

        // Only a problem if it is actually RENDERED as a component.
        if (!new RegExp(`<${name}[\\s/>]`).test(src)) continue

        offenders.push(`${dir}/${file}:${i + 1}  ${name} — remounts its whole subtree every render`)
      }
    }

    if (offenders.length) console.log("        " + offenders.join("\n        "))
    return offenders.length === 0
  })(),
)

section("The creator's own page: one header, one owner")

check(
  "the storefront header is ONE component, not two that drift",
  (() => {
    /**
     * The page had two headers. The configured branch rendered
     * ShopHeaderRenderer; the branch for creators with no published config
     * carried about fifty lines of hand-written cover/avatar/name/bio/stats
     * that were a near copy of it.
     *
     * A copy is not free: every improvement had to be made twice and in
     * practice was made once, so that branch had no handle, no social icons
     * and no way for the owner to edit anything. It renders the real header
     * with the real defaults now.
     *
     * This is also the guard against the mistake that got made here before —
     * adding a NEW profile block beside the existing one instead of editing
     * it. Two headers on one page is the failure either way round.
     */
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const missing: string[] = []

    const headers = page.match(/<ShopHeaderRenderer/g)?.length ?? 0
    if (headers !== 2) missing.push(`expected both branches to render ShopHeaderRenderer, found ${headers}`)

    // The tell-tales of a hand-rolled second header.
    if (/productCount\} products/.test(page))
      missing.push("a hand-written stats row is back in the page — the header already renders one")
    if (/creator\.niche_tags\.map/.test(page))
      missing.push("a hand-written niche-tag row is back in the page")
    if ((page.match(/<Avatar\b/g)?.length ?? 0) > 1)
      missing.push("more than one Avatar in the page — the storefront header owns the creator's avatar")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the profile sits half over the cover, with its handle and its links",
  (() => {
    /**
     * Four things the creator page was asked for, each with a way of being
     * quietly wrong:
     *
     *   · the avatar half over the cover — it was two hardcoded offsets that
     *     came out at 34% and 44%, and drifted further at other avatar sizes.
     *     Deriving it from `avatarSize` is only half the fix: the negative
     *     margin travels through the section's top padding first, so with the
     *     padding left in a -68px offset on a 137px avatar produced a 15%
     *     overlap. Measured in a browser at 50% after both changes.
     *   · the @handle — the address the page is served from, which the page
     *     never showed.
     *   · social icons ONLY for platforms the creator actually filled in.
     *     SocialMediaIcons already filters on `enabled && url`, so the rule is
     *     kept in the data; what was wrong is that they only rendered as an
     *     overlay on the cover, so a creator with no cover got none at all.
     *   · exactly one copy of those icons. Rendering them in both places is
     *     the duplication this file exists to prevent.
     */
    const header = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    if (!/marginTop: coverImageUrl \? `-\$\{avatarSize \/ 2\}px`/.test(header))
      missing.push("the avatar overlap is hardcoded again — it will be wrong at every other avatar size")
    if (!/style=\{coverImageUrl \? \{ paddingTop: 0 \} : undefined\}/.test(header))
      missing.push("the section's top padding is back under the avatar — the overlap collapses to ~15%")
    if (!/@\{profile\.username\}/.test(header)) missing.push("the @handle is gone from the header")

    const socialRenders = header.match(/<SocialMediaIcons/g)?.length ?? 0
    if (socialRenders !== 1)
      missing.push(`social icons render in ${socialRenders} places in the header — there must be exactly one`)
    if (/absolute z-\[5\][\s\S]{0,120}<SocialMediaIcons/.test(header))
      missing.push("social icons are back as a cover overlay, where a creator with no cover never sees them")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "only the owner gets the edit control, and the server does not take its word for it",
  (() => {
    /**
     * `viewerIsOwner` decides whether a button is drawn. It is NOT an
     * authorisation, and the value of this check is that the route says so
     * too: every write re-derives the identity from the session and scopes the
     * update by it, so a forged answer in the page buys a button that fails.
     *
     * The URL cleaner is lifted out of the route and RUN, rather than pattern
     * matched. These links become an href on a public page, so `javascript:`
     * is the case that matters and asserting a regex exists would not prove it
     * is rejected.
     */
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const api = read("app/api/creator-profile/route.ts")
    const missing: string[] = []

    if (!/const viewerIsOwner = !!viewer && viewer\.id === profile\.id/.test(page))
      missing.push("the page no longer checks who is looking")
    if (!/if \(!viewerIsOwner\) return null/.test(page))
      missing.push("buildOwnerActions hands the edit control to everyone")
    /**
     * THE VIEWER LOOKUP COSTS NO ROUND TRIP OF ITS OWN.
     *
     * This used to pin `supabase.auth.getUser(),` — the trailing comma being
     * the proof it sat inside the batch array. The lookup has since moved
     * EARLIER, to the top of the request: it reads a cookie and depends on
     * nothing, so it is started before the profile query and handed to the
     * batch as a promise, which lets the purchase check join the batch too.
     *
     * Same invariant, pinned where it now lives, and pinned harder: started
     * without an await, and consumed in the batch. An `await` on that line
     * would put the round trip back in series, which is what the old pattern
     * existed to catch.
     */
    if (!/const viewerPromise = supabase\.auth\.getUser\(\)/.test(page))
      missing.push("the viewer lookup is not started up front")
    if (/await supabase\.auth\.getUser\(\)/.test(page))
      missing.push("the viewer lookup is awaited on its own — that is a round trip in series")
    if (!/^\s*viewerPromise,\s*$/m.test(page))
      missing.push("the viewer lookup left the batch — that is a round trip before first byte")

    // The route must re-check, and must not reach for the admin client.
    if (!/if \(!user\)[\s\S]{0,120}401/.test(api))
      missing.push("the save route no longer rejects an unauthenticated caller")
    if (/createAdminClient/.test(api))
      missing.push("the save route uses the admin client — it would bypass the RLS that scopes writes to the owner")
    if (!/\.eq\("id", user\.id\)/.test(api))
      missing.push("the profile update is not scoped to the signed-in user")

    /**
     * RUN THE REAL CLEANER — the module now, not a copy lifted out of the file
     * with a regex and `new Function`. That trick worked while cleanUrl was
     * self-contained and broke the moment it delegated, which is the honest
     * signal that it was testing a transcription rather than the code.
     */
    if (
      !/return cleanUrl\(body\[key\]\) \?\? undefined/.test(api) ||
      !/const avatarUrl = imageField\("avatarUrl"\)/.test(api) ||
      !/const coverUrl = imageField\("coverUrl"\)/.test(api)
    )
      missing.push("the image URLs reach the page unchecked")

    if (toPublicHttpUrl("javascript:alert(1)") !== null) missing.push("a javascript: URL gets through")
    // Not just the payload that happens to be an invalid port: one that parses
    // cleanly as a URL is the case that would actually reach an href.
    if (toPublicHttpUrl("javascript:void(0)") !== null) missing.push("a parseable javascript: URL gets through")
    if (toPublicHttpUrl("data:text/html,<script>") !== null) missing.push("a data: URL gets through")
    if (toPublicHttpUrl("vbscript:msgbox") !== null) missing.push("a vbscript: URL gets through")
    if (toPublicHttpUrl("   ") !== null) missing.push("blank input becomes a link")
    if (toPublicHttpUrl("notaurl") !== null) missing.push("something with no host is accepted")
    /**
     * `../../evil` has slashes, so it is treated as a URL; it then parses with
     * a hostname of `..`, which contains a dot — and "contains a dot" was the
     * whole hostname check. `https://../evil` was saved and rendered. Found by
     * a test feeding the resolver its own edge cases.
     */
    if (toPublicHttpUrl("../../evil") !== null) missing.push("a relative path is accepted as a hostname")
    if (toPublicHttpUrl("https://../x") !== null) missing.push("`..` is accepted as a hostname")
    if (toPublicHttpUrl("https://x./y") !== null) missing.push("a trailing-dot host with no TLD is accepted")
    if (toPublicHttpUrl("instagram.com/me") !== "https://instagram.com/me")
      missing.push("a bare host with a path is no longer accepted")
    if (toPublicHttpUrl("https://x.com/me") !== "https://x.com/me") missing.push("a valid https URL is mangled")
    if (toPublicHttpUrl("x".repeat(400)) !== null) missing.push("the length bound is gone")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the storefront renders the explore card itself, not a lookalike",
  (() => {
    /**
     * "The product cards in the profile listings should use the same font
     * sizes and all the things such as on the explore product listings" is not
     * a styling task. Matching a design by hand is how two components start
     * identical and end up different — which has already happened twice on
     * this page, with the header and with the profile block.
     *
     * So the storefront renders components/explore/product-card.tsx ITSELF.
     * The only storefront-specific file is an adapter that reshapes a product
     * into what that card expects, and it must carry no markup of its own —
     * the moment it does, it has started becoming a second card.
     */
    const adapter = code("components/storefront/storefront-product-card.tsx")
    const grid = code("components/storefront/all-products-grid.tsx")
    const featured = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    if (!/from "@\/components\/explore\/product-card"/.test(adapter))
      missing.push("the storefront card no longer wraps the explore card — the two designs will drift")
    for (const markup of ["aspect-video", "line-through", "formatPrice", "<Image", "% OFF"]) {
      if (adapter.includes(markup)) missing.push(`the adapter has grown card markup of its own (${markup})`)
    }
    for (const [name, src] of [
      ["the featured rail", featured],
      ["the products tab", grid],
    ] as const) {
      if (!/<StorefrontProductCard\b/.test(src)) missing.push(`${name} no longer renders the shared card`)
    }
    // `?layout=discover` tells the product page it was reached from a browse
    // surface. A creator's own storefront is not that.
    if (!/discoverLayout=\{false\}/.test(adapter))
      missing.push("the storefront links products as though they came from discover")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the owner's edit control sits low on the cover",
  (() => {
    /**
     * Top-right put it level with whatever the page has above the cover — the
     * subscribe bar's own button, in practice — so it read as part of that row
     * rather than as the banner's own control. The avatar straddles the bottom
     * CENTRE, so bottom-right is clear of it. Measured in a browser: the
     * button's top edge falls in the lower half of the cover.
     */
    const header = code("components/store-builder/unified-section-renderer.tsx")
    const slot = header.match(/\{ownerActions && \([\s\S]{0,320}?\)\}/)?.[0] ?? ""
    const missing: string[] = []
    if (!slot) missing.push("the owner-actions slot is gone from the cover")
    else {
      // Bottom-right on desktop, top-right on mobile — see the note on the
      // slot for why the phone has to differ.
      if (!/bottom-\d/.test(slot)) missing.push("the edit control is not anchored to the bottom on desktop")
      if (!/right-\d/.test(slot)) missing.push("the edit control is no longer right-aligned")
    }
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "social icons are not hidden behind a master toggle nobody set",
  (() => {
    /**
     * Same trap the sticky bar took three attempts to escape. The builder's
     * "Enable Social Media" switch defaulted to OFF and was written out on
     * every save whether or not anyone touched it, so essentially every stored
     * config carries an explicit `false` that never represented a decision —
     * and creators who had filled in their links saw no icons and no reason
     * why. Verified in a browser with `showSocialMedia: false` in the settings:
     * three links in, three icons out.
     *
     * The per-platform switches remain the real control, and
     * SocialMediaIcons still needs both `enabled` and a url, so a creator who
     * has added nothing gets nothing.
     */
    const header = code("components/store-builder/unified-section-renderer.tsx")
    const sidebar = code("components/store-builder/sections-sidebar.tsx")
    const icons = code("components/store-builder/social-media-icons.tsx")
    const missing: string[] = []

    if (/showSocialMedia/.test(header))
      missing.push("the storefront gates social icons on showSocialMedia again — a stored false will win")
    if (/showSocialMedia/.test(sidebar))
      missing.push("the master social toggle is back in the builder, and it defaults to off")
    /**
     * A URL IS THE WHOLE CONDITION. It used to also need a per-platform
     * `enabled`, a second switch on top of the master one — so a creator could
     * type their Instagram in, save, and see nothing, with two different
     * toggles able to be the reason and neither visible from the page.
     * Verified in a browser with BOTH set false and three URLs present: three
     * icons rendered.
     */
    if (!/!!socialLinks\[key\]\?\.url\?\.trim\(\)/.test(icons))
      missing.push("icons depend on something other than the url again")
    if (/socialLinks\[key\]\?\.enabled/.test(icons))
      missing.push("the per-platform enabled flag is back — a filled-in link can be invisible again")
    if (/"enabled", checked/.test(sidebar) || /field: "enabled"/.test(sidebar))
      missing.push("the per-platform toggle is back in the builder")
    if (!/enabledPlatforms\.length === 0\) return null/.test(icons))
      missing.push("a creator with no links gets an empty icon row")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "social marks are outlines in currentColor, on any background",
  (() => {
    /**
     * They were solid brand glyphs painted with a hardcoded `#111827`.
     * Instagram and YouTube in particular render as a filled rounded square,
     * which beside a line of small grey text reads as two black blobs stamped
     * on the page — and on a dark storefront a near-black icon is simply
     * invisible.
     *
     * Stroked outlines sit at the same visual weight as the text they share a
     * row with, and `currentColor` means they inherit that row's colour: grey
     * on white, grey on black, and a creator's own text colour without anyone
     * passing one. Screenshotted on both backgrounds.
     */
    // The marks moved to components/social so the dialog could use the same
    // ones; the row that renders them, and its colour default, did not.
    const icons = code("components/social/platform-icons.tsx")
    const row = code("components/store-builder/social-media-icons.tsx")
    const header = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    /**
     * THE MARKS COME FROM SIMPLE ICONS, not from anyone's hand.
     *
     * They used to be drawn here — `<path d="M14.2 3v11.6a4.4 4.4 0 1 1-4.4…" />`,
     * an approximation of a TikTok note, in a codebase that already depends on
     * react-icons, which ships Simple Icons: the reference set every brand
     * takes its own mark from. Approximating a logo by eye is wrong the way a
     * misspelt company name is wrong — nobody can say which curve is off,
     * everybody can see it is not the real one. The X mark in particular
     * changed in 2023 and the drawn version was three strokes hoping.
     *
     * Verified in a browser: all seven marks in the dialog render the exact
     * same path data as the seven on the page.
     */
    if (!/from "react-icons\/si"/.test(icons))
      missing.push("the brand marks are hand-drawn again instead of coming from Simple Icons")
    if (/<path d="M/.test(icons)) missing.push("there is hand-drawn path data in the icon module again")
    if (!/color = "currentColor"/.test(icons))
      missing.push("the marks no longer default to currentColor — they will not follow the page's colour")
    if (!/iconColor = "currentColor"/.test(row))
      missing.push("the default icon colour is a fixed value again — it will vanish on a dark page")
    if (/iconColor=\{settings\.textsColor/.test(header))
      missing.push("the header passes a hardcoded colour again instead of letting the row decide")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the creator's own page does not put their face on every card",
  (() => {
    /**
     * The explore card carries a seller row — avatar, name, rating — and on a
     * browse surface that is the point. On a creator's OWN storefront every
     * card would show the same face and the same name, directly under a header
     * showing that face and that name.
     *
     * The row is not merely hidden: when there is no seller AND no rating it
     * is not rendered at all, so nothing leaves a 20px gap above the title.
     */
    const card = code("components/explore/product-card.tsx")
    const adapter = code("components/storefront/storefront-product-card.tsx")
    const missing: string[] = []

    if (!/showCreator=\{false\}/.test(adapter)) missing.push("the storefront card shows the creator on every card again")
    if (!/\{\(showCreator \|\| hasReviews\) && \(/.test(card))
      missing.push("the seller row renders even with nothing in it — an empty gap above every title")
    if (!/showCreator = true/.test(card)) missing.push("explore lost its seller row, which is where it belongs")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the creator page is one colour, and nothing paints a white slab on it",
  (() => {
    /**
     * THIS TOOK THREE GOES AND TWO OF THEM MADE IT WORSE.
     *
     * Everything on a creator page is white — the subscribe bar, the header,
     * the tab strip, every card — so on a white page there is nothing to see
     * any of it against.
     *
     *   1. Gave the bar, cover, profile and tabs one white surface above a
     *      grey page. That drew a hard horizontal seam across the middle:
     *      white above, grey below, reading as a rendering fault.
     *   2. Made the whole page grey. Still a seam, from the other direction —
     *      the THEME PRESETS set white explicitly (`pageBackgroundColor` and
     *      `featuredProductsBackgroundColor` are both "#ffffff" in the
     *      default), so the Featured section painted its own white slab under
     *      the tab strip whatever the page did, and the cards on it had
     *      nothing to be seen against.
     *   3. A stored white means "nobody chose a colour" — because in practice
     *      nobody did, it is what the preset carries. Any other colour is a
     *      real decision and is left exactly alone.
     *
     * The rule is evaluated here, not pattern-matched, because the whole point
     * is which inputs it treats as "unchosen".
     */
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const tabs = code("components/storefront/storefront-tabs.tsx")
    const surface = read("lib/store-builder/page-surface.ts")
    const missing: string[] = []

    const src = surface.match(/const WHITE = new Set\([\s\S]*?\n\}/)?.[0]
    if (!src) {
      missing.push("the surface rule is gone — theme white will paint slabs again")
    } else {
      // eslint-disable-next-line no-new-func
      const isInheritedWhite = new Function(
        `${src.replace(/export /g, "").replace(/: string \| null \| undefined|\?: string \| null|: boolean/g, "")}; return isInheritedWhite`,
      )() as (c?: string | null) => boolean

      for (const unchosen of [undefined, null, "", "#fff", "#ffffff", "#FFFFFF", " white ", "transparent"]) {
        if (!isInheritedWhite(unchosen as string)) missing.push(`${JSON.stringify(unchosen)} is treated as a chosen colour`)
      }
      for (const chosen of ["#0f0f0f", "#f8fafc", "#faf5ff", "rgb(12,12,12)"]) {
        if (isInheritedWhite(chosen)) missing.push(`${chosen} is being thrown away — a creator's real choice`)
      }
    }

    /**
     * The page reads its background off the resolved chrome now, and
     * resolveStorefrontChrome is what calls the surface rule. The rule itself
     * is exercised above; this checks the page still goes through it.
     */
    const chrome = read("lib/store-builder/storefront-chrome.ts")
    if (!/background: chrome\.pageBackground/.test(page))
      missing.push("the page background no longer comes from the resolved chrome")
    if (!/storefrontPageBackground\(/.test(chrome))
      missing.push("the chrome no longer goes through the surface rule — theme white will paint slabs again")
    if (!/storefrontSectionBackground\(section\.settings\.colors\?\.backgroundColor\)/.test(page))
      missing.push("section backgrounds no longer go through the rule — Featured will paint a white slab again")
    if (/min-h-screen bg-background/.test(page))
      missing.push("a branch still paints the page with the default white background")
    if (/surfaceFor|stripBackground/.test(page) || /stripBackground/.test(tabs))
      missing.push("the white header sheet is back — it puts a seam across the middle of the page")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the owner's per-card menu never reaches a visitor",
  (() => {
    /**
     * A three-dot menu on each card, linking into that product's editor. It is
     * gated the same way the header's controls are: the SERVER decides who is
     * looking, and a visitor is never sent the component — not sent it hidden,
     * not sent it behind a CSS rule. Verified in a browser: with the flag off
     * there are no menu buttons and the string "/app/products" does not appear
     * anywhere in the HTML.
     *
     * It links rather than edits, for the same reason the header menu does: a
     * product has a whole editor in /app with uploads, variants, pricing and
     * files in it, and a popover on a public page could only be a worse copy.
     */
    const card = code("components/storefront/storefront-product-card.tsx")
    const menu = code("components/storefront/product-owner-menu.tsx")
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const missing: string[] = []

    if (!/if \(!isOwner\) return card/.test(card))
      missing.push("the per-card menu is rendered for everyone and hidden — a visitor receives it")
    if (!/isOwner = false/.test(card)) missing.push("the per-card menu defaults to shown")
    if (!/viewerIsOwner/.test(page)) missing.push("the page no longer passes who is looking down to the cards")

    // The trigger must not navigate the card it sits on. The menu is the shared
    // owner menu now (a sheet on a phone), which stops the click when told to.
    const shared = code("components/storefront/owner-actions-menu.tsx")
    if (!/\bstopClicks\b/.test(menu) || !/e\.preventDefault\(\)/.test(shared) || !/e\.stopPropagation\(\)/.test(shared))
      missing.push("opening the menu navigates the card underneath it")

    if (!menu.includes("/app/products/${productId}")) missing.push("Edit product no longer opens that product")
    if (!existsSync(join(root, "app/app/products/[id]/page.tsx")))
      missing.push("/app/products/[id] has no route behind it — Edit product 404s")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "social marks hover by darkening, and the meta row's dots sit evenly",
  (() => {
    /**
     * Two things that came from the same line of CSS.
     *
     * `p-2` put 8px of dead space around every mark, so in the meta row the
     * gap after the dot divider measured wider than the gap before it — the
     * icon's own box was pushing it along. Measured in a browser: 12px before
     * and 20px after, now 12 and 12.
     *
     * `hover:scale-110` grew the mark by 10% and gave it a translucent
     * background, which is a lot of movement for something the size of a word
     * and read as a glitch beside static text. Hover is opacity alone —
     * measured 0.7 to 1.0 with the box unchanged.
     */
    const icons = code("components/store-builder/social-media-icons.tsx")
    const missing: string[] = []

    if (/hover:scale-/.test(icons)) missing.push("the marks scale on hover again")
    if (/hover:bg-white\/20/.test(icons)) missing.push("hover paints a background behind the mark again")
    if (!/opacity-70 transition-opacity/.test(icons)) missing.push("hover no longer just darkens the mark")
    if (/"p-2 rounded-full transition-all"/.test(icons))
      missing.push("the marks carry their own padding again — it unbalances the dot dividers beside them")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the owner's menu goes to the real screens rather than rebuilding them",
  (() => {
    /**
     * "Edit profile" opens a dialog because what it edits is small enough to
     * finish in place. The three-dot menu is for what is not: managing
     * products, laying the page out, reading the numbers. Those have whole
     * screens in /app already, and a popover version of any of them on a
     * public page would be a worse copy of a thing that already works.
     *
     * So it is a menu of destinations, and every destination has to be a route
     * that exists — a menu item leading to a 404 is worse than no menu.
     */
    const menu = code("components/storefront/owner-menu.tsx")
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const missing: string[] = []

    /** It takes `embedded` now, so match the tag rather than one spelling of it. */
    if (!/<OwnerMenu[\s/>]/.test(page)) missing.push("the owner menu is not on the page")
    // It must live inside buildOwnerActions, which is the only owner-gated slot.
    const slot = page.match(/const buildOwnerActions[\s\S]*?\n  \}/)?.[0] ?? ""
    if (!/OwnerMenu/.test(slot))
      missing.push("the owner menu is outside the owner-only slot — every visitor would see it")

    for (const href of ["/app/products", "/creator-page", "/app/analytics", "/app/settings"]) {
      if (!menu.includes(`"${href}"`)) {
        missing.push(`the menu no longer links to ${href}`)
        continue
      }
      const route = `app${href}/page.tsx`
      if (!existsSync(join(root, route))) missing.push(`${href} has no route behind it — the menu item 404s`)
    }

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the products tab always has a control, and the edit button is a button",
  (() => {
    /**
     * Category chips only appear for a creator with more than one category — a
     * filter with a single option is not a choice — which left everybody else
     * with an entirely bare tab. Sort works for any number of products, so the
     * row is never empty.
     *
     * And the edit control: `rounded-full` made it read as a chip or a tag.
     * 8px, the same corner as the cards it sits above.
     */
    const grid = code("components/storefront/all-products-grid.tsx")
    const button = code("components/storefront/edit-profile-button.tsx")
    const missing: string[] = []

    if (!/const \[sort, setSort\]/.test(grid)) missing.push("the products tab has no sort — a creator with one category sees nothing")
    if (!/price-low|price-high/.test(grid)) missing.push("sorting by price is gone")
    if (/rounded-full/.test(button)) missing.push("the edit control is a pill again")
    if (!/rounded-lg/.test(button)) missing.push("the edit control lost its 8px corner")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the storefront page is not publicly cacheable now that it renders per-viewer",
  (() => {
    /**
     * THIS ONE IS NOT COSMETIC.
     *
     * The page renders things decided from the SESSION: an Edit profile
     * control, a creator menu, a three-dot menu on every card. It was still
     * served with `public, s-maxage=300, stale-while-revalidate=600`, which
     * tells a shared CDN it may hand ONE rendering to everybody — so the
     * owner's rendering could be cached and served to visitors.
     *
     * The same header was why saving a profile appeared to do nothing:
     * `router.refresh()` fetches the RSC payload, the edge returned the cached
     * one, and the page only updated after a hard reload.
     */
    const config = read("next.config.mjs")
    const block = config.match(/source: '\/u\/:username\*',[\s\S]{0,300}?\]/)?.[0] ?? ""
    const missing: string[] = []
    if (!block) missing.push("the /u/:username* header block is gone — check what replaced it")
    else {
      if (/public/.test(block))
        missing.push("the creator page is publicly cacheable again — an owner's rendering can be served to visitors")
      if (/s-maxage/.test(block)) missing.push("a shared-cache lifetime is back on a per-viewer page")
      if (!/private/.test(block)) missing.push("the creator page is no longer marked private")
    }
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the tab bar is underlined tabs on a rule, and every tab opens at the same place",
  (() => {
    /**
     * THE SHAPE OF THIS CHANGED TWICE, so what is asserted is the shape that
     * shipped, not the argument for it: underlined tabs sitting on a rule that
     * spans the content column, the active one breaking the rule. The pill
     * track came in between and went again.
     *
     * What has NOT changed and must not: every panel starts at the same
     * distance from the bar. Each used to bring its own top space — a Home
     * section carries the creator's spacing setting, the products grid had
     * `py-8`, the empty states `py-16` — so the content jumped as you
     * switched. Measured 48px on Home against 32 on Products; now 32 across.
     *
     * And the switch is animated. Instant replacement reads as a jump rather
     * than as a change; only the arriving panel moves, and `motion-reduce`
     * turns it off.
     */
    const tabs = code("components/storefront/storefront-tabs.tsx")
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const css = read("app/globals.css")
    const missing: string[] = []

    if (!/"relative flex w-full gap-0 border-b border-border"/.test(tabs))
      missing.push("the tabs no longer sit on a rule")
    /**
     * THE UNDERLINE SLIDES between tabs, and it is the only motion in a
     * switch. The panels swap instantly — they are already rendered, and
     * fading them in was the flash — but an instant swap with a mark that
     * teleports too gives the eye nothing to follow. The bar is the one
     * element that can move without any content moving with it. Measured at
     * 390px: left 12 → 256 over eight decelerating frames, landing exactly on
     * the tab; the panel stays at opacity 1.00, transform none, throughout.
     *
     * Its position is MEASURED from the button, never computed as a fraction:
     * the tabs are equal thirds on a phone and their own widths on desktop,
     * and a webfont arriving late changes those widths after first paint.
     */
    /*
      It slid on `left` and `width`, which is a layout on every frame of the
      slide. It slides on transform now (a one-pixel bar translated and
      scaled), so the compositor draws it; scripts/check-storefront-tabs.mjs
      reads the computed transition to be sure.
    */
    if (!/transition-transform/.test(tabs) || !/translateX\(\$\{bar\.left\}px\) scaleX\(\$\{bar\.width\}\)/.test(tabs))
      missing.push("the active mark no longer slides between tabs on transform")
    if (/transition-\[left,width\]/.test(tabs))
      missing.push("the active mark animates left and width again, a layout per frame")
    /*
      AND WHAT A SWITCH MUST NOT DO, each measured by that probe: the other
      tabs' pictures are fetched at idle, so Products opens finished rather
      than grey; the strip is held where it was when a shorter tab would
      have let the page clamp and drop it; and a label is as wide as its
      chosen weight, so the others do not shift sideways.
    */
    if (!/'\[role="tabpanel"\]\[hidden\] img\[loading="lazy"\]'/.test(tabs))
      missing.push("the hidden tabs' pictures are no longer warmed; Products opens on grey boxes")
    if (!/panels\.style\.minHeight = `\$\{natural \+ drift\}px`/.test(tabs))
      missing.push("a switch to a shorter tab can drop the strip down the screen again")
    if (!/after:font-\[530\] after:content-\[attr\(data-label\)/.test(tabs))
      missing.push("a label no longer reserves its chosen width; the tabs shift sideways on a press")
    if (!/setBar\(\{ left: el\.offsetLeft, width: el\.offsetWidth \}\)/.test(tabs))
      missing.push("the sliding bar is no longer measured from the tab it belongs to")
    if (!/selected && !bar \? "border-foreground" : "border-transparent"/.test(tabs))
      missing.push("the static underline and the sliding bar can now both be on screen")
    if (!/focus:outline-none focus-visible:ring-2/.test(tabs))
      missing.push("the webview's own blue focus box is back over the tab bar")
    if (!/rounded-full bg-black/.test(tabs) === false) missing.push("the pill track came back")
    if (!/"pt-8 \[&>\*:first-child:not\(\[data-panel-spacing\]\)\]:!pt-0"/.test(tabs))
      missing.push("panels bring their own top space again — the content jumps between tabs")

    /**
     * AND THE BOTTOM, which was never forced. The space between the last
     * product and the About rule was whatever the panel happened to bring —
     * 24px from the Featured rail's spacing, 32 from the Products grid, 64
     * from the empty state — stacked on About's own top padding. Measured
     * before: 129px of nothing under every tab, and a different 129 on each.
     * After: 48px, and the same 48 on all three.
     */
    if (!/\[&>\*:last-child:not\(\[data-panel-spacing\]\)\]:!pb-0/.test(tabs))
      missing.push("the gap below a panel is unowned again — each tab ends at a different height")

    /**
     * ONE COMPONENT OWNS THE DISTANCE from the rule to the first card.
     *
     * It was two numbers — the Featured rail's `mt-5` against the grid's
     * `mb-6`, then `mb-5` — that had to be kept equal by hand. And even equal,
     * the tabs only lined up while both header rows happened to be 36px tall,
     * which was true because the compact sort button is 36px and nothing else
     * in the row was taller. A heading that wrapped, or a long category name,
     * moved one tab's cards and not the other's.
     *
     * CatalogHeader is `min-h-9 mb-5` in one place both tabs render, so the
     * distance is the same by construction. Measured at 390 / 700 / 1180, and
     * again after replacing the headline with one long enough to have wrapped:
     * 88px on both tabs every time.
     */
    const controls = code("components/storefront/catalog-controls.tsx")
    const rail = code("components/store-builder/unified-section-renderer.tsx")
    const productsGrid = code("components/storefront/all-products-grid.tsx")
    if (!/mb-5 flex min-h-9 items-center/.test(controls))
      missing.push("CatalogHeader no longer fixes its own height and margin")
    for (const [name, src] of [["the featured rail", rail], ["the products tab", productsGrid]] as const) {
      // `\b`, or a renamed `<CatalogHeaderX` satisfies the check — which is
      // exactly how a break-test caught this guard being loose, twice.
      if (!/<CatalogHeader\b/.test(src)) missing.push(`${name} builds its own header row again`)
    }
    if (/"grid gap-4 mt-\d"/.test(rail))
      missing.push("the featured grid has taken its top margin back — the two tabs will drift again")

    /**
     * EXACTLY THREE TABS. Reviews and About are both below them now: About
     * because it is read after the work rather than instead of it, Reviews for
     * the same reason — the evidence for the rating in the meta row belongs
     * where the visitor lands, not behind a tab that takes them off the
     * products. A fourth tab also costs each of the others a quarter of a
     * phone's width instead of a third.
     */
    for (const label of ['label: "Home"', 'label: "Products"', 'label: "Communities"']) {
      if (!page.includes(label)) missing.push(`the ${label} tab is gone`)
    }
    if (/label: "Reviews"|label: "About"/.test(page))
      missing.push("there is a fourth tab again — Reviews and About belong at the foot of the page")
    /*
      The gate is still "only when there are reviews"; what sits between the
      gate and the panel is now a SafeRegion, so that a fault in the reviews
      cannot take the shop's products down with it.
    */
    if (!/\{creatorReviewCount > 0 && \(\s*<SafeRegion name="reviews">\s*<ReviewsPanel/.test(page))
      missing.push("the reviews block shows even when there are none to show")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "Home and Products are the same width",
  (() => {
    /**
     * TWO BUGS THAT ONLY SHOWED ON THE REAL PAGE.
     *
     * The Featured rail set `paddingLeft/Right: 8` as an INLINE style, and an
     * inline style beats a class — so it replaced SectionContainer's
     * responsive `px-3 sm:px-4 lg:px-6` outright. Home sat 8px from the edge
     * while Products sat at 12 on mobile and 24 on desktop: two tabs of one
     * page with different margins, and cards that changed width as you
     * switched. Measured after: tabs, Home heading and Products grid all start
     * at the same x.
     *
     * Measured after, at 390px and 1180px: the tab strip, the Home heading and
     * the Products grid all start and end at the same x.
     *
     * (Where the owner's controls sit — the other half of this bug — has a
     * guard of its own further down, because the fix for it turned out to be a
     * different kind of mistake.)
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    if (/const horizontalPadding = \d/.test(renderer))
      missing.push("the featured rail sets its own horizontal padding again — Home and Products will differ")
    if (!/\{ownerActions && \(/.test(renderer))
      missing.push("the owner-actions slot is gone from the cover")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the meta row's rating is weighted, and followers are real rows",
  (() => {
    /**
     * A creator's rating is not the mean of their products' means: a five-star
     * product with one review must not drag a four-star product with two
     * hundred up to 4.5. It is weighted by how many reviews each product has,
     * and products nobody has reviewed contribute nothing rather than a zero.
     *
     * The maths is lifted out of the page and RUN, because "4.9" is a claim
     * about other people's opinions and getting it wrong is worse than not
     * showing it.
     *
     * Followers are rows in `follows`, counted with `head: true` so the rows
     * never travel — and the follow itself points at a PROFILE, not a creator
     * row, because a person is the thing you follow.
     */
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const api = code("app/api/follow/route.ts")
    const missing: string[] = []

    const src = page.match(/const reviewTotals = \(products \|\| \[\]\)\.reduce\([\s\S]*?\n  \)/)?.[0]
    if (!src) {
      missing.push("the rating aggregate is gone from the page")
    } else {
      // eslint-disable-next-line no-new-func
      const totals = new Function(
        "products",
        `${src.replace("(products || [])", "products")}; return reviewTotals`,
      ) as (p: unknown[]) => { count: number; weighted: number }
      const rate = (p: unknown[]) => {
        const t = totals(p)
        return t.count > 0 ? t.weighted / t.count : 0
      }
      if (rate([]) !== 0) missing.push("a creator with no products has a rating")
      if (rate([{ reviews_count: 0, reviews_average: 0 }]) !== 0) missing.push("an unreviewed product produces a rating")
      // 200 reviews at 4.0 and 1 at 5.0 must land near 4.0, not near 4.5.
      const weighted = rate([
        { reviews_count: 200, reviews_average: 4 },
        { reviews_count: 1, reviews_average: 5 },
      ])
      if (Math.abs(weighted - 4.005) > 0.01)
        missing.push(`the rating is a mean of means, not weighted — got ${weighted.toFixed(3)}`)
      // Unreviewed products must not dilute it.
      const diluted = rate([
        { reviews_count: 10, reviews_average: 5 },
        { reviews_count: 0, reviews_average: 0 },
      ])
      if (diluted !== 5) missing.push(`unreviewed products are dragging the rating down — got ${diluted}`)
    }

    if (!/\.eq\("following_id", profile\.id\)/.test(page))
      missing.push("followers are not counted against the profile the follow points at")
    if (!/head: true/.test(page)) missing.push("the follower count is fetching rows instead of a count")

    // The API must never take the follower from the body.
    if (/follower_id: (body|target)/.test(api))
      missing.push("follower_id comes from the request body — one account could make another follow")
    if (!/follower_id: user\.id/.test(api)) missing.push("the follow is not attributed to the session user")
    if (!/target === user\.id/.test(api)) missing.push("a creator can follow themselves and inflate their own count")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "an avatar can be changed but not emptied, and menus have no icons",
  (() => {
    /**
     * There is no such thing as a profile with no picture, only one with a
     * different picture — so the uploader for the avatar and the cover offers
     * replacement and not deletion. A red destructive button in the corner of
     * a photo you just chose reads as a warning about the photo.
     *
     * The image itself is the control, the old one stays visible under a
     * progress wash while the new one uploads, and there is no delete at all.
     *
     * The menus lost their icons for the same reason: four rows that each say
     * what they are do not need a picture as well.
     */
    const upload = code("components/app/image-upload.tsx")
    const dialog = code("components/storefront/edit-profile-button.tsx")
    const ownerMenu = code("components/storefront/owner-menu.tsx")
    const cardMenu = code("components/storefront/product-owner-menu.tsx")
    const missing: string[] = []

    /* `(value || pending)` since a picked picture shows while it uploads (livePreview). */
    if (!/if \(\(?value(?: \|\| pending\))? && replaceOnly\)/.test(upload))
      missing.push("the uploader has no replace-only mode — the avatar gets a delete button again")
    if ((dialog.match(/replaceOnly/g)?.length ?? 0) < 2)
      missing.push("the avatar or the cover is back to a deletable upload")
    if (!/Uploading…/.test(upload)) missing.push("uploading no longer shows progress over the old image")

    // A menu of words. lucide is still imported for the trigger glyph itself.
    for (const [name, src] of [
      ["the owner menu", ownerMenu],
      ["the product menu", cardMenu],
    ] as const) {
      const icons = src.match(/<(Package|LayoutTemplate|BarChart3|Settings|Pencil|ExternalLink)\b/g)
      if (icons) missing.push(`${name} has icons on its items again (${icons.join(", ")})`)
    }

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "nothing calls .catch() on a Supabase query",
  (() => {
    /**
     * A POSTGREST QUERY BUILDER IS A THENABLE, NOT A PROMISE. It implements
     * `then()` and nothing else — no `catch`, no `finally`. So
     *
     *     await supabase.from("x").delete().eq("id", id).catch(() => {})
     *
     * does not swallow an error. It throws `TypeError: .catch is not a
     * function` before the query is even sent, and it throws EVERY time.
     * Verified against the installed @supabase/postgrest-js: `then` is a
     * function, `catch` is undefined.
     *
     * WHAT IT WAS ACTUALLY BREAKING when this was written:
     *
     *   · /api/track-view answered 500 on every creator and product page view,
     *     and the view counters never incremented.
     *   · /api/auth/delete-account threw on its first cleanup call, so account
     *     deletion left the account's rows behind.
     *   · The chunked and server upload routes answered 500 after the file had
     *     already uploaded.
     *
     * It hides well: it type-checks, because a builder is assignable to
     * PromiseLike, and it appears exactly where nobody looks — fire-and-forget
     * cleanup and best-effort counters. `lib/supabase/ignore-error.ts` is what
     * those lines were trying to be.
     *
     * Storage (`.storage.from(...).remove()`) and `fetch`/`Response.json()` DO
     * return real Promises; their `.catch()` is correct and not matched here.
     */
    const offenders: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir))) {
        if (entry === "node_modules" || entry === ".next") continue
        const rel = `${dir}/${entry}`
        const full = join(root, rel)
        if (statSync(full).isDirectory()) {
          walk(rel)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue
        if (rel.endsWith("lib/supabase/ignore-error.ts")) continue

        const src = code(rel)
        const lines = src.split("\n")
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].includes(".catch(")) continue
          // The builder chain can span lines; look back a little for its start.
          /**
           * Read back the EXACT expression the `.catch(` is attached to, by
           * walking left from it and matching brackets until the expression
           * starts. Looking at "the last few lines" is not good enough: it
           * flags `notifyPayoutAvailable(...).catch(...)` — a plain async call
           * returning a real Promise — whenever an unrelated `.from(` happens
           * to sit above it.
           */
          const window = lines.slice(Math.max(0, i - 12), i + 1).join("\n")
          const at = window.lastIndexOf(".catch(")
          if (at === -1) continue

          let depth = 0
          let k = at - 1
          for (; k >= 0; k--) {
            const c = window[k]
            if (c === ")" || c === "}" || c === "]") depth++
            else if (c === "(" || c === "{" || c === "[") {
              if (depth === 0) break
              depth--
            } else if (depth === 0 && /[\s;=,]/.test(c)) break
          }
          const target = window.slice(k + 1, at)

          if (!/\.(from|rpc)\(/.test(target)) continue
          if (/\.storage\./.test(target)) continue
          if (/\.(json|text|arrayBuffer)\(\)$/.test(target.trim())) continue
          offenders.push(`${rel}:${i + 1}  ${lines[i].trim().slice(0, 84)}`)
        }
      }
    }
    for (const dir of ["app", "lib", "components"]) walk(dir)

    if (offenders.length) console.log("        " + offenders.join("\n        "))
    return offenders.length === 0
  })(),
)

check(
  "Save is always reachable, and a banner can be removed without a red button",
  (() => {
    /**
     * The whole dialog used to scroll, so on a short window Save sat below the
     * fold and you had to scroll a form you had just filled in to submit it.
     * It is a column now — header, scrolling body, footer — and only the
     * middle moves. Measured at 700px tall: the body scrolls 433px and the
     * footer does not move a pixel while it does.
     *
     * `p-0 gap-0` on the content matters: with the base padding still on, the
     * header keeps its padding while the body scrolls underneath it.
     *
     * On the images — an avatar has no empty state worth offering, but a
     * banner does: plenty of pages look better without one. So the banner gets
     * a remove control and the avatar does not, and it is a small dark disc
     * that appears with the hover overlay rather than the old destructive-red
     * button shouting danger about a photo somebody just chose.
     */
    /**
     * THE SHELL MOVED. Every editor on the creator page renders through
     * components/storefront/editor-sheet now — a Radix Dialog on a desktop
     * and the builder's bottom sheet on a phone — so the column, the
     * scrolling body and the sticky footer are its, once, rather than the
     * profile dialog's alone. The invariant is unchanged; the file is not.
     */
    const dialog = code("components/storefront/editor-sheet.tsx")
    const profile = code("components/storefront/edit-profile-button.tsx")
    const upload = code("components/app/image-upload.tsx")
    const missing: string[] = []

    if (!profile.includes("<EditorSheet"))
      missing.push("the profile dialog no longer goes through the shared shell")
    /**
     * A DRAWER AT THE RIGHT EDGE, so it is the full height of the window
     * rather than 85% of it. The invariant is unchanged and is the one that
     * matters: it is a COLUMN, only the middle scrolls, and the footer with
     * Save in it cannot be pushed off the bottom.
     */
    if (!/flex h-dvh flex-col gap-0 overflow-hidden/.test(dialog))
      missing.push("the dialog scrolls as one piece again — Save goes below the fold")
    if (!/left-auto right-0 top-0/.test(dialog))
      missing.push("the editors are centred dialogs again, over a dimmed page")
    if (!/min-h-0 flex-1 space-y-5 overflow-y-auto/.test(dialog))
      missing.push("the dialog body is not the part that scrolls")
    /* `relative z-10` in front of it now: the footer carries a skirt and is
       held at the bottom edge while a phone sheet is lowered for a scheme. */
    if (!/className="[^"]*\bgrid shrink-0/.test(dialog))
      missing.push("the footer can be pushed off screen again")

    /**
     * CANCEL LEFT, SAVE RIGHT, EQUAL WIDTHS.
     *
     * DialogFooter's default is `sm:justify-end`, which put both buttons in
     * the right-hand corner sized to their own words — "Cancel" narrower than
     * "Save", the pair huddled in the corner of a 512px dialog with a stretch
     * of empty white beside them, and the destructive choice nearer the middle
     * where a thumb lands. A two-column grid gives them the width and puts
     * each at the end it belongs to.
     */
    if (!/grid-cols-2 gap-3 border-t/.test(dialog))
      missing.push("the footer buttons are not two equal columns")
    /* Not DialogFooter at all: its `sm:justify-end` beats a grid quietly. */
    if (/<DialogFooter/.test(dialog))
      missing.push("DialogFooter's sm:justify-end is winning again — the buttons will bunch up on the right")
    /* The shell's Save renders whatever label the editor hands it. */
    /*
      `w-full` anywhere in each button's class, not the literal attribute:
      Save composes its classes through cn() now, because it turns off the
      variant's disabled fade while a save is in flight.
    */
    const buttons = dialog.match(/<Button[\s\S]*?Cancel[\s\S]*?<\/Button>[\s\S]*?<Button[\s\S]*?\{saveLabel\}/)?.[0] ?? ""
    if ((buttons.match(/w-full/g) || []).length < 2)
      missing.push("one of the footer buttons no longer fills its column")

    // The banner may be removed; the avatar may not. Those are the profile's own.
    const banner = profile.slice(profile.indexOf('bucket="covers"'), profile.indexOf('bucket="avatars"'))
    const avatar = profile.slice(profile.indexOf('bucket="avatars"'))
    if (!/allowRemove/.test(banner)) missing.push("the banner can no longer be removed")
    if (/allowRemove/.test(avatar.slice(0, avatar.indexOf("/>"))))
      missing.push("the avatar can be deleted — there is no profile without a picture")

    if (!/aria-label="Remove image"/.test(upload)) missing.push("the remove control is gone")
    /**
     * Only the REPLACE-ONLY branch is checked. The old destructive button still
     * exists for the uploader's other callers — product images and the like,
     * where deleting really is the offer — and this is not the place to change
     * that.
     */
    /* Spelled `(value || pending) && replaceOnly` since a picked picture shows while it uploads. */
    const replaceAt = upload.indexOf("if ((value || pending) && replaceOnly)") >= 0
      ? upload.indexOf("if ((value || pending) && replaceOnly)")
      : upload.indexOf("if (value && replaceOnly)")
    const replaceBranch = replaceAt < 0 ? "" : upload.slice(replaceAt, upload.indexOf("if (value) {", replaceAt + 10))
    if (!replaceBranch) missing.push("the replace-only branch is gone")
    else if (/variant="destructive"/.test(replaceBranch))
      missing.push("the destructive red button is back on a replace-only image")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the name area does not repeat what is already on the page",
  (() => {
    /**
     * The product count came off the meta row. It is the least interesting
     * thing on that line — the products are directly below it, and the number
     * is on the About section for anyone reading about the creator. What is
     * left is what a visitor cannot get by scrolling: the rating and the
     * following.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const header = renderer.slice(renderer.indexOf("function UnifiedShopHeader"))
    const body = header.slice(0, header.indexOf("\nfunction ", 40))
    const missing: string[] = []

    if (/\{productCount\} products/.test(body)) missing.push("the product count is back in the name area")
    if (!/reviewCount > 0 && reviewAverage > 0/.test(body)) missing.push("the rating left the meta row")
    if (!/followerCount > 0/.test(body)) missing.push("the follower count left the meta row")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the sort and the filter exist once, on the tab that owns them",
  (() => {
    /**
     * THE CONTROLS HAVE BEEN WRONG IN THREE DIRECTIONS NOW.
     *
     * First the Featured rail carried its own sort dropdown — its own drag
     * handling, its own theme plumbing, its own copy of the five labels — plus
     * a mobile-only row of category pills, and the Products tab had neither.
     * Then both had the same shared pair, which was consistent and still two
     * of everything on one page: sort here, switch tab, find a different sort.
     *
     * Now the rail is a TEASER — the creator's products in their own order,
     * and a link to the tab that has all of them — and the Products tab owns
     * both controls. One sort, one filter, one place each.
     *
     * The dead giveaway that the middle state was wrong: after the controls
     * moved, the rail's sort and filter STATE stayed behind for a commit with
     * nothing able to change it, and a hold-to-open touch handler outlived its
     * dropdown by several — still calling
     * `document.getElementById("sb-sort-trigger").click()` on an element that
     * no longer existed.
     */
    const controls = code("components/storefront/catalog-controls.tsx")
    const rail = code("components/store-builder/unified-section-renderer.tsx")
    const grid = code("components/storefront/all-products-grid.tsx")
    const missing: string[] = []

    const railBody = (() => {
      const from = rail.slice(rail.indexOf("function UnifiedFeaturedProductsSection"))
      return from.slice(0, from.search(/\n(export )?function /) + 1 || undefined)
    })()

    // The Products tab has them, from the shared file.
    if (!/<SortControl\b/.test(grid)) missing.push("the products tab does not use the shared sort control")
    if (!/<CategorySelect\b/.test(grid)) missing.push("the products tab does not use the shared category selector")
    if (!/compact className="sm:hidden"/.test(grid))
      missing.push("the products tab is not using the compact sort on phones")

    // The rail has neither, and no leftovers of having had them.
    for (const [what, re] of [
      ["a sort control", /<SortControl\b/],
      ["a category selector", /<CategorySelect\b/],
      ["sort state", /setSortBy|sortedProducts/],
      ["filter state", /selectedCategory|categoriesWithCounts/],
      ["the orphaned touch handler", /sortTouch|sb-sort-trigger/],
      ["a dead price formatter", /const formatPrice/],
    ] as const) {
      if (re.test(railBody)) missing.push(`the featured rail has ${what} again — the Products tab owns it`)
    }

    // The five options live in one place.
    for (const label of ["Most Recent", "Oldest", "Price: Low → High", "Price: High → Low", "Most Popular"]) {
      if (!controls.includes(label)) missing.push(`the shared control lost "${label}"`)
    }
    if (/SORT_LABELS: Record|sortLabels: Record/.test(grid))
      missing.push("the products tab has its own copy of the sort labels")

    /**
     * THE PILL SHOWS EVEN WHEN "ALL" IS THE ONLY OPTION. It used to return
     * null below two categories, so a store with none had a header collapsing
     * to a lone control at the right and no product count anywhere. With
     * nothing to choose between it is a label, not a menu — same shape, same
     * count, no chevron — because a control that opens a list containing only
     * what it already says is a small lie about what it does.
     */
    if (/categories\.length < 2\) return null/.test(controls))
      missing.push("the category pill hides itself again when All is the only option")
    if (!/categories\.length === 0/.test(controls))
      missing.push("the pill opens a one-item menu instead of being a label")
    // A chip row is what this replaced.
    if (/rounded-full border px-3\.5 py-2 text-sm font-medium/.test(rail))
      missing.push("the mobile category chip row is back")
    if (!/compact \? \(\s*<ArrowUpDown/.test(controls)) missing.push("sort no longer collapses to an icon")
    if (!/compact \? "h-9 w-9 justify-center rounded-\[7px\] border border-border"/.test(controls))
      missing.push("the compact sort button is not a 7px square")

    /**
     * The builder still offers "Hide Category Filter". The filter it hid moved
     * tabs, so the setting has to travel with it or become a control that
     * saves and does nothing — which it already was once.
     */
    if (!/showCategoryFilter && \(/.test(grid))
      missing.push("the products tab ignores the Hide Category Filter setting")
    if (!/showCategoryFilter=\{/.test(code("app/(marketing)/u/[username]/page.tsx")))
      missing.push("the page no longer passes Hide Category Filter through — the builder toggle is dead again")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "About is not a tab, and the three tabs share a phone's width",
  (() => {
    /**
     * About sits BELOW the tab panels, so it is the last thing on the page
     * whichever tab you are on. As a tab it was a destination competing with
     * the products for a click it was never going to win.
     *
     * THE TABS ARE FULL WIDTH ON A PHONE. Centring them first — the previous
     * attempt — still left three short words huddled in the middle of a 390px
     * column with dead rule either side, and the active underline, the thing
     * that says where you are, was as narrow as the word above it. Etsy, and
     * every phone tab bar that works, gives each tab an equal share: measured
     * at 390px, three tabs of 122px spanning the rule exactly. Desktop hands
     * the width back to the words, where three stretched tabs across 1100px
     * would read as site navigation rather than as a filter on the page.
     */
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const tabs = code("components/storefront/storefront-tabs.tsx")
    const missing: string[] = []

    if (/label: "About"/.test(page)) missing.push("About is a tab again")
    // Below the panels, and last of everything below them — the reviews block
    // now sits between the two.
    /* `{about}` is inside its own SafeRegion now; it is still the last thing. */
    if (!/<StorefrontTabs[\s\S]{0,300}?\/>[\s\S]{0,600}?<SafeRegion name="about">\{about\}<\/SafeRegion>\s*<\/>/.test(page))
      missing.push("About no longer renders last, after the tab panels, on every tab")
    /**
     * The desktop half is behind `!isMobile` so the store builder's phone
     * frame — narrow frame, wide viewport, invisible to CSS — gets the phone
     * strip. Measured at a 1180px viewport: frame on, three tabs of 351px;
     * frame off, 44/63/91.
     */
    if (!/"relative flex w-full gap-0 border-b border-border",\s*\n\s*!isMobile && "sm:w-auto sm:min-w-max/.test(tabs))
      missing.push("the tab strip no longer fills a phone's width, or ignores the builder's phone frame")
    if (!/"-mb-px flex-1 [^"]*text-center text-sm",\s*\n\s*!isMobile && "sm:flex-none sm:text-left"/.test(tabs))
      missing.push("the tabs no longer share that width evenly — one long label would take more than its third")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "switching tabs does not flash: nothing refetches and nothing fades",
  (() => {
    /**
     * Three ways this has gone wrong, in order.
     *
     * Unmounting the inactive panel means every switch back rebuilds the
     * sections and re-requests their images. The panels stay mounted, and it
     * is measured rather than assumed: zero extra image requests across six
     * switches, at 390px and at 1180px.
     *
     * Then the arrival animation rose 6px as well as fading, which on a grid
     * of product images reads as the cards jumping rather than as the panel
     * arriving.
     *
     * Then — with the rise gone — the fade itself was still the flash. The
     * outgoing panel is hidden on the same frame the incoming one starts at
     * `opacity: 0`, so every switch opened on a frame of empty page and the
     * cards blinked into existence. Both panels are already rendered and
     * already hold their images; swapping which is visible is instantaneous,
     * and instantaneous is what "no flash" means. Measured: computed opacity
     * 1.00 and transform `none` on every frame after the click.
     *
     * A fade would be earned by content that has to be FETCHED. That is not
     * this, and it must not come back without it.
     */
    const tabs = code("components/storefront/storefront-tabs.tsx")
    const css = read("app/globals.css")
    const missing: string[] = []

    if (!/hidden=\{tab\.id !== active\}/.test(tabs))
      missing.push("inactive panels are unmounted again — every switch back refetches their images")
    if (/animate-\[|animate-in|transition-opacity/.test(tabs))
      missing.push("the panel animates on arrival again — the first frame of a fade-in is the flash")
    if (/@keyframes storefront-tab-in/.test(css))
      missing.push("the tab-switch keyframes are back")

    /**
     * THE PANEL RESET MUST NOT REACH INTO A BOX THAT OWNS ITS PADDING.
     *
     * The reset zeroes the top padding of a panel's first two levels so every
     * tab starts the same distance below the rule — a Home section carries its
     * spacing as an inline style, so it takes `!important` to overrule. But
     * the Communities empty state is exactly two levels deep, so the reset
     * stripped its `p-10` top too and "No communities yet" ended up sitting ON
     * the dashed border. `data-panel-spacing` opts a box out; measured, the
     * heading is 41px below the border rather than 0.
     */
    if (!/\[&>\*:first-child:not\(\[data-panel-spacing\]\)\]:!pt-0/.test(tabs))
      missing.push("the panel reset no longer exempts boxes that own their padding")
    if (!/<div data-panel-spacing className="rounded-lg border border-dashed/.test(tabs))
      missing.push("the empty-tab box lost its opt-out — its heading will sit on the dashed border")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the owner's controls clear the avatar on a real phone",
  (() => {
    /**
     * "Edit profile" plus the overflow menu is about 160px. The avatar
     * straddles the bottom CENTRE of the cover, so a control pinned
     * bottom-right on a 390px screen reaches back past the avatar's right edge
     * and sits on top of it. It did, visibly, in the shipped app.
     *
     * IT WAS SUPPOSEDLY ALREADY FIXED. The first fix branched on the `isMobile`
     * PROP — which is the store builder's phone-preview switch, not a fact
     * about the device. The published page renders with it false whatever is
     * asking, so on a real phone the branch chose the desktop position and the
     * overlap survived a fix written specifically to remove it. Only CSS knows
     * how wide the screen is; the prop is still honoured because the builder's
     * preview frame is narrow while its viewport is not.
     *
     * Measured at 390px: actions at y=12 top-right, avatar at y=124 — no
     * intersection on either axis. At 1180px they are 345px apart.
     */
    const header = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    const block = header.match(/\{ownerActions && \([\s\S]{0,400}?\)\}/)?.[0] ?? ""
    if (!block) missing.push("could not find the owner-actions block")
    if (/isMobile \? "top-3 right-3" : "bottom-4 right-4"/.test(header))
      missing.push("the position is chosen by the isMobile prop again — the published page always picks desktop")
    /* 15px rather than 12 since the owner asked for the phone controls a few pixels lower. */
    if (!/"absolute right-3 top-\[15px\] z-\[6\]"/.test(block))
      missing.push("the owner's controls no longer start at the top-right, where nothing else is")
    if (!/!isMobile && "sm:bottom-4 sm:right-4 sm:top-auto"/.test(block))
      missing.push("the desktop position is no longer a breakpoint")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "a section's spacing setting is applied once, and empty tabs are a mark and a line",
  (() => {
    /**
     * ABOUT PADDED ITSELF TWICE.
     *
     * UnifiedSectionRenderer pads every section with that section's own
     * `spacing`, and the About section's inner div then applied the identical
     * numbers again — so a creator's 48px became 96 on the page, and every
     * nudge of the control in the builder moved it by twice what the control
     * said. On the storefront that was 96px of empty page between the last
     * product and the About rule, under every tab; with the panel's own bottom
     * gap on top of it, 129.
     *
     * Deleting only the inline style would have revived the `py-6 md:py-12`
     * classes underneath it, which is a different wrong number rather than a
     * fix — so those went too.
     *
     * AND THE EMPTY TAB is now a mark, four words and one short line. It used
     * to carry two sentences explaining that Storelib has no paid-communities
     * feature yet: a roadmap note in the middle of somebody's shop, which a
     * visitor does not need and the creator cannot act on. Shorter box, less
     * void under it.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const tabs = code("components/storefront/storefront-tabs.tsx")
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const missing: string[] = []

    // Just this one component: ProductAboutSection further down the file is a
    // different thing — a payment-methods block on the product page, with no
    // spacing setting to double — and it legitimately carries its own padding.
    const about = renderer.slice(renderer.indexOf("function UnifiedAboutSection"))
    const aboutBody = about.slice(0, about.search(/\n(export )?function /) + 1 || undefined)
    if (/paddingTop: spacing\?\.paddingTop/.test(aboutBody))
      missing.push("the About section pads itself on top of the wrapper's padding again — every spacing setting is doubled")
    if (/py-6 px-2 md:py-12/.test(aboutBody))
      missing.push("the About section's hardcoded vertical padding is back")

    /*
      The icon used to be a COMPONENT prop with `Users` as its default, and
      that is exactly what took every creator's live page down: the creator
      page is a Server Component, and handing a client component a forwardRef
      object across that boundary throws during the render. It is a name now,
      resolved on the client side. Still an icon, still defaulting to people.
      tests/rsc-boundary.test.ts guards the class.
    */
    if (!/icon = "people"/.test(tabs) || !/people: Users/.test(tabs))
      missing.push("the empty tab lost its icon")
    if (/icon\?: React\.ComponentType/.test(tabs))
      missing.push("the empty tab takes a component again — that cannot cross the server boundary")
    if (!/<Icon className="mx-auto mb-3 h-6 w-6/.test(tabs)) missing.push("the empty tab's icon is not rendered")
    const detail = page.match(/detail="([^"]*)"/)?.[1] ?? ""
    if (!detail) missing.push("the empty tab has no line under its heading")
    else if (detail.length > 60)
      missing.push(`the empty tab explains itself again (${detail.length} chars) — nobody reading a shop needs the roadmap`)

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

section("The two biggest images on a storefront are the two that were never optimised")

check(
  "the cover and the avatar are served at the size they are shown at",
  (() => {
    /**
     * BOTH POINTED AT THE ORIGINAL UPLOAD. Nothing resized either one: a phone
     * camera JPEG went to storage at 4032×3024 and came back at four megabytes
     * to be painted into a 192px band and a 137px circle. Every product
     * thumbnail on the same page went through the optimizer; these two did not.
     *
     * Measured on a real page with a real 5.5MB camera-sized JPEG:
     *   cover   5,791,666 B JPEG → 33,986 B AVIF at 390px, 152,253 B at 3×
     *   avatar  5,791,666 B JPEG →  9,903 B AVIF
     *
     * `priority` is the other half: it puts a preload link in the document
     * head, so the download starts from the first bytes of HTML instead of
     * after hydration. Verified present, with a full srcset.
     *
     * AND THE FADE IS GONE. The cover set `opacity: 0` from a ref callback and
     * transitioned back over 700ms on load — invisible until JavaScript ran,
     * then most of a second to arrive. That is what "abruptly shows the image"
     * described: not the appearing, the waiting. Measured after: computed
     * opacity 1 with no transition.
     */
    const header = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    if (!/src=\{coverImageUrl\}\s*\n\s*alt=\{`\$\{profile\?\.display_name \|\| "Creator"\} cover`\}\s*\n\s*fill/.test(header))
      missing.push("the cover is not rendered through next/image any more")
    /* `sizes` follows the zoom now (lib/images/cover-crop coverSizes): 100vw at
       zoom 1, more for a zoomed cover. Still resized, still preloaded. */
    if (!/sizes=\{coverSizes\(crop\.zoom\)\}\s*\n\s*quality=\{PORTRAIT_QUALITY\}\s*\n\s*priority/.test(header))
      missing.push("the cover lost its sizes/quality/priority — it will not be preloaded or resized")
    if (/el\.style\.opacity = "0"/.test(header))
      missing.push("the cover hides itself until JavaScript runs again")
    if (/transition-opacity duration-700/.test(header))
      missing.push("the cover fades in over 700ms again")
    /**
     * The expression moved into lib/store-builder/header-avatar, because the
     * creator page needs the SAME url to preload it — Radix loads its picture
     * in an effect, so without a preload the download cannot start until the
     * page has hydrated. Two expressions would drift and the page would fetch
     * the avatar twice. What this guards is unchanged: the header must not go
     * back to pointing at the original upload.
     */
    if (!/src=\{avatarSrc\}/.test(header))
      missing.push("the header avatar is not coming from headerAvatar() any more")
    if (!/optimizedImageUrl\(source, size\)/.test(code("lib/store-builder/header-avatar.ts")))
      missing.push("headerAvatar stopped resizing — the avatar is back to the full-size original")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the optimizer is only ever asked for widths and qualities it accepts",
  (() => {
    /**
     * THE ENDPOINT RETURNS 400, NOT A SMALLER PICTURE, when either is wrong —
     * so a mistake here is not "slightly less optimised", it is every avatar
     * on the site broken, and it looks like nothing until someone opens the
     * network tab.
     *
     *  - `w` must be a literal member of deviceSizes ∪ imageSizes. Next 16
     *    also dropped 16 from imageSizes, so a list copied from older docs is
     *    already wrong.
     *  - `q` must appear in `images.qualities`, which Next 16 defaults to
     *    `[75]` ALONE. PORTRAIT_QUALITY is 88 because these are the pictures a
     *    creator chose to represent themselves — that only works while
     *    next.config lists it.
     *
     * The real function is run rather than pattern-matched: it is the widths
     * it actually emits that break, not the ones it is written to emit.
     */
    const allowed = new Set([32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840])
    const missing: string[] = []

    for (let display = 1; display <= 2000; display += 7) {
      const url = optimizedImageUrl("https://x.supabase.co/storage/v1/object/public/avatars/a.jpg", display)
      const w = Number(new URLSearchParams(url.split("?")[1]).get("w"))
      if (!allowed.has(w)) {
        missing.push(`display ${display}px asks the optimizer for w=${w}, which it rejects`)
        break
      }
    }

    const config = read("next.config.mjs")
    const qualities = config.match(/qualities:\s*\[([^\]]*)\]/)?.[1] ?? ""
    if (!qualities.split(",").map((q) => Number(q.trim())).includes(PORTRAIT_QUALITY))
      missing.push(`PORTRAIT_QUALITY is ${PORTRAIT_QUALITY} but next.config lists qualities [${qualities.trim()}] — every image using it 400s`)

    /**
     * AND AN UNCONFIGURED HOST IS LEFT ALONE. `<Image>` does not degrade on
     * one — it throws "hostname is not configured" during render, and this
     * header is at the top of every storefront. `cover_url` is user data going
     * back years; one row pointing at some other CDN and the creator's page is
     * an error instead of a slightly-too-large photo. Verified in a browser:
     * a cdn.shopify.com cover renders a plain <img>, page status 200, zero
     * page errors.
     */
    if (isOptimizableImage("https://cdn.shopify.com/x/legacy.jpg"))
      missing.push("an unconfigured host is treated as optimizable — <Image> will throw and take the page down")
    if (!isOptimizableImage("https://abc.supabase.co/storage/v1/object/public/covers/c.jpg"))
      missing.push("Supabase storage is no longer recognised — every real cover would skip the optimizer")
    if (!isOptimizableImage("/placeholder.jpg")) missing.push("our own /public images are no longer optimizable")
    if (isOptimizableImage("//evil.example.com/x.jpg")) missing.push("a protocol-relative URL is treated as local")
    if (optimizedImageUrl("blob:http://localhost/abc", 128) !== "blob:http://localhost/abc")
      missing.push("a local preview URL is handed to the optimizer, which cannot fetch it")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "an upload is resized before it is stored, and stored to be cached",
  (() => {
    /**
     * lib/storage/image-url.ts has promised for a while that "compression
     * happens ONCE at upload, in the browser — see lib/images/compress.ts".
     * That file did not exist and nothing resized anything. Serving through
     * the optimizer hides that from a viewer, but the origin object is still
     * four megabytes: it costs storage, it costs the optimizer a slow first
     * fetch, and anything reading the original pays again.
     *
     * Measured in a browser on a 5.52MB 4032×3024 JPEG:
     *   avatars → 28KB WebP at 512×384, 357ms
     *   covers  → 341KB WebP at 1867×1400, 776ms
     *   an already-small WebP passes through untouched; an SVG is left alone.
     *
     * AND cacheControl WAS AN HOUR. Every path is `<user>/<timestamp>.<ext>`,
     * so a new upload is a new URL and the bytes at any URL never change — an
     * hour meant a visitor returning tomorrow downloaded the whole cover
     * again. That is the "sometimes" in "sometimes it takes very long".
     */
    const upload = code("components/app/image-upload.tsx")
    const compress = code("lib/images/compress.ts")
    const missing: string[] = []

    if (!/const profile = COMPRESS_PROFILES\[bucket\]/.test(upload) || !/await compressImage\(file, profile\)/.test(upload))
      missing.push("uploads are no longer compressed in the browser")
    if (!/\.upload\(filePath, upload, \{/.test(upload))
      missing.push("the ORIGINAL file is being uploaded again, not the compressed one")
    if (!/cacheControl: "31536000"/.test(upload))
      missing.push("uploads are cached for an hour again — returning visitors re-download every image")
    if (!/const ext = upload\.name\.split\(/.test(upload))
      missing.push("the stored path takes its extension from the original, so a WebP is stored as .heic")

    // The three refusals, each of which turns an optimisation into a downgrade.
    /* The original goes up instead, without its location metadata
       (lib/images/metadata.ts), never the larger re-encode. */
    if (!/if \(blob\.size >= file\.size\) return \(await withoutMetadata\(file\)\) as File/.test(compress))
      missing.push("compression can now return something LARGER than it was given")
    if (!/const LEAVE_ALONE = /.test(compress) || !compress.includes("svg") || !compress.includes("gif"))
      missing.push("SVGs and GIFs are rasterised again — one loses its animation, the other gets bigger")
    if (!/LEAVE_ALONE\.test\(file\.type\)\) return file/.test(compress))
      missing.push("the leave-alone list is declared but never consulted")
    if (!/while \(width > targetWidth \* 2/.test(compress))
      missing.push("the stepwise halving is gone — a 4032px photo resampled in one draw aliases badly")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "there is one list of social platforms, and a handle is a handle",
  (() => {
    /**
     * THERE WERE FIVE COPIES. The edit-profile dialog, the store builder's
     * header panel, the store builder's social-icons panel, the storefront's
     * icon row, and the API route — each with its own order, its own labels,
     * and its own idea of what you were allowed to type. Adding a platform
     * meant finding all five; missing one meant a field a creator could fill
     * in that saved nothing, or an icon on the page with nothing behind it.
     *
     * `enabled` was removed for exactly this reason and this is the same bug
     * one level up.
     *
     * AND "Username or URL" WAS A LIE. The old rule prefixed https:// onto
     * anything without a scheme and then required a dot in the hostname, so
     * `andrew.rullz` — an ordinary Instagram handle, and the one in the report
     * — was saved as `https://andrew.rullz/`, a link to a domain that does not
     * exist. `andrewrullz`, with no dot, was rejected silently: the field just
     * emptied itself on save. The real function is run here, because what it
     * accepts is the whole of what the placeholder promises.
     */
    const dialog = code("components/storefront/edit-profile-button.tsx")
    const sidebar = code("components/store-builder/sections-sidebar.tsx")
    const row = code("components/store-builder/social-media-icons.tsx")
    const api = code("app/api/creator-profile/route.ts")
    const missing: string[] = []

    // Nobody may declare their own list any more.
    for (const [name, src] of [
      ["the edit-profile dialog", dialog],
      ["the store builder sidebar", sidebar],
      ["the storefront icon row", row],
      ["the API route", api],
    ] as const) {
      if (/\["instagram", "tiktok"|"instagram" as const, Icon|instagram: "Instagram"/.test(src))
        missing.push(`${name} has its own copy of the platform list again`)
    }
    // `\b` matters: without it a renamed `<SocialLinksEditorX` satisfies the
    // check, which is exactly how a break-test found this guard was loose.
    /* Or its memoised wrapper, which is the same component (React.memo(SocialLinksEditor)). */
    if (!/<SocialLinksEditor\b/.test(dialog) && !(/<MemoSocialLinksEditor\b/.test(dialog) && /React\.memo\(SocialLinksEditor\)/.test(dialog)))
      missing.push("the dialog no longer uses the shared editor")
    if ((sidebar.match(/<SocialLinksEditor\b/g) || []).length < 2)
      missing.push("the store builder has gone back to hand-rolling its social inputs")

    // The seven that were asked for, in order.
    const expected = ["tiktok", "instagram", "facebook", "youtube", "linkedin", "twitter", "twitch"]
    if (JSON.stringify([...OFFERED_SOCIAL_PLATFORM_KEYS]) !== JSON.stringify(expected))
      missing.push(`the offered platforms changed: ${OFFERED_SOCIAL_PLATFORM_KEYS.join(", ")}`)

    // A handle becomes that platform's profile, on every platform.
    const handles: Array<[string, string]> = [
      ["instagram", "https://www.instagram.com/andrew.rullz"],
      ["tiktok", "https://www.tiktok.com/@andrew.rullz"],
      ["youtube", "https://www.youtube.com/@andrew.rullz"],
      ["twitter", "https://x.com/andrew.rullz"],
      ["facebook", "https://www.facebook.com/andrew.rullz"],
      ["linkedin", "https://www.linkedin.com/in/andrew.rullz"],
      ["twitch", "https://www.twitch.tv/andrew.rullz"],
    ]
    for (const [key, want] of handles) {
      const got = resolveSocialInput(key as never, "andrew.rullz")
      if (got !== want) missing.push(`a ${key} handle resolves to ${got} instead of ${want}`)
    }
    if (resolveSocialInput("instagram" as never, "@andrew") !== "https://www.instagram.com/andrew")
      missing.push("a leading @ is no longer stripped from a handle")
    if (resolveSocialInput("instagram" as never, "andrewrullz") !== "https://www.instagram.com/andrewrullz")
      missing.push("a handle with no dot is rejected again — the field empties itself on save")

    // A real URL is still a URL.
    if (resolveSocialInput("instagram" as never, "instagram.com/andrew") !== "https://instagram.com/andrew")
      missing.push("a pasted URL is no longer kept as one")

    /**
     * The protocol allowlist is the point of this function: these end up in an
     * href on a public page. They carry a scheme, so they never reach the
     * handle branch — but the handle branch must not become a way around it.
     */
    for (const nasty of [
      "javascript:alert(1)",
      "javascript:void(0)",
      "data:text/html,<script>",
      "vbscript:msgbox",
      "JavaScript:alert(1)",
    ]) {
      if (resolveSocialInput("instagram" as never, nasty) !== null)
        missing.push(`resolveSocialInput lets ${nasty} through`)
    }
    // And a handle cannot reshape the URL it is pasted into.
    for (const nasty of ["../../evil", "a?x=1", "a#b", "a\\b"]) {
      const got = resolveSocialInput("instagram" as never, nasty)
      if (got !== null && !got.startsWith("https://www.instagram.com/"))
        missing.push(`the handle "${nasty}" escaped its platform: ${got}`)
    }

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "both product grids break at the same widths",
  (() => {
    /**
     * TWO DEFINITIONS OF "MOBILE" ON ONE PAGE.
     *
     * The Featured rail picked its column count from a JS media query at
     * `max-width: 768px`; the Products tab used Tailwind's `sm:`, which is
     * 640px. Between those two numbers the tabs disagreed — measured at 700px,
     * Home drew ONE column of 668px cards and Products drew TWO of 326px, so
     * switching tab halved every card and pulled the grid up by more than a
     * screen: 2472px of grid against 922px. Measured after, at 600 / 700 / 760
     * / 800 / 1100: identical column count, card width and grid height on both
     * tabs at every one.
     *
     * One of the two being JavaScript is what kept it hidden — it only showed
     * in a window that happened to be that wide, and it also meant the first
     * paint was always the desktop layout with a phone re-laying-out a frame
     * later.
     *
     * The creator's `mobileListing` choice is still the phone layout; it is
     * the base class now, with the same `sm:`/`lg:` steps above it that the
     * Products grid has. `isMobile` — the builder's phone preview, where the
     * frame is narrow but the viewport is not — is the one case CSS cannot
     * see, so it is the one case still branched on.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const grid = code("components/storefront/all-products-grid.tsx")
    const missing: string[] = []

    const featured = renderer.slice(renderer.indexOf("function UnifiedFeaturedProductsSection"))
    const body = featured.slice(0, featured.search(/\n(export )?function /) + 1 || undefined)

    if (/matchMedia/.test(body))
      missing.push("the featured rail decides its layout in JavaScript again — it will disagree with the Products tab between the two breakpoints")
    if (/runtimeIsMobile|uiIsMobile/.test(body))
      missing.push("the JS 'is this mobile' flag is back in the featured rail")
    /**
     * THREE COLUMNS FROM `md`, NOT FROM `lg`, on both.
     *
     * The creator page is edited inside a frame that is a sidebar and two
     * insets narrower than the window, so at `lg` an ordinary laptop showed
     * the creator two columns while a visitor on the same laptop saw three.
     * A card at 768/3 is about 230px, still wider than the phone layout all
     * of these are designed at.
     */
    if (!/!isMobile && "sm:grid-cols-2 md:grid-cols-3"/.test(body))
      missing.push("the featured grid no longer steps at sm and md")
    if (!/"grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3"/.test(grid))
      missing.push("the Products grid changed its steps — the two must match")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "a storefront is never edge-cached, on either path it is reached by",
  (() => {
    /**
     * THE FIX WAS ONLY HALF APPLIED, AND THE MISSING HALF WAS THE COMMON PATH.
     *
     * next.config.mjs sets `private, no-cache, must-revalidate` for
     * `/u/:username*`, with a comment saying why: the page renders an Edit
     * button, owner menus and a follow state that all depend on who is asking,
     * so a shared cache serves one visitor's rendering to another — and it
     * made `router.refresh()` after a save a no-op, because the refreshed RSC
     * payload came straight back from the edge unchanged.
     *
     * But `headers()` matches THE PATH THE BROWSER ASKED FOR, and most
     * storefronts are reached at `andrew.storelib.com`, where that path is
     * `/`. `/` has its own rule — `public, s-maxage=3600` — meant for the
     * marketing landing page. So the subdomain storefront was edge-cached for
     * an hour, shared across visitors, and a saved profile stayed invisible
     * until the hour was up. That is the "I still have to refresh manually".
     *
     * proxy.ts is the only place that knows a request is a storefront, because
     * it is the thing rewriting `/` to `/u/{username}`. Verified separately
     * that router.refresh() itself works: a force-dynamic server component
     * re-rendered with a new value on click.
     */
    const proxy = code("proxy.ts")
    const config = read("next.config.mjs")
    const missing: string[] = []

    if (!/rewritePath\.startsWith\("\/u\/"\)/.test(proxy))
      missing.push("the proxy no longer recognises a storefront rewrite")
    /* Set on whichever response the proxy returns: built by `respond()`, the
       one function the proxy uses both first and again after a session
       renewal, so the header survives a renewal too. */
    if (!/if \(rewritePath\.startsWith\("\/u\/"\)\) r\.headers\.set\("Cache-Control", "private, no-cache, must-revalidate"\)/.test(proxy) ||
        !/supabaseResponse = respond\(\)/.test(proxy))
      missing.push("a subdomain storefront is edge-cacheable again — saves will not show, and one viewer's page can be served to another")

    // The direct path keeps its own rule.
    const uRule = config.match(/source: '\/u\/:username\*',\s*headers: \[\s*\{ key: 'Cache-Control', value: '([^']*)'/)?.[1]
    if (!uRule) missing.push("the /u/:username* cache rule is gone")
    else if (!/private/.test(uRule) || !/no-cache/.test(uRule))
      missing.push(`/u/:username* is publicly cacheable again: ${uRule}`)

    /**
     * And the save still asks for the re-render. Without this the header would
     * only mean the NEXT navigation was fresh.
     *
     * The call moved into `useSaveThenRefresh` so that it can run when the
     * sheet has finished leaving rather than underneath it on the way down.
     * Both halves are checked: the dialog asks, and the sheet does it.
     */
    const dialog = code("components/storefront/edit-profile-button.tsx")
    const sheetSrc = code("components/storefront/editor-sheet.tsx")
    if (!/markSaved\(\)/.test(dialog))
      missing.push("saving a profile no longer asks for the page to be re-read")
    if (!/router\.refresh\(\)/.test(sheetSrc))
      missing.push("the sheet no longer refreshes the page after a save")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the two tabs draw their cards in the same column",
  (() => {
    /**
     * THE HOME RAIL WAS INSET AND THE PRODUCTS TAB WAS NOT.
     *
     * `defaultFeaturedProductsSettings` ships `paddingLeft/Right: 16` (12 on
     * mobile), and UnifiedSectionRenderer's wrapper applied it ON TOP of the
     * rail's own SectionContainer — which already provides the page column,
     * `px-3 sm:px-4 lg:px-6`, and is the same container the Products tab uses.
     * So Home sat 32px from the edge on desktop against Products' 16: the same
     * cards on two tabs of one page, at different widths, sliding sideways as
     * you switched.
     *
     * IT WAS INVISIBLE TO EVERY EARLIER MEASUREMENT because the harness passed
     * `paddingLeft: 0` — a number nobody's storefront actually has. Measured
     * with the real defaults, at 390 / 768 / 1180: grid edges 12–378, 16–752
     * and 64–1116 on BOTH tabs, and the two titles start at the same x.
     *
     * Vertical spacing is still the creator's — it separates this section from
     * the ones around it, which is what that control is for. Horizontal is the
     * page's column, not a per-section choice.
     *
     * The assertion on the default is not decoration: if it ever became 0 this
     * guard would pass for a page that no longer needs it, and the next person
     * to set it back would reintroduce the bug silently.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const defaults = code("lib/store-builder/defaults.ts")
    const grid = code("components/storefront/all-products-grid.tsx")
    const missing: string[] = []

    if (!/const isProductRail = section\.type === "featured-products"/.test(renderer))
      missing.push("the renderer no longer recognises the product rail")
    /*
      The exemption is a named list now — `ownsItsColumn` — because the
      reviews joined it: they carry the page's column themselves and the
      wrapper was adding padding on top, which put the reviews card one step
      further in than More from the seller on a phone. So this checks that the
      rail is still IN that list and that the style still reads it, rather
      than pinning the exact expression, which is what made this fail when the
      list grew.
    */
    if (!/const ownsItsColumn = [^\n]*isProductRail/.test(renderer))
      missing.push("the featured rail is no longer exempt from the wrapper's horizontal padding — Home will sit further in than Products")
    if (!/paddingLeft: ownsItsColumn \? undefined :/.test(renderer))
      missing.push("the wrapper applies horizontal padding again")
    if (!/paddingRight: ownsItsColumn \? undefined :/.test(renderer))
      missing.push("the wrapper's right padding is back")

    const shipped = defaults.match(/defaultFeaturedProductsSettings[\s\S]{0,900}?paddingLeft: (\d+)/)?.[1]
    if (shipped === undefined) missing.push("could not read the featured section's default horizontal padding")
    else if (shipped === "0")
      missing.push("the default horizontal padding is 0, so this guard proves nothing — set it back or delete the guard")

    /*
      Both columns come from the same place, and that place is 1180 now, not
      1100: About and the reviews had always overridden the container to 1180,
      so the page had two left edges and the tab strip started 32px further in
      than "About <creator>". One number for all of them.
      See tests/creator-page-default.test.ts and scripts/check-page-width.mjs,
      which measures where the words begin rather than trusting these names.
    */
    if (!/mx-auto w-full max-w-\[1180px\]/.test(grid))
      missing.push("the products grid no longer uses the page column")
    if (!/"mx-auto w-full max-w-\[1180px\]", !noPadding && "px-3 sm:px-4 lg:px-6"/.test(renderer))
      missing.push("SectionContainer's column changed — the two tabs will no longer agree")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "Home is a heading, and the category pill only pretends to be a menu when it is one",
  (() => {
    /**
     * TWO HEADERS WITH DIFFERENT JOBS, in one component so their heights and
     * margins cannot drift apart. Home reads "Featured" and nothing else;
     * Products reads "Products … All (n) … Sort: Most Recent". Measured: both
     * rows 36px, so the first card sits the same distance below the tab strip
     * on either tab.
     *
     * HOME HAD A "View all products →" LINK for one commit. The tab strip is
     * directly above it saying "Products" — a second control two inches below
     * the first, doing the same thing, is not a shortcut. It went, and the
     * context that let a panel switch tabs went with it: plumbing with no
     * consumers reads as a feature and is a no-op.
     *
     * "Featured", not "Featured Products", because Products is now the tab
     * beside it. A creator's own headline still wins; only the value nobody
     * chose — the old shipped default — is replaced, the same "did anyone
     * actually decide this" rule the sticky bar uses.
     *
     * THE PILL IS A MENU ONLY WHEN THERE IS SOMETHING TO BROWSE. With
     * categories it lists them with their counts and filters the grid —
     * verified: All (6) / Bags (3) / Tees (2) / Templates (1), choosing Tees
     * leaves 2 cards and relabels the pill, choosing All restores 6. With
     * none it is a plain label in the same pill: same shape, same count, no
     * chevron, not clickable. A control that opens a list containing only what
     * it already says is a small lie about what it does.
     */
    const rail = code("components/store-builder/unified-section-renderer.tsx")
    const grid = code("components/storefront/all-products-grid.tsx")
    const tabs = code("components/storefront/storefront-tabs.tsx")
    const controls = code("components/storefront/catalog-controls.tsx")
    const missing: string[] = []

    if (!/const LEGACY_FEATURED_HEADLINE = "Featured Products"/.test(rail))
      missing.push("the old default headline is no longer recognised, so stores still set to it keep saying it")
    if (!/settings\.headline === LEGACY_FEATURED_HEADLINE \? "Featured" : settings\.headline/.test(rail))
      missing.push("the rail no longer prefers the creator's own headline over the old default")
    if (!/title="Products"/.test(grid)) missing.push("the Products tab lost its title")

    // The rail is a heading. Nothing else belongs in its header.
    if (/View all products/.test(rail)) missing.push("the rail duplicates the Products tab as a link again")
    if (/useStorefrontTabs|StorefrontTabsContext/.test(rail + tabs))
      missing.push("the switch-tabs-from-a-panel plumbing is back with nothing using it")
    /**
     * THE RAIL'S HEADER CARRIES ONE THING, and it is not a visitor's.
     *
     * This used to require the header to be SELF-CLOSING — nothing in it at
     * all — which was right when the only things that had ever been in it
     * were a sort control, a category selector and a "View all products"
     * link, all of which belong to the Products tab. It is wrong now: the
     * owner's Arrange control lives there, because a row of its own put 48px
     * between the heading and the first card for one button, measured by
     * scripts/check-arrange-row.
     *
     * So the rule is by NAME rather than by emptiness. A visitor still gets a
     * heading and nothing else; the control a visitor never sees is allowed.
     */
    const railHeader = rail.slice(rail.indexOf("<CatalogHeader"), rail.indexOf("</CatalogHeader>"))
    if (!railHeader) missing.push("the rail has no header at all")
    if (/CategorySelect|SortControl/.test(railHeader))
      missing.push("the rail's header has grown the Products tab's browsing controls again")
    for (const allowed of railHeader.match(/<[A-Z][A-Za-z]*/g) || []) {
      if (allowed !== "<CatalogHeader" && allowed !== "<ArrangeProductsControl")
        missing.push(`the rail's header has grown ${allowed.slice(1)} — a visitor should see a heading and nothing else`)
    }

    // The header row keeps its height with no controls in it, or the two tabs
    // stop lining up.
    if (!/mb-5 flex min-h-9 items-center/.test(controls))
      missing.push("CatalogHeader no longer fixes its height — an empty Home header would collapse and the tabs would disagree")
    if (!/\{children \? <div className="ml-auto/.test(controls))
      missing.push("an empty controls box is rendered when a tab has none")

    // Menu when there is something to choose, label when there is not.
    if (!/if \(categories\.length === 0\) \{\s*return <span className=\{triggerClass\}>/.test(controls))
      missing.push("with no categories the pill is a menu again, opening a list of one")
    if (/categories\.length < 2\) return null/.test(controls))
      missing.push("the category pill hides itself again, taking the product count with it")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the creator can edit their story from their own page, and a save that changed nothing says so",
  (() => {
    /**
     * THE ABOUT BLOCK HAD NO WAY IN FROM THE PAGE. Its "+ Add a story
     * headline" placeholders and hover pencils are `isEditorMode` only, so
     * they exist in the builder canvas and nowhere else — a creator looking at
     * their own storefront could see the block and not change it. Now the
     * heading carries the same pencil the cover does, opening the same fields
     * the builder offers: headline, story, images and YouTube.
     *
     * It writes through /api/creator-profile, which already does the auth, the
     * ownership check and the merge into both the draft and the published
     * config. A second route would have been a second copy of all of that, and
     * the copy is always the one that forgets a check.
     *
     * AND A SAVE THAT DID NOT REACH THE STOREFRONT SAYS SO. The route answers
     * `{ ok: true, storefront: false }` when the account is not a creator yet
     * or has no config row — both used to close the dialog and refresh a page
     * that had not changed, which is indistinguishable from the bug where
     * nothing saved at all. Verified separately that the refresh itself works:
     * the real dialog, against a mutating endpoint, updated a server-rendered
     * value with no reload.
     */
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const about = code("components/storefront/edit-about-button.tsx")
    const profile = code("components/storefront/edit-profile-button.tsx")
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const api = code("app/api/creator-profile/route.ts")
    const missing: string[] = []

    if (!/aboutOwnerActions=\{[\s\S]{0,80}viewerIsOwner \?/.test(page))
      missing.push("the About editor is not gated on the viewer being the owner")
    if (!/<EditAboutButton\b/.test(page)) missing.push("the storefront no longer offers the About editor")
    if (!/\{ownerActions\}/.test(renderer)) missing.push("the About section has nowhere to render the owner's control")
    for (const field of ["ea-headline", "ea-story", "Paste a YouTube or Vimeo link"]) {
      if (!about.includes(field)) missing.push(`the story editor lost its ${field} field`)
    }
    if (!/bucket="store-builder-images"/.test(about)) missing.push("the story editor cannot add images")
    if (!/"\/api\/creator-profile"/.test(about))
      missing.push("the story editor writes somewhere other than the shared route")
    if (!/mergeAbout\b/.test(api)) missing.push("the route no longer merges the About story into the config")

    for (const [name, src] of [["the profile dialog", profile], ["the story dialog", about]] as const) {
      if (!/data\.storefront === false/.test(src))
        missing.push(`${name} still reports success for a save that never reached the storefront`)
      /* The refresh moved into `useSaveThenRefresh`, so that it runs when the
         sheet has finished leaving rather than under it on the way down. The
         dialog's half is asking for it. */
      if (!/markSaved\(\)/.test(src)) missing.push(`${name} no longer asks for the page to be re-read`)
    }

    /**
     * ONE YOUTUBE RULE. The dialog needs it to refuse a bad link before a round
     * trip and the API needs it because the dialog is not the authority — and
     * they were two regexes for a moment, which is how a field ends up
     * accepting something the server then silently drops. The real function is
     * run rather than matched, because what it accepts is the whole point.
     */
    /**
     * The YouTube assertions that were here have moved, and grown. There are
     * now two providers and one parser for both — see "there is one video
     * parser, one media editor, and no raw storage URLs in either". This check
     * had asserted that a Vimeo link must be REFUSED, which was true when
     * YouTube was the only option and is exactly backwards now.
     */
    for (const [name, src] of [["the story dialog", about], ["the API route", api]] as const) {
      if (!/parseVideoUrl|canonicalVideoUrl/.test(src))
        missing.push(`${name} no longer uses the shared video parser`)
    }

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the builder canvas previews the page the visitor gets",
  (() => {
    /**
     * THE CANVAS HAD NO TABS. The live storefront grew a Home / Products /
     * Communities strip and the builder kept rendering one long column, so a
     * creator arranged their sections against a layout that no longer existed
     * and published a different one. The whole point of a canvas is that it is
     * the page.
     *
     * It renders the storefront's own components with the draft config —
     * StorefrontTabs, AllProductsGrid, EmptyTabPanel — rather than a lookalike,
     * so the preview cannot drift from the page again without the page moving
     * with it. Editing is unchanged: every section a creator can arrange lives
     * on Home, which is the panel that opens.
     *
     * `isMobile` has to be passed because the builder's phone frame is narrow
     * while the viewport is not, and CSS can only see the viewport. Measured at
     * a 1180px viewport: with the frame on, three tabs of 351px each; with it
     * off, 44/63/91 — their own widths.
     */
    const canvas = code("components/store-builder/preview-canvas.tsx")
    const missing: string[] = []

    if (!/<StorefrontTabs tabs=\{canvasTabs\} isMobile=\{isMobile\} \/>/.test(canvas))
      missing.push("the canvas does not render the storefront's tab strip, or does not tell it about the phone frame")
    if (!/<AllProductsGrid/.test(canvas)) missing.push("the canvas Products tab is not the real grid")
    if (!/<EmptyTabPanel/.test(canvas)) missing.push("the canvas Communities tab is not the real panel")
    if (!/label: "Home"/.test(canvas) || !/label: "Products"/.test(canvas) || !/label: "Communities"/.test(canvas))
      missing.push("the canvas tabs do not match the page's three")
    // About stays outside the tabs here exactly as it does on the page.
    if (!/aboutSection && \(/.test(canvas) || canvas.indexOf("<StorefrontTabs") > canvas.indexOf("aboutSection && ("))
      missing.push("About is no longer rendered after the tabs in the canvas, so the preview and the page disagree")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the social marks are sized for a solid glyph, not an outline",
  (() => {
    /**
     * 20/24 was tuned for hand-drawn OUTLINES, which carry about as much ink
     * as the text beside them. These are Simple Icons — solid glyphs — and a
     * solid 24px mark next to 14px text reads as roughly twice its weight: on
     * a desktop storefront the Instagram square sat beside "1.2K Followers"
     * like a button rather than a mark. Measured after: 18px marks against a
     * 20px text line.
     */
    const row = code("components/store-builder/social-media-icons.tsx")
    const missing: string[] = []
    const size = row.match(/const iconSize = isMobile \? (\d+) : (\d+)/)
    if (!size) missing.push("could not find the icon size")
    else {
      const [, mobile, desktop] = size
      if (Number(desktop) > 18) missing.push(`the desktop mark is ${desktop}px again — too heavy for a solid glyph`)
      if (Number(mobile) > 16) missing.push(`the mobile mark is ${mobile}px again`)
    }
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "there is one video parser, one media editor, and no raw storage URLs in either",
  (() => {
    /**
     * THE FOURTH AND FIFTH COPIES. Two YouTube regexes were merged last week
     * and two more were still out there: one in the About renderer, 400 lines
     * from anything related and the one that decided what a visitor actually
     * saw, and one in the store builder's media list. Five copies of the same
     * eleven characters.
     *
     * AND NOT ONLY YOUTUBE. Pasting a Vimeo link produced a YouTube embed of
     * nothing — a black rectangle on a creator's page, saved without
     * complaint. Verified: watch URLs with a playlist param, youtu.be with a
     * timestamp, /shorts/, /embed/, /live/ and a bare id all resolve to one
     * YouTube watch URL; vimeo.com, player.vimeo.com and a channels URL all
     * resolve to one Vimeo URL; anything else is refused.
     *
     * THE MEDIA LIST WAS TWO EDITORS. The builder's sidebar had thumbnails,
     * captions and drag-to-reorder; the storefront's story dialog had a column
     * of raw Supabase storage URLs and a delete button — which is what a
     * creator saw when editing their own page. Same data, same job, and the
     * worse one was the one they used. Verified in a browser: thumbnails,
     * provider badges, an editable link on a video, drag from position 1 to 3
     * reorders, and no storage URL anywhere in the dialog.
     */
    const editor = code("components/social/media-items-editor.tsx")
    const dialog = code("components/storefront/edit-about-button.tsx")
    const sidebar = code("components/store-builder/sections-sidebar.tsx")
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const api = code("app/api/creator-profile/route.ts")
    const missing: string[] = []

    // One parser, used everywhere a video link is read or written.
    for (const [name, src] of [
      ["the media editor", editor],
      ["the story dialog", dialog],
      ["the About renderer", renderer],
      ["the API route", api],
    ] as const) {
      if (!/parseVideoUrl|videoEmbedUrl|canonicalVideoUrl/.test(src))
        missing.push(`${name} no longer uses the shared video parser`)
    }
    for (const [name, src] of [
      ["the About renderer", renderer],
      ["the store builder sidebar", sidebar],
    ] as const) {
      if (/function extractYouTubeId/.test(src)) missing.push(`${name} has its own YouTube parser again`)
    }

    const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    for (const link of [
      yt,
      "https://www.youtube.com/watch?list=x&v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?t=42",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ]) {
      const got = parseVideoUrl(link)
      if (got?.url !== yt) missing.push(`${link} → ${got?.url ?? "null"}, expected ${yt}`)
    }
    const vimeo = "https://vimeo.com/76979871"
    for (const link of [
      vimeo,
      "https://player.vimeo.com/video/76979871",
      "https://vimeo.com/channels/staffpicks/76979871",
      "https://vimeo.com/video/76979871",
    ]) {
      const got = parseVideoUrl(link)
      if (got?.url !== vimeo) missing.push(`${link} → ${got?.url ?? "null"}, expected ${vimeo}`)
      // The provider name too: renaming the key left its patterns in place, so
      // a break-test that renamed it changed nothing a url-only check could see.
      if (got?.provider !== "vimeo") missing.push(`${link} reports provider "${got?.provider}"`)
    }
    for (const bad of ["not a link", "https://example.com/x", "", "https://youtube.com/watch?v=short"]) {
      if (parseVideoUrl(bad) !== null) missing.push(`"${bad}" was accepted as a video`)
    }
    // The embed must not be the watch URL — an iframe pointed at a watch page
    // renders YouTube's consent wall, not the video.
    if (!parseVideoUrl(yt)?.embedUrl.includes("/embed/")) missing.push("the YouTube embed URL is not an embed URL")
    if (!parseVideoUrl(vimeo)?.embedUrl.includes("player.vimeo.com")) missing.push("the Vimeo embed URL is wrong")

    // One editor, in both places.
    if (!/<MediaItemsEditor\b/.test(dialog)) missing.push("the story dialog builds its own media list again")
    if (!/<MediaItemsEditor\b/.test(sidebar)) missing.push("the store builder builds its own media list again")
    if (/item\.url\}<\/span>/.test(dialog)) missing.push("the story dialog prints raw URLs again")
    if (!/useSortable\(/.test(editor)) missing.push("media items can no longer be reordered")
    if (!/aria-label="Video link"/.test(editor)) missing.push("a video's link is no longer editable in place")

    /**
     * IMAGES ARE NOT DRAGGABLE OUT OF A PAGE. A half-second press on a product
     * photo detaches a ghost of it and follows the cursor, which on a touchpad
     * happens while scrolling and reads as the page coming apart.
     */
    const css = read("app/globals.css")
    if (!/-webkit-user-drag: none/.test(css)) missing.push("images can be dragged out of the page again")
    if (/user-select: none/.test(css.slice(css.indexOf("-webkit-user-drag") - 300, css.indexOf("-webkit-user-drag") + 200)))
      missing.push("the no-drag rule also stopped text being selectable")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the meta row's items toggle one at a time, and the sales badge has one switch",
  (() => {
    /**
     * `showStats` was all-or-nothing, so a creator who wanted their followers
     * shown and their rating hidden had to choose between everything and
     * nothing. Each item is its own switch now, and each is treated as ON when
     * absent — every stored config predates them, and somebody who has never
     * opened the control has not asked for anything to disappear.
     *
     * THE SALES BADGE HAS TWO FLAGS and the renderer requires both:
     * `creators.show_total_sales_badge` AND `headerSettings.showTotalSalesBadge`.
     * One switch has to write both or it is a control that appears not to
     * work — the same bug as the per-platform social `enabled` switch and the
     * sticky bar, for the third time.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const dialog = code("components/storefront/edit-profile-button.tsx")
    const api = code("app/api/creator-profile/route.ts")
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const missing: string[] = []

    if (!/\(settings\.showReviews \?\? true\)/.test(renderer))
      missing.push("the rating is not individually toggleable, or defaults to hidden")
    if (!/\(settings\.showFollowers \?\? true\)/.test(renderer))
      missing.push("followers are not individually toggleable, or default to hidden")

    for (const label of ["Rating and reviews", "Followers", "Sales count", "Social links"]) {
      if (!dialog.includes(label)) missing.push(`the profile dialog has no "${label}" switch`)
    }
    if (!/display: shown/.test(dialog)) missing.push("the switches are not sent when saving")

    if (!/creatorUpdate\.show_total_sales_badge = display\.showTotalSalesBadge/.test(api))
      missing.push("the sales switch writes only one of the two flags — it will appear not to work")
    if (!/\(headerSettings\?\.showTotalSalesBadge \?\? true\) && \(creator\.show_total_sales_badge \?\? true\)/.test(page))
      missing.push("the sales switch does not show the AND of both flags, so it lies about its own state")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the backfill fixes what is stale and leaves what was chosen",
  (() => {
    /**
     * Most of this week's creator-page work was rendering, and rendering needs
     * no migration. Three things are stored and predate a feature, so the page
     * cannot infer what the creator wanted: a config with no About section at
     * all (those pages end at the product grid, with no way to add one from
     * the page because the editor attaches to a section that is not there),
     * the legacy `type: "youtube"` media label, and the three social platforms
     * added later.
     *
     * WHAT IT DELIBERATELY DOES NOT TOUCH is the interesting half. The
     * headline stays "Featured Products" in the column even though the rail
     * renders "Featured", because the rail treats only the old shipped default
     * as unchosen AT RENDER TIME — so a creator who deliberately typed
     * "Featured Products" keeps it. Rewriting the column would take that
     * choice away permanently and leave no way to tell the two apart.
     */
    const sql = read("supabase/migrations/20260909_creator_page_backfill.sql").replace(/^\s*--.*$/gm, "")
    const missing: string[] = []

    if (!/'type', 'about'/.test(sql)) missing.push("configs with no About section are no longer given one")
    if (!/'\{sections\}'/.test(sql)) missing.push("the backfill does not write into the sections array")
    if (!/'"video"'/.test(sql)) missing.push("legacy youtube media items are not relabelled")
    for (const platform of ["facebook", "linkedin", "twitch"]) {
      if (!sql.includes(`'${platform}'`)) missing.push(`${platform} is not backfilled into socialLinks`)
    }
    // Both configs, or a creator's live page and their draft disagree.
    for (const column of ["draft_config", "published_config"]) {
      if (!new RegExp(`SET ${column} =`).test(sql)) missing.push(`${column} is not backfilled`)
    }

    /**
     * The distinction the first version of this guard missed: the new About
     * section's DEFAULTS legitimately contain an empty headline and a padding
     * value — that is what a default is. What must not happen is rewriting the
     * ones already stored, which is a jsonb_set at those paths.
     */
    if (/'\{settings,headline\}'/.test(sql))
      missing.push("the backfill rewrites a stored headline — that choice belongs to the creator, at render time")
    if (/'\{settings,spacing,padding/.test(sql))
      missing.push("the backfill rewrites the rail's padding — the renderer already ignores it")
    if (/DROP|DELETE FROM|TRUNCATE/i.test(sql)) missing.push("the backfill removes data")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

// ---------------------------------------------------------------------------
section("The product page does not ask one question at a time")
// ---------------------------------------------------------------------------

/**
 * Six queries — the variants, the digital files, the course, the other
 * products by this seller, the reviews, and who is looking — ran one after
 * another after the config batch, and not one of them needed anything the
 * others produced: every one is keyed on `product.id` or `product.creator_id`,
 * both known before the batch starts.
 *
 * The rule is positional rather than textual, because "is it started before
 * the batch and awaited after it" is exactly the property that makes the
 * page fast, and a phrase match would go on passing if somebody moved the
 * `await` back up beside the query.
 */
{
  const src = code("app/(marketing)/p/[slug]/page.tsx")
  /*
    INSIDE THE PAGE COMPONENT, not the first Promise.all in the file.
    generateMetadata gained one of its own — the creator and the shop config,
    which do not depend on each other — and it sits above every declaration
    below, so an unanchored search reported all six as started too late.
  */
  const component = src.indexOf("export default async function ProductPage")
  const batch = src.indexOf("] = await Promise.all([", component)

  check("the product page still batches its four configs", batch > 0)

  for (const name of [
    "userPromise",
    "variantsPromise",
    "moreProductsPromise",
    "reviewsPromise",
    "assetsPromise",
    "coursePromise",
  ]) {
    const started = src.indexOf(`const ${name}`, component)
    const awaited = src.indexOf(`await ${name}`, component)
    check(
      `${name} is started before the batch and awaited after it`,
      started > 0 && awaited > started && started < batch,
      `        started at ${started}, batch at ${batch}, awaited at ${awaited}`,
    )
  }

  /**
   * A Supabase query builder is a thenable that issues nothing until something
   * calls `then` on it, so `const p = supabase.from(...)` would be a rename
   * with no effect at all — the request would still be made by the `await`
   * further down, in series, and this whole section would pass while the page
   * stayed exactly as slow. `start()` existed to force that `then`.
   *
   * IT IS GONE, AND OVERLAPPING THE QUERIES WAS NOT THE ANSWER ANYWAY.
   * Measured on production afterwards, the variants query alone was still
   * between 139ms and 3302ms of a render that has under a second to spend:
   * running a slow query next to four fast ones leaves the page waiting for
   * the slow one. They are cached now, and each of these five names is bound
   * to a CALL — `cachedVariants(product.id)` — which is an async function
   * already running by the time the next line is read. So the property the
   * check below was defending is now structural, and what is worth guarding
   * is that none of them slid back onto the request's own client.
   */
  for (const [name, loader] of [
    ["variantsPromise", "cachedVariants"],
    ["moreProductsPromise", "cachedMoreFromCreator"],
    ["reviewsPromise", "cachedReviews"],
    ["assetsPromise", "cachedProductAssets"],
    ["coursePromise", "cachedCourseOutline"],
  ] as const) {
    check(
      `${name} comes from the shared cache, already running`,
      new RegExp(`${name} =[^\\n]*${loader}\\(`).test(src),
      `        expected ${name} to be bound to ${loader}(...)`,
    )
  }

  /**
   * And nothing was left behind on the per-request client. A `supabase.from`
   * between the top of the component and the config batch is a query that
   * runs per visitor, which is the thing this section exists to prevent.
   */
  {
    const before = src.slice(component, batch)
    const strays = (before.match(/supabase\s*\n?\s*\.from\(/g) || []).length
    check(
      "no per-visitor query is started before the batch",
      strays === 0,
      `        found ${strays}`,
    )
  }

  /**
   * The block that reads the user catches everything and leaves the page
   * logged-out. Started early, a rejection has to be handled where it is
   * created too, or it is an unhandled rejection before the `await` is reached.
   */
  check(
    "starting the user lookup early cannot become an unhandled rejection",
    /supabase\.auth\.getUser\(\)\.catch\(/.test(src),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}

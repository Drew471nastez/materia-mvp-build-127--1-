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
import { join } from "node:path"
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
    const src = code("app/app/settings/billing/page.tsx")
    const sequential = src.match(/await\s+stripe\./g)?.length ?? 0
    return /Promise\.allSettled\(/.test(src) && sequential === 0
  })(),
  "        app/app/settings/billing/page.tsx",
)

check(
  "the product page batches the lookups that only need the product",
  (() => {
    // creator, shop config, default product template and the product-specific
    // config all key off product.id / product.creator_id and read nothing from
    // each other. They were four round trips before any HTML.
    const src = code("app/(marketing)/p/[slug]/page.tsx")
    return (
      /Promise\.all\(\[/.test(src) &&
      /store_builder_configs/.test(src) &&
      /product_page_configs/.test(src)
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
      return !src.includes("skeleton-deferred")
    })
    if (offenders.length) console.log("        " + offenders.join("\n        "))
    return offenders.length === 0
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
    const src = code("components/platform/platform-header-client.tsx")
    return (
      /useState\(\(\) => readAuthSnapshot\(\) === null\)/.test(src) &&
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
    if (!/cookies\(\)/.test(layout) || !/storelib_wishlist_count/.test(layout))
      missing.push("marketing layout: not reading the cookie server-side")
    if (!/Number\.isInteger\(n\) && n >= 0/.test(layout))
      missing.push("marketing layout: client-written cookie not clamped")
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
        else if (/\.(ts|tsx)$/.test(entry) && /navigator\.vibrate/.test(read(rel))) offenders.push(rel)
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
    const analytics = code("app/app/analytics/analytics-client.tsx")
    return (dash.match(/hapticTap\(/g)?.length ?? 0) >= 2 &&
           (analytics.match(/hapticTap\(/g)?.length ?? 0) >= 2
  })(),
  "        dashboard-client.tsx + analytics-client.tsx",
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
      /NATIVE_HOME_ALLOWED\s*=\s*\["\/app", "\/library", "\/dashboard", "\/store-builder"\]/.test(bridge) &&
      // Protocol-relative "//host" leaves the app entirely, so a leading "/"
      // alone must not be accepted.
      /startsWith\("\/\/"\)/.test(bridge)
    const sanitisedOnWrite = /const destination = sanitizeNativeHome\(rawDestination\)/.test(bridge)
    const sanitisedOnRead = /value \? sanitizeNativeHome\(value\) : null/.test(bridge)
    const startGuards =
      /sanitizeNativeHome\(url\)/.test(start) &&
      /target === "\/native-start"/.test(start)
    const offlineGuards = /ALLOWED\s*=\s*\['\/app', '\/library', '\/dashboard', '\/store-builder'\]/.test(offline)

    const missing: string[] = []
    if (!sanitiserRejectsRoot) missing.push("lib/native-bridge.ts: sanitizeNativeHome allowlist")
    if (!sanitisedOnWrite) missing.push("lib/native-bridge.ts: cacheNativeHome does not sanitise")
    if (!sanitisedOnRead) missing.push("lib/native-bridge.ts: getCachedNativeHome does not sanitise")
    if (!startGuards) missing.push("app/native-start/page.tsx: safeRedirect unguarded")
    if (!offlineGuards) missing.push("out/index.html: offline fallback unguarded")
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
    const wrappers = src.match(/<span className="relative inline-flex">\s*<Heart/g)?.length ?? 0
    const badges = src.match(/bg-red-500/g)?.length ?? 0
    return wrappers === 2 && badges === 2
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
      /extractUsernameFromHost\(host\) === null && !isCustomDomain\(host\)/.test(layout) &&
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

    const barAt = dash.indexOf('bg-[#8b5cf6] text-white')
    const indicatorAt = dash.indexOf("<PullToRefreshIndicator")
    const slideAt = dash.indexOf("translateY(${contentTranslateY}px)")

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
     * NO phase may place the ring above its anchor — including the exit.
     *
     * The exit used to slide it to -(size + 8) while the opacity was still
     * fading, so at the END of a refresh it visibly rose over the purple bar.
     * Parking off-screen was meant to stop it peeking; opacity 0 already does
     * that, and the cost was an animation crossing the one element it had to
     * stay clear of.
     */
    // Both offsets the ring can take are clamped at 0, so no phase — drag,
    // refresh or exit — can place it above its anchor and over the bar.
    if (!/Math\.max\(\(pullDistance - size\) \/ 2, 0\)/.test(indicator))
      missing.push("indicator: the drag offset is not clamped to its anchor")
    if (/offScreen/.test(indicator))
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
     * The refreshing appearance is held for the length of the fade instead:
     * `spinning` covers the exit, the dash length follows `spinning` rather than
     * the phase, and the resting offset IS the refreshing offset, so the exit
     * involves no movement at all.
     */
    if (!/const spinning = phase === "refreshing" \|\| exiting/.test(indicator))
      missing.push("indicator: the spinner look is not held through the fade")
    if (!/const progressDash = spinning/.test(indicator))
      missing.push("indicator: the arc collapses when the refresh ends")
    if (!/\.\.\.\(spinning \? \{ animation: "ptr-spin/.test(indicator))
      missing.push("indicator: rotation snaps back to zero when the refresh ends")
    if (!/const restingY = Math\.max\(\(refreshHold - size\) \/ 2, 0\)/.test(indicator))
      missing.push("indicator: the exit does not rest where the refresh left it")
    // The ring must centre in the SAME gap the page holds open.
    if (!/refreshHold/.test(indicator) || !/refreshHold=\{REFRESH_HOLD\}/.test(dash))
      missing.push("dashboard/indicator: refresh gap not shared, positions can drift")
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the creator storefront's subscribe bar sticks on scroll up",
  (() => {
    /**
     * THE BUG THIS EXISTS FOR, WHICH TOOK ME TWO GOES TO FIND.
     *
     * Sticky-on-scroll-up already existed and I "enabled" it by flipping the
     * shared default in lib/store-builder/defaults.ts. Nothing changed, because
     * the storefront page NEVER READS that default: it builds its own settings
     * object with `savedSettings.enableStickyBar ?? false` hardcoded, and a
     * second hardcoded false for creators with no config at all. Two fallbacks
     * in a page, quietly overriding the file whose whole job is to hold them.
     *
     * So this asserts the page, not the defaults file. A creator who has
     * explicitly switched sticky off still has `false` stored and keeps it —
     * `??` only decides for the ones who never touched the toggle.
     */
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const bar = code("components/store-builder/subscribe-bar.tsx")

    const missing: string[] = []
    /**
     * `?? true` was not enough and this is the third attempt. The builder writes
     * the toggle out whether or not anyone touched it, so nearly every saved
     * config carries an explicit `false` — and `false ?? true` is `false`. The
     * storefront decides outright now, so what is asserted is that no `false`
     * survives anywhere in this page's subscribe settings.
     */
    if (/enableStickyBar:\s*(savedSettings\.enableStickyBar \?\? )?false/.test(page))
      missing.push("storefront: sticky can be false again — a stored false will win")
    if (/enableStickyOnScrollUp:\s*(savedSettings\.enableStickyOnScrollUp \?\? )?false/.test(page))
      missing.push("storefront: scroll-up reveal can be false again")
    if ((page.match(/enableStickyBar:\s*true/g)?.length ?? 0) < 2)
      missing.push("storefront: both subscribe-settings branches must pin the bar")
    // And the bar must still actually do something with it.
    if (!/fixed left-0 right-0/.test(bar))
      missing.push("subscribe bar: sticky mode no longer pins the bar")
    if (!/!isVisible && settings\.enableStickyOnScrollUp && "-translate-y-full"/.test(bar))
      missing.push("subscribe bar: no longer hides on scroll down")
    // Smoothed, not per-event: this used to setState on every scroll frame.
    if (!/requestAnimationFrame\(evaluate\)/.test(bar))
      missing.push("subscribe bar: scroll handler is no longer frame-throttled")
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}

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
    // Smoothed, not per-event: this used to setState on every scroll frame.
    if (!/requestAnimationFrame\(evaluate\)/.test(bar))
      missing.push("subscribe bar: scroll handler is no longer frame-throttled")
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

    // The default delay, read out of the source rather than pattern-matched.
    const delay = Number(avatar.match(/delayMs = (\d+)/)?.[1] ?? 0)
    if (!(delay > 0))
      missing.push(`AvatarFallback's default delayMs is ${delay || "unset"} — initials paint before every image`)

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
    if (!/supabase\.auth\.getUser\(\),/.test(page))
      missing.push("the viewer lookup left the batch — that is a third round trip before first byte")

    // The route must re-check, and must not reach for the admin client.
    if (!/if \(!user\)[\s\S]{0,120}401/.test(api))
      missing.push("the save route no longer rejects an unauthenticated caller")
    if (/createAdminClient/.test(api))
      missing.push("the save route uses the admin client — it would bypass the RLS that scopes writes to the owner")
    if (!/\.eq\("id", user\.id\)/.test(api))
      missing.push("the profile update is not scoped to the signed-in user")

    // Run the real cleaner.
    const src = api.match(/function cleanUrl[\s\S]*?\n\}/)?.[0]
    if (!src) {
      missing.push("cleanUrl is gone — social URLs reach the page unchecked")
    } else {
      // The constants it closes over come from the same file, so they are
      // lifted with it rather than restated here — a copy would drift.
      const consts = api.match(/^const MAX_URL = \d+$/m)?.[0] ?? ""
      if (!consts) missing.push("MAX_URL is gone from the save route — social URLs have no length bound")
      // eslint-disable-next-line no-new-func
      const cleanUrl = new Function(
        `${consts}; ${src.replace(/: unknown/g, "").replace(/: string \| null/g, "")}; return cleanUrl`,
      )() as (v: unknown) => string | null
      if (cleanUrl("javascript:alert(1)") !== null) missing.push("cleanUrl lets a javascript: URL through")
      // Not just the payload that happens to be an invalid port: one that
      // parses cleanly as a URL is the case that would actually reach an href.
      if (cleanUrl("javascript:void(0)") !== null) missing.push("cleanUrl lets a parseable javascript: URL through")
      if (cleanUrl("data:text/html,<script>") !== null) missing.push("cleanUrl lets a data: URL through")
      if (cleanUrl("vbscript:msgbox") !== null) missing.push("cleanUrl lets a vbscript: URL through")
      if (cleanUrl("   ") !== null) missing.push("cleanUrl turns blank input into a link")
      if (cleanUrl("notaurl") !== null) missing.push("cleanUrl accepts something with no host")
      if (cleanUrl("instagram.com/me") !== "https://instagram.com/me")
        missing.push("cleanUrl no longer accepts a bare host and adds https")
      if (cleanUrl("https://x.com/me") !== "https://x.com/me") missing.push("cleanUrl mangles a valid https URL")
    }

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
      if (!/<StorefrontProductCard/.test(src)) missing.push(`${name} no longer renders the shared card`)
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
  "the products tab can be filtered",
  (() => {
    /**
     * The tab shipped with no filtering at all — every product, no way to
     * narrow it. Chips rather than the rail that used to run down the left of
     * Featured: they cost no horizontal room, read the same on a phone and a
     * desktop, and sit above the thing they filter instead of beside it.
     *
     * Built from the products actually on the page, so a creator never sees a
     * filter that leads nowhere, and hidden below two categories where the only
     * choice is "everything". Verified in a browser: All 3 / Productivity 2 /
     * Audio & Music 1, and clicking Productivity left two cards.
     */
    const grid = code("components/storefront/all-products-grid.tsx")
    const missing: string[] = []
    if (!/const \[active, setActive\]/.test(grid)) missing.push("the products tab has no filter state")
    if (!/categories\.length > 1/.test(grid))
      missing.push("the chips render for a single category — a filter with one option is not a choice")
    if (!/products\.filter\(/.test(grid)) missing.push("selecting a chip no longer filters anything")
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
  "the featured section has no left-hand category rail",
  (() => {
    /**
     * It took 192px off every desktop storefront to list categories most
     * creators have two of, and pushed the products — the thing the page
     * exists for — into a narrower column and further from the eye.
     *
     * The MOBILE pill row is a different thing and stays: it costs no
     * horizontal room and on a phone it is the only way to narrow a long list.
     * So this asserts the desktop rail specifically, not every mention of a
     * category filter.
     */
    const src = code("components/store-builder/unified-section-renderer.tsx")
    const featured = src.slice(src.indexOf("function UnifiedFeaturedProductsSection"))
    const body = featured.slice(0, featured.indexOf("function ", 40))
    const missing: string[] = []
    if (/hidden md:block w-48/.test(body)) missing.push("the left category rail is back")
    if (/md:flex-row md:gap-8/.test(body)) missing.push("the two-column layout the rail forced is back")
    if (!/uiIsMobile && !settings\.hideCategoryFilter/.test(body))
      missing.push("the mobile pill filter went too — that one was worth keeping")
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
    const icons = code("components/store-builder/social-media-icons.tsx")
    const header = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    if (!/stroke: "currentColor"/.test(icons)) missing.push("the marks are not stroked in currentColor any more")
    if (/fill="#|fill={color}/.test(icons)) missing.push("a mark is painted with a fixed fill again")
    if (!/iconColor = "currentColor"/.test(icons))
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

    if (!/storefrontPageBackground\(pageBackgroundColor\)/.test(page))
      missing.push("the page background no longer goes through the surface rule")
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

    // The trigger must not navigate the card it sits on.
    if (!/e\.preventDefault\(\)/.test(menu) || !/e\.stopPropagation\(\)/.test(menu))
      missing.push("opening the menu navigates the card underneath it")

    if (!menu.includes("/app/products/${productId}")) missing.push("Edit product no longer opens that product")
    if (!existsSync(join(root, "app/app/products/[id]/page.tsx")))
      missing.push("/app/products/[id] has no route behind it — Edit product 404s")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "both tabs sort with the same control",
  (() => {
    /**
     * The Products tab had a native <select> reading "Most recent" while the
     * Featured rail on Home had a dropdown reading "Sort: Most Recent" — two
     * controls, two vocabularies, same idea, one page. That is what makes a
     * page feel assembled rather than designed.
     *
     * Same labels in the same order, asserted against BOTH files rather than
     * against a copy written here.
     */
    const grid = code("components/storefront/all-products-grid.tsx")
    const featured = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    for (const label of ["Most Recent", "Oldest", "Price: Low → High", "Price: High → Low", "Most Popular"]) {
      if (!grid.includes(label)) missing.push(`the products tab lost the "${label}" option`)
      if (!featured.includes(label)) missing.push(`the featured rail lost the "${label}" option`)
    }
    if (!/Sort: \{SORT_LABELS\[sort\]\}/.test(grid))
      missing.push("the products tab's trigger no longer reads like the one on Home")
    if (/<select/.test(grid)) missing.push("the products tab is back to a native select")

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

    if (!/<OwnerMenu \/>/.test(page)) missing.push("the owner menu is not on the page")
    // It must live inside buildOwnerActions, which is the only owner-gated slot.
    const slot = page.match(/const buildOwnerActions[\s\S]*?\n  \}/)?.[0] ?? ""
    if (!/OwnerMenu/.test(slot))
      missing.push("the owner menu is outside the owner-only slot — every visitor would see it")

    for (const href of ["/app/products", "/store-builder", "/app/analytics", "/app/settings"]) {
      if (!menu.includes(`"${href}"`)) {
        missing.push(`the menu no longer links to ${href}`)
        continue
      }
      const route = href === "/store-builder" ? "app/store-builder/page.tsx" : `app${href}/page.tsx`
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

    if (!/border-b border-border" role="tablist"/.test(tabs)) missing.push("the tabs no longer sit on a rule")
    if (!/border-foreground font-medium text-foreground/.test(tabs))
      missing.push("the active tab has no underline")
    if (!/rounded-full bg-black/.test(tabs) === false) missing.push("the pill track came back")
    if (!/pt-8 \[&>\*:first-child\]:!pt-0 \[&>\*:first-child>\*:first-child\]:!pt-0/.test(tabs))
      missing.push("panels bring their own top space again — the content jumps between tabs")
    if (!/animate-\[storefront-tab-in/.test(tabs)) missing.push("switching tabs is instant again")
    if (!/motion-reduce:animate-none/.test(tabs)) missing.push("the tab animation ignores reduced-motion")
    if (!/@keyframes storefront-tab-in/.test(css)) missing.push("the tab-switch keyframes are gone")

    for (const label of ['label: "Home"', 'label: "Products"', 'label: "Communities"', 'label: "Reviews"', 'label: "About"']) {
      if (!page.includes(label)) missing.push(`the ${label} tab is gone`)
    }
    if (!/creatorReviewCount > 0/.test(page)) missing.push("the Reviews tab shows even with no reviews")
    if (!/if \(about\) tabs\.push/.test(page)) missing.push("the About tab shows even with no About section")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "Home and Products are the same width, and nothing overlaps the avatar on mobile",
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
     * And the owner's controls were pinned bottom-right of the cover, where on
     * a phone — 128px of cover against a 137px avatar straddling the bottom
     * centre — they landed on top of the avatar. Verified at 390px: no overlap.
     */
    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    const missing: string[] = []

    if (/const horizontalPadding = \d/.test(renderer))
      missing.push("the featured rail sets its own horizontal padding again — Home and Products will differ")

    const slot = renderer.match(/\{ownerActions && \([\s\S]{0,240}?\)\}/)?.[0] ?? ""
    if (!slot) missing.push("the owner-actions slot is gone from the cover")
    else if (!/isMobile \? "top-\d/.test(slot))
      missing.push("the owner's controls are back at the bottom on mobile, where the avatar is")

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

    if (!/if \(value && replaceOnly\)/.test(upload))
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
    const dialog = code("components/storefront/edit-profile-button.tsx")
    const upload = code("components/app/image-upload.tsx")
    const missing: string[] = []

    if (!/flex max-h-\[85vh\] flex-col gap-0 overflow-hidden p-0/.test(dialog))
      missing.push("the dialog scrolls as one piece again — Save goes below the fold")
    if (!/min-h-0 flex-1 space-y-5 overflow-y-auto/.test(dialog))
      missing.push("the dialog body is not the part that scrolls")
    if (!/DialogFooter className="shrink-0/.test(dialog)) missing.push("the footer can be pushed off screen again")

    // The banner may be removed; the avatar may not.
    const banner = dialog.slice(dialog.indexOf('bucket="covers"'), dialog.indexOf('bucket="avatars"'))
    const avatar = dialog.slice(dialog.indexOf('bucket="avatars"'))
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
    const replaceBranch = upload.slice(
      upload.indexOf("if (value && replaceOnly)"),
      upload.indexOf("if (value) {", upload.indexOf("if (value && replaceOnly)") + 10),
    )
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}

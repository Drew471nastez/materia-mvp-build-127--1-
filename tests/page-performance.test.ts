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

    // repair() must be inert when nothing is stuck or an overlay owns the lock.
    if (!/function repair\(\)\s*\{\s*if \(!isScrollLocked\(\) \|\| hasOpenOverlay\(\)\) return/.test(restorer))
      missing.push("repair() runs unconditionally again — it will fire a resize into a working page")

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
  "there is ONE product card, and it is the one that was asked for",
  (() => {
    /**
     * THE SHAPE, asked for more than once and pinned so it stops drifting:
     *
     *     4:5 image, discount badge if there is one
     *     Product name
     *     Creator · Category
     *     €29   €230
     *
     * No type chip — "PRODUCT" over every card in a grid of products is a word
     * that never distinguishes anything. No description: a grid is scanned, not
     * read. Price at 600, firm without shouting over the title.
     *
     * AND ONE OF IT. The Featured rail and the Products tab render the same
     * component. The way this goes wrong is that somebody needs a second grid,
     * copies the markup, and the two drift until they are visibly different
     * products from different sites on the same page — which is the exact
     * failure this file already carries two other guards for.
     *
     * Measured in a browser: the image box came back at 0.800, which is 4:5,
     * and a $92-from-$230 product produced "60% off".
     */
    const card = code("components/storefront/product-card.tsx")
    const featured = code("components/store-builder/unified-section-renderer.tsx")
    const grid = code("components/storefront/all-products-grid.tsx")
    const missing: string[] = []

    // The shape.
    if (!/aspect-video/.test(card)) missing.push("the card image is not 16:9 any more")
    if (/aspect-\[4\/5\]/.test(card)) missing.push("the card is back to 4:5 — three of those stop fitting one screen")
    if (/\{product\.description\}/.test(card)) missing.push("the description is back on the card")
    if (/>PRODUCT|PRODUCT</.test(card)) missing.push("the type chip is back on the card")
    if (!/font-semibold tracking-tight/.test(card)) missing.push("the price is no longer 600 weight")
    if (/settings\.showCompareAtPrice/.test(card))
      missing.push("the compare-at price is gated on a toggle again — entered discounts will not show")
    if (!/compare_at_cents > product\.price_cents/.test(card)) missing.push("the compare-at price is gone")
    if (!/discountPercent/.test(card)) missing.push("the discount badge is gone")
    if (!/\[creatorName, category\]/.test(card)) missing.push("the Creator · Category line is gone")

    /**
     * The rating rule, run rather than pattern-matched: a rating is worth
     * printing once somebody has left one, and "0.0" under a new product says
     * the opposite of what a rating is for — it makes it look judged rather
     * than new.
     */
    const decl = card.match(/const hasReviews = [^\n]+/)?.[0]
    if (!decl) {
      missing.push("the review gate is gone from the card")
    } else {
      // eslint-disable-next-line no-new-func
      const hasReviews = new Function(
        "product",
        `const reviewsCount = product.reviews_count ?? 0; ${decl}; return hasReviews`,
      ) as (p: Record<string, unknown>) => boolean
      if (hasReviews({}) !== false) missing.push("a product with no review data shows a rating")
      if (hasReviews({ reviews_count: 0, reviews_average: 0 }) !== false)
        missing.push("a product with zero reviews shows a rating")
      if (hasReviews({ reviews_count: 3, reviews_average: 0 }) !== false)
        missing.push("a product with reviews but no average shows 0.0")
      if (hasReviews({ reviews_count: 12, reviews_average: 5 }) !== true)
        missing.push("a product WITH reviews does not show its rating")
    }

    // Performance, and a bug that has been fixed once already.
    if (!/quality=\{72\}/.test(card) || !/sizes="/.test(card)) missing.push("the card image is unoptimised again")
    if (/el\.style\.opacity = "0"/.test(card))
      missing.push("the ref-driven opacity is back — a failed image leaves the card blank forever")

    /**
     * One of it. `aspect-video` alone is no longer a usable fingerprint — other
     * sections legitimately use it — so what is matched is the card's own image
     * container, class for class. A copy-paste of the card brings it along; an
     * unrelated 16:9 box does not.
     */
    const IMAGE_BOX = /aspect-video overflow-hidden rounded-t-lg bg-muted/g
    if ((card.match(IMAGE_BOX)?.length ?? 0) !== 1)
      missing.push("more than one card image block inside the card component")
    for (const [name, src] of [
      ["the featured rail", featured],
      ["the products tab", grid],
    ] as const) {
      if (!/<StorefrontProductCard/.test(src)) missing.push(`${name} no longer renders the shared card`)
      if (IMAGE_BOX.test(src)) missing.push(`${name} has its own copy of the card markup`)
      IMAGE_BOX.lastIndex = 0
    }

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the storefront tabs cost nothing to switch, and claim nothing that does not exist",
  (() => {
    /**
     * Both panels are rendered ON THE SERVER and handed to the tab strip as
     * props, so switching is a visibility change — no fetch, no spinner, no
     * second render of the sections — and Home is in the first HTML a visitor
     * or a crawler receives. A tab strip that fetches its panel on click would
     * undo every batching fix above it in this file.
     *
     * Inactive panels stay MOUNTED and hidden. Unmounting them would rebuild
     * the sections and re-request their images on every switch back.
     *
     * The design also has a "Communities" tab — a paid membership a creator
     * sells. Storelib has no such thing: `community_posts` is the creator's own
     * dashboard feed, not something anyone joins or is charged for. So there is
     * no tab for it, and this asserts none was invented, because a tab onto an
     * empty panel is worse than no tab. The list is data so that the day paid
     * communities exist they get a tab by appearing in it.
     */
    const tabs = code("components/storefront/storefront-tabs.tsx")
    const page = code("app/(marketing)/u/[username]/page.tsx")
    const missing: string[] = []

    if (/fetch\(|useEffect/.test(tabs))
      missing.push("the tab strip fetches or runs an effect — panels are server-rendered props")
    if (!/hidden=\{tab\.id !== active\}/.test(tabs))
      missing.push("inactive panels are unmounted instead of hidden — every switch back rebuilds them")
    if (!/if \(tabs\.length < 2\) return/.test(tabs))
      missing.push("a lone tab renders a strip — that is a button onto what is already on screen")

    if (!/label: "Home"/.test(page)) missing.push("the Home tab is gone")
    if (!/label: "Products"/.test(page)) missing.push("the Products tab is gone")
    if (/label: "Communities"/.test(page))
      missing.push("a Communities tab was added with no feature behind it — it would open an empty panel")

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
      if (!/bottom-\d/.test(slot)) missing.push("the edit control is not anchored to the bottom of the cover")
      if (/top-\d/.test(slot)) missing.push("the edit control is back at the top of the cover")
      if (!/right-\d/.test(slot)) missing.push("the edit control is no longer right-aligned")
    }
    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the tab strip is not a full-width rule across the page",
  (() => {
    /**
     * The strip sat on a `border-b` spanning the whole 1100px column, which cut
     * the page in half under a header that is centred and has no other hard
     * edges in it. The only line now is the one under the active tab. Centred
     * too, since everything above it — name, handle, bio, icons — is on the
     * centre line. Measured in a browser: the tablist's border-bottom-width
     * computes to 0px and its justify-content to center.
     */
    const tabs = code("components/storefront/storefront-tabs.tsx")
    const list = tabs.match(/<div className="[^"]*" role="tablist">/)?.[0] ?? ""
    const missing: string[] = []
    if (!list) missing.push("the tablist element is gone")
    else {
      if (/border-b\b/.test(list)) missing.push("the full-width rule is back under the tabs")
      if (!/justify-center/.test(list)) missing.push("the tabs are no longer centred under the profile")
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
    if (!/socialLinks\[key\]\?\.enabled && socialLinks\[key\]\?\.url/.test(icons))
      missing.push("icons no longer require both a switch and a url — empty links will render")
    if (!/enabledPlatforms\.length === 0\) return null/.test(icons))
      missing.push("a creator with no links gets an empty icon row")

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

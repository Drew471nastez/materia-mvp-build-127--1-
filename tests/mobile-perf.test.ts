/**
 * ===========================================================================
 *  FEWER REQUESTS AND LESS WORK ON A PHONE, WITH NOTHING ON SCREEN CHANGED
 * ===========================================================================
 * Measured in headless Chromium at 390x844, DPR 3, 4x CPU throttling, against
 * a production build (see the commit for the numbers). Each check pins one
 * piece of waste that was removed, so it does not come back:
 *
 *   the front page's globe (globe.gl and three.js, 500 KB over the wire) is
 *   loaded when it is about to scroll into view, not as the page hydrates;
 *
 *   the root layout's read ahead follows the device's plan, never reads the
 *   page already on screen, and /login no longer reads /app (a signed out
 *   visitor only ever got the redirect back to /login);
 *
 *   Home's live visitors and Analytics' minute refresh ask nothing while the
 *   tab or the app is in the background, and ask at once on the way back;
 *
 *   Payouts reads its chart once when visibilitychange and focus arrive
 *   together on a return;
 *
 *   the native bridge listeners (appUrlOpen, appStateChange) are taken off
 *   even when the component goes before the bridge has answered.
 *
 * Run with:  pnpm test:push
 */
import { prefetchPlan, planFor, resetPrefetchPolicy } from "@/lib/nav/prefetch-policy"
import { readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}

console.log("\nThe front page's globe")
{
  const src = readCode("components/marketing/globe-widget.tsx")
  const importAt = src.indexOf('import("globe.gl")')
  const buildAt = src.indexOf("const build = async () =>")
  check("globe.gl is imported inside build(), not straight from the effect", buildAt > 0 && importAt > buildAt)
  check("build() waits for an IntersectionObserver with a lookahead margin", /new IntersectionObserver\([\s\S]*?approach\.disconnect\(\)\s*void build\(\)[\s\S]*?rootMargin: `\$\{GLOBE_AHEAD_PX\}px/.test(src))
  check("the lookahead is under the globe's distance below a phone's first screen (1903px top, 844px screen)", (() => {
    const m = /export const GLOBE_AHEAD_PX = (\d+)/.exec(src)
    const px = m ? Number(m[1]) : NaN
    return px >= 400 && px < 1903 - 844
  })())
  check("a browser without IntersectionObserver still gets the globe", /typeof IntersectionObserver !== "function"\)\s*\{\s*void build\(\)/.test(src))
  check("the approach observer is taken off on unmount", /stopApproach\(\)/.test(src) && /stopApproach = \(\) => approach\.disconnect\(\)/.test(src))
  check("the widget itself is still a client-only dynamic import", /dynamic\(\(\) => import\("\.\/globe-widget"\), \{\s*ssr: false/.test(readCode("components/marketing/bento-grid.tsx")))
}

console.log("\nThe root layout's read ahead")
{
  const src = readCode("components/shared/prefetch-links.tsx")
  check("it asks the device plan (lib/nav/prefetch-policy)", /import \{ prefetchPlan \} from "@\/lib\/nav\/prefetch-policy"/.test(src) && /\.slice\(0, prefetchPlan\(\)\.idleBudget\)/.test(src))
  check("it never reads the page on screen", /\.filter\(\(route\) => route !== pathname\)/.test(src))
  check("/login no longer reads /app", /"\/login": \["\/signup"\]/.test(src))
  check("Settings still reads Billing ahead (tests/page-performance)", /"\/app\/settings":\s*\["\/app\/settings\/billing"\]/.test(src))
  check("Save-Data and 2g read nothing ahead", planFor("off").idleBudget === 0)
  check("a slow phone reads only the likeliest", planFor("lean").idleBudget === 1)
  resetPrefetchPolicy()
  check("outside a browser the plan is the normal one", prefetchPlan().tier === "normal" && prefetchPlan().idleBudget >= 3)
}

console.log("\nPolling that waits for the page to be seen")
{
  const dash = readCode("components/app/dashboard-client.tsx")
  check("Home's live visitors: nothing while hidden", /const read = \(\) => \{\s*if \(document\.visibilityState === "hidden"\) return/.test(dash))
  check("  every 30 seconds while shown, as before", /const LIVE_VISITORS_EVERY_MS = 30_000/.test(dash) && /setInterval\(read, LIVE_VISITORS_EVERY_MS\)/.test(dash))
  check("  at once on the way back, and the listener is taken off", /addEventListener\("visibilitychange", read\)/.test(dash) && /removeEventListener\("visibilitychange", read\)/.test(dash))
  check("  no bare interval left on fetchLiveVisitors", !/setInterval\(fetchLiveVisitors/.test(dash))

  const analytics = readCode("app/(storelib)/app/analytics/analytics-client.tsx")
  check("Analytics' minute refresh: nothing while hidden", /const again = \(\) => \{\s*if \(document\.visibilityState === "hidden"\) return/.test(analytics))
  check("  every minute while shown, at once on the way back", /setInterval\(again, 60_000\)/.test(analytics) && /addEventListener\("visibilitychange", again\)/.test(analytics) && /removeEventListener\("visibilitychange", again\)/.test(analytics))
  check("  no bare minute interval left", !/setInterval\(\(\) => setTick\(\(n\) => n \+ 1\), 60_000\)/.test(analytics))

  const payouts = readCode("app/(storelib)/app/payouts/payouts-client.tsx")
  check("Payouts: one chart read for a return's visibilitychange and focus together", /let lastRead = 0;\s*const tick = \(\) => \{\s*if \(document\.visibilityState !== "visible"\) return;\s*const now = Date\.now\(\);\s*if \(now - lastRead < 10000\) return;/.test(payouts))
  check("  the cadence the owner set is unchanged (tests/polling-costs)", /setInterval\(tick, 60000\)/.test(payouts) && /setInterval\(tick, 120000\)/.test(payouts))
}

console.log("\nNative bridge listeners")
{
  const opener = readCode("components/platform/app-link-opener.tsx")
  check("appUrlOpen is taken off when the opener went before the bridge answered", /const added = await App\.addListener\("appUrlOpen"[\s\S]*?if \(gone\) return void added\.remove\(\)/.test(opener))
  const oauth = readCode("app/NativeOAuthBridge.tsx")
  check("appStateChange likewise", /const handle = await App\.addListener\("appStateChange"[\s\S]*?if \(gone\) return void handle\.remove\(\)/.test(oauth))
  check("  and the cleanup marks it gone", /return \(\) => \{\s*gone = true\s*removeHandle\?\.\(\)/.test(oauth))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}

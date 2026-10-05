/**
 * Round 10, the app and its navigation: the start, the product page's bars,
 * the header's icons, the receipt's frame, the navigator and the library, the
 * tab bar, the prefetch policy, pull to refresh and the settings back.
 *
 * The pure parts are run (the prefetch tiers, the tab scroll memory, where a
 * start lands, which pages carry the tab bar); the wiring is read from the
 * source, as the rest of the suite does. The motion and the geometry are
 * measured in a browser by scripts/check-app-round10.mjs.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

/* A browser's storage and window for the modules that keep things in them. */
const store = new Map<string, string>()
;(globalThis as any).sessionStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
}

import { planFor, prefetchHref, resetPrefetchPolicy, tierFor } from "../lib/nav/prefetch-policy"
import { noteTabScroll, prepareTabArrival, tabScrollFor } from "../lib/navigation/tab-scroll"
import { landsAsDocument } from "../lib/native-start-landing"
import { buyerTabFor, buyerTabsBelongOn } from "../lib/nav/buyer-tabs"
import { needsDocumentLoad } from "../lib/native-links"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

console.log("\n8. One prefetch policy, from the device and the network")
check("Save-Data reads nothing ahead", tierFor({ saveData: true, effectiveType: "4g", hardwareConcurrency: 8 }) === "off")
check("2g and slow-2g read nothing ahead", tierFor({ effectiveType: "2g" }) === "off" && tierFor({ effectiveType: "slow-2g" }) === "off")
check("3g is lean, whatever the phone", tierFor({ effectiveType: "3g", hardwareConcurrency: 8, deviceMemory: 8 }) === "lean")
check("a weak device is lean, whatever the network", tierFor({ effectiveType: "4g", deviceMemory: 2, hardwareConcurrency: 8 }) === "lean" && tierFor({ effectiveType: "4g", hardwareConcurrency: 2 }) === "lean")
check("a strong phone on 4g is rich", tierFor({ effectiveType: "4g", deviceMemory: 8, hardwareConcurrency: 8 }) === "rich")
check("an iPhone (Safari says only its cores) is rich", tierFor({ hardwareConcurrency: 6 }) === "rich")
check("a browser that says nothing is normal, never rich", tierFor({}) === "normal")
check("a middling phone on 4g is normal", tierFor({ effectiveType: "4g", deviceMemory: 4, hardwareConcurrency: 4 }) === "normal")
check("the plans step down: rich reads more and sooner than normal, lean only one frame, off nothing",
  planFor("rich").idleBudget > planFor("normal").idleBudget && planFor("rich").idleDelayMs < planFor("normal").idleDelayMs &&
  planFor("lean").idleBudget === 1 && !planFor("lean").idleFull && !planFor("lean").onHover && planFor("off").idleBudget === 0)

{
  /* A router that records, in a "browser" with no window: every intent is judged, a page is read once. */
  resetPrefetchPolicy()
  const asked: { href: string; kind?: string }[] = []
  const router = { prefetch: (href: string, o?: { kind?: string }) => void asked.push({ href, kind: o?.kind }) }
  prefetchHref(router as never, "/explore", "idle")
  prefetchHref(router as never, "/explore", "idle")
  prefetchHref(router as never, "/account", "press")
  prefetchHref(router as never, "https://elsewhere.example/x", "press")
  prefetchHref(router as never, "#top", "press")
  check("a page is read once within the router's keep, a press reads it whole, another site never", asked.length === 2 && asked[0].href === "/explore" && asked[1].href === "/account" && asked[1].kind === "full", asked)
}
const policy = code("lib/nav/prefetch-policy.ts")
check("it reads navigator.connection (effectiveType, saveData), deviceMemory and hardwareConcurrency, and listens for a change of network",
  /effectiveType: c\?\.effectiveType/.test(policy) && /saveData: c\?\.saveData === true/.test(policy) && /deviceMemory/.test(policy) && /hardwareConcurrency: navigator\.hardwareConcurrency/.test(policy) && /addEventListener\?\.\("change"/.test(policy))
check("one read per idle slice, at most the plan's budget", /hrefs\.slice\(0, plan\.idleBudget\)/.test(policy) && /requestIdleCallback\(step/.test(policy))
const tabBar = code("components/nav/buyer-tab-bar.tsx")
check("the tab bar reads its tabs through it, on idle and on the press", /return prefetchOnIdle\(router, hrefs\)/.test(tabBar) && /prefetchHref\(router, hrefOf\(index\), "press"\)/.test(tabBar) && !/router\.prefetch\(href\)/.test(tabBar))
check("the navigator reads its recent rows as it opens", /prefetchHref\(router, r\.href, "hover"\)/.test(code("components/nav/place-navigator.tsx")))
check("and /app reads Explore while idle", /warmStorelibPages\(router\)/.test(code("components/app/sidebar.tsx")))

console.log("\n7. Each tab keeps its own place")
store.clear()
noteTabScroll("/account/library", 840)
noteTabScroll("/explore?q=x", 1200)
check("the page left is noted by its address", tabScrollFor("/account/library") === 840 && tabScrollFor("/explore") === 1200)
check("Explore is told to put itself back (its own keys), not moved from outside", prepareTabArrival("/explore") === null && store.get("explore-scroll-restore-pending") === "1" && store.get("explore-scroll-position") === "1200")
check("any other tab is put back here, a tab never seen opens at the top", prepareTabArrival("/account/library") === 840 && prepareTabArrival("/account") === 0)
check("the press does not scroll; the arrival puts it back before the paint",
  /router\.push\(href, \{ scroll: false \}\)/.test(tabBar) && /noteTabScroll\(pathname\)/.test(tabBar) && /useLayoutEffect\(\(\) => \{\s*const a = arrival\.current/.test(tabBar) && /return restoreTabScroll\(a\.y\)/.test(tabBar))

console.log("\n1. The app's start")
check("a start lands in the same document: a client navigation, not location.replace", /landInPlace\(target, router\)/.test(code("app/native-start/page.tsx")) && !/window\.location\.replace\(target\)/.test(code("app/native-start/page.tsx")))
check("only route handlers and odd addresses load a document", landsAsDocument("/auth/sync-session?x") && landsAsDocument("//evil.example") && !landsAsDocument("/explore") && !landsAsDocument("/app") && !landsAsDocument("/community/x"))
check("and a stall loads it as a document after all", /window\.location\.pathname === "\/native-start"\) window\.location\.replace\(target\)/.test(code("lib/native-start-landing.ts")))
check("a later visit to the gate in the same document is not a start", /let startUsed = false/.test(code("app/native-start/page.tsx")))
check("the gate's spinner only shows when a start is slow", /ns-show 160ms ease-out 700ms both/.test(read("app/native-start/page.tsx")))
check("the proxy asks Supabase nothing for the gate, and still sets the app's frame policy on it",
  /request\.nextUrl\.pathname === "\/native-start" \? \{ user: null, state: "indeterminate", reason: "start gate" \} : await readCurrentUser\(supabase\)/.test(code("proxy.ts")) && /"Content-Security-Policy"/.test(code("proxy.ts")))

console.log("\n3 and 4. A product in the app: one header, one back")
const wrapper = code("components/store-builder/discover-sticky-wrapper.tsx")
check("the product's own dark bar is hidden in the app from the first paint, kept on the web", /data-product-top-bar=""/.test(wrapper) && /\[html\.capacitor_&\]:hidden/.test(wrapper))
check("and in the app the buy bar does not wait on a top bar that is not there", /setProductTopBarRevealed\(isNativeApp\(\) \? false : visible\)/.test(wrapper))
const crumb = code("components/product/discover-back-breadcrumb.tsx")
check("the one back is a 44px target with padding, pulled back so the words stay put", /min-h-\[44px\]/.test(crumb) && /-ml-3/.test(crumb) && /pl-3/.test(crumb) && /before:-inset-y-1\.5/.test(crumb))
check("it answers on the frame the finger lands and acts on the first tap's lift", /usePressFeedback/.test(crumb) && /useFirstTap/.test(crumb) && /data-\[pressed\]:bg-/.test(crumb) && /goBackOr\(href/.test(crumb))
const header = code("components/platform/platform-header-client.tsx")
check("the header has no library and no heart in the app (by the capacitor class, so the first frame is right)",
  /const appHidden = "\[html\.capacitor_&\]:hidden"/.test(header) && (header.match(/data-header-wishlist=""/g) ?? []).length === 2 && (header.match(/data-header-library=""/g) ?? []).length === 2 && (header.match(/chrome\.iconBtn, appHidden\)/g) ?? []).length === 4)
check("and no heart over the library on the web", /const showWishlistIcon = !isExploreSurface && !isLibraryPages/.test(header) && /pathname\.startsWith\("\/account\/library\/"\)/.test(header))

console.log("\n5. A receipt has Storelib around it")
const receiptLayout = code("app/receipt/layout.tsx")
check("the header and the tab bar, neither printed", /<ConditionalHeader/.test(receiptLayout) && /<BuyerTabBar \/>/.test(receiptLayout) && (receiptLayout.match(/print:hidden/g) ?? []).length === 2)
check("the header draws there", /p\.startsWith\("\/receipt\/"\)/.test(code("components/marketing/conditional-header.tsx")))
check("the tab bar is on a receipt, with Library lit", buyerTabsBelongOn("/receipt/abc") && buyerTabFor("/receipt/abc") === 2)
const receiptView = code("app/receipt/[token]/receipt-view.tsx")
check("a back that returns where they came from, never into the checkout, else the library", /<BackControl fallback="\/account\/library" label="Back" skipBack=\{\(path\) => path\.startsWith\("\/checkout"\)\}/.test(receiptView))
check("the page no longer pads under the clock itself (the header does)", !/safe-area-inset-top/.test(receiptView) && !/safe-area-inset-top/.test(read("app/receipt/[token]/loading.tsx")))

console.log("\n6. The navigator opens a library product on the client")
check("the library is not a document load any more; /app and the builders still are", !needsDocumentLoad("/account/library/products/x") && !needsDocumentLoad("/account/library/courses/x") && needsDocumentLoad("/app") && needsDocumentLoad("/website-builder/x"))
check("the header asks that one list", /const isCrossLayoutPath = needsDocumentLoad/.test(header))

console.log("\n2. /app to Explore stays in the document")
for (const f of ["components/app/sidebar.tsx", "components/app/mobile-account-menu.tsx", "components/dashboard/sidebar.tsx"]) {
  const c = code(f)
  check(`${f}: Explore through the router, never openExternal or window.location`, /openStorelibPage\(router, "\/explore"\)/.test(c) && !/openExternal\(/.test(c) && !/window\.location\.href = "\/explore"/.test(c))
}

console.log("\n9. Pull to refresh")
const ptr = code("components/ui/pull-to-refresh.tsx")
check("one component on the /app home's own engine (the hook and its ring)", /usePullToRefresh\(scrollerRef/.test(ptr) && /<PullToRefreshIndicator/.test(ptr))
check("it finds the scroller: inside (a page scroll box), around (/app), or the document", /\[data-pull-scroller\], \.page-scroll/.test(ptr) && /closest<HTMLElement>\("\.app-content-scroll"\)/.test(ptr) && /document\.scrollingElement/.test(ptr))
check("the event contract: storelib:pull-refresh with a scope, waiting on detail.done", /export const PULL_REFRESH_EVENT = "storelib:pull-refresh"/.test(ptr) && /new CustomEvent<PullRefreshDetail>\(PULL_REFRESH_EVENT, \{ detail \}\)/.test(ptr) && /Promise\.resolve\(detail\.done\)/.test(ptr))
check("a refresh that never ends still lets the ring go", /REFRESH_MAX_MS = 10_000/.test(ptr))
const hook = code("hooks/use-pull-to-refresh.ts")
check("the hook takes a document scroller: touches on the page's own wrapper, its top watched against the viewport", /listenOn\?: React\.RefObject/.test(hook) && /root: isDocument \? null : el/.test(hook) && /target\.addEventListener\("touchstart"/.test(hook))
check("every gesture inside the shared component is judged by its first pixels, so a sideways row keeps its swipe", /axisFirst: true/.test(ptr) && /if \(held === 0 && axisFirst\) lateral = true/.test(hook))
check("the blocking listener is still only on while the top is on screen", /target\.addEventListener\("touchmove", onTouchMove, \{ passive: false \}\)/.test(hook) && /new IntersectionObserver/.test(hook))
check("nothing at rest: the page is not moved once home", /el\.style\.transform = y === 0 \? "" :/.test(hook))
check("used on /app analytics (refreshing its figures in place)", /<RouterPullToRefresh scope="app-analytics" fill>/.test(code("app/app/analytics/page.tsx")) && /detail\?\.scope !== "app-analytics"/.test(code("app/app/analytics/analytics-client.tsx")) && /setTick\(\(n\) => n \+ 1\)/.test(code("app/app/analytics/analytics-client.tsx")))
check("the /app home has had it all along, on the same engine", /usePullToRefresh\(scrollRef, handlePullRefresh/.test(code("components/app/dashboard-client.tsx")))
check("the community feed pages dispatch the event for the feed", /<PullToRefreshEvent scope="community-feed">/.test(code("app/(marketing)/community/[slug]/page.tsx")) && /<PullToRefreshEvent scope="community-feed">/.test(code("app/(marketing)/community/[slug]/(member)/space/[space]/page.tsx")))
const bridge = code("lib/native-bridge.ts")
check("the tick: the plugin on the bridge first (no chunk to fetch at the threshold), never a vibration in an Apple browser",
  /const onBridge = cap\.Plugins\?\.Haptics/.test(bridge) && /if \(appleTouchBrowser\(\)\) return/.test(bridge))

console.log("\n10. Settings' back")
check("the shared back control: a real back to the kept profile, first tap, pressed on touch", /<BackControl fallback=\{BACK_TO\} label="Back to profile"/.test(code("components/account/account-settings.tsx")) && /const BACK_TO = "\/account"/.test(code("components/account/account-settings.tsx")))
const back = code("components/navigation/back-control.tsx")
check("  which is 40px with 44px of reach, darkens on the touch and goes on the lift", /h-10 w-10/.test(back) && /before:-inset-\[3px\]/.test(back) && /useFirstTap/.test(back) && /usePressFeedback/.test(back) && /goBackOr\(fallback/.test(back))
check("press feedback writes the DOM, not state", /setAttribute\("data-pressed", ""\)/.test(code("lib/navigation/press-feedback.ts")) && !/useState/.test(code("lib/navigation/press-feedback.ts")))

console.log("\nCopy")
const files = [
  "lib/nav/prefetch-policy.ts", "lib/navigation/tab-scroll.ts", "lib/navigation/press-feedback.ts", "lib/navigation/cross-section.ts", "lib/native-start-landing.ts",
  "components/ui/pull-to-refresh.tsx", "components/navigation/back-control.tsx", "app/receipt/layout.tsx", "components/product/discover-back-breadcrumb.tsx",
  "components/store-builder/discover-sticky-wrapper.tsx", "app/native-start/page.tsx",
]
const dash = String.fromCharCode(0x2014)
const banned = new RegExp("\\b(" + ["unlock", "elevate", "seamless", "powerful", "effortless", "supercharge"].join("|") + ")", "i")
const comments = (t: string) => (t.match(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm) ?? []).join("\n")
check("no em dashes and none of the banned words anywhere this round wrote", files.every((f) => existsSync(join(process.cwd(), f)) && !read(f).includes(dash) && !banned.test(comments(read(f)))), files.filter((f) => read(f).includes(dash) || banned.test(comments(read(f)))))
const fresh = files.slice(0, 9)
check("  and the new files' comments say translate, never the other word", fresh.every((f) => !/\btransform/i.test(comments(read(f)))), fresh.filter((f) => /\btransform/i.test(comments(read(f)))))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)

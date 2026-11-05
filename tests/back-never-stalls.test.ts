/**
 * ===========================================================================
 *  NO WAY BACK ENDS NOWHERE, AND NOTHING WAITS ON A BACK THAT DID NOTHING
 * ===========================================================================
 * "Sometimes trying to go back from a checkout or whatever takes too much and
 * blocks."
 *
 * `history.back()` reports nothing when it does nothing, and it does nothing
 * more often than the code that calls it expects: an entry the browser
 * replaced, a hash entry, an editor opened straight from a link or a
 * notification, a web view that reports a length it cannot go back through.
 * Every screen that goes back also puts something up while it waits, and all
 * of it stayed up. Filmed at 390 with back made into a no-op
 * (scripts/check-app-back-stall.mjs, scripts/check-onepage-back-stall.mjs):
 *
 *   the product editor's Back    the layer sat over a dimmed arrow and the
 *                               list never came: nothing changed on the
 *                               screen for the whole film
 *   the coupon editor's Back     the same
 *   the app's hardware back      nothing changed on the screen in 3,000ms
 *   the OnePage editor's Discard the question closed and then nothing, for
 *                               3,952ms of film and 12s in the code
 *
 * So there is one watch, lib/navigation/go-back backThen, and this suite is
 * the guard that every way back in the app goes through it and that each one
 * names a real destination.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { APP_ROOT_ROUTES, homeFor, isAppRootRoute } from "../lib/navigation/app-home"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)}) `}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Comments explain what the old code did, so every rule below reads code only. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\nThe watch itself")
const watch = code("lib/navigation/go-back.ts")
check("backThen goes back and watches for the back showing itself", /export function backThen\([\s\S]{0,1600}window\.history\.back\(\)/.test(watch))
for (const event of ["popstate", "pagehide", "beforeunload"]) {
  check(`  a real back shows itself as ${event}`, new RegExp(`window\\.addEventListener\\("${event}", done\\)`).test(watch))
}
check("  and as the Navigation API's navigate where there is one", /nav\?\.addEventListener\?\.\("navigate", done\)/.test(watch))
/* Round 23: the fallback is marked as a way back first (lib/ui/new-deploy markBackStarted), so a newer deploy does not make it a whole page load. */
check("nothing arriving runs the fallback", /if \(settled\) return\s*\n\s*done\(\)\s*\n\s*(markBackStarted\(\)\s*\n\s*)?fallback\(\)/.test(watch))
check("and the watch can be cancelled by a screen that goes away first", /return \(\) => \{\s*\n\s*if \(settled\) return\s*\n\s*done\(\)\s*\n\s*window\.clearTimeout\(timer\)/.test(watch))
check("goBackOr is the same watch, with the creator's page as the fallback", /backThen\(\(\) => navigate\(fallbackHref\(creatorHref\)\)\)/.test(watch))

/*
  ═══════════════════════════════════════════════════════════════════════════
   AND NOTHING ANYWHERE CALLS BACK WITHOUT IT
  ═══════════════════════════════════════════════════════════════════════════
  One rule over the whole app, so a new screen cannot quietly reintroduce the
  bug: the only places that may call the browser's back are the watch itself
  and the checkout, which carries the same watch inline (it was written on the
  buyer's side first, and its own suite covers it).
*/
console.log("\nEvery way back in the app")
const SOURCES = [
  "app/(storelib)/app",
  "app/(storelib)/admin",
  "app/(storelib)/checkout",
  "app/(storelib)/(marketing)",
  "components/app",
  "components/onepage",
  "components/store-builder",
  "components/website-builder",
  "components/search",
  "components/navigation",
  "components/email",
  "components/storefront",
  "components/wishlist",
  "components/product",
  "components/library",
  "components/nav",
  "lib",
]
/* Round 20: the settings sheet's extra Back past a second Settings entry follows a backThen and has its own watch (STUCK_MS: the page under, then the sheet back working). */
const OWN_WATCH = ["lib/navigation/go-back.ts", "app/(storelib)/checkout/checkout-client.tsx", "components/app/settings-sheet.tsx"]
function walk(dir: string): string[] {
  const out: string[] = []
  const full = join(process.cwd(), dir)
  let entries: string[] = []
  try {
    entries = readdirSync(full)
  } catch {
    return out
  }
  for (const name of entries) {
    const rel = `${dir}/${name}`
    if (statSync(join(process.cwd(), rel)).isDirectory()) out.push(...walk(rel))
    else if (/\.tsx?$/.test(name)) out.push(rel)
  }
  return out
}
const files = SOURCES.flatMap(walk)
check("the sweep reads the whole app and not an empty list", files.length > 300, files.length)
const raw = files.filter((f) => !OWN_WATCH.includes(f) && /(?:window\.history|history|router)\.back\(\)/.test(code(f)))
check("nothing calls the browser's back without the watch", raw.length === 0, raw)
/* The checkout's own copy of the watch, so allowing it above cannot hide a regression. */
const checkout = code("app/(storelib)/checkout/checkout-client.tsx")
check("the checkout's own back is inside its own watch", /const backThen = \(fallback[\s\S]{0,700}window\.history\.back\(\)/.test(checkout))

console.log("\nThe seller's editors land on their list")
const products = code("app/(storelib)/app/products/list-return.ts")
/* Changed on purpose: Coupons, Upsells and bundles, Collections and Size charts share one round trip. */
const coupons = code("components/app/list-return.ts")
const couponsUse = /createListReturn<CouponReturn>\(COUPONS_HREF\)/.test(code("app/(storelib)/app/coupons/list-return.ts"))
check("the product editor's Back is watched, and the list is the fallback", /backThen\(replaceWithList\)/.test(products) && /const replaceWithList = \(\) => \{\s*\n\s*markTraversal\(\)\s*\n\s*router\.replace\(PRODUCTS_HREF\)/.test(products))
check("the coupon editor's is too", couponsUse && /backThen\(/.test(coupons) && /replaceWithList\(\)/.test(coupons) && /router\.replace\(listHref\)/.test(coupons))
/* The fallback is a replace and is marked as a return, so the list comes back where it was left rather than as a fresh visit. */
check("and the fallback is the same return, not a fresh visit", /markTraversal\(\)/.test(products) && /markTraversal\(\)/.test(coupons))
check("the way back is still one move of the layer", /moveLayer\("leave"/.test(products) && /moveLayer\("leave"/.test(coupons))

const composer = code("components/email/compose/compose-page.tsx")
const flow = code("app/(storelib)/app/emails/flow/[id]/builder.tsx")
const chooser = code("app/(storelib)/app/emails/flow/new/chooser.tsx")
check("the email composer's way out is watched", /backThen\(\(\) => router\.replace\(list\)\)/.test(composer))
check("the automation builder's is", /backThen\(\(\) => router\.replace\(EMAILS\)\)/.test(flow))
check("and so is the new automation chooser's", /backThen\(\(\) => router\.replace\(FLOWS_HREF\)\)/.test(chooser))

const emails = code("app/(storelib)/app/emails/emails-client.tsx")
const orders = code("app/(storelib)/app/orders/orders-client.tsx")
check("an email opened over the list closes even when the back does nothing", /backThen\(closeOver\)/.test(emails) && /const closeOver = \(\) => writeAddress/.test(emails))
check("and so does an order", /backThen\(closeOver\)/.test(orders) && /const closeOver = \(\) => writeAddress/.test(orders))

const upgrade = code("components/app/billing/upgrade-page-client.tsx")
check("the plans page lands on Billing when its back does nothing", /moveLayer\("leave", \(\) => backThen\(\(\) => router\.replace\(BILLING_HREF\)\), false\)/.test(upgrade))

console.log("\nThe editors that hold Back to ask first")
const onepage = code("components/onepage/onepage-editor.tsx")
check("the OnePage editor's held Back lands on the app when it goes nowhere", /if \(target === "back"\) \{\s*\n\s*backThen\(\(\) => goTo\(EXIT_HREF\)\)/.test(onepage))
/* Soft first, and the address loaded for real if the editor is still here: a navigation that never lands is still an ending. */
check("  and every way out of it has the ceiling under it", /const goTo = \(href: string\) => \{[\s\S]{0,400}navigateWithCeiling\(/.test(onepage))
check("  with the shell told, so a slow page out says something", /const goTo = \(href: string\) => \{\s*\n\s*startNavigationLoading\(href\)/.test(onepage))
const topbar = code("components/store-builder/editor-topbar.tsx")
check("the store builder's Save and Discard both land", (topbar.match(/backThen\(\(\) => \{ window\.location\.href = APP_HREF \}\)/g) || []).length === 2)

console.log("\nThe installed app's own back")
const native = code("components/app/native-back-handler.tsx")
check("the hardware key's back is watched", /backThen\(\(\) => router\.replace\(homeFor\(here\)\)\)/.test(native))
check("and it says something at once, since a key press dims no control", /startNavigationLoading\(homeFor\(here\)\)\s*\n\s*backThen\(/.test(native))
check("a page with nothing behind it goes to its own list, not the home screen", /router\.replace\(homeFor\(here\)\)/.test(native))
check("the thing on top still goes first (the menu, then a panel inside the page)", native.indexOf("CLOSE_EVENT") < native.indexOf("backThen(") && native.indexOf("nativeBackTarget()") < native.indexOf("backThen("))
check("it is mounted in the seller's layout", /<NativeBackHandler \/>/.test(read("app/(storelib)/app/layout.tsx")))
/*
  AND NOWHERE ELSE. Its home is /app and its roots are the seller shell's, so
  on a buyer route it would send somebody reading their library into the
  seller app. The buyer routes keep the web view's own back, and the search
  screen closes itself through a history entry of its own.
*/
const mounted = files.filter((f) => /<NativeBackHandler \/>/.test(read(f)))
check("and nowhere else, so no buyer route gets the seller's home", mounted.join() === "app/(storelib)/app/layout.tsx", mounted)
check("/library is not one of the seller shell's roots", !APP_ROOT_ROUTES.includes("/library"))
check("the buyer's search screen closes even when its own back does nothing", /backThen\(\(\) => \{\s*\n\s*closing\.current = false\s*\n\s*shut\(\)/.test(code("components/search/search-overlay.tsx")))

console.log("\nWhere a back with nothing behind it lands")
check("a product editor belongs to Products", homeFor("/app/products/abc") === "/app/products")
check("an automation belongs to Emails, not to the home screen", homeFor("/app/emails/flow/xyz") === "/app/emails")
check("a page under none of them is the home screen", homeFor("/app/something-new/1") === "/app" && homeFor("/app") === "/app")
check("a lookalike path is not a match", homeFor("/app/productsomething") === "/app")
check("the roots themselves are roots", isAppRootRoute("/app/products") && isAppRootRoute("/app/products/") && isAppRootRoute("/app"))
check("and a page under one is not", !isAppRootRoute("/app/products/abc"))
check("a buyer route is neither a root nor a home of the seller's", !isAppRootRoute("/library") && homeFor("/library") === "/app")

console.log("\nThe pages that are read rather than used")
check("Back on Terms and Privacy goes home when there is nothing behind", /backThen\(\(\) => router\.push\(fallbackHref\)\)/.test(code("components/back-button.tsx")))
/* Changed on purpose (r40): the old legal address is a permanent redirect from the server now, with no page and so no Back of its own. */
check("the old legal address sends people on from the server", /permanentRedirect\("\/privacy"\)/.test(code("app/(storelib)/(marketing)/legal/privacy/page.tsx")) && /permanentRedirect\("\/terms"\)/.test(code("app/(storelib)/(marketing)/legal/terms/page.tsx")))
check("a return link that is a link follows its own href when the back does nothing", /backThen\(\(\) => window\.location\.assign\(href\)\)/.test(code("components/navigation/return-link.tsx")))
check("the embedded bar's only way out always goes somewhere", /if \(canGoBack\) backThen\(page\)/.test(code("components/storefront/embedded-back-bar.tsx")))
check("and the public wishlist's arrow", /backThen\(\(\) => router\.push\("\/explore"\)\)/.test(code("components/wishlist/public-wishlist-shell.tsx")))

/*
  ═══════════════════════════════════════════════════════════════════════════
   AND EXPLORE DOES NOT WRITE TO DISK ON EVERY SCROLL EVENT
  ═══════════════════════════════════════════════════════════════════════════
  The handler said "throttled scroll save" and nothing was throttling it:
  sessionStorage.setItem, a synchronous write, on every scroll event for as
  long as a finger is moving.
*/
console.log("\nExplore's scroll")
const explore = code("lib/explore/use-explore-scroll.ts")
const handler = explore.slice(explore.indexOf("const handleScroll"), explore.indexOf("window.addEventListener(\"beforeunload\""))
check("the scroll handler writes nothing itself", !/sessionStorage/.test(handler), handler.replace(/\s+/g, " ").slice(0, 120))
check("it asks for one frame and no more until that frame has run", /if \(frame\) return\s*\n\s*frame = requestAnimationFrame\(write\)/.test(explore))
check("there is one place the position is written", (explore.match(/sessionStorage\.setItem\(EXPLORE_SCROLL_KEY/g) || []).length === 1)
check("a write that throws (private mode, storage full) does not take the page", /try \{[\s\S]*sessionStorage\.setItem\(EXPLORE_SCROLL_KEY[\s\S]*\} catch \{/.test(explore))
check("leaving writes the last position straight away, with no frame to wait for", /window\.addEventListener\("pagehide", handleLeave\)/.test(explore) && /window\.addEventListener\("beforeunload", handleLeave\)/.test(explore))
check("and a frame still pending when it unmounts is written rather than dropped", /if \(frame\) handleLeave\(\)/.test(explore))

console.log("\nThe films that measured it")
for (const probe of ["scripts/check-app-back-stall.mjs", "scripts/check-onepage-back-stall.mjs"]) {
  const p = read(probe)
  check(`${probe} films the screen rather than asking the page`, /Page\.startScreencast/.test(p) && /Page\.screencastFrame/.test(p))
  check("  and can film the commit before the fix, to compare", /BEFORE/.test(p))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

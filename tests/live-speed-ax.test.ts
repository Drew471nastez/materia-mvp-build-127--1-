/**
 * ===========================================================================
 *  ROUND AX: A LIVE IMPORTED THEME'S CLOSED COUNTRY LISTS COST NOTHING
 * ===========================================================================
 * The owner: "it takes about 8 seconds to load a page, I want it under 2".
 * Measured on andrewrullz.storelib.com: four country lists (header, its
 * phone copy, top bar, footer) were 6,500 of the product page's 7,900
 * elements, laid out on every layout a theme script forced. Each list is
 * now skipped whole while it is closed and let go before it is used
 * (lib/storelib-theme/compat/first-load.ts, 4.). And every drawn page says
 * where its time went (Server-Timing).
 *
 * And the native (Storelib theme) websites: CLS was 0.25 on a computer and
 * up to 1.4 on a phone because the cart, wishlist and sandbox providers
 * made urgent updates at hydration, which made React throw away lazy
 * sections' server HTML and draw it again. Those updates are non-urgent
 * now. And every website stopped downloading Storelib's own app pieces
 * (platform header, community bar, sign-in client) it never shows.
 *
 * Run with:  npx tsx tests/live-speed-ax.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COUNTRY_LIST_ATTR, COUNTRY_LIST_HEAD, readierFirstLoad } from "../lib/storelib-theme/compat/first-load"
import { flagImage } from "../lib/storelib-theme/compat/objects"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA closed country list is skipped whole\n")
const us = flagImage("US")
const fr = flagImage("FR")
const list = (id: string) => `<div id="${id}" class="disclosure__list invisible"><ul class="list"><li><a data-value="US"><span><img src="${us}" alt="United States"></span><span>United States</span></a></li><li><a data-value="FR"><span><img src="${fr}" alt="France"></span><span>France</span></a></li></ul></div>`
const page = `<html><head><title>x</title></head><body><header>${list("a")}</header><nav><ul class="menu"><li><a href="/shop">Shop</a></li></ul></nav><footer>${list("b")}</footer><script>var t='<ul><li><img src="${us}"></li></ul>'</script></body></html>`
const r = readierFirstLoad(page)
check("each list holding flags is marked closed, once", r.countryLists === 2 && (r.html.match(new RegExp(`<ul ${COUNTRY_LIST_ATTR}="closed" class="list">`, "g")) ?? []).length === 2, r.countryLists)
check("a list with no flag (a menu) is left as it was", r.html.includes(`<ul class="menu"><li><a href="/shop">Shop</a></li></ul>`))
check("a list written inside a script's string is not touched", r.html.includes(`var t='<ul><li><img src="${us}"></li></ul>'`))
check("every item, its link and its flag stay in the page, the flags lazy", (r.html.match(/data-value="US"/g) ?? []).length === 2 && (r.html.match(/<img loading="lazy" src="data:image\/svg\+xml,/g) ?? []).length === 4)
check("the rule and the script that lets a list go are written once, in the head", r.html.indexOf(COUNTRY_LIST_HEAD) > 0 && r.html.indexOf(COUNTRY_LIST_HEAD) < r.html.indexOf("</head>") && r.html.split(COUNTRY_LIST_HEAD).length === 2)
const again = readierFirstLoad(r.html)
check("done twice, nothing more is marked or written", again.countryLists === 0 && again.html === r.html)
check("a page with no country list gets neither", !readierFirstLoad(`<html><head></head><body><ul><li>x</li></ul></body></html>`).html.includes("data-sl-countries"))

console.log("\nIt is let go before it is used\n")
check("skipped only while closed (content-visibility: hidden), never removed or display:none", /\[data-sl-countries="closed"\]\{content-visibility:hidden\}/.test(COUNTRY_LIST_HEAD) && !/display:\s*none/.test(COUNTRY_LIST_HEAD))
check("a pointer resting on or pressing, a touch, a key or a focus reaching it lets it go, before the theme's own handler (capture)", /\["pointerdown","pointerover","touchstart","keydown","focusin"\]/.test(COUNTRY_LIST_HEAD) && /capture:true,passive:true/.test(COUNTRY_LIST_HEAD))
check("found through what controls it (aria-controls) or what holds it", /getAttribute\("aria-controls"\)/.test(COUNTRY_LIST_HEAD) && /form,details/.test(COUNTRY_LIST_HEAD))
check("and the theme opening it by itself (class, style, open, hidden, aria-expanded around it) lets it go too", /MutationObserver/.test(COUNTRY_LIST_HEAD) && /attributeFilter:\["class","style","open","hidden","aria-expanded","aria-hidden"\]/.test(COUNTRY_LIST_HEAD))
check("let go for good: nothing ever marks it closed again", !/setAttribute\(A,"closed"\)/.test(COUNTRY_LIST_HEAD))

console.log("\nA drawn page says where its time went\n")
const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
check("read, localize, draw and post, then the total", /mark\("read"\)/.test(route) && /mark\("localize"\)/.test(route) && /mark\("draw"\)/.test(route) && /mark\("post"\)/.test(route) && /headers\.set\("Server-Timing", timing\.join\(", "\)\)/.test(route))
check("a held page says it was held, and what its draw cost when drawn", /hold;desc=hit/.test(route) && /drawn-\$2;/.test(route))

console.log("\nA native site keeps its server HTML while its sections load\n")
const cart = code("components/website-builder/site-cart.tsx")
const wish = code("components/website-builder/site-wishlist.tsx")
const sandbox = code("components/website-builder/sections/section-sandbox.tsx")
check("the cart's first read is non-urgent (an urgent one made React redraw lazy sections, CLS 0.25 to 1.0)", /startTransition\(\(\) => setReady\(true\)\)/.test(cart) && /if \(kept\.length > 0\) startTransition\(\(\) => setLines\(kept\)\)/.test(cart) && !/\n\s+setReady\(true\)\n/.test(cart))
check("the wishlist's first read is non-urgent", /startTransition\(\(\) => setReady\(true\)\)/.test(wish) && /startTransition\(\(\) => \{\n\s+setSignedIn\(true\)/.test(wish) && (wish.match(/startTransition\(/g) ?? []).length >= 3)
check("a section script asking for the sandbox is non-urgent", /startTransition\(\(\) => setNeeded\(true\)\)/.test(sandbox))

console.log("\nA native site does not download Storelib's own app\n")
const rootLayout = code("app/layout.tsx")
const appOnly = code("components/platform/app-only.tsx")
const notFound = code("app/not-found.tsx")
const headerLazy = code("components/platform/platform-header-lazy.tsx")
check("the root layout takes the community bar, the sign-in bridge, push and the ask from app-only", /import \{ AccountCommunityChrome, NativeOAuthBridge, NativePushInit, NotificationsAsk \} from "@\/components\/platform\/app-only"/.test(rootLayout))
check("  and imports none of them directly (a plain import ships them to every website)", !/from "@\/components\/account\/account-community-chrome"/.test(rootLayout) && !/from "@\/app\/NativeOAuthBridge"/.test(rootLayout) && !/from "@\/components\/native-push-init"/.test(rootLayout) && !/from "@\/components\/platform\/notifications-ask"/.test(rootLayout))
check("each is loaded on demand, drawn on the browser only (all four draw nothing on the server already)", (appOnly.match(/dynamic\(\(\) => \w+\(\), \{ ssr: false \}\)/g) ?? []).length === 4)
check("a published website is told by the router's segments, which the server and the browser agree on", /useSelectedLayoutSegments\(\)/.test(appOnly) && /segments\[0\] === "\(site\)" && segments\[1\] === "w"/.test(appOnly) && (appOnly.match(/usePublishedWebsite\(\) \? null :/g) ?? []).length === 4)
check("on Storelib's own pages their code is asked for before hydration, so they mount when they did", /if \(typeof window !== "undefined" && !looksLikeWebsite\(\)\)/.test(appOnly))
check("the 404's header comes from the on-demand file, still drawn on the server for a real 404", /import \{ PlatformHeaderClient \} from "@\/components\/platform\/platform-header-lazy"/.test(notFound) && !/from "@\/components\/platform\/platform-header-client"/.test(notFound) && /dynamic\(\s*\(\) => import\("@\/components\/platform\/platform-header-client"\)/.test(headerLazy) && !/ssr: false/.test(headerLazy))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

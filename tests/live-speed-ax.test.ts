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
import { startFrom, deploymentOf, WARM_PATHS } from "@/lib/website-builder/warm-sites"
import { siteImageProps } from "@/lib/website-builder/site-image"
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
/* Changed on purpose (camera and notifications access): the sheet for a refused permission is the sixth piece, loaded the same way. */
check("the root layout takes the community bar, the settings layer, the sign-in bridge, push, the ask and the access sheet from app-only", /import \{ AccessSheet, AccountCommunityChrome, NativeOAuthBridge, NativePushInit, NotificationsAsk, SettingsSubpageHost \} from "@\/components\/platform\/app-only"/.test(rootLayout))
check("  and imports none of them directly (a plain import ships them to every website)", !/from "@\/components\/account\/account-community-chrome"/.test(rootLayout) && !/from "@\/app\/NativeOAuthBridge"/.test(rootLayout) && !/from "@\/components\/native-push-init"/.test(rootLayout) && !/from "@\/components\/platform\/notifications-ask"/.test(rootLayout) && !/from "@\/components\/account\/settings-subpage"/.test(rootLayout) && !/from "@\/components\/platform\/access-sheet"/.test(rootLayout))
check("each is loaded on demand, drawn on the browser only (all of them draw nothing on the server already)", (appOnly.match(/dynamic\(\(\) => \w+\(\), \{ ssr: false \}\)/g) ?? []).length === 6)
check("a published website is told by the router's segments, which the server and the browser agree on", /useSelectedLayoutSegments\(\)/.test(appOnly) && /segments\[0\] === "\(site\)" && segments\[1\] === "w"/.test(appOnly) && (appOnly.match(/usePublishedWebsite\(\) \? null :/g) ?? []).length === 6)
check("on Storelib's own pages their code is asked for before hydration, so they mount when they did", /if \(typeof window !== "undefined" && !looksLikeWebsite\(\)\)/.test(appOnly))
check("the 404's header comes from the on-demand file, still drawn on the server for a real 404", /import \{ PlatformHeaderClient \} from "@\/components\/platform\/platform-header-lazy"/.test(notFound) && !/from "@\/components\/platform\/platform-header-client"/.test(notFound) && /dynamic\(\s*\(\) => import\("@\/components\/platform\/platform-header-client"\)/.test(headerLazy) && !/ssr: false/.test(headerLazy))

console.log("\nA link pointed at opens at once\n")
const links = code("components/website-builder/site-links.tsx")
check("a pointer, focus or touch on a link fetches the whole page (Next's default fetched only its outline)", /if \(to\) ahead\(to, true\)/.test(links) && /router\.prefetch\(key, \{ kind: FULL \}\)/.test(links) && /const FULL = "full" as PrefetchKind/.test(links))
check("  links that only come into view keep the light prefetch on a computer, and are fetched whole on a touch screen (no hover there)", /\n\s+ahead\(to, touchOnly\)\n/.test(links) && /matchMedia\("\(hover: none\)"\)/.test(links) && /else router\.prefetch\(key\)/.test(links))
check("the public page does not ship the theme settings schema (fonts come from font-options)", /from "@\/lib\/website-builder\/font-options"/.test(code("lib/website-builder/font-link.ts")) && !/theme-settings-schema/.test(code("lib/website-builder/font-link.ts")))
check("no bare Buffer in cart links or own-database (it shipped a 19 KB polyfill to browsers)", ["lib/physical/cart-link.ts", "lib/website-builder/own-database.ts"].every((f) => !/(^|[^.\w])Buffer\.from/m.test(code(f))))

console.log("\nA creator page does not ship the owner's editing tools to visitors\n")
const storefront = code("app/(marketing)/u/[username]/page.tsx")
const ownerLazy = code("components/storefront/owner-controls-lazy.tsx")
check("Edit profile, Edit about and the owner's menu come from the on-demand file", /import \{ EditAboutButton, EditProfileButton, OwnerMenu \} from "@\/components\/storefront\/owner-controls-lazy"/.test(storefront) && !/from "@\/components\/storefront\/(edit-profile-button|edit-about-button|owner-menu)"/.test(storefront))
check("  each loaded with dynamic(), still drawn on the server for the owner", (ownerLazy.match(/= dynamic\(\(\) => import\(/g) ?? []).length === 3 && !/ssr: false/.test(ownerLazy))

console.log("\nEvery published website is drawn before its first visitor after a deploy\n")
{
  check("a new deployment starts from the first site", JSON.stringify(startFrom({ deployment: "dpl_old", offset: 400, done: true }, "dpl_new")) === JSON.stringify({ offset: 0, done: false }))
  check("  the same deployment carries on where the last run stopped, and is never warmed twice", startFrom({ deployment: "dpl_a", offset: 200, done: false }, "dpl_a").offset === 200 && startFrom({ deployment: "dpl_a", offset: 600, done: true }, "dpl_a").done === true)
  check("  nothing saved yet, or something odd saved, starts from the top", startFrom(null, "d").offset === 0 && startFrom({ deployment: "d", offset: -5 }, "d").offset === 0)
  check("the deployment is Vercel's own id, the URL when that is missing", deploymentOf({ VERCEL_DEPLOYMENT_ID: "dpl_x", VERCEL_URL: "u" }) === "dpl_x" && deploymentOf({ VERCEL_URL: "u" }) === "u" && deploymentOf({}) === null)
  check("the front page and the products page are the pages warmed", JSON.stringify(WARM_PATHS) === JSON.stringify(["/", "/products"]))
  const cron = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[]; regions?: string[] }
  check("it runs every five minutes, and costs nothing once the deploy is warmed", cron.crons.some((c) => c.path === "/api/cron/warm-sites" && c.schedule === "*/5 * * * *") && /already-warmed/.test(code("lib/website-builder/warm-sites.ts")))
  check("the warm asks through the public address, a few at a time, each with a timeout", /const AT_ONCE = 6/.test(code("lib/website-builder/warm-sites.ts")) && /return Math\.min\(EACH_MS, hardStop - Date\.now\(\)\)/.test(code("lib/website-builder/warm-sites.ts")) && /setTimeout\(\(\) => ctl\.abort\(\), Math\.max\(MIN_REQUEST_MS, limitFor\(hardStop\)\)\)/.test(code("lib/website-builder/warm-sites.ts")) /* Changed on purpose (rel-shared): EACH_MS, or less when the run has less left */)
  check("functions run next to the database (iad1 only)", JSON.stringify(cron.regions) === JSON.stringify(["iad1"]))
}

console.log("\nA website's pictures come at the size the screen draws them\n")
{
  const own = "https://storelib.com/media/product-images/a/b/photo.png"
  const p = siteImageProps(own, "(min-width: 768px) 50vw, 100vw")
  check("Storelib's own picture gets a srcset of re-encoded widths, the original kept as src", !!p.srcSet && /\/_next\/image\?url=https%3A%2F%2Fstorelib\.com%2Fmedia%2Fproduct-images%2Fa%2Fb%2Fphoto\.png&w=384&q=90 384w/.test(p.srcSet) && /&w=2048&q=90 2048w$/.test(p.srcSet) && p.sizes === "(min-width: 768px) 50vw, 100vw")
  check("  SVG, GIF, blob, data and already optimised addresses are left alone", [own.replace(".png", ".svg"), own.replace(".png", ".gif"), "blob:https://x/1", "data:image/png;base64,AA", "/_next/image?url=x&w=1&q=1"].every((u) => Object.keys(siteImageProps(u)).length === 0))
  check("  a host the optimiser will not fetch is left alone, and so is nothing", Object.keys(siteImageProps("https://example.org/a.jpg")).length === 0 && Object.keys(siteImageProps(undefined)).length === 0)
  const media = code("components/website-builder/sections/renderers/product/product-media.tsx")
  check("the product page's main picture and its thumbnails use it; the zoom view keeps the original", /src=\{src\}\n\s+\{\.\.\.siteImageProps\(src, "\(min-width: 768px\) 50vw, 100vw"\)\}/.test(media) && /siteImageProps\(src, "96px"\)/.test(media) && /src=\{images\[at\]\}\n/.test(media))
  check("so do the hero, image, image banner, split content, slideshow and collection banner sections", ["HeroSection", "ImageSection", "ImageBannerSection", "SplitContentSection", "SlideshowSection", "CollectionBannerSection"].every((f) => /siteImageProps\(/.test(code(`components/website-builder/sections/renderers/${f}.tsx`))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

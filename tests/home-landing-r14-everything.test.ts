/**
 * ===========================================================================
 *  HOME, LANDING ROUND 14 (EVERYTHING): A REAL PRODUCT PAGE AND A REAL
 *  ONEPAGE IN THE STRIP, CARDS THAT COME UP SMOOTHLY, LOOPS THAT NEVER STOP
 * ===========================================================================
 * components/marketing/home/everything-in-one-place.tsx,
 * components/marketing/product-marquee.tsx,
 * components/marketing/home/integrations-section.tsx (+ module css),
 * components/marketing/home/loop-gate.ts.
 *
 * The owner, after round 13:
 *   1. "Build a store that looks like you": Liam Bailey's real product page
 *      (storelib.com/liam-bailey/gym-beginner-program) in Jonah Wells's
 *      place, its cover the page's full width with no grey bars, and the
 *      "I want this!" button drawn live, not faded. Satori Studio (the
 *      showcase's real OnePage) as another page in the strip.
 *   2. the Sell what you make cards come up smoothly as the page scrolls.
 *   3. Unlimited possibilities (and Connect your favorite apps) never stop
 *      while on screen.
 *   4. Connect your favorite apps: the gap between icons about half on a
 *      computer, still no icon seen twice, real apps only.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_STORES, EVERYTHING_STYLES, EVERYTHING_SUPPORT, SUPPORT_TURN_MS, Storefronts, Support } from "@/components/marketing/home/everything-in-one-place"
import { ProductMarquee } from "@/components/marketing/product-marquee"
import { IntegrationsSection, INTEGRATION_ROW_SIZES, INTEGRATION_STEP_SHARE, PLATFORM_INTEGRATION_APPS } from "@/components/marketing/home/integrations-section"
import { LOOP_CHECK_MS, LOOP_SCROLL_QUIET_MS } from "@/components/marketing/home/loop-gate"
import { PAGE_INTEGRATION_NAME } from "@/lib/onepage/integrations/catalog"
import { INTEGRATIONS } from "@/lib/integrations/catalog"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const ev = read("components/marketing/home/everything-in-one-place.tsx")
const um = read("components/marketing/product-marquee.tsx")
const apps = read("components/marketing/home/integrations-section.tsx")
const appsCss = read("components/marketing/home/integrations-section.module.css")
const gate = read("components/marketing/home/loop-gate.ts")
const evCss = EVERYTHING_STYLES.map((s) => s.css).join("\n")
const rule = (sheet: string, selector: string) => {
  const at = sheet.indexOf(`${selector}{`)
  return at < 0 ? "" : sheet.slice(at, sheet.indexOf("}", at) + 1)
}
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
/* What a visitor sees: the markup without its stylesheet. */
const seen = html.replace(/<style[\s\S]*?<\/style>/g, "")

console.log("\n── 1. Liam Bailey's real product page in the strip ──")
const liam = EVERYTHING_STORES.find((s) => s.key === "liam")
check("Jonah Wells is gone, from the data and the page", !EVERYTHING_STORES.some((s) => s.key === "jonah") && !/Jonah|Guitar lessons/.test(seen) && !/Jonah/.test(EVERYTHING_STYLES[0].css))
check(
  "Liam's page carries the live page's words: liam bailey, Gym Beginner Program, Workout Plans, $11.87, I want this!, what is included",
  !!liam && liam.kind === "product" && liam.seller === "liam bailey" && liam.title === "Gym Beginner Program" && liam.category === "Workout Plans" && liam.price === "$11.87" && liam.cta === "I want this!" && liam.included.join("|") === "Instant download access|All included files|Lifetime access",
  liam,
)
check("  and its button colour (#2563eb, the page's buy button setting)", !!liam && liam.kind === "product" && liam.button === "#2563eb")
check("  drawn on the page: the seller's bar, the cover, the title, the price, the button and the wishlist", /data-product-page=""/.test(html) && html.includes("liam bailey") && html.includes("Gym Beginner Program") && html.includes("$11.87") && html.includes("I want this!") && html.includes("Add to wishlist") && html.includes("What&#x27;s included"))
check("its cover and photo are files of its own (the poster cut from the upload, and his avatar)", ["liam-cover.webp", "liam-cover-300.webp", "liam-av.webp"].every((f) => existsSync(join(root, "public/home/everything/stores", f))))
check("the cover runs the page's full width, in the poster's own shape (554 x 450: no grey bars)", /\.ev-pp-cover\{display:block;flex:none;width:100%;height:auto;aspect-ratio:554\/450;object-fit:cover/.test(evCss) && /width=\{554\} height=\{450\}/.test(ev))
const buy = rule(evCss, ".ev-pp-buy")
check("the button is drawn live: its full colour, white words, no opacity, no disabled look", /color:#fff/.test(buy) && !/opacity/.test(buy) && !/grayscale|saturate/.test(buy) && /style=\{\{ background: s\.button \}\}/.test(ev), buy)

console.log("\n── 1b. Satori Studio's real OnePage in the strip ──")
const satori = EVERYTHING_STORES.find((s) => s.key === "satori")
check("Satori Studio is a page of the strip, the showcase's own picture of it", !!satori && satori.kind === "shot" && satori.src === "/home/showcase/a-satori.webp" && /a-satori-360\.webp 360w/.test(satori.srcSet) && existsSync(join(root, "public/home/showcase/a-satori.webp")))
check("  its top at the card's top, filling it", /\.ev-shot-img\{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 0\}/.test(evCss) && /a-satori\.webp/.test(html))
check("the drawn creative director's OnePage is gone (and its name with it)", !EVERYTHING_STORES.some((s) => (s as { kind: string }).kind === "profile") && !/Idris|ev-pf/.test(seen) && !/\.ev-pf/.test(evCss))
/* Changed on purpose (landing round 15): nine pages (Loudlib in Fieldwork's place, Sora and GodBless added), the stores still never side by side. */
const isStore = (s: (typeof EVERYTHING_STORES)[number]) => s.kind === "merch" || (s.kind === "shot" && s.key !== "satori")
check("nine pages, never two stores side by side", EVERYTHING_STORES.length === 9 && EVERYTHING_STORES.every((s, i) => !isStore(s) || !isStore(EVERYTHING_STORES[(i + 1) % EVERYTHING_STORES.length])))
check("no disliked name in the section (Juno Kada's domain went from the support card)", !/junokada|Juno Kada/i.test(html) && !/junokada/i.test(JSON.stringify(EVERYTHING_SUPPORT)))

console.log("\n── 2. the cards come up smoothly ──")
const strip = renderToStaticMarkup(createElement(Storefronts, { live: true }))
/* Changed on purpose (landing round 15): nine pages. */
check("the strip holds each page once: 9 layers and 9 animations, not 18", (strip.match(/class="ev-s-slot"/g) ?? []).length === 9 && /const strip = EVERYTHING_STORES\n/.test(ev))
const support = renderToStaticMarkup(createElement(Support))
check("one support thread plays at a time: the first is on, the others wait", (support.match(/class="ev-c-thread ev-loop"/g) ?? []).length === 3 && (support.match(/data-on=""/g) ?? []).length === 1 && SUPPORT_TURN_MS === 10000)
check("  no endless animation in the support card (every part plays once as its thread comes in)", !/infinite/.test(evCss.slice(evCss.indexOf(".ev-c-thread{"), evCss.indexOf("@container (max-width:480px)"))) && /\.ev-c\[data-turning\] \.ev-c-thread\[data-on\] \.ev-c-dot\{animation:ev-dot 1\.1s ease-in-out 2\.35s 2\}/.test(evCss))
check("  until the first turn the first thread stands whole, so the card is never empty on screen", /\n\.ev-c-thread\[data-on\]\{opacity:1;transform:translate3d\(-50%,-50%,0\)\}/.test(evCss) && /\.ev-c-thread\[data-on\] \.ev-c-q,\.ev-c-thread\[data-on\] \.ev-c-r\{opacity:1;transform:none\}/.test(evCss) && /el\.setAttribute\("data-turning", ""\)/.test(ev))
check("  the one leaving keeps its words while it fades", /\.ev-c-thread\[data-out\] \.ev-c-q,\.ev-c-thread\[data-out\] \.ev-c-r\{opacity:1;transform:none\}/.test(evCss))
check("  its timer runs only near the screen with the tab shown, and not at all under reduced motion", /const go = near && !document\.hidden/.test(ev) && /rootMargin: LIVE_AHEAD/.test(ev) && /prefers-reduced-motion: reduce\)"\)\.matches\) return\n    const threads/.test(ev))
check("  under reduced motion the first thread simply stands", /\.ev-c-thread:first-child\{opacity:1;transform:translate3d\(-50%,-50%,0\)\}/.test(evCss))

console.log("\n── 3. the loops never stop on screen ──")
check("both rows are run by one hook, through the Animations API", /useLoopGate\(ref, MARQUEE_GATE\)/.test(um) && /useLoopGate\(ref, ROW_GATE\)/.test(apps))
check("  no hover stop on pointerenter any more (a row scrolled under a resting pointer was stopped)", !/pointerenter/.test(code(um)) && !/pointerenter/.test(code(apps)) && !/function easeRow/.test(um + apps))
check("  the marquee no longer pauses by stylesheet attribute (data-um-paused)", !/data-um-paused/.test(code(um)))
const g = code(gate)
check("a row stops only for a mouse that really moved over it, never in the moments after a scroll", /e\.movementX === 0 && e\.movementY === 0/.test(g) && /performance\.now\(\) - lastScroll < LOOP_SCROLL_QUIET_MS/.test(g) && LOOP_SCROLL_QUIET_MS >= 150)
check("  any scroll sets every stopped row going again", /window\.addEventListener\("scroll", scrolled, \{ passive: true \}\)/.test(g) && /if \(hovered\.size\) release\(\)/.test(g))
check("on screen and shown, a row is played; off screen or hidden, paused at full speed", /if \(a\.playState !== "running"\) a\.play\(\)/.test(g) && /if \(a\.playState !== "paused"\) a\.pause\(\)/.test(g) && /setRate\(a, 1\)/.test(g))
check("  checked every two seconds while on screen, so nothing else can leave it standing", LOOP_CHECK_MS <= 2000 && /window\.setInterval\(\(\) => \{\n\s*if \(shown\(\)\) apply\(\)/.test(g))
check("  the tab coming back and a page restored from the cache are heard", /addEventListener\("visibilitychange", vis\)/.test(g) && /addEventListener\("pageshow", vis\)/.test(g))
check("the marquee and the apps still render their rows", /class="um-track"/.test(renderToStaticMarkup(createElement(ProductMarquee))) && (renderToStaticMarkup(createElement(IntegrationsSection)).match(/data-row-track=""/g) ?? []).length === 2)

console.log("\n── 4. the apps' gap about half on a computer ──")
check("a tile and its gap take 1/15 of the screen on a computer, 10px least (1/13 and 20px before)", /--gap: max\(10px, calc\(100vw \/ 15 - var\(--tile\)\)\);/.test(appsCss) && !/--gap: max\(20px/.test(appsCss))
check("  a phone keeps 1/13 and 6px", /--gap: max\(6px, calc\(100vw \/ 13 - var\(--tile\)\)\);/.test(appsCss))
const gap = (w: number) => Math.max(10, w / 15 - Math.min(116, Math.max(90, 0.056 * w)))
const old = (w: number) => Math.max(20, w / 13 - Math.min(116, Math.max(90, 0.056 * w)))
check("  at 1440 and 1920 the gap is about half what it was", [1440, 1920].every((w) => gap(w) / old(w) > 0.4 && gap(w) / old(w) < 0.6), [gap(1440), old(1440), gap(1920), old(1920)])
check("no icon seen twice: every row's set is over a screen plus a tile at 1/15", INTEGRATION_STEP_SHARE === 1 / 15 && INTEGRATION_ROW_SIZES.every((n) => (n - 1) * INTEGRATION_STEP_SHARE >= 1), INTEGRATION_ROW_SIZES)
const names = PLATFORM_INTEGRATION_APPS.map((a) => a.name)
check("  and no app twice", new Set(names).size === names.length)
check("the three added are real connections: a OnePage's signups to Google Sheets, its SoundCloud embed, a website's GitHub sync", ["Google Sheets", "SoundCloud", "GitHub"].every((n) => names.includes(n)) && Object.values(PAGE_INTEGRATION_NAME).includes("Google Sheets") && existsSync(join(root, "app/api/onepage/soundcloud")) && existsSync(join(root, "app/api/github/connect")))
const coming = INTEGRATIONS.filter((i) => i.comingSoon).map((i) => i.name)
/* Changed on purpose (OnePage editor fixes 2): Zapier, Make and Mailchimp take a OnePage's signups today and are no longer Coming soon, so they are on the page like every app a store can connect. */
check("  and nothing the integrations page lists as Coming soon", !names.some((n) => coming.includes(n)), names.filter((n) => coming.includes(n)))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

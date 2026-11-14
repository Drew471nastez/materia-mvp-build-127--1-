/**
 * LANDING ROUND 4, THE COMMERCE SECTIONS (storelib.com home)
 *
 * What the owner asked for, pinned:
 *
 *   examples        no Weeknight Pasta and no blue Heavyweight tee anywhere in
 *                   these sections; one shop (an embroidered cap, a night
 *                   photography e-book, a course, a membership), half
 *                   physical, half digital, and none of this round's banned
 *                   samples
 *   How it works    colourful grounds that change (two soft gradient layers
 *                   drifting, paused off screen); the first tile a product
 *                   card and a caption about half as long; the checkout tile
 *                   the real OnePage and its real product sheet, captured;
 *                   the domain tile cleaner, its claims still the code's
 *   checkout scene  the phone rises and stays, the products orbit it again
 *                   (pre-blurred files, compositor loops, paused off screen),
 *                   the headline's words come in after, the scroll never
 *                   presses Pay, and the four tab cards rise over the phone
 *                   as it sinks back; view timelines with an observer
 *                   fallback; still under reduced motion
 *   the tabs        four: the website checkout on a computer, a phone with
 *                   Apple Pay, Google Pay and Stripe, one cap in five
 *                   currencies, a light reminder demo; dark cards on black,
 *                   a fine dot grid
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { HowItWorks, HOW_PRODUCTS, HOW_DOMAIN, HOW_IT_WORKS_STYLES } from "../components/marketing/home/how-it-works"
import { CheckoutScene, CHECKOUT_HEADING, CHECKOUT_STYLES } from "../components/marketing/home/checkout-scene"
import { EBOOK } from "../components/marketing/home/ebook-cover"
import { sheetButtonLabel } from "../lib/onepage/product-block"
import { CURRENCY_FEE_RULES } from "../lib/payments/fees/currency-rules"
import { DOMAIN_PURPOSES } from "../lib/custom-domains/hostname"

let passed = 0
const check = (label: string, fn: () => void) => {
  fn()
  passed++
  console.log(`  ok    ${label}`)
}
const read = (p: string) => readFileSync(p, "utf8")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")

const DIR = "components/marketing/home"
const FILES = ["how-it-works.tsx", "checkout-scene.tsx", "ebook-cover.tsx", "commerce-kit.tsx"].map((f) => `${DIR}/${f}`)
const HOW = `${DIR}/how-it-works.tsx`
const CO = `${DIR}/checkout-scene.tsx`
const how = renderToString(createElement(HowItWorks))
const co = renderToString(createElement(CheckoutScene))
const howCss = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const coCss = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const keyframes = (css: string, name: string) => {
  const m = css.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`))
  assert.ok(m, name)
  return m![1]
}
const onlyCompositor = (body: string) => [...body.matchAll(/[{;]([a-z-]+):/g)].map((x) => x[1]).every((p) => p === "transform" || p === "opacity" || p === "animation-timing-function")

console.log("\nThe examples")
check("no Weeknight Pasta, no Heavyweight tee, no Maya Ellis, no pasta pictures, anywhere in these sections", () => {
  for (const f of FILES) assert.ok(!/weeknight|pasta|heavyweight|maya ?ellis|tee-heather|mayaellis/i.test(read(f)), f)
  assert.ok(!/weeknight|pasta|heavyweight/i.test(words(how) + words(co)))
  for (const p of ["public/home/how/tee-heather.webp", "public/home/how/course-pasta.webp", "public/home/commerce/ebook-pasta.webp"]) assert.ok(!existsSync(p), p)
})
check("none of this round's banned samples", () => {
  const all = FILES.map(read).join("\n") + words(how) + words(co)
  assert.ok(!/sourdough|golden hour|wheel throw|drawing basics|saturday run club|dust & tape|elena ruiz|real mornings|hemi walker|lowtide|bank account/i.test(all))
})
// Changed on purpose (landing round 5): the owner did not like the cap; How it works sells a signed print of Nadia's photograph instead.
check("half physical, half digital: the print and the e-book in How it works, physical and digital taking turns around the phone", () => {
  assert.deepEqual(HOW_PRODUCTS.map((p) => [p.id, p.kind]), [["print", "Physical"], ["ebook", "Digital"]])
  const ids = [...co.matchAll(/\/home\/commerce\/float-([a-z]+)\.webp/g)].map((m) => m[1])
  assert.deepEqual(ids, ["ebook", "cap", "course", "tee", "club", "vinyl"])
})

console.log("\nHow it works")
// Changed on purpose (landing round 5): the owner found the colourful grounds "too colorful"; they are a soft grey or near black, and still.
check("every tile stands on a calm ground in Storelib's colours, nothing drifting behind it, loops paused off screen", () => {
  assert.equal((how.match(/class="cmh-stage" data-ground="(light|dark)"/g) ?? []).length, 6)
  assert.ok(!/cmh-gl|cmh-drift/.test(how + howCss))
  assert.ok(/\.cmh-a\{[^}]*animation-play-state:paused!important/.test(howCss) && howCss.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}"))
  assert.ok(/@media \(prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}/.test(howCss))
})
check("the first tile is a product card, and its caption is about half as long as it was", () => {
  assert.equal((how.match(/class="cmh-a cmh-pc"/g) ?? []).length, 2)
  for (const t of ["Selling price", "Production cost", "You keep", "Status"]) assert.ok(words(how).includes(t), t)
  const cap = words(how.match(/<p class="cmh-cap">([\s\S]*?)<\/p>/)![1])
  /* Round 3's caption was 33 words. */
  assert.ok(cap.trim().split(" ").length <= 17, cap)
})
// Changed on purpose (landing round 5): the owner wanted the sheet's title and price bigger and bolder, and no cap; the OnePage and its sheet are drawn in HTML with the print.
check("the checkout tile is the OnePage and its product sheet, and the sheet's button is the real one for a product that ships", () => {
  for (const f of ["op-nadia.webp", "op-nadia-sheet.webp"]) assert.ok(!how.includes(f) && !existsSync(`public/home/how/${f}`), f)
  assert.ok(how.includes('class="cmh-a cmh-sheet"') && how.includes("/home/how/print-lasalle.webp") && statSync("public/home/how/print-lasalle.webp").size < 30 * 1024)
  assert.equal(sheetButtonLabel("Check out", "$45.00", true), "Check out · $45.00")
  assert.ok(words(how).includes("Check out · $45.00"))
  assert.ok(/const words = p\?\.ships \? "Check out"/.test(read("components/onepage/product-sheet.tsx")))
  assert.ok(onlyCompositor(keyframes(howCss, "cmh-sheet")) && onlyCompositor(keyframes(howCss, "cmh-dim")))
})
check("the domain tile is cleaner and keeps the code's claims: the three purposes, Pro, DNS checked, HTTPS", () => {
  assert.deepEqual(HOW_DOMAIN.targets.map((t) => t.purpose), [...DOMAIN_PURPOSES])
  const w = words(how)
  assert.ok(/On Pro, point a domain you own at your website, your creator page or a community\. Storelib checks the DNS and adds HTTPS\./.test(w))
  assert.ok(how.includes('class="cmh-dm-card"') && /\bPro\b/.test(w) && w.includes("DNS checked") && w.includes("HTTPS on"))
  assert.ok(!how.includes("cmh-dm-site"))
})

console.log("\nThe checkout scene")
check("the phone rises from below and stays, the words come in one by one after it, all on view timelines", () => {
  assert.ok(/view-timeline-name:--cmc[;}]/.test(coCss) && /view-timeline-name:--cmc-cards/.test(coCss) && /timeline-scope:--cmc-cards/.test(coCss))
  assert.ok(/\.cmc-rise\{animation:cmc-rise linear both;animation-timeline:--cmc;animation-range:entry/.test(coCss))
  assert.ok(onlyCompositor(keyframes(coCss, "cmc-rise")) && /from\{transform:translate3d\(0,62%,0\)/.test(keyframes(coCss, "cmc-rise")))
  const n = CHECKOUT_HEADING.split(" ").length
  assert.equal((co.match(/class="cmc-w"/g) ?? []).length, n)
  const starts = [...coCss.matchAll(/\.cmc-w\[data-w="\d+"\]\{animation-range:contain ([\d.]+)%/g)].map((m) => Number(m[1]))
  assert.equal(starts.length, n)
  assert.ok(starts.every((s, i) => i === 0 || s > starts[i - 1]))
  assert.ok(onlyCompositor(keyframes(coCss, "cmc-word")))
})
check("the tab cards rise over the phone and the phone sinks back and fades into them", () => {
  assert.ok(/\.cmc-cards\.cmc-cards\{[^}]*margin:-60vh 0 0/.test(coCss) && /\.cmc-cards\.cmc-cards\{[^}]*z-index:5/.test(coCss))
  assert.ok(/\.cmc-sink\{animation:cmc-sink linear both;animation-timeline:--cmc-cards/.test(coCss))
  const sink = keyframes(coCss, "cmc-sink")
  assert.ok(onlyCompositor(sink) && /to\{[^}]*opacity:0/.test(sink))
})
check("the scroll never steps through a payment on the phone", () => {
  const phone = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
  assert.ok(!/Payment complete|Face ID|Double Click|cmc-sheet|data-step/.test(phone))
  assert.ok(phone.includes("Pay $19.00 with Apple Pay") && phone.includes(EBOOK.title))
})
check("browsers without view timelines: two observers set two attributes, the same states play as transitions; no scroll listener", () => {
  const src = read(CO)
  assert.ok(/CSS\.supports\?\.\("animation-timeline: view\(\)"\)/.test(src) && (src.match(/new IntersectionObserver/g) ?? []).length === 2)
  assert.ok(/data-cmc-in/.test(src) && /data-cmc-over/.test(src) && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(/.test(src))
  assert.ok(/\.cmc\[data-cmc-js\] \.cmc-rise\{[^}]*transition:transform/.test(coCss) && /\.cmc\[data-cmc-js\]\[data-cmc-over\] \.cmc-sink\{opacity:0/.test(coCss))
})
check("the products orbit the phone again: pre-blurred files, compositor loops, paused off screen", () => {
  for (const id of ["ebook", "cap", "course", "tee", "club", "vinyl"]) {
    for (const f of [`float-${id}.webp`, `float-${id}-blur.webp`]) assert.ok(existsSync(`public/home/commerce/${f}`) && statSync(`public/home/commerce/${f}`).size < 40 * 1024, f)
  }
  assert.ok(onlyCompositor(keyframes(coCss, "cmc-lap")) && onlyCompositor(keyframes(coCss, "cmc-focus-sharp")) && onlyCompositor(keyframes(coCss, "cmc-focus-soft")))
  assert.ok(/\.cmc-lap,\.cmc-sharp,\.cmc-soft\{[^}]*animation-play-state:paused/.test(coCss))
  assert.ok(/\.cmc-track\[data-commerce-live\] :is\(\.cmc-lap,\.cmc-sharp,\.cmc-soft\)\{animation-play-state:running\}/.test(coCss))
  assert.ok(!/filter:\s*blur/.test(coCss))
})
check("reduced motion: nothing pinned, no overlap, nothing moving", () => {
  const still = coCss.slice(coCss.lastIndexOf("@media (prefers-reduced-motion:reduce)"))
  assert.ok(/\.cmc-track\.cmc-track\{height:auto\}/.test(still) && /\.cmc-cards\.cmc-cards\{margin-top:0\}/.test(still) && /\.cmc-stage \*\{transition:none!important;animation:none!important\}/.test(still))
})
check("a fine dot grid on the black, drawn once in CSS", () => {
  assert.ok(co.includes('class="cmc-dots"') && /\.cmc-dots\{[^}]*radial-gradient\(rgba\(255,255,255,\.\d+\) 1px/.test(coCss))
})

console.log("\nThe four tabs")
check("four tabs, in this order", () => {
  assert.deepEqual([...co.matchAll(/<span class="cmc-tab-l">([^<]+)</g)].map((m) => m[1]), ["Built to convert", "One-tap payments", "Local currencies", "Checkout reminders"])
})
check("Built to convert is the website checkout on a computer, and its sums add up", () => {
  const panel = co.slice(co.indexOf('id="cmc-panel-convert"'), co.indexOf('id="cmc-panel-tap"'))
  const w = words(panel)
  for (const t of ["Contact information", "Delivery", "Shipping method", "Payment method", "Powered by Stripe", "Payment complete", "Total due"]) assert.ok(w.includes(t), t)
  assert.ok(read("components/checkout/parts/ui.tsx").includes("Powered by"))
  assert.equal(2800 + 1900, 4700)
  assert.equal(4700 + 600 + Math.round(4700 * 0.08), 5676)
  assert.ok(w.includes("$47.00") && w.includes("$6.00") && w.includes("$3.76") && w.includes("$56.76"))
  assert.ok(w.includes("New sale: $56.76") && w.includes("Sam Rivera bought Darkroom cap and 1 more for $56.76."))
  const catalog = read("lib/notify/templates/catalog.ts")
  assert.ok(catalog.includes("New sale: ${total}") && catalog.includes("bought ${thing}"))
})
check("One-tap payments: just the phone, with Apple Pay, Google Pay and Stripe, each lit in turn", () => {
  const panel = co.slice(co.indexOf('id="cmc-panel-tap"'), co.indexOf('id="cmc-panel-currency"'))
  assert.equal((panel.match(/class="cmc-phone"/g) ?? []).length, 1)
  assert.ok(!/cdx-/.test(panel))
  const w = words(panel)
  for (const t of ["Apple Pay", "Google Pay", "Stripe", "Pay $19.00 with Google Pay"]) assert.ok(w.includes(t), t)
  for (const k of ["cmv-la", "cmv-lg", "cmv-ls", "cmv-ring", "cmv-mwa", "cmv-mwg"]) assert.ok(onlyCompositor(keyframes(coCss, k)), k)
})
check("Local currencies: a nicer product, the cap, read in five currencies checkout charges in", () => {
  const panel = co.slice(co.indexOf('id="cmc-panel-currency"'), co.indexOf('id="cmc-panel-recover"'))
  assert.ok(panel.includes("/home/how/cap-yellow.webp") && words(panel).includes("Darkroom cap"))
  for (const code of ["USD", "EUR", "GBP", "JPY", "CAD"]) assert.ok(code in CURRENCY_FEE_RULES && panel.includes(code), code)
})
check("Checkout reminders: light, a few layers, the email in within a second and a half, its pictures loaded ahead", () => {
  const panel = co.slice(co.indexOf('id="cmc-panel-recover"'))
  assert.ok(!/loading="lazy"/.test(panel))
  const start = Number(keyframes(coCss, "cmv-mail").match(/^0%,([\d.]+)%/)![1])
  assert.ok(start <= 10, String(start))
  const animated = coCss.match(/\[data-commerce-live\] \.cmc-panel\[data-on\] \.cmv-(st\d|mail)\{/g) ?? []
  assert.equal(animated.length, 4)
})
check("dark cards on black; the demos take no pointer", () => {
  assert.ok(/\.cmc-panel\{[^}]*background:#111113;border:1px solid rgba\(255,255,255,\.08\)/.test(coCss))
  assert.ok(/\.cmv-cc,\.cmv-mail,\.cmv-link\{[^}]*background:#1a1a1e/.test(coCss))
  assert.ok(/\.cmc-vis\{[^}]*pointer-events:none/.test(coCss) && /\.cmc-phone\{[^}]*pointer-events:none/.test(coCss) && /\.cmh-stage\{[^}]*pointer-events:none/.test(howCss))
  const buttons = co.match(/<button\b[^>]*>/g) ?? []
  assert.ok(buttons.length === 4 && buttons.every((b) => /role="tab"/.test(b)))
})
check("every demo loop is transform and opacity only", () => {
  for (const m of coCss.matchAll(/@keyframes ((?:cmv|cdx)-[a-z0-9-]+)\{([\s\S]*?\})\}/g)) assert.ok(onlyCompositor(m[2]), m[1])
})

check("registered in the push suite", () => {
  assert.ok(read("scripts/run-push-tests.mjs").includes('"tests/home-landing-commerce4.test.ts"'))
})

console.log(`\nhome-landing-commerce4: ${passed} checks passed`)

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
import { CheckoutScene, CHECKOUT_HEADING, CHECKOUT_STYLES, GUIDE } from "../components/marketing/home/checkout-scene"
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
check("half physical, half digital: the print and the e-book in How it works", () => {
  assert.deepEqual(HOW_PRODUCTS.map((p) => [p.id, p.kind]), [["print", "Physical"], ["ebook", "Digital"]])
  /* Changed on purpose (landing round 7): the owner asked for the products around the phone back ("bring back the axis products how they were before"), with a new set of pictures; tests/home-landing-r7-checkout.test.ts pins the ring. */
  assert.ok(/\/home\/commerce\/float-/.test(co))
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
/* Changed on purpose (landing round 5): no view timelines and no orbit. The phone is there from the first pixel and slides up once as the section comes in (one observer, a CSS transition); the cards come up over it with plain scroll. tests/home-landing-r5-checkout.test.ts pins the rest. */
check("the phone is there from the start and slides up once as the section comes in; the words follow", () => {
  assert.ok(!/view-timeline|animation-timeline|timeline-scope/.test(coCss))
  /* Changed on purpose (landing round 7): the phone rises from lower (34%) when its own box comes up the screen, so the rise is seen. */
  assert.ok(/\.cmc\[data-cmc-in-armed\]:not\(\[data-cmc-in\]\) \.cmc-rise\{transform:translate3d\(0,34%,0\)/.test(coCss))
  const n = CHECKOUT_HEADING.split(" ").length
  assert.equal((co.match(/class="cmc-w"/g) ?? []).length, n)
})
check("the tab cards come up over the phone with the page", () => {
  assert.ok(/\.cmc-cards\.cmc-cards\{[^}]*margin:calc\(64svh \* -1\) 0 0/.test(coCss) && /\.cmc-cards\.cmc-cards\{[^}]*z-index:5/.test(coCss))
})
check("the scroll never steps through a payment on the phone", () => {
  const phone = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
  assert.ok(!/Payment complete|Face ID|Double Click|cmc-sheet|data-step/.test(phone))
  /* Changed on purpose (landing round 7): the phone is the full page checkout for Maren Holt's pattern, its express Apple Pay button and its Pay. */
  assert.ok(words(phone).includes("Pay $12.00") && phone.includes(GUIDE.title))
})
check("one observer, no scroll listener, no layout read, no orbit", () => {
  const src = read(CO)
  assert.ok((src.match(/new IntersectionObserver/g) ?? []).length === 1 && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(/.test(src))
  /* Changed on purpose (landing round 7): the ring is back (cmc-orbit, cmc-lap), still without a blur filter. */
  assert.ok(!/filter:\s*blur/.test(src))
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
  /* Changed on purpose (landing round 7, the owner: not The Loop): Maren Holt's yarn kit ($64) and pattern ($12). */
  assert.equal(6400 + 1200, 7600)
  assert.equal(7600 + 600 + Math.round(7600 * 0.08), 8808)
  assert.ok(w.includes("$76.00") && w.includes("$6.00") && w.includes("$6.08") && w.includes("$88.08"))
  assert.ok(w.includes("New sale: $88.08") && w.includes("Sam Rivera bought Harbor yarn kit and 1 more for $88.08."))
  const catalog = read("lib/notify/templates/catalog.ts")
  assert.ok(catalog.includes("New sale: ${total}") && catalog.includes("bought ${thing}"))
})
check("One-tap payments: just the phone, with Apple Pay, Google Pay and Stripe, each lit in turn", () => {
  const panel = co.slice(co.indexOf('id="cmc-panel-tap"'), co.indexOf('id="cmc-panel-currency"'))
  assert.equal((panel.match(/class="cmc-phone"/g) ?? []).length, 1)
  assert.ok(!/cdx-/.test(panel))
  const w = words(panel)
  /* Changed on purpose (landing round 7, the owner: smoother and cleaner): a tap on the page's Apple Pay, the wallet's sheet, Done, Payment complete, beside the three ways it pays. */
  for (const t of ["Apple Pay", "Google Pay", "Stripe", "Confirm with Side Button", "Payment complete"]) assert.ok(w.includes(t), t)
  for (const k of ["pc-press", "ap-sheet", "ap-done", "pc-paid"]) assert.ok(onlyCompositor(keyframes(coCss, k)), k)
})
check("Local currencies: a nicer product, the cap, read in five currencies checkout charges in", () => {
  const panel = co.slice(co.indexOf('id="cmc-panel-currency"'), co.indexOf('id="cmc-panel-recover"'))
  /* Changed on purpose (landing round 7): Maren Holt's yarn kit in place of the print. */
  assert.ok(panel.includes("/home/commerce/maren-yarn-kit.webp") && words(panel).includes("Harbor yarn kit"))
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

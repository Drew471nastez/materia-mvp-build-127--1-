/**
 * LANDING ROUND 8, THE CHECKOUT SECTION (storelib.com home, the dark "Checkout that turns a tap into a sale")
 *
 * The owner sent a screen recording of the motion they want (a black section, a centred phone, real 3D
 * products floating around it at different depths and turning as the page scrolls, then a grid of dark
 * cards sliding up over the phone). What they asked for, pinned:
 *
 *   3D products        "3D products, not images; actual products, 3D, going around on an axis": renders of
 *                      real scanned models (and the tee, its white ground cut away) with transparent grounds,
 *                      at different depths in one CSS perspective, behind and in front of the phone, turning
 *                      on their own axis as the page scrolls (a scroll timeline of transform only)
 *   the cards slide up four dark cards in a grid come up over the phone one after another (a row to swipe
 *                      on a phone, native scroll snap); no tabs, so nothing is drawn on a tab switch
 *   what is sold       a t-shirt for the physical product, the Cine Tones LUT Pack (the cover "Sell what you
 *                      make" shows) for the digital one; no Nadia Brooks, no The Loop, anywhere in these files
 *   One-tap            the wallets' own buttons (Apple's logo, Google's G, a card) at one size, Stripe's
 *                      wordmark, the LUT pack, more motion (a light over Apple Pay, presses, checks, a ring)
 *   currencies         the shared products, the tee and the LUT pack, in every currency checkout charges in
 *   One page           on a phone the card draws the checkout as a phone lays it out, edge to edge
 *   reminder           round 7's smooth reminder, kept
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { CheckoutScene, CHECKOUT_STYLES, FLOATS, LUTS, PRICES, TEE } from "../components/marketing/home/checkout-scene"
import { EBOOK, EBOOK_COVER_CSS } from "../components/marketing/home/ebook-cover"
import { COMMERCE_CURRENCY_COUNT } from "../components/marketing/home/commerce-kit"
import { CURRENCY_FEE_RULES } from "../lib/payments/fees/currency-rules"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const CO = "components/marketing/home/checkout-scene.tsx"
const EB = "components/marketing/home/ebook-cover.tsx"
const src = read(CO)
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const co = renderToString(createElement(CheckoutScene))
const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")
const keyframes = (name: string) => css.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`))?.[1] ?? ""
const onlyCompositor = (body: string) => body.length > 0 && [...body.matchAll(/[{;]([a-z-]+):/g)].map((x) => x[1]).every((p) => p === "transform" || p === "opacity" || p === "animation-timing-function")
const card = (id: string) => co.slice(co.indexOf(`data-k="${id}"`), co.indexOf("</article>", co.indexOf(`data-k="${id}"`)))
/** A webp file with an alpha channel (VP8X with the alpha flag, or a lossless VP8L). */
const transparentWebp = (p: string) => {
  if (!existsSync(p)) return false
  const b = readFileSync(p)
  const kind = b.toString("ascii", 12, 16)
  return b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" && ((kind === "VP8X" && (b[20] & 0x10) !== 0) || kind === "VP8L")
}

console.log("\n3D products around the phone, turning as the page scrolls")
// Changed on purpose (landing round 9): the owner: "physical products and digital products, not only physical ones and random things like a camera or a plant", and "rotating on an axis ... they should not just be standing there". The scanned models are gone; a creator's own products go round the phone on a ring in one 3D space. tests/home-landing-r9-checkout.test.ts pins the ring.
const pics = FLOATS.filter((f) => f.img)
check("seven products; the photographs are transparent webps under 60 KB (cut out, never a framed picture)", FLOATS.length === 7 && pics.length === 3 && pics.every((f) => transparentWebp(`public/${f.img!.src}`) && statSync(`public/${f.img!.src}`).size < 60 * 1024))
check("  credited: the tee's Unsplash photograph; no scanned models", !/Poly Haven/.test(src) && /photo-1618354691373-d851c5c3a990/.test(src))
check("  no frame, no rounded card, no background behind them", !/\.cmc-pic\{[^}]*(border-radius|background|box-shadow)/.test(css))
check("at different depths: behind the phone and in front of it, in one perspective centred on it", /\.cmc-phone-wrap\{[^}]*perspective:calc\(var\(--pw\) \* var\(--pp\)\)/.test(css) && /\.cmc-world\{[^}]*transform-style:preserve-3d/.test(css) && /\.cmc-orbit\{[^}]*transform-style:preserve-3d/.test(css) && (co.match(/class="cmc-orbit"/g) ?? []).length === 1)
check("  the browser sorts the phone and the products by depth: one 3D space, the ring before the phone in it", /class="cmc-world"><div class="cmc-orbit"[\s\S]*<div class="cmc-rise">/.test(co) && !/\.cmc-(world|orbit|o)\{[^}]*(opacity|overflow|filter)/.test(css))
const turn = keyframes("cmc-orbit")
check("each goes round the phone's axis (rotateY), out to the ring, and is turned back to face the viewer: one transform", onlyCompositor(turn) && /from\{transform:rotateY\(calc\(var\(--a\) \+ 0deg\)\) translate3d\(0,calc\(var\(--pw\) \* var\(--y\)\),var\(--r\)\) rotateY\(calc\(var\(--a\) \* -1 - 0deg\)\)\}/.test(turn) && /to\{transform:rotateY\(calc\(var\(--a\) \+ 360deg\)\)/.test(turn))
// Changed on purpose (landing round 10): the track's height is the stage's and the cards' own (it holds both), so no height is written on it.
check("  the scroll turns the ring a little further: a scroll timeline over the scene's track (the compositor's work, nothing per frame in script)", /\.cmc-track\.cmc-track\{view-timeline:--cmc-t block\}/.test(css) && /\.cmc-orbit\{animation:cmc-spin linear both;animation-timeline:--cmc-t;animation-range:entry 0% exit 100%\}/.test(css) && onlyCompositor(keyframes("cmc-spin")))
check("  it turns by itself either way, paused off screen", /\.cmc-o\{animation:cmc-orbit \d+s linear infinite;animation-play-state:paused\}/.test(css) && /\.cmc-stage\[data-commerce-live\] \.cmc-o\{animation-play-state:running;will-change:transform\}/.test(css))
check("  dimmer behind the phone (opacity on the face, in step with the turn)", onlyCompositor(keyframes("cmc-depth")) && /50%\{opacity:\.38\}/.test(keyframes("cmc-depth")))
check("  no blur, no scroll listener, no rAF, no layout read", !/filter:\s*blur/.test(css) && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop/.test(code(src)))
check("on a phone five, smaller; the tote and the Notion template only on a computer", FLOATS.filter((f) => f.m).length === 5 && FLOATS.filter((f) => f.m).every((f) => f.m!.s < f.d.s) && /@media \(max-width:899px\)\{[\s\S]*?\.cmc-o:not\(\[data-m\]\)\{display:none\}/.test(css))
check("reduced motion: they stand still on the ring, the finished scene", /\.cmc-o\{[^}]*transform:rotateY\(calc\(var\(--a\) \+ 0deg\)\)/.test(css) && /\.cmc-stage \*\{transition:none!important;animation:none!important\}/.test(css))

console.log("\nThe cards slide up over the phone")
check("four cards in a grid (no tabs, no buttons, no autoplay)", (co.match(/<article class="cmc-card"/g) ?? []).length === 4 && !/role="tab|<button/.test(co) && !/setTimeout|setInterval|useState/.test(code(src)))
check("  each with its label, title, line and demo", ["Built to convert", "One-tap payments", "Local currencies", "Checkout reminders"].every((l) => co.includes(`<span class="cmc-card-l">${l}</span>`)) && (co.match(/class="cmc-vis"/g) ?? []).length === 4)
check("  they come up one after another as the grid reaches the screen (transform and opacity)", /\.cmc-card\{transition:opacity \.7s ease,transform 1s cubic-bezier\(\.16,1,\.3,1\);transition-delay:calc\(var\(--ci\) \* \.09s\)\}/.test(css) && /\.cmc\[data-cmc-over-armed\]:not\(\[data-cmc-over\]\) \.cmc-card\{opacity:0;transform:translate3d\(0,96px,0\)/.test(css))
// Changed on purpose (landing round 9): 56svh with the one screen hold; the ring cannot fade (opacity would flatten its 3D space), the phone alone dims.
// Changed on purpose (landing round 10): the cards start 44svh under the stage's foot inside the same track (the same 56svh overlap); the phone and the ring step back and go soft under them on the timeline (the wrap fades, not the 3D space), no veil.
check("  over the phone: pulled 56svh up, above it, the phone dimmed under", /\.cmc-cards\{position:relative;z-index:5;/.test(css) && /\.cmc-track > \.cmc-cards\{margin-top:calc\(100svh - 56svh\)\}/.test(css) && /@keyframes cmc-recede\{from\{opacity:1;transform:scale\(1\)\}to\{opacity:0\.55;/.test(css))
check("two across on a computer; a row to swipe on a phone, native scroll snap that never takes a vertical swipe", /\.cmc-bento\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:16px\}/.test(css) && /\.cmc-bento\{display:flex;[^}]*overflow-x:auto;[^}]*scroll-snap-type:x mandatory;overscroll-behavior-x:contain;[^}]*touch-action:pan-x pan-y\}/.test(css) && /scroll-snap-align:start/.test(css))
check("each card's demo runs only while that card is on screen (its own observer, no React state)", /function Card\([\s\S]*?useCommerceLive<HTMLElement>\("0px 0px", false\)/.test(src) && /const ON = "\.cmc-card\[data-commerce-live\]"/.test(src) && !/\[data-commerce-live\] \.cmc-panel/.test(css))
check("four facts under the cards, each true of checkout (no invented metrics)", (co.match(/class="cmc-fact"/g) ?? []).length === 4 && ["1 page", "1 tap", `${COMMERCE_CURRENCY_COUNT} currencies`, "1 hour"].every((t) => words(co).includes(t)) && !/%</.test(co.slice(co.indexOf("cmc-facts"))))
check("the cards and facts sit in the shared content box", /max-width:var\(--home-max,2020px\)/.test(css) && /\.cmc-cards-in\{[^}]*padding:clamp\(72px,10vh,120px\) var\(--edge\)/.test(css))

console.log("\nWhat is sold: a t-shirt and the Cine Tones LUT Pack")
check("the LUT pack is the digital product, Mara Quinn's, on the cover Sell what you make shows", LUTS.title === "Cine Tones LUT Pack" && EBOOK.title === LUTS.title && EBOOK.author === "Mara Quinn" && /lut-still\.webp/.test(read(EB)) && /\.ebc-name\{[^}]*font-weight:800/.test(EBOOK_COVER_CSS) && co.includes('<span class="ebc-tag">LUT Pack</span>'))
check("  the cover is built here, not imported from everything-in-one-place", !/everything-in-one-place/.test(code(src) + code(read(EB))))
check("the physical product is a t-shirt", TEE.title === "Midnight Studio Tee" && words(co).includes("Midnight Studio Tee") && existsSync("public/home/commerce/tee-thumb.webp"))
check("no Nadia Brooks, no The Loop, no Maren Holt's pattern anywhere in these files or the markup", !/Nadia|The Loop|LaSalle|guide-loop|Maren|Harbor|knitting/.test(src + read(EB) + words(co)) && !existsSync("public/home/commerce/guide-loop.webp") && !existsSync("public/home/commerce/creator-nadia.webp"))
check("the phone's checkout sells the LUT pack: Pay Mara Quinn $29.00, its cover in the order line", words(co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))).includes("Pay Mara Quinn $29.00") && /class="pc-thumb"><span class="ebc /.test(co))
check("none of this round's banned samples", !/LaSalle at dusk|Nails by Bea|Nordline Coffee|Charla Circle|Static Bloom|Wildcamp|drone|enthusiasts/i.test(words(co) + src))

console.log("\nOne-tap payments: the wallets' own buttons, aligned, with more motion")
const tap = card("tap")
check("Apple Pay: black, Apple's logo (its own path) and Pay", /class="tp-btn tp-apple"/.test(tap) && /M12\.152 6\.896c-\.948 0-2\.415-1\.078-3\.96-1\.04/.test(tap) && /\.tp-btn\{[^}]*background:#000/.test(css))
check("Google Pay: black, Google's G in its four colours, and Pay", /class="tp-btn tp-gpay"/.test(tap) && ["#EA4335", "#4285F4", "#FBBC05", "#34A853"].every((c) => tap.includes(c)))
check("cards: the card with Visa, Mastercard and Amex; Stripe's own wordmark under them", /class="tp-btn tp-card"/.test(tap) && /cb-visa/.test(tap) && /cb-mc/.test(tap) && /cb-amex/.test(tap) && /aria-label="Stripe"/.test(tap) && /viewBox="0 120 640 272"/.test(tap) && !/cmv-stripe/.test(css))
check("  one height and one corner for the three, the marks sized in one place", /\.tp-btn\{position:relative;display:flex;align-items:center;justify-content:center;gap:\.28em;height:3\.5em;border-radius:\.7em/.test(css) && /\.tp-apple \.mk-apple\{/.test(css) && /\.tp-gpay \.mk-g\{/.test(css))
check("  the same marks on the checkout's express buttons", (co.match(/class="mk-g"/g) ?? []).length >= 3 && /\.cdx-xp \.mk-apple\{/.test(css))
check("the phone pays the LUT pack with Apple Pay", words(tap).includes(`${LUTS.price} paid. Opening your receipt`) && words(tap).includes("Pay Mara Quinn"))
const tapK = ["tp-shine", "tp-ring", "tp-press1", "tp-press2", "tp-press3", "tp-ok1", "tp-ok2", "tp-ok3", "pc-press", "ap-sheet", "ap-done", "pc-paid"]
check("motion: a light over Apple Pay, its press with the phone's tap, a check once paid, then the ring to Google Pay and the card", tapK.every((k) => onlyCompositor(keyframes(k))) && /translate3d\(0,var\(--tp-step\),0\)/.test(keyframes("tp-ring")))

console.log("\nLocal currencies: the shared products")
const cur = card("currency")
check(`the title says ${COMMERCE_CURRENCY_COUNT} currencies, from the code`, words(cur).includes(`Local in ${COMMERCE_CURRENCY_COUNT} currencies`))
check("every currency checkout charges in, each with its flag", PRICES.length === COMMERCE_CURRENCY_COUNT && PRICES.every((p) => p.code in CURRENCY_FEE_RULES && cur.includes(`/flags/${p.flag}.svg`)))
check("the tee and the LUT pack, each priced in each", cur.includes("/home/commerce/tee-thumb.webp") && /class="ebc /.test(cur) && PRICES.every((p) => cur.includes(p.tee) && cur.includes(p.luts)))
// Changed on purpose (landing round 9): the owner: the currencies "should change more smoothly": the marker also glides across the loop's seam, so it has two more stops (the seam's middle, at each end).
check("  one reading at a time in its slot, the marker stepping along (transform and opacity)", onlyCompositor(keyframes("cv-cyc")) && onlyCompositor(keyframes("cv-hl")) && (keyframes("cv-hl").match(/translate3d\(\d+%,0,0\)/g) ?? []).length === PRICES.length + 2)

console.log("\nOne page, then paid: smooth and clean on a phone")
const conv = card("convert")
// Changed on purpose (landing round 9): the owner: on a phone the picture "should be like on desktop, 4:3", "adapted, not shrunk": the same window on every screen, drawn larger than its box on a phone; the phone layout of round 8 is gone.
// Changed on purpose (landing round 10): the phone's 4:3 box first undoes the computer's capped height.
check("the website checkout's window on every screen; on a phone drawn larger than its 4:3 box and cut by it", /class="cdx"/.test(conv) && !/class="mcx"/.test(co) && !/\.mcx/.test(css) && /@media \(max-width:899px\)\{[\s\S]*?\.cmc-vis\{height:auto;aspect-ratio:4\/3;[\s\S]*?\.cdx\{left:5%;right:auto;top:8%;bottom:-12%;width:132%;/.test(css))
// Changed on purpose (landing round 9): no scaled phone page; the window's own unit is larger on a phone (a design width of 640, not 880).
check("  on a phone the window is laid out again at a design width of 640, not scaled down", /\.cdx-win\{--u:calc\(100cqw \/ 640\);/.test(css) && /\.cdx-grid\{grid-template-columns:230u 1fr\}/.test(read(CO)))
// Changed on purpose (landing round 9): one loop for every screen: the window's.
check("  its loop: typed, down to the shipping, down to the card, Pay, paid, back up under the paid screen (transform and opacity)", ["cdx-scroll", "cdx-stick", "cdx-press", "cdx-paid", "cdx-v-email", "cdx-v-card"].every((k) => onlyCompositor(keyframes(k))) && /100%\{transform:translate3d\(0,0,0\)\}/.test(keyframes("cdx-scroll")))
check("the sums add up: $32 + $29, $6 shipping, 8% tax, $71.88", 3200 + 2900 === 6100 && 6100 + 600 + Math.round(6100 * 0.08) === 7188 && ["$61.00", "$6.00", "$4.88", "$71.88"].every((t) => words(conv).includes(t)))

console.log("\nCheckout reminders: round 7's, kept")
// Changed on purpose (landing round 9): the owner: in the reminder "put the black t-shirt example".
check("the rail, the email, the button, one fade; the black t-shirt in it", ["cmv-rec", "cmv-fill", "cmv-st1", "cmv-st2", "cmv-st3", "cmv-mail", "cmv-btn"].every((k) => onlyCompositor(keyframes(k))) && words(card("recover")).includes("You left Midnight Studio Tee at checkout"))

console.log("\nCopy")
const all = words(co)
check("no banned words, no em dash, no fans", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all) && !/—/.test(all) && !/\bfans?\b/i.test(all))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r8-checkout.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

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
check("seven objects, each a transparent webp under 60 KB (a render or a cut out photograph, never a framed picture)", FLOATS.length === 7 && FLOATS.every((f) => transparentWebp(`public/${f.src}`) && statSync(`public/${f.src}`).size < 60 * 1024))
check("  credited: Poly Haven's scanned models (CC0) and the tee's Unsplash photograph", /Poly Haven \(CC0\)/.test(src) && ["Camera_01", "fishermans_hat", "desk_lamp_arm_01", "ceramic_vase_02", "portable_cassette_player", "potted_plant_02"].every((m) => src.includes(m)) && /photo-1618354691373-d851c5c3a990/.test(src))
check("  no frame, no rounded card, no background behind them", !/\.cmc-pic\{[^}]*(border-radius|background|box-shadow)/.test(css))
check("at different depths: behind the phone and in front of it, in one perspective centred on it", FLOATS.some((f) => f.front) && FLOATS.some((f) => !f.front) && FLOATS.some((f) => f.d.z[1] < -0.5) && FLOATS.some((f) => f.d.z[1] > 0.3) && /\.cmc-orbit\{[^}]*perspective:calc\(var\(--pw\) \* 3\.2\)/.test(css) && (co.match(/class="cmc-floats cmc-front"/g) ?? []).length === 1)
check("  the front layer sits over the phone, the back one under it", /\.cmc-floats\{position:absolute;z-index:1;/.test(css) && /\.cmc-front\{z-index:3\}/.test(css) && /\.cmc-rise\{position:relative;z-index:2\}/.test(css))
const turn = keyframes("cmc-turn")
check("each turns on its own axis (rotateY), leans and swings in depth over the scroll: one transform", onlyCompositor(turn) && /rotateY\(calc\(var\(--ry0\) \* 1 \+ var\(--ry1\) \* 0\)\)/.test(turn) && /rotateY\(calc\(var\(--ry0\) \* 0 \+ var\(--ry1\) \* 1\)\)/.test(turn) && /translate3d\(/.test(turn) && FLOATS.every((f) => f.d.ry[0] * f.d.ry[1] < 0))
check("  driven by a scroll timeline over the scene's track (the compositor's work, nothing per frame in script)", /@supports \(animation-timeline:view\(\)\)\{\s*\.cmc\[data-story-section\] > \.cmc-track\.cmc-track\{view-timeline:--cmc-t block\}\s*\.cmc-o\{animation:cmc-turn linear both;animation-timeline:--cmc-t;animation-range:entry 0% exit 100%\}/.test(css))
check("  where scroll timelines are missing, a slow loop instead, paused off screen", /@supports not \(animation-timeline:view\(\)\)\{\s*\.cmc-o\{animation:cmc-turn 16s ease-in-out infinite alternate both;[^}]*animation-play-state:paused\}\s*\.cmc-stage\[data-commerce-live\] \.cmc-o\{animation-play-state:running\}/.test(css))
check("  a small float on top, paused off screen; the nearer the object, the more it rises", /\.cmc-stage\[data-commerce-live\] \.cmc-bob\{animation-play-state:running\}/.test(css) && onlyCompositor(keyframes("cmc-bob")) && FLOATS.every((f) => FLOATS.every((g) => g.d.z[1] <= f.d.z[1] || g.d.dy >= f.d.dy - 1e-9)))
check("  no blur, no scroll listener, no rAF, no layout read", !/filter:\s*blur/.test(css) && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop/.test(code(src)))
check("on a phone five, smaller, at the phone's edges; the far two only on a computer", FLOATS.filter((f) => f.m).length === 5 && FLOATS.filter((f) => !f.m).every((f) => f.d.z[1] < -0.5) && /@media \(max-width:899px\)\{[\s\S]*?\.cmc-o:not\(\[data-m\]\)\{display:none\}/.test(css))
check("reduced motion: they stand still at their middle pose", /\.cmc-o\{[^}]*transform:translate3d\(calc\(var\(--pw\) \* \(var\(--x\) \+ var\(--dx\) \* 0\)\)/.test(css) && /\.cmc-stage \*\{transition:none!important;animation:none!important\}/.test(css))

console.log("\nThe cards slide up over the phone")
check("four cards in a grid (no tabs, no buttons, no autoplay)", (co.match(/<article class="cmc-card"/g) ?? []).length === 4 && !/role="tab|<button/.test(co) && !/setTimeout|setInterval|useState/.test(code(src)))
check("  each with its label, title, line and demo", ["Built to convert", "One-tap payments", "Local currencies", "Checkout reminders"].every((l) => co.includes(`<span class="cmc-card-l">${l}</span>`)) && (co.match(/class="cmc-vis"/g) ?? []).length === 4)
check("  they come up one after another as the grid reaches the screen (transform and opacity)", /\.cmc-card\{transition:opacity \.7s ease,transform 1s cubic-bezier\(\.16,1,\.3,1\);transition-delay:calc\(var\(--ci\) \* \.09s\)\}/.test(css) && /\.cmc\[data-cmc-over-armed\]:not\(\[data-cmc-over\]\) \.cmc-card\{opacity:0;transform:translate3d\(0,96px,0\)/.test(css))
check("  over the phone: pulled 64svh up, above it, the phone and objects dimmed under", /\.cmc-cards\.cmc-cards\{[^}]*z-index:5;[^}]*margin:calc\(64svh \* -1\) 0 0/.test(css) && /\.cmc\[data-cmc-over\] \.cmc-orbit\{opacity:\.25\}/.test(css))
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
check("  one reading at a time in its slot, the marker stepping along (transform and opacity)", onlyCompositor(keyframes("cv-cyc")) && onlyCompositor(keyframes("cv-hl")) && (keyframes("cv-hl").match(/translate3d\(\d+%,0,0\)/g) ?? []).length === PRICES.length)

console.log("\nOne page, then paid: smooth and clean on a phone")
const conv = card("convert")
check("on a computer the website checkout's window; on a phone the checkout as a phone lays it out, edge to edge", /class="cdx"/.test(conv) && /class="mcx"/.test(conv) && /\.mcx\{display:none;position:absolute;inset:0;/.test(css) && /@media \(max-width:899px\)\{[\s\S]*?\.cdx\{display:none\}\s*\.mcx\{display:block\}/.test(css))
check("  the phone page at 393px, scaled to the card in one transform", /\.mcx-ui\{position:absolute;left:0;top:0;width:393px;[^}]*transform-origin:0 0;transform:scale\(var\(--k\)\)/.test(css) && /--k:tan\(atan2\(100cqw,393px\)\)/.test(css))
check("  its loop: down to the form, typed, down to the card, Pay, paid, back up under the paid screen (transform and opacity)", ["mcx-scroll", "mcx-press", "mcx-touch", "mcx-paid", "mcx-v-email", "mcx-v-card"].every((k) => onlyCompositor(keyframes(k))) && /100%\{transform:translate3d\(0,0,0\)\}/.test(keyframes("mcx-scroll")))
check("the sums add up: $32 + $29, $6 shipping, 8% tax, $71.88", 3200 + 2900 === 6100 && 6100 + 600 + Math.round(6100 * 0.08) === 7188 && ["$61.00", "$6.00", "$4.88", "$71.88"].every((t) => words(conv).includes(t)))

console.log("\nCheckout reminders: round 7's, kept")
check("the rail, the email, the button, one fade; the LUT pack in it", ["cmv-rec", "cmv-fill", "cmv-st1", "cmv-st2", "cmv-st3", "cmv-mail", "cmv-btn"].every((k) => onlyCompositor(keyframes(k))) && words(card("recover")).includes("You left Cine Tones LUT Pack at checkout"))

console.log("\nCopy")
const all = words(co)
check("no banned words, no em dash, no fans", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all) && !/—/.test(all) && !/\bfans?\b/i.test(all))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r8-checkout.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

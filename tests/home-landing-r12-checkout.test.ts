/**
 * LANDING ROUND 12, THE CHECKOUT SECTION (storelib.com home, the dark "Checkout that turns a tap into a sale")
 *
 * The owner, after round 11:
 *   1. "Bring back the ones who almost bought": get rid of the Recovered chart and its stats entirely; and the phone
 *      mockup is too visible behind the cards: when the cards arrive it must be gone, at every width
 *   2. "One page, then paid": on phones its picture must be 4:3, like on a computer
 *   3. "Apple Pay and Google Pay, built in": a white bar at the foot of the phone mockup
 *   4. "Local in 7 currencies": its content is cut off by its container
 *   5. the section must not cost frames
 *   and from the coordinator: totes are never on the page now; the ring's tote is a beanie
 *
 *   the phone         fades out whole between 48svh and 80svh into the hold (cmc-out on the phone itself), its
 *                     blurred copy (soft-phone.webp) gone; its black shade, which keeps the round 11 fix (no product
 *                     across the screen), fades only after the phone has gone, 80 to 86svh
 *   the reminder      the rail and the email, centred; no Recovered tile, no chart, no amounts, no wipe
 *   One-tap           no home indicator on the dark phone (it was the white bar, #f4f4f5 over the Apple Pay
 *                     sheet), and the dark screen's ground is the page's own dark, so nothing light shows under it
 *   Built to convert  on a phone the picture is 4:3 (32 x 24 em) and the window scrolls further to bring Pay up
 *   currencies        every column may shrink and a tile's square is drawn by padding, its photo or cover filling
 *                     it from outside the flow, so nothing in it can make the tiles taller than the picture
 *
 * Measured on the dev server with scratch Playwright scripts (numbers in the round's report).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { CheckoutScene, CHECKOUT_STYLES, FLOATS, SOFT } from "../components/marketing/home/checkout-scene"

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
const src = read(CO)
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const co = renderToString(createElement(CheckoutScene))
const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")
const card = (id: string) => co.slice(co.indexOf(`data-k="${id}"`), co.indexOf("</article>", co.indexOf(`data-k="${id}"`)))
const stage = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
const tl = css.slice(css.indexOf("@supports (animation-timeline:view()){"), css.indexOf(" * The cards: no ground of their own"))
const phoneCss = css.slice(css.lastIndexOf("@media (max-width:899px){", css.indexOf(".cmc-bento{grid-template-columns:minmax(0,1fr)")), css.indexOf("@keyframes cdx-scroll"))

console.log("\n1. The reminder card: no Recovered tile; the phone gone behind the cards")
check("no Recovered tile, chart, amount or count in the markup", !/cmv-got|cmv-chart|cmv-wipe|cmv-n0|cmv-n1/.test(card("recover")) && !/Recovered|\$384|\$416|came back|last 30 days/.test(words(card("recover"))))
check("  and none of it left in the styles or the loop", !/cmv-got|cmv-chart|cmv-wipe|cmv-n0|cmv-n1|cmv-area/.test(css) && !/REC_LINE|REC_PREV|REC_TODAY|REC_BEFORE|REC_AFTER/.test(code(src)))
check("  the rail and the email stay, the email centred across the picture", /class="cmv-tl"/.test(card("recover")) && /class="cmv-mail"/.test(card("recover")) && /\.cmv-mail\{position:absolute;left:8em;right:8em;/.test(css) && /\.cmv-mail\{left:1\.6em;right:1\.6em;/.test(phoneCss))
check("the phone has no blurred copy any more (no soft-phone picture, no SOFT.phone, no half fade in)", !/soft-phone|cmc-phone-soft/.test(co) && !/cmc-phone-soft|cmc-in-half/.test(css) && !("phone" in SOFT) && !existsSync("public/home/commerce/soft-phone.webp") && !/"phone"/.test(read("scripts/bake-checkout-soft.mjs")))
check("  the phone itself fades to nothing from 48 to 80svh into the hold", /\.cmc-rise > \.cmc-phone\{animation:cmc-out linear both;animation-timeline:--cmc-t;animation-range:contain 48svh contain 80svh\}/.test(tl) && /@keyframes cmc-out\{from\{opacity:1\}to\{opacity:0\}\}/.test(css))
check("  its shade goes only after it, 80 to 86svh: never a fading phone over a product (the round 11 fix kept)", /\.cmc-shade\{animation:cmc-out linear both;animation-timeline:--cmc-t;animation-range:contain 80svh contain 86svh\}/.test(tl) && /<div class="cmc-rise"><span class="cmc-shade" aria-hidden="true"><\/span><div class="cmc-phone"/.test(stage))
check("  the ring stays under the phone and out of its world", /\.cmc-ring\{position:absolute;z-index:2;/.test(css) && /\.cmc-phone-wrap\{position:absolute;z-index:3;/.test(css) && !/class="cmc-o"/.test(stage.slice(stage.indexOf('class="cmc-phone-wrap"'))))

console.log("\n2. Built to convert: 4:3 on a phone")
check("on a phone its picture is 4:3, drawn 32 x 24 em", /\.cmc-card\[data-k=convert\] \.cmc-vis\{aspect-ratio:4\/3\}/.test(phoneCss) && /\.cmc-card\[data-k=convert\] \.cmc-vis-in\{height:24em\}/.test(phoneCss))
check("  the window scrolls further to bring Pay up in the shorter view", /--s2:calc\(1250\*var\(--u\)\)/.test(phoneCss))

console.log("\n3. One-tap: no white bar at the phone's foot")
const tap = card("tap")
check("the dark phone draws no home indicator; the light one keeps it", !/cmc-home/.test(tap) && /class="cmc-home"/.test(stage))
check("  the dark screen's ground is the page's dark, and no light home bar rule is left", /class="cmc-screen" data-dark="true"/.test(tap) && /\.cmc-screen\[data-dark\]\{background:#111113\}/.test(css) && !/\.cmc-ui\[data-dark\] \.cmc-home/.test(css))

console.log("\n4. Local in 7 currencies: nothing grows past its picture")
check("columns may shrink", /\.cv-tiles\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/.test(css) && /\.cv-tile\{[^}]*min-width:0/.test(css) && /\.cv-head\{[^}]*min-width:0/.test(css) && /\.cv-for\{[^}]*min-width:0/.test(css))
check("  a tile's square drawn by padding, its photo and cover filling it out of the flow", /\.cv-pic\{position:relative;display:block;width:100%;height:0;padding-bottom:100%;/.test(css) && /\.cv-pic img\{position:absolute;inset:0;/.test(css) && /\.cv-pic \.ebc\{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto\}/.test(css))

console.log("\n5. Cost: no filters, nothing blurred in the browser, every loop paused off screen")
check("no filter, backdrop-filter or will-change on a filter anywhere in the section's styles", !/(^|[;{])\s*(-webkit-)?(backdrop-)?filter\s*:/m.test(css))
check("the ring's loops are paused until the stage is live", /\.cmc-o\{animation:cmc-orbit 44s linear infinite;animation-play-state:paused\}/.test(css) && /\.cmc-stage\[data-commerce-live\] \.cmc-o\{animation-play-state:running;will-change:transform\}/.test(css))
check("a card's demo runs only while that card is live", /\.cmc-card\[data-commerce-live\] :where\(/.test(css))
check("the scroll timeline animations apply only while the section is within half a screen (data-cmc-near)", ["cmc-world", "cmc-phone-wrap", "cmc-ring", "cmc-sharp", "cmc-soft", "cmc-shade", "cmc-copy", "cmc-orbit", "cmc-face", "cmc-w"].every((k) => new RegExp(`\\.cmc\\[data-cmc-near\\] \\.${k}\\{animation:`).test(tl)) && !/\n\s*\.cmc-(world|phone-wrap|ring|sharp|soft|shade|copy|orbit|w)\{animation:/.test(tl) && /\.cmc\[data-cmc-near\] \.cmc-w\[data-w="0"\]\{animation-range:/.test(tl))
check("  the layout of the hold stays put whatever the attribute: the sticky stage and the cards' pull are not gated", /\n\s*\.cmc-stage\{position:sticky;top:0\}/.test(tl) && /\n\s*\.cmc-track > \.cmc-cards\{margin-top:calc\(100svh - 56svh\)\}/.test(tl))
check("  the ring wakes half a screen ahead and its clock loops pause once the cards cover the stage", /useCommerceLive<HTMLDivElement>\("50% 0px", false\)/.test(src) && /\.cmc:not\(\[data-cmc-covered\]\) \.cmc-stage\[data-commerce-live\] \.cmc-o\{animation-play-state:running;will-change:transform\}/.test(css) && /<span class="cmc-cover-mark" aria-hidden="true"><\/span><div class="cmc-cards-in">/.test(co))
check("  one observer for both, with a half screen of margin; no scroll listener, no rAF", /\{ rootMargin: "50% 0px" \}/.test(src) && (src.match(/new IntersectionObserver/g) ?? []).length === 2 && !/addEventListener\("scroll"|requestAnimationFrame/.test(src))
check("a cover drawn at thumbnail size takes the 240px still, not the 720px one", existsSync("public/home/everything/lut-still-240.webp") && statSync("public/home/everything/lut-still-240.webp").size < 12 * 1024 && (src.match(/<EbookCover small \/>/g) ?? []).length === 4 && /class="pc-thumb"><span class="ebc "><img class="ebc-img" src="\/home\/everything\/lut-still-240\.webp" alt="" width="240" height="135"/.test(co))

console.log("\n6. No tote on the page: the ring's third photograph is a beanie")
check("the ring has a beanie and no tote", FLOATS.some((f) => f.id === "beanie" && f.kind === "physical" && f.img?.src === "/home/commerce/obj-beanie.webp") && !FLOATS.some((f) => /tote/.test(f.id)))
check("  no tote anywhere in the section: markup, code, soft copies or the bake script", !/tote/i.test(co) && !/tote/i.test(code(src)) && !/tote/i.test(read("scripts/bake-checkout-soft.mjs")) && !existsSync("public/home/commerce/obj-tote.webp") && !existsSync("public/home/commerce/soft-tote.webp"))
check("  its picture and blurred copy are small webp files", statSync("public/home/commerce/obj-beanie.webp").size < 60 * 1024 && statSync("public/home/commerce/soft-beanie.webp").size < 4 * 1024 && SOFT.beanie?.w === 112 && SOFT.beanie?.h === 126 && statSync("public/home/commerce/obj-beanie.webp").size < 16 * 1024)
check("  and no ceramics or memberships brought in instead", !/ceramic|membership|mug\b/i.test(words(co)))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

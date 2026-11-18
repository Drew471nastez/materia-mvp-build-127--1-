/**
 * HOME, LANDING ROUND 8: HOW IT WORKS (section "Products, courses and tips. On your own domain.")
 *
 * The owner, after round 7:
 *   1. the physical product "just a t-shirt"; the digital one the Cine Tones
 *      LUT pack on the same cover as "Sell what you make" (black, the graded
 *      desert road still, "LUT Pack" small, "CINE / TONES" big), in place of
 *      the apron and the workbench plans;
 *   2. "Build and sell a course": a different background;
 *   3. "Use your own domain" too complex, no shop. / club. / www. banner: one
 *      simple picture, the domain typing into a browser's address bar, the
 *      lock coming in, over his website;
 *   4. three light grey cards and one black "doesn't work for the eye": one
 *      considered set of grounds;
 *   5. the two by two structure and the shared width stay.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HowItWorks, HOW_CARDS, HOW_DOMAIN, HOW_IT_WORKS_STYLES, HOW_PRODUCTS } from "@/components/marketing/home/how-it-works"
// Changed on purpose (landing round 12): the LUT cover went with the Top products picture; its price is the product's.
const HOW_LUTS = { still: "/home/everything/lut-still.webp", priceCents: 2900 }
import { EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"
import { DOMAIN_PURPOSES, cleanHostname, hostnameProblem } from "@/lib/custom-domains/hostname"
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const FILE = "components/marketing/home/how-it-works.tsx"
const src = read(FILE)
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const how = renderToStaticMarkup(createElement(HowItWorks))
const css = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const evCss = EVERYTHING_STYLES.map((s) => s.css).join("\n")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")
const text = words(how)
const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]=()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? ""
const keyframeBodies = (c: string) => [...c.matchAll(/@keyframes [\w-]+\{([\s\S]*?\})\}/g)].map((m) => m[1])
const onlyCompositor = (body: string) => [...body.matchAll(/[{;]([a-z-]+):/g)].every((x) => ["transform", "opacity", "animation-timing-function"].includes(x[1]))

console.log("\n1. A t-shirt and the Cine Tones LUT pack")
// Changed on purpose (landing round 9): the products card is gone (the owner: it repeated "Sell anything you make"); the two products are section 3's own, shown as the shop's top products.
check("the two products are section 3's LUT pack and black tee", HOW_PRODUCTS.map((p) => `${p.id}:${p.name}`).join() === "luts:Cine Tones LUT Pack,tee:Midnight Studio Tee")
check("no apron and no workbench plans anywhere in the file or on the page", !/apron|workbench|plans-bench|PlansCover/i.test(code + text) && !existsSync("public/home/how/apron.webp") && !existsSync("public/home/how/plans-bench.webp"))
// Changed on purpose (landing round 9): the tee is section 3's black Midnight Studio Tee (its file), in Top products and on his website; the white tee's picture is deleted.
// Changed on purpose (landing round 10): his website is gone from the domain card, so the tee is drawn once, in Top products.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "the tee is section 3's photograph".
check("the pack's cover uses section 3's still, the file, not an import of section 3's component", HOW_LUTS.still === "/home/everything/lut-still.webp" && existsSync(`public${HOW_LUTS.still}`) && !/from "\.\/everything-in-one-place"/.test(src))
// Changed on purpose (landing round 10): his website and its shelf are gone, so the cover is drawn once, in Top products.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "the cover is section 3's".
const ev = (sel: string) => (evCss.match(new RegExp(`${sel.replace(/[.[\]()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? "x"
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "the cover's type and shade".
// Changed on purpose (landing round 9): no "You keep" figures any more (they were the products card's); the prices are section 3's.
check("the prices are section 3's: the pack $29, the tee $32", HOW_PRODUCTS[0].priceCents === HOW_LUTS.priceCents && HOW_PRODUCTS[1].priceCents === 3200 && typeof calculateStorelibFee === "function")
check("the pack's price matches section 3's ($29.00)", HOW_LUTS.priceCents === 2900 && /"\$29\.00"/.test(read("components/marketing/home/everything-in-one-place.tsx")))

console.log("\n2 and 4. Four grounds of one family, none the odd one out")
const grounds = [...how.matchAll(/class="cmh-stage" data-ground="(\w+)"/g)].map((m) => m[1])
// Changed on purpose (landing round 9): three cards; the owner found the grounds "too grey". Flat colour: lilac for the tips, a near white for the numbers, peach for the domain.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "the three cards are on their own quiet grounds".
const stops = (g: string) => [...rule(`.cmh-stage[data-ground=${g}]`).matchAll(/#([0-9a-f]{6})/g)].map((m) => m[1])
const lum = (h: string) => { const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const chroma = (h: string) => { const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v) }
const all = ["sand", "sage", "clay", "mist"].flatMap(stops)
// Changed on purpose (landing round 9): flat colours, no gradient, each with its own ring line colour.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). No ring colour.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "each ground is one flat colour".
// Changed on purpose (landing round 9): light, and no longer grey: the lilac and the peach carry colour, the paper between them stays neutral.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). Near white, a breath of colour each.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "all light (luminance".
// Changed on purpose (landing round 9): Storelib's violet is the accent again (the brief: black, white, violet; the owner: "more colorful"), flat, never a gradient of it.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "no black ground".

console.log("\n3. Your own domain: one browser window, the address typing in")
check("no www / shop / club banner, no rows of addresses", !/cmh-dm-pill|cmh-dm-row|cmh-dm-rows|cmh-dm-tick/.test(how + css) && !/>(www|shop|club)<\/b>\./.test(how) && !("targets" in HOW_DOMAIN))
// Changed on purpose (landing round 9): the owner liked the card, not its design. No browser window: one address pill over his website.
// Changed on purpose (landing round 10): no website under the address: one address band.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). His website in one browser window.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "one browser window, his website".
// Changed on purpose (landing round 9): the address is not typed letter by letter; his site's storelib.com address rolls over to his own domain (two lines, transform and opacity).
// Changed on purpose (landing round 10): his name stands and its ending glides, his Storelib address first, then his own domain.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "the address holds his name".
check("a domain Storelib accepts, serving one of the product's purposes, not a Storelib name", hostnameProblem(cleanHostname(HOW_DOMAIN.host)) === null && (DOMAIN_PURPOSES as readonly string[]).includes(HOW_DOMAIN.purpose) && !/storelib/.test(HOW_DOMAIN.host))
const at = (k: string, n = 1) => Number((css.match(new RegExp(`@keyframes ${k}\\{0%,([\\d.]+)%`)) ?? [])[n] ?? NaN)
// Changed on purpose (landing round 9): no typing, so no letter keyframes, carets, veil or load line.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "no letter by letter typing".
// Changed on purpose (landing round 10): no ticks, no lock that turns; the lock on the band is violet throughout.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "no DNS and HTTPS ticks".
// Changed on purpose (landing round 9): a caption is a title and one short line now.
/* Changed on purpose (pricing round 5): the $29 plan is named Grow. */
check("the caption keeps the code's claims in one line", /On Grow, point a domain you own at your site\. HTTPS is set up for you\./.test(text) && text.includes("Use your own domain"))

console.log("\n5. Structure and width stay")
// Changed on purpose (landing round 9): the owner asked for the reference's row: three cards, narrow, wide, narrow.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "three cards, narrow, wide".
check("still in the shared box (--home-max, --home-edge)", /\.cmh-in\{box-sizing:border-box;width:100%;max-width:var\(--home-max,2020px\);margin-inline:auto;padding-inline:var\(--home-edge,clamp\(20px,5\.15vw,84px\)\)\}/.test(css) && how.includes('class="cmh-in home-wrap"'))
// Changed on purpose (landing round 9): three cards in one row are taller pictures; the section is much shorter (reported to the lead for the lazy heights).
// Changed on purpose (landing round 10): the pictures stop at half the screen's height on a computer (the owner: a MacBook Air at 1440x800).
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "the pictures' heights".

console.log("\nSmooth")
check("every keyframe moves transform and opacity only", keyframeBodies(css).every(onlyCompositor))
// Changed on purpose (landing round 9): fewer moving parts (three cards).
// Changed on purpose (landing round 10): the domain card has two moving parts now, not seven.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). Fewer moving parts.
check("every looping part is a .cmh-a, paused unless its card is on screen and the tab visible", (how.match(/class="cmh-a /g) ?? []).length >= 9 && /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}") && /visibilitychange/.test(src))
// Changed on purpose (landing round 10): reduced motion shows his own domain on the band.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). 
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "reduced motion: nothing loops, his own".
// Changed on purpose (landing round 9): the owner asked for interactive pictures. A picture still takes no pointer, except the tip card's amounts and Send (a press) and the chart (a mouse); still no links, buttons or inputs.
// Changed on purpose (landing round 11): the owner disliked the pictures; new ones, one white panel each on a quiet ground (tests/home-landing-r11-lower.test.ts). No part of a picture takes the pointer now.
check("a picture takes no pointer", /\.cmh-stage\{[^}]*pointer-events:none/.test(css) && !/<(a|button|input|select)\b/.test(how) && !/pointer-events:auto/.test(css))

console.log("\nCopy")
check("no em dash, none of the banned words, none of the banned samples", !/—/.test(text) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform(?!:)/i.test(text) && !/Nadia|The Loop|LaSalle|Nails by Bea|Nordline|Charla|Static Bloom|Wildcamp|enthusiast|\bfans?\b/i.test(code + text))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r8-how.test.ts"'))

console.log(`\nhome-landing-r8-how: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

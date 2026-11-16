/**
 * HOME, LANDING ROUND 7: HOW IT WORKS (section 8)
 *
 * The owner: a "more clean and simple" heading in the structure of section 3
 * (everything-in-one-place: a two tone heading, then a two by two grid of wide
 * and narrow cards, one picture each with a caption under it); no Nadia
 * Brooks, no "LaSalle at dusk", no "Checkout without leaving your page"; the
 * "Use your own domain" tile as it was before (round 3, 971429ade) on a smooth
 * black to deep purple ground; and the section in the page's shared box, its
 * edges on the showcase's.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HowItWorks, HOW_CARDS, HOW_DOMAIN, HOW_HEADING, HOW_IT_WORKS_STYLES, HOW_PRODUCTS, HOW_SHOP } from "@/components/marketing/home/how-it-works"
import { EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"
import { DOMAIN_PURPOSES, cleanHostname, hostnameProblem } from "@/lib/custom-domains/hostname"
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const FILE = "components/marketing/home/how-it-works.tsx"
const src = read(FILE)
const how = renderToStaticMarkup(createElement(HowItWorks))
const css = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const evCss = EVERYTHING_STYLES.map((s) => s.css).join("\n")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")
const text = words(how)
const keyframeBodies = (c: string) => [...c.matchAll(/@keyframes [\w-]+\{([\s\S]*?\})\}/g)].map((m) => m[1])
const onlyCompositor = (body: string) => [...body.matchAll(/[{;]([a-z-]+):/g)].every((x) => ["transform", "opacity", "animation-timing-function"].includes(x[1]))

console.log("\nSection 3's structure: a two tone heading, then wide and narrow cards")
// Changed on purpose (landing round 9): the owner asked for a new heading, the products card being gone.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "a clean two tone heading".
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "the heading is an h2".
check("the heading's type is section 3's (size, weight, tracking, the grey)", /font-size:clamp\(34px,4\.6vw,64px\);font-weight:500;line-height:1\.05;letter-spacing:-\.045em/.test(css) && /font-size:clamp\(34px,4\.6vw,64px\);font-weight:500;line-height:1\.05;letter-spacing:-\.045em/.test(evCss) && /#8e8c96/.test(evCss))
// Changed on purpose (landing round 9): three picture cards in one row, narrow, wide, narrow (the owner's reference).
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "three cards: narrow".
// Changed on purpose (landing round 9): one row from 1100px, the wide card twice a narrow one; one column on a phone.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "one column on a phone".
// Changed on purpose (landing round 9): the reference's caption, a title and one short line under it.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "each card is one picture".
// Changed on purpose (landing round 10): on a computer the pictures stop at half the screen's height (the owner: a MacBook Air at 1440x800).
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "the pictures' heights, and".
// Changed on purpose (landing round 9): the owner saw blank white boxes when scrolling fast. The cards never hide; only the chart's line waits to be seen. The dot field behind the heading has a frame loop (off screen it stops) and reads its place on resize and as a mouse comes in.
check("the cards never hide: no opacity 0 on a card, nothing waits for script", !/\.cmh-card\{[^}]*opacity:0/.test(css) && /\.cmh-card\{min-width:0\}/.test(css) && /@media\(scripting:none\)\{\.cmh-o\{animation:none\}\}/.test(css) && /prefers-reduced-motion: reduce\)"\)\.matches/.test(src + readFileSync("components/marketing/home/dot-field-mount.ts", "utf8"))) // Changed on purpose (landing round 6 perf): the dot field's reduced motion check moved to dot-field-mount.ts

console.log("\nThe shared width")
check("the content sits in the page's box: --home-max and --home-edge, with the same fallbacks as globals.css", /\.cmh-in\{box-sizing:border-box;width:100%;max-width:var\(--home-max,2020px\);margin-inline:auto;padding-inline:var\(--home-edge,clamp\(20px,5\.15vw,84px\)\)\}/.test(css) && how.includes('class="cmh-in home-wrap"'))
check("the heading starts --home-head-inset in from the cards' edge (14px, none on a phone)", /\.cmh-h\{[^}]*padding-left:var\(--home-head-inset,14px\)/.test(css) && /@media\(max-width:767px\)\{\.cmh-h\{padding-left:var\(--home-head-inset,0px\)\}\}/.test(css))
check("no data-story-section, whose global rule would cap it at 1400px; the same --home-pad top and bottom", !/data-story-section/.test(how.replace(/<style[\s\S]*?<\/style>/g, "")) && /\.cmh\{[^}]*padding-block:var\(--home-pad,clamp\(48px,5\.6vw,80px\)\)/.test(css))

console.log("\nThe examples")
check("no Nadia Brooks, no LaSalle at dusk, no The Loop, no checkout tile", !/Nadia|LaSalle|The Loop|Checkout without leaving your page|cmh-sheet|cmh-op-|print-lasalle|creator-nadia|guide-loop/.test(code(FILE) + words(how)))
check("nothing imported from the checkout track's files", !/from "\.\/(checkout-scene|ebook-cover)"/.test(src))
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "one made up woodworker".
// Changed on purpose (landing round 8): the owner asked for "just a t-shirt" and the Cine Tones LUT pack (tests/home-landing-r8-how.test.ts).
// Changed on purpose (landing round 9): no products card; the shop's two products are section 3's.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "section 3's LUT pack and black tee".
check("no You keep figures (the products card is gone)", !/You keep|Print cost|Selling price/.test(text) && typeof calculateStorelibFee === "function") // Changed on purpose (landing round 9)
check("no course card (another section shows what you can build)", !/Sharpening a chisel|2 of 7 done|cmh-cp/.test(text + css) && !existsSync("public/home/how/lesson-plane.webp")) // Changed on purpose (landing round 9)
const PICS = ["linde-avatar"] // Changed on purpose (landing round 10): the workshop picture went with his website.
// // Changed on purpose (landing round 9): the tee and the pack are section 3's files; the white tee and the lesson still are deleted.
check("its pictures are local webp files under 120 KB, all drawn", PICS.every((n) => existsSync(`public/home/how/${n}.webp`) && statSync(`public/home/how/${n}.webp`).size < 120 * 1024 && how.includes(`/home/how/${n}.webp`)))
check("the street course still this section alone used is gone", !existsSync("public/home/how/course-street.webp") && !how.includes("course-street"))
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "none of the banned samples".

console.log("\nYour own domain")
// Changed on purpose (landing round 8) (the owner: the www, shop and club banner was "too complex", and the black card the odd one out): one browser window on a light ground; tests/home-landing-r8-how.test.ts pins it.
// Changed on purpose (landing round 9): one address pill over his website, no browser window (tests/home-landing-r9-how.test.ts pins it).
// Changed on purpose (landing round 10): one address band (tests/home-landing-r10-how.test.ts pins it).
// Changed on purpose (landing round 11): one browser window with his website, its address closing to his own domain.
// Changed on purpose (landing round 12): the owner replaced the pictures with the real dashboard (its rail has Payouts), a tip flow and a typed domain over a store, full width on the section with no grounds; tests/home-landing-r12-how.test.ts pins them. Retired here: "one browser window, no rows".
check("the domain is one Storelib accepts and serves one of the product's purposes", hostnameProblem(cleanHostname(HOW_DOMAIN.host)) === null && (DOMAIN_PURPOSES as readonly string[]).includes(HOW_DOMAIN.purpose))
check("the caption keeps the code's claims", /On Grow, point a domain you own at your site\. HTTPS is set up for you\./.test(text)) // Changed on purpose (landing round 9): one short line. /* Changed on purpose (pricing round 5): the $29 plan is named Grow. */

console.log("\nSmooth")
check("every keyframe moves transform and opacity only", keyframeBodies(css).every(onlyCompositor))
check("loops are paused unless their card is on screen and the tab visible", /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}") && /visibilitychange/.test(src) && /new IntersectionObserver/.test(src))
check("reduced motion: nothing loops", /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}/.test(css))
// Changed on purpose (landing round 9): the pictures can be touched in three places (the tip card's amounts and Send, the chart); still no links, buttons or inputs.
check("pictures hold no links, buttons or inputs", /\.cmh-stage\{[^}]*pointer-events:none/.test(css) && !/<(a|button|input|select)\b/.test(how))

console.log("\nCopy")
check("no em dash, none of the banned words", !/—/.test(text) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform(?!:)/i.test(text))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r7-how.test.ts"'))

console.log(`\nhome-landing-r7-how: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

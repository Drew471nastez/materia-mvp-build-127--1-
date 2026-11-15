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
check("a clean two tone heading, not the old line", HOW_HEADING.lead === "Products, courses and tips." && HOW_HEADING.rest === "On your own domain." && !/Sell what people love|We handle the rest/.test(src + how))
check("the heading is an h2 with its grey half in its own span, on its own line", /<h2 id="cmh-title" class="cmh-h">Products, courses and tips\. <span class="cmh-h-mute">On your own domain\.<\/span><\/h2>/.test(how) && /\.cmh-h-mute\{display:block;color:#8e8c96\}/.test(css))
check("the heading's type is section 3's (size, weight, tracking, the grey)", /font-size:clamp\(34px,4\.6vw,64px\);font-weight:500;line-height:1\.05;letter-spacing:-\.045em/.test(css) && /font-size:clamp\(34px,4\.6vw,64px\);font-weight:500;line-height:1\.05;letter-spacing:-\.045em/.test(evCss) && /#8e8c96/.test(evCss))
check("four cards: wide, narrow, narrow, wide", HOW_CARDS.map((c) => c.wide).join() === "true,false,false,true" && [...how.matchAll(/class="cmh-card (cmh-wide|cmh-narrow)"/g)].map((m) => m[1]).join() === "cmh-wide,cmh-narrow,cmh-narrow,cmh-wide")
check("section 3's grid: one column under 768px, then 24 columns, 13 and 11", /\.cmh-grid\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:44px\}/.test(css) && /\.cmh-grid\{grid-template-columns:repeat\(24,minmax\(0,1fr\)\);column-gap:clamp\(16px,2vw,28px\);row-gap:clamp\(48px,5vw,72px\)\}/.test(css) && /\.cmh-wide\{grid-column:span 13\}/.test(css) && /\.cmh-narrow\{grid-column:span 11\}/.test(css))
check("each card is one picture and a caption under it, a bold lead and a grey continuation", (how.match(/<p class="cmh-cap"><b class="cmh-cap-lead">/g) ?? []).length === 4 && /\.cmh-cap\{margin:24px 0 0;max-width:46ch;font-size:15\.5px;line-height:1\.5;color:#7c7a84/.test(css) && /\.cmh-cap-lead\{font-weight:500;color:#18181b\}/.test(css))
check("the pictures' height and corners are section 3's from 768px", /\.cmh-stage\{height:clamp\(360px,32vw,440px\);border-radius:19px\}/.test(css))
check("cards come in once as the page scrolls (one observer, opacity and transform), and stand without script or with reduced motion", /\.cmh-card\{min-width:0;opacity:0;transform:translate\(0,24px\);transition:opacity \.7s/.test(css) && /@media\(scripting:none\)\{\.cmh-card\{opacity:1;transform:none\}\}/.test(css) && /prefers-reduced-motion: reduce\)"\)\.matches/.test(src) && !/addEventListener\("scroll"|getBoundingClientRect|requestAnimationFrame/.test(code(FILE)))

console.log("\nThe shared width")
check("the content sits in the page's box: --home-max and --home-edge, with the same fallbacks as globals.css", /\.cmh-in\{box-sizing:border-box;width:100%;max-width:var\(--home-max,2020px\);margin-inline:auto;padding-inline:var\(--home-edge,clamp\(20px,5\.15vw,84px\)\)\}/.test(css) && how.includes('class="cmh-in home-wrap"'))
check("the heading starts --home-head-inset in from the cards' edge (14px, none on a phone)", /\.cmh-h\{[^}]*padding-left:var\(--home-head-inset,14px\)/.test(css) && /@media\(max-width:767px\)\{\.cmh-h\{padding-left:var\(--home-head-inset,0px\)\}\}/.test(css))
check("no data-story-section, whose global rule would cap it at 1400px; the same --home-pad top and bottom", !/data-story-section/.test(how.replace(/<style[\s\S]*?<\/style>/g, "")) && /\.cmh\{[^}]*padding-block:var\(--home-pad,clamp\(48px,5\.6vw,80px\)\)/.test(css))

console.log("\nThe examples")
check("no Nadia Brooks, no LaSalle at dusk, no The Loop, no checkout tile", !/Nadia|LaSalle|The Loop|Checkout without leaving your page|cmh-sheet|cmh-op-|print-lasalle|creator-nadia|guide-loop/.test(code(FILE) + words(how)))
check("nothing imported from the checkout track's files", !/from "\.\/(checkout-scene|ebook-cover)"/.test(src))
check("one made up woodworker's shop: Ruben Linde, Linde Woodshop", HOW_SHOP.creator === "Ruben Linde" && HOW_SHOP.name === "Linde Woodshop" && text.includes("Support Ruben") && text.includes("Linde Woodshop"))
// Changed on purpose (landing round 8): the owner asked for "just a t-shirt" and the Cine Tones LUT pack (tests/home-landing-r8-how.test.ts).
check("a tee printed when ordered and the LUT pack as a download", HOW_PRODUCTS.map((p) => `${p.id}:${p.kind}`).join() === "tee:Physical,luts:Digital" && text.includes("Linde Shop Tee") && text.includes("Cine Tones LUT Pack"))
check("what he keeps is the price less Storelib's real fee and the print cost", HOW_PRODUCTS.every((p) => p.keepCents === p.priceCents - calculateStorelibFee({ grossMinor: p.priceCents, currency: "USD", sellerPlan: "free" }).totalStorelibFeeMinor - p.baseCents && p.keepCents > 0))
check("a hand tool course in the player", ["Sharpening a chisel", "Sawing to a line", "Planing a board flat", "Your first dovetail", "2 of 7 done"].every((w) => text.includes(w)))
const PICS = ["tee-white", "lesson-plane", "linde-avatar", "site-workshop"] // Changed on purpose (landing round 8): the tee in place of the apron and the bench.
check("its pictures are local webp files under 120 KB, all drawn", PICS.every((n) => existsSync(`public/home/how/${n}.webp`) && statSync(`public/home/how/${n}.webp`).size < 120 * 1024 && how.includes(`/home/how/${n}.webp`)))
check("the street course still this section alone used is gone", !existsSync("public/home/how/course-street.webp") && !how.includes("course-street"))
check("none of the banned samples", !/weeknight|pasta|sourdough|golden hour|wheel throw|drawing basics|saturday run club|dust & tape|elena ruiz|payout|\bfans?\b/i.test(src + text))

console.log("\nYour own domain")
// Changed on purpose (landing round 8) (the owner: the www, shop and club banner was "too complex", and the black card the odd one out): one browser window on a light ground; tests/home-landing-r8-how.test.ts pins it.
check("one browser window over his website, no pill, no rows, no night ground", how.includes('class="cmh-br"') && !how.includes('class="cmh-dm-pill"') && !how.includes('class="cmh-dm-row"') && !/data-ground="night"/.test(how) && !/night/.test(css))
check("the domain is one Storelib accepts and serves one of the product's purposes", hostnameProblem(cleanHostname(HOW_DOMAIN.host)) === null && (DOMAIN_PURPOSES as readonly string[]).includes(HOW_DOMAIN.purpose))
check("the caption keeps the code's claims", /On Pro, point a domain you own at your website, your creator page or a community\. Storelib checks the DNS and adds HTTPS\./.test(text))

console.log("\nSmooth")
check("every keyframe moves transform and opacity only", keyframeBodies(css).every(onlyCompositor))
check("loops are paused unless their card is on screen and the tab visible", /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}") && /visibilitychange/.test(src) && /new IntersectionObserver/.test(src))
check("reduced motion: nothing loops", /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}/.test(css))
check("pictures are not controls", /\.cmh-stage\{[^}]*pointer-events:none/.test(css) && !/<(a|button|input|select)\b/.test(how) && !/:hover/.test(css))

console.log("\nCopy")
check("no em dash, none of the banned words", !/—/.test(text) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform(?!:)/i.test(text))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r7-how.test.ts"'))

console.log(`\nhome-landing-r7-how: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

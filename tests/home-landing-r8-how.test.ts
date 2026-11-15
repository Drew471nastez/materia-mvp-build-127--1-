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
import { HowItWorks, HOW_CARDS, HOW_DOMAIN, HOW_IT_WORKS_STYLES, HOW_LUTS, HOW_PRODUCTS } from "@/components/marketing/home/how-it-works"
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
check("the two products are a plain tee and the LUT pack, physical then digital", HOW_PRODUCTS.map((p) => `${p.id}:${p.kind}:${p.name}`).join() === "tee:Physical:Linde Shop Tee,luts:Digital:Cine Tones LUT Pack")
check("no apron and no workbench plans anywhere in the file or on the page", !/apron|workbench|plans-bench|PlansCover/i.test(code + text) && !existsSync("public/home/how/apron.webp") && !existsSync("public/home/how/plans-bench.webp"))
check("the tee is a local webp photograph under 120 KB, drawn in the card and on his website", existsSync("public/home/how/tee-white.webp") && statSync("public/home/how/tee-white.webp").size < 120 * 1024 && (how.match(/\/home\/how\/tee-white\.webp/g) ?? []).length === 2)
check("the pack's cover uses section 3's still, the file, not an import of section 3's component", HOW_LUTS.still === "/home/everything/lut-still.webp" && existsSync(`public${HOW_LUTS.still}`) && !/from "\.\/everything-in-one-place"/.test(src))
check("the cover is section 3's: LUT Pack small, CINE / TONES big, in the card and on the shelf", (how.match(/<span class="cmh-lut[^"]*"><img src="\/home\/everything\/lut-still\.webp"[^>]*\/><span class="cmh-lut-tag">LUT Pack<\/span><span class="cmh-lut-name"><span>Cine<\/span><span>Tones<\/span><\/span><\/span>/g) ?? []).length === 2)
const ev = (sel: string) => (evCss.match(new RegExp(`${sel.replace(/[.[\]()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? "x"
check("the cover's type and shade are section 3's numbers (21cqw heavy name, 7cqw tag, the still over 64%, black #0a0a0b)",
  rule(".cmh-lut-name").endsWith(ev(".ev-lut-name").slice(ev(".ev-lut-name").indexOf("display:flex"))) &&
  /font-size:21cqw;font-weight:800;line-height:\.84;letter-spacing:-\.05em;text-transform:uppercase/.test(rule(".cmh-lut-name")) &&
  /left:7cqw;top:7cqw/.test(rule(".cmh-lut-tag")) && /letter-spacing:\.18em;text-transform:uppercase/.test(rule(".cmh-lut-tag")) &&
  /height:64%;object-fit:cover;object-position:50% 60%/.test(rule(".cmh-lut img")) && /background:#0a0a0b/.test(rule(".cmh-lut")) &&
  rule(".cmh-lut::after") === ev(".ev-lut::after") && rule(".cmh-lut::before") === ev(".ev-lut::before"))
check("what he keeps is the price less Storelib's real fee and, for the tee, an example print cost", HOW_PRODUCTS.every((p) => p.keepCents === p.priceCents - calculateStorelibFee({ grossMinor: p.priceCents, currency: "USD", sellerPlan: "free" }).totalStorelibFeeMinor - p.baseCents && p.keepCents > 0) && HOW_PRODUCTS[1].baseCents === 0 && HOW_PRODUCTS[1].priceCents === HOW_LUTS.priceCents)
check("the pack's price matches section 3's ($29.00)", HOW_LUTS.priceCents === 2900 && /"\$29\.00"/.test(read("components/marketing/home/everything-in-one-place.tsx")))

console.log("\n2 and 4. Four grounds of one family, none the odd one out")
const grounds = [...how.matchAll(/class="cmh-stage" data-ground="(\w+)"/g)].map((m) => m[1])
check("the four cards are on sand, sage, clay and mist, and the course is no longer on the shared grey", grounds.join() === "sand,sage,clay,mist" && rule(".cmh-stage[data-ground=sage]") !== "" && !/#f3f3f4/.test(css.slice(css.indexOf(".cmh-stage[data-ground"))))
const stops = (g: string) => [...rule(`.cmh-stage[data-ground=${g}]`).matchAll(/#([0-9a-f]{6})/g)].map((m) => m[1])
const lum = (h: string) => { const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const chroma = (h: string) => { const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v) }
const all = ["sand", "sage", "clay", "mist"].flatMap(stops)
check("each ground is a still two stop tint, top lighter than the foot", ["sand", "sage", "clay", "mist"].every((g) => /^background:linear-gradient\(180deg,#[0-9a-f]{6},#[0-9a-f]{6}\)$/.test(rule(`.cmh-stage[data-ground=${g}]`)) && lum(stops(g)[0]) > lum(stops(g)[1])))
check("all light, at one lightness (every stop's luminance within 0.70 to 0.90) and soft (no channel spread over 24)", all.length === 8 && all.every((h) => lum(h) > 0.7 && lum(h) < 0.9 && chroma(h) <= 24))
check("no black ground, no purple, no glass", !/data-ground="night"|night/.test(how + css) && !/#3a1c6b|#050507|#7c3aed|#8b5cf6|#a855f7/.test(css) && !/backdrop-filter|blur\(/.test(css))

console.log("\n3. Your own domain: one browser window, the address typing in")
check("no www / shop / club banner, no address pill, no rows of addresses", !/cmh-dm-pill|cmh-dm-row|cmh-dm-rows|cmh-dm-tick/.test(how + css) && !/>(www|shop|club)<\/b>\./.test(how) && !("targets" in HOW_DOMAIN))
check("one window: its bar with the dots, the address field, and his website under it", /<div class="cmh-br"><div class="cmh-br-top"><span class="cmh-br-dots">/.test(how) && how.includes('class="cmh-br-bar"') && how.includes('class="cmh-br-page"') && text.includes("Linde Woodshop") && text.includes("Hand Tool Basics"))
const typed = [...how.matchAll(/<span class="cmh-a cmh-ch" data-k="(\d+)">([^<]*)/g)]
check("the address is his bare domain, one letter per span in order", typed.map((m) => m[2]).join("") === HOW_DOMAIN.host && typed.every((m, i) => Number(m[1]) === i))
check("a domain Storelib accepts, serving one of the product's purposes, not a Storelib name", hostnameProblem(cleanHostname(HOW_DOMAIN.host)) === null && (DOMAIN_PURPOSES as readonly string[]).includes(HOW_DOMAIN.purpose) && !/storelib/.test(HOW_DOMAIN.host))
const at = (k: string, n = 1) => Number((css.match(new RegExp(`@keyframes ${k}\\{0%,([\\d.]+)%`)) ?? [])[n] ?? NaN)
const letters = typed.map((_, i) => at(`cmh-ch${i}`))
check("the letters come one after another, then the lock comes in after the last", letters.every((t, i) => i === 0 || t > letters[i - 1]) && at("cmh-lk") > letters[letters.length - 1])
check("a caret leads the typing and each letter's caret hands on to the next", (how.match(/<i class="cmh-a cmh-caret"><\/i>/g) ?? []).length === typed.length && how.includes('class="cmh-a cmh-caret cmh-caret0"') && typed.every((_, i) => css.includes(`@keyframes cmh-ck${i}{`)))
check("the page comes up after the address: a veil lifts and a load line runs as the lock appears", at("cmh-veil") > letters[letters.length - 1] && at("cmh-load") === at("cmh-lk") && how.includes('class="cmh-a cmh-br-veil"') && /\.cmh-br-veil\{z-index:2;/.test(css))
check("the caption keeps the code's claims, little text in the picture", /On Pro, point a domain you own at your website, your creator page or a community\. Storelib checks the DNS and adds HTTPS\./.test(text) && words(how.slice(how.indexOf('<div class="cmh-br-top">'), how.indexOf('<div class="cmh-br-page">'))).replace(/\s/g, "") === HOW_DOMAIN.host)

console.log("\n5. Structure and width stay")
check("four cards, wide, narrow, narrow, wide, on the 24 column grid", HOW_CARDS.map((c) => c.wide).join() === "true,false,false,true" && /\.cmh-wide\{grid-column:span 13\}/.test(css) && /\.cmh-narrow\{grid-column:span 11\}/.test(css))
check("still in the shared box (--home-max, --home-edge)", /\.cmh-in\{box-sizing:border-box;width:100%;max-width:var\(--home-max,2020px\);margin-inline:auto;padding-inline:var\(--home-edge,clamp\(20px,5\.15vw,84px\)\)\}/.test(css) && how.includes('class="cmh-in home-wrap"'))
check("the pictures keep their heights, so the section's height does not move", /\.cmh-stage\{[^}]*height:clamp\(360px,96vw,400px\)/.test(css) && /\.cmh-stage\{height:clamp\(360px,32vw,440px\);border-radius:19px\}/.test(css))

console.log("\nSmooth")
check("every keyframe moves transform and opacity only", keyframeBodies(css).every(onlyCompositor))
check("every moving part is a .cmh-a, paused unless its card is on screen and the tab visible", (how.match(/class="cmh-a /g) ?? []).length > 40 && /\.cmh-a\{[^}]*animation-play-state:paused!important/.test(css) && css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}") && /visibilitychange/.test(src))
check("reduced motion: nothing loops, the address and lock stand, the veil, load line and carets are gone", /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}/.test(css) && /\.cmh-br-veil,\.cmh-br-loadfill,\.cmh-caret\{opacity:0\}/.test(css))
check("nothing in a picture is a control", /\.cmh-stage\{[^}]*pointer-events:none/.test(css) && !/<(a|button|input|select)\b/.test(how) && !/:hover/.test(css))

console.log("\nCopy")
check("no em dash, none of the banned words, none of the banned samples", !/—/.test(text) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform(?!:)/i.test(text) && !/Nadia|The Loop|LaSalle|Nails by Bea|Nordline|Charla|Static Bloom|Wildcamp|enthusiast|\bfans?\b/i.test(code + text))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r8-how.test.ts"'))

console.log(`\nhome-landing-r8-how: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

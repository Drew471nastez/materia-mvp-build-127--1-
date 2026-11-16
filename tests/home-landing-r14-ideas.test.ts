/**
 * ===========================================================================
 *  HOME, LANDING ROUND 14 (IDEAS): THE OWNER'S OWN STEEZ PRODUCTS, LOUDLIB AS
 *  LOUDLIB.NET IS, AND THE BUILDER EDITING A HEADING THEN PUBLISHING
 * ===========================================================================
 * components/marketing/home/showcase-mocks/builder-mocks.tsx and
 * ideas-come-to-life.tsx (the Website builder tab of "See your ideas come to
 * life").
 *
 * The owner, after round 13:
 *   1. Steez's products: no people. Exactly his four (Gradient Hoodie $100.00,
 *      Raw Tee $120.00, Grey Graphic T-shirt $80.00, Faith over fear Graphic
 *      T-shirt $120.00), flat shots on light grey as his store shows them; no
 *      progress bar under them.
 *   2. The animation: the pointer selects the hero heading, its words change as
 *      if typed, then Publish.
 *   3. loudlib exactly as loudlib.net: the purple sale bar, the dark header with
 *      the logo and menu, BESTSELLING and the grid of sample pack boxes with
 *      their sale prices. Unused pictures go.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as Ideas from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, EDIT_AT, LL_EDIT, LoudlibSite, STZ_EDIT, SteezSite, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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
const F = {
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
}
const rule = (sheet: string, selector: string) => {
  const at = sheet.indexOf(`\n${selector}{`)
  return at < 0 ? "" : sheet.slice(at + 1, sheet.indexOf("}", at) + 1)
}
const U = (n: number) => `calc(${n}*var(--u))`
/** A real webp under `kb`, and its pixel size from the VP8/VP8L/VP8X header. */
const webp = (p: string, kb: number) => {
  const f = join(root, "public", p)
  if (!existsSync(f)) return null
  const b = readFileSync(f)
  if (b.subarray(0, 4).toString() !== "RIFF" || b.subarray(8, 12).toString() !== "WEBP" || statSync(f).size >= kb * 1024) return null
  const kind = b.subarray(12, 16).toString()
  if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
  if (kind === "VP8L") {
    const v = b.readUInt32LE(21)
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
}
const all = code(read(F.builders)) + code(read(F.ideas))

console.log("\n── 1. Steez: the owner's four products, no people, no progress bar ──")
const stz = renderToStaticMarkup(createElement(SteezSite, { rings: true }))
const cards = [...stz.matchAll(/<span class="stz-card"><span class="stz-img"><img[^>]*src="\/home\/showcase\/([a-z-]+)\.webp"[^>]*><\/span><b>([^<]+)<\/b><span class="stz-price">([^<]+)<\/span>/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`)
check(
  "exactly his four, in his order, at his prices",
  cards.join() === "stz-p-hoodie Gradient Hoodie $100.00,stz-p-raw Raw Tee $120.00,stz-p-grey Grey Graphic T-shirt $80.00,stz-p-faith Faith over fear Graphic T-shirt $120.00",
  cards,
)
check(
  "each a 3:4 shot at 480 x 640, small",
  ["stz-p-hoodie", "stz-p-raw", "stz-p-grey", "stz-p-faith"].every((n) => {
    const s = webp(`home/showcase/${n}.webp`, 30)
    return !!s && s.w === 480 && s.h === 640
  }),
)
check("on the light grey of his store's cards (#f4f6fa)", /background:#f4f6fa/.test(rule(BUILDER_CSS, ".stz-img")))
check("the model shots are deleted and named nowhere", ["stz-p-navy", "stz-p-orange", "stz-p-red", "stz-p-lilac"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`)) && !all.includes(n)) && !/Navy Box Logo|Lilac Heavy|Pexels/.test(all))
check("no progress bar under them, View all straight after", !/stz-progress/.test(stz + BUILDER_CSS) && /<\/div><span class="stz-all">View all<\/span>/.test(stz))

console.log("\n── 2. The moment: select the heading, type over it, Publish ──")
check("the edits: Summer Madness '26 to Winter Drop '26, BESTSELLING to NEW RELEASES", STZ_EDIT.was === "Summer Madness '26" && STZ_EDIT.now === "Winter Drop '26" && LL_EDIT.was === "BESTSELLING" && LL_EDIT.now === "NEW RELEASES")
const typed = (html: string, now: string) => [...html.matchAll(/<span class="wx-now" aria-hidden="true">([\s\S]*?)<\/span>/g)].map((m) => [...m[1].matchAll(/<i style="animation-delay:([\d.]+)s">([^<]*)<\/i>/g)]).find((c) => c.map((x) => x[2]).join("").replace(/&#x27;/g, "'") === now)
const st = typed(stz, STZ_EDIT.now)
check("Steez's heading: the old words with their selection mark, the new ones one character at a time", /<b><span class="wx-edit"><span class="wx-was"><i class="wx-mark"><\/i>Summer Madness &#x27;26<\/span>/.test(stz) && !!st && st.length === STZ_EDIT.now.length)
check("each character a beat later than the one before, all typed within 12% of the moment", !!st && st.every((c, i) => i === 0 || Number(c[1]) > Number(st[i - 1][1])) && Number(st[st.length - 1][1]) < 0.12 * 8.4)
const ll = renderToStaticMarkup(createElement(LoudlibSite, { rings: true }))
check("loudlib's heading is edited the same way", /<p class="ll-h"><span class="wx-edit"><span class="wx-was"><i class="wx-mark"><\/i>BESTSELLING<\/span>/.test(ll) && !!typed(ll, LL_EDIT.now))
check("without the builder, the sites are just the sites: the old words, nothing to type", /<b>Summer Madness &#x27;26<\/b>/.test(renderToStaticMarkup(createElement(SteezSite))) && /<p class="ll-h">BESTSELLING<\/p>/.test(renderToStaticMarkup(createElement(LoudlibSite))))
check("at rest (and with reduced motion) the old words stand, the new ones are hidden", !/opacity/.test(rule(BUILDER_CSS, ".wx-was")) && /opacity:0/.test(rule(BUILDER_CSS, ".wx-now i")) && /opacity:0/.test(rule(BUILDER_CSS, ".wx-mark")))
check("the selection is the browser's blue, behind the words", /background:rgba\(59,130,246,\.55\)/.test(rule(BUILDER_CSS, ".wx-mark")) && /z-index:-1/.test(rule(BUILDER_CSS, ".wx-mark")))
const kf = (name: string) => {
  const at = BUILDER_CSS.indexOf(`@keyframes ${name}{`)
  return at < 0 ? "" : BUILDER_CSS.slice(at, BUILDER_CSS.indexOf("}}", at) + 2)
}
check("the ring and the row light on the first click (13%), the words are selected on the double click (17%), typing from 21%", /0%,12\.5%\{opacity:0\}13\.5%,100%\{opacity:1\}/.test(kf("sxk-ed-sel")) && /0%,16\.5%\{opacity:0\}17%,20\.5%\{opacity:1\}21%,100%\{opacity:0\}/.test(kf("sxk-ed-mark")) && /0%,21%\{opacity:0\}21\.2%,100%\{opacity:1\}/.test(kf("sxk-ed-ch")))
check("each pointer clicks its heading, double clicks, then Publish (44%) and Publish changes (60%), where the panel's own keyframes press", ["sxk-cur-stz", "sxk-cur-ll"].every((n) => /12%\{transform:none\}13%\{transform:scale\(\.86\)\}/.test(kf(n)) && /16\.5%\{transform:scale\(\.86\)\}/.test(kf(n)) && /44%\{transform:translate\(.*?\) scale\(\.86\)\}/.test(kf(n)) && /60%\{transform:translate\(.*?\) scale\(\.86\)\}/.test(kf(n))) && /44\.5%\{transform:scale\(\.94\)\}/.test(kf("sxk-wx-press")) && /60\.5%\{transform:scale\(\.96\)\}/.test(kf("sxk-wx-go")))
check("Publish's targets are where the button and Publish changes are drawn", kf("sxk-cur-stz").includes(`translate(${U(1214 - EDIT_AT.stz[0])},${U(21 - EDIT_AT.stz[1])})`) && kf("sxk-cur-ll").includes(`translate(${U(1150 - EDIT_AT.ll[0])},${U(298 - EDIT_AT.ll[1])})`))
check("Steez plays when the tab opens, loudlib when the tab moves on to it, each once, so the finished edit stays while it fades", /\[data-mock-live\] \.wx-cur-stz\{animation:sxk-cur-stz var\(--bm-t\) var\(--bm-ease\) 1 both\}/.test(BUILDER_CSS) && /\[data-mock-live\]\[data-scene="1"\] \.wx-cur-ll\{animation:sxk-cur-ll var\(--bm-t\) var\(--bm-ease\) 1 both\}/.test(BUILDER_CSS) && /\[data-mock-live\]\[data-scene="1"\] \.ll \.wx-now i\{animation:sxk-ed-ch/.test(BUILDER_CSS))
check("every animation of the edit is under reduced motion's no-preference and moves only opacity or transform", [...BUILDER_CSS.matchAll(/@keyframes (sxk-ed-[\w-]+|sxk-cur-\w+|sxk-stz-scroll)\{([\s\S]*?)\}\}/g)].every((m) => !/[{;](?!opacity|transform)[a-z-]+:/.test(m[2])) && [...BUILDER_CSS.matchAll(/animation:sxk-(ed|cur)-/g)].length === [...BUILDER_CSS.matchAll(/@media\(prefers-reduced-motion:no-preference\)\{[^@]*animation:sxk-(ed|cur)-/g)].length)
check("one pointer per site, faded with its site, over the panel", /<span class="wx-curs bm-s1"><svg class="bm-cursor wx-cur wx-cur-stz"/.test(wb()) && /<span class="wx-curs bm-s2"><svg class="bm-cursor wx-cur wx-cur-ll"/.test(wb()) && /z-index:30/.test(rule(BUILDER_CSS, ".wx-curs")))
function wb() {
  return renderToStaticMarkup(createElement(WebsiteBuilderMock))
}
check("after Published the canvas scrolls down to the products, once, and stays for the fade to loudlib", /\[data-mock-live\] \.stz-page\{animation:sxk-stz-scroll var\(--bm-t\) var\(--bm-ease\) 1 both\}/.test(BUILDER_CSS) && /0%,86%\{transform:none\}96%,100%\{transform:translateY/.test(kf("sxk-stz-scroll")))
check("one ring per site, one row lit per tree", (wb().match(/class="wx-sel wx-ring"/g) ?? []).length === 2 && (wb().match(/wx-hl/g) ?? []).length === 2 && !/wx-ring-[ab]|wx-hl-[ab]/.test(wb() + BUILDER_CSS))

console.log("\n── 3. loudlib as loudlib.net is ──")
check("the purple bar with its sun and its words", /<p class="ll-bar"><svg[^>]*ll-sun[^>]*>[\s\S]*?<\/svg>Sale 60% Off To All Products<\/p>/.test(ll) && /background:#6c2bd9/.test(rule(BUILDER_CSS, ".ll-bar")))
check("the near black header: loud over LIB., the seven menu words with Home underlined, the three icons, Discover in a purple ring", /<span class="ll-logo">loud<i>LIB\.<\/i><\/span>/.test(ll) && [...ll.matchAll(/<span(?: class="on")?>([^<]+)<\/span>/g)].map((m) => m[1]).slice(0, 7).join() === "Home,Shop,Sample Packs,Free Downloads,Blog,Work With Us,Support" && /<span class="on">Home<\/span>/.test(ll) && /background:#141414/.test(rule(BUILDER_CSS, ".ll-nav")) && /inset 0 0 0 calc\(1\.4\*var\(--u\)\) #6c2bd9/.test(rule(BUILDER_CSS, ".ll-discover")))
check("no hero: BESTSELLING comes straight after the header, in heavy italic", !/ll-hero|ll-pitch|ll-buy|New bundle/.test(ll + BUILDER_CSS) && /<\/div><div class="ll-shop"><p class="ll-h">/.test(ll) && /font-style:italic;font-weight:800/.test(rule(BUILDER_CSS, ".ll-h")))
const packs = [...ll.matchAll(/<span class="ll-card"><span class="ll-img"><img[^>]*src="\/home\/showcase\/([a-z-]+)\.webp"[^>]*>(<i class="ll-sale">On Sale<\/i>)?<\/span><b>([^<]+)<\/b><span class="ll-price">(?:<s>([^<]+)<\/s>)?([^<]+)<\/span>/g)].map((m) => `${m[1]}|${m[3]}|${m[4] ?? ""}|${m[5]}|${m[2] ? "sale" : ""}`)
check(
  "the six Bestselling packs, three to a row, the three on sale with their badge and struck prices",
  packs.join() ===
    [
      "ll-serum|Serum Presets Vol 1|€22,47|€8,99|sale",
      "ll-tech-house|Tech House Sample Pack - Master Bundle 2025|€49,96|€19,98|sale",
      "ll-drums|Tech House Drum Kit Vol I||From €0,00|",
      "ll-ambience|Free Ambience Sample Pack Vol I||Free|",
      "ll-deep-house|Deep House Production Suite - Serenade|€24,94|€9,98|sale",
      "ll-unitech|Tech House Sample Pack - Unitech||€9,20|",
    ].join() && /grid-template-columns:repeat\(3,calc\(267\*var\(--u\)\)\)/.test(rule(BUILDER_CSS, ".ll-grid")),
  packs,
)
check("each box shot is the real one, cut from the owner's screenshot, small", ["ll-serum", "ll-tech-house", "ll-drums", "ll-ambience", "ll-deep-house", "ll-unitech"].every((n) => { const s = webp(`home/showcase/${n}.webp`, 20); return !!s && s.w === 540 }))
check("the old hero and the made up MIDI kit are deleted and named nowhere", ["ll-hero", "ll-midi"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`)) && !all.includes(n)) && !/Melodic Techno MIDI|Sale 60% off all products/.test(all))
check("loudlib's tree starts with its Bestselling grid, lit", /<span class="wx-row wx-hl">(?:(?!<\/b>)[\s\S])*<b>Featured products<\/b>/.test(wb().slice(wb().indexOf('class="wx-tree bm-s2"'))) && !/<b>Hero<\/b>/.test(wb()))

console.log("\n── The tab, the words, the suite ──")
const alt = Ideas.IDEAS_TABS[0].alt
check("the alt text tells it as it now is", /Gradient Hoodie/.test(alt) && /Bestselling/.test(alt) && /typed over/.test(alt) && !/on models|club photo|new bundle/.test(alt))
const words = alt + code(read(F.builders)).replace(/className="[^"]*"/g, "")
check("no banned words, no em dashes", !/\b(unlock|elevate|seamless|powerful|effortlessly|supercharge|transform(?!:|\(|-origin))/i.test(alt) && !/—/.test(alt + read(F.builders)))
check("none of the never on the page samples", !/Nadia Brooks|The Loop\b|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|Studio Marlow|Kai Moreno|ceramics|\btotes?\b|After Dark|memberships|Mondo Mango|Mara Lind\b|Idris Kane|Ruben Linde|Juno Kada|junokada/i.test(words))
check("this suite runs with the push tests, after round 13's", /"tests\/home-landing-r13-pricing\.test\.ts",[\s\S]{0,3000}"tests\/home-landing-r14-ideas\.test\.ts"/.test(read("scripts/run-push-tests.mjs").replace(/\/\*[\s\S]*?\*\//g, "")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

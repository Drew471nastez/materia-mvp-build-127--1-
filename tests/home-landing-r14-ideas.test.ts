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
import { BUILDER_CSS, EDIT_AT, STZ_EDIT, SteezSite, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("the edit: Summer Madness '26 to Winter Drop '26", STZ_EDIT.was === "Summer Madness '26" && STZ_EDIT.now === "Winter Drop '26")
const typed = (html: string, now: string) => [...html.matchAll(/<span class="wx-now" aria-hidden="true">([\s\S]*?)<\/span>/g)].map((m) => [...m[1].matchAll(/<i style="animation-delay:([\d.]+)s">([^<]*)<\/i>/g)]).find((c) => c.map((x) => x[2]).join("").replace(/&#x27;/g, "'") === now)
const st = typed(stz, STZ_EDIT.now)
/* Changed on purpose (landing round 15): the heading wears the editor's outline on the page; its words are selected in the panel's Heading field, where the typing happens, and the page follows. All typed within 1.2s. */
check("Steez's heading: the editor's outline, the old words, the new ones one character at a time", /<b><span class="wx-edit"><i class="wx-hd"><\/i><span class="wx-was">Summer Madness &#x27;26<\/span>/.test(stz) && !!st && st.length === STZ_EDIT.now.length)
check("each character a beat later than the one before, all typed within 1.2s", !!st && st.every((c, i) => i === 0 || Number(c[1]) > Number(st[i - 1][1])) && Number(st[st.length - 1][1]) < 1.2)
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("without the builder, the site is just the site: the old words, nothing to type", /<b>Summer Madness &#x27;26<\/b>/.test(renderToStaticMarkup(createElement(SteezSite))))
check("at rest (and with reduced motion) the old words stand, the new ones are hidden", !/opacity/.test(rule(BUILDER_CSS, ".wx-was")) && /opacity:0/.test(rule(BUILDER_CSS, ".wx-now i")) && /opacity:0/.test(rule(BUILDER_CSS, ".wx-mark")))
/* Changed on purpose (landing round 15): the selection is in the panel's field, a lighter blue on white. */
check("the selection is the browser's blue, behind the words", /background:rgba\(59,130,246,\.3\)/.test(rule(BUILDER_CSS, ".wx-mark")) && /z-index:-1/.test(rule(BUILDER_CSS, ".wx-mark")))
const kf = (name: string) => {
  const at = BUILDER_CSS.indexOf(`@keyframes ${name}{`)
  return at < 0 ? "" : BUILDER_CSS.slice(at, BUILDER_CSS.indexOf("}}", at) + 2)
}
/* Changed on purpose (landing round 15): the moment is 11.6s: the heading outlined from 0.7s and clicked at 1s (the row lit), the field clicked at 1.8s (the words selected), typing from 2.05s; Publish at 3.85s and Publish changes at 4.6s; the products picked at 6.7s and the slider dragged from 7.5s to 8.5s; Publish again at 9.15s and 9.9s. Pinned in tests/home-landing-r15-showcase.test.ts. */
const at = (sec: number) => `${+((sec / 11.6) * 100).toFixed(2)}%`
check("the row lights on the first click (1s), the words are selected in the field (1.8s), typing from 2.05s", kf("sxk-ed-row").startsWith(`@keyframes sxk-ed-row{0%,${at(1)}{opacity:0}`) && kf("sxk-ed-mark").startsWith(`@keyframes sxk-ed-mark{0%,${at(1.82)}{opacity:0}`) && kf("sxk-ed-ch").startsWith(`@keyframes sxk-ed-ch{0%,${at(2.05)}{opacity:0}`))
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("the pointer clicks the heading, the field, then Publish and Publish changes, twice, where the panel's own keyframes press", ["sxk-cur-stz"].every((n) => [1, 1.8, 3.9, 4.65, 9.2, 9.95].every((t) => kf(n).includes(`${at(t)}{transform:`) && kf(n).split(`${at(t)}{transform:`)[1].split("}")[0].endsWith("scale(.86)"))) && kf("sxk-wx-press").includes(`${at(3.92)}{transform:scale(.94)}`) && kf("sxk-wx-press").includes(`${at(9.22)}{transform:scale(.94)}`))
check("Publish's targets are where the button and Publish changes are drawn", kf("sxk-cur-stz").includes(`translate(${U(1214 - EDIT_AT.stz[0])},${U(21 - EDIT_AT.stz[1])})`) && kf("sxk-cur-stz").includes(`translate(${U(1150 - EDIT_AT.stz[0])},${U(298 - EDIT_AT.stz[1])})`))
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("Steez plays once when the tab opens, so the finished edit stays", /\[data-mock-live\] \.wx-cur-stz\{animation:sxk-cur-stz var\(--bm-t\) var\(--bm-ease\) 1 both\}/.test(BUILDER_CSS) && !/wx-cur-ll|data-scene/.test(BUILDER_CSS))
check("every animation of the edit is under reduced motion's no-preference and moves only opacity or transform", [...BUILDER_CSS.matchAll(/@keyframes (sxk-ed-[\w-]+|sxk-cur-\w+|sxk-(?:stz|ll)-[\w-]+)\{([\s\S]*?)\}\}/g)].every((m) => !/[{;](?!opacity|transform|animation-timing-function)[a-z-]+:/.test(m[2])) && [...BUILDER_CSS.matchAll(/animation:sxk-(ed|cur|stz|ll)-/g)].length === [...BUILDER_CSS.matchAll(/@media\(prefers-reduced-motion:no-preference\)\{[^@]*animation:sxk-(ed|cur|stz|ll)-/g)].length)
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("one pointer, over the panel", /<span class="wx-curs"><svg class="bm-cursor wx-cur wx-cur-stz"/.test(wb()) && !/wx-cur-ll/.test(wb()) && /z-index:30/.test(rule(BUILDER_CSS, ".wx-curs")))
function wb() {
  return renderToStaticMarkup(createElement(WebsiteBuilderMock))
}
/* Changed on purpose (landing round 15): the canvas scrolls after the first Published, mid moment, then the products are picked. */
check("after Published the canvas scrolls down to the products, once, and stays", /\[data-mock-live\] \.stz \.stz-page\{animation:sxk-stz-scroll var\(--bm-t\) var\(--bm-ease\) 1 both\}/.test(BUILDER_CSS) && kf("sxk-stz-scroll").startsWith(`@keyframes sxk-stz-scroll{0%,${at(5.7)}{transform:none}${at(6.6)},100%{transform:translateY(`))
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("one ring, one row lit", (wb().match(/class="wx-sel wx-ring"/g) ?? []).length === 1 && (wb().match(/wx-hl/g) ?? []).length === 1 && !/wx-ring-[ab]|wx-hl-[ab]/.test(wb() + BUILDER_CSS))

console.log("\n── 3. loudlib is gone from the builder ──")
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("no loudlib site, styles or box pictures", !/loudlib|class="ll/.test(wb()) && !/\.ll[-{ ]/.test(BUILDER_CSS) && ["ll-serum", "ll-tech-house", "ll-drums", "ll-ambience", "ll-deep-house", "ll-unitech"].every((n) => !existsSync(join(root, `public/marketing/loudlib/${n}.webp`)) && !existsSync(join(root, `public/marketing/loudlib/${n}-320.webp`))))
check("the old hero and the made up MIDI kit are deleted and named nowhere", ["ll-hero", "ll-midi"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`)) && !all.includes(n)) && !/Melodic Techno MIDI|Sale 60% off all products/.test(all))

console.log("\n── The tab, the words, the suite ──")
const alt = Ideas.IDEAS_TABS[0].alt
// Changed on purpose (landing round 15): the owner asked for the builder to show only Steez; loudlib, its second scene and its boxes are gone (tests/home-landing-r15-stats.test.ts).
check("the alt text tells it as it now is", /Gradient Hoodie/.test(alt) && !/Bestselling|loudlib/.test(alt) && /typed over/.test(alt) && !/on models|club photo|new bundle/.test(alt))
const words = alt + code(read(F.builders)).replace(/className="[^"]*"/g, "")
check("no banned words, no em dashes", !/\b(unlock|elevate|seamless|powerful|effortlessly|supercharge|transform(?!:|\(|-origin))/i.test(alt) && !/—/.test(alt + read(F.builders)))
check("none of the never on the page samples", !/Nadia Brooks|The Loop\b|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|Studio Marlow|Kai Moreno|ceramics|\btotes?\b|After Dark|memberships|Mondo Mango|Mara Lind\b|Idris Kane|Ruben Linde|Juno Kada|junokada/i.test(words))
check("this suite runs with the push tests, after round 13's", /"tests\/home-landing-r13-pricing\.test\.ts",[\s\S]{0,3000}"tests\/home-landing-r14-ideas\.test\.ts"/.test(read("scripts/run-push-tests.mjs").replace(/\/\*[\s\S]*?\*\//g, "")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

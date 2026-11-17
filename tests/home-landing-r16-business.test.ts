/**
 * Landing round 16, business. The owner:
 *  - asked for another heading than "Ship it, stream it or book it" (and not
 *    the earlier disliked ones): "A page that fits what you sell", one accent
 *    word, "fits", in Storelib's purple #7c3aed.
 *  - asked for another picture of a digital product than the product page and
 *    the buyer's library: one cookbook, Ancestral Kitchen, closed beside its
 *    buy card. Buy turns into Download PDF and the book opens to its first
 *    spread (the soup's photograph, its recipe). Three flat layers under one
 *    perspective, CSS animations on transform and opacity only, once per turn
 *    under .bz-on, paused off screen; without motion the book stands open.
 *  - every picture the section names exists in public/ (one was a 404 in
 *    round 15).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as Section from "@/components/marketing/home/business-carousel"
import * as Mocks from "@/components/marketing/home/showcase-mocks/business-mocks"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const SECTION = "components/marketing/home/business-carousel.tsx"
const MOCKS = "components/marketing/home/showcase-mocks/business-mocks.tsx"
const { BUSINESS_HEADING, BUSINESS_SUB, BUSINESS_ACCENT, BUSINESS_ACCENT_COLOR, BUSINESS_SLIDES, BUSINESS_STYLES, BusinessCarousel } = Section
const { BUSINESS_MOCK_CSS, DigitalScene, PhysicalScene, CourseScene, ClubScene, CoachScene, DIGITAL_BOOK, STORE_DESIGNS, STORE_DESIGN_WIDTHS } = Mocks
const css = (BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? "").replace(/\/\*[\s\S]*?\*\//g, "")
const mocks = BUSINESS_MOCK_CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/calc\(([-\d.]+)\*var\(--u\)\)/g, "$1u")
const phoneAt = mocks.indexOf("@media(max-width:767px)")
const motionAt = mocks.indexOf("@media(prefers-reduced-motion:no-preference)")
const desk = mocks.slice(0, phoneAt)
const phone = mocks.slice(phoneAt, motionAt)
const motion = mocks.slice(motionAt)
const html = renderToStaticMarkup(createElement(BusinessCarousel))
const digital = renderToStaticMarkup(createElement(DigitalScene))
const BANNED = /unlock|elevate|seamless|powerful|effortless|supercharge|transform|—|Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|enthusiasts|Studio Marlow|Kai Moreno|ceramic|\btotes?\b|After Dark|membership|Mondo Mango|Mara Lind|Idris Kane|Ruben Linde|Juno Kada|junokada|Five ways to get paid|From a cookbook to a coaching call|Ship it, stream it|Sell files, parcels|What sellers ask us|Shopify|Liquid|Materia/i
const rule = (src: string, sel: string) => src.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? ""

console.log("\nHeading")
{
  check("the heading is \"A page that fits what you sell\"", BUSINESS_HEADING === "A page that fits what you sell" && html.includes('aria-label="A page that fits what you sell"'))
  check("none of the disliked headings in the section's code", !/Ship it, stream it or book it|Sell files, parcels or your time|Five ways to get paid|From a cookbook to a coaching call/.test(code(SECTION)))
  check("one accented word, fits, in Storelib's purple", BUSINESS_ACCENT.join() === "fits" && (html.match(/data-story-accent="true"/g) ?? []).length === 1 && BUSINESS_ACCENT_COLOR === "#7c3aed" && css.includes(".biz .biz-h{--story-accent:#7c3aed;"))
  check("two balanced lines on a phone", /\.biz \.biz-h\{max-width:none;[^}]*text-wrap:balance\}/.test(css))
  const words = [BUSINESS_HEADING, BUSINESS_SUB, ...BUSINESS_SLIDES.flatMap((s) => [s.label, s.line, s.alt]), digital.replace(/<[^>]+>/g, " ")].join(" ")
  check("no banned words, em dashes, disliked names or other brands", !BANNED.test(words), words.match(BANNED)?.[0])
}

console.log("\nDigital: a cookbook bought, then opening")
{
  check("one book: Ancestral Kitchen, a PDF by Ruth Calder, $34", DIGITAL_BOOK.name === "Ancestral Kitchen" && DIGITAL_BOOK.by === "Ruth Calder" && DIGITAL_BOOK.price === "$34" && /PDF/.test(DIGITAL_BOOK.kind))
  check("a cover, a left page with the photograph, a right page with the recipe", /<div class="bk"><div class="bk-page bk-right">[\s\S]*Roasted squash soup[\s\S]*<\/div><div class="bk-page bk-left"><img[^>]*dg-kitchen-soup\.webp[^>]*><\/div><div class="bk-cover"><img[^>]*dg-kitchen-cover\.webp/.test(digital))
  check("its buy card: Buy for $34 turns into Download PDF, a line says it is in the library", /<span class="bs-btn bk-btn"><span class="a">Buy for \$34<\/span><span class="b">[\s\S]*?Download PDF<\/span><\/span>/.test(digital) && /class="bk-paid"[\s\S]*in your library/.test(digital))
  check("its pictures exist in public/ and are small", [DIGITAL_BOOK.cover, DIGITAL_BOOK.photo].every((s) => existsSync(`public${s}`) && statSync(`public${s}`).size < 60_000))
  check("a labelled picture, the usual turn, no script", !BUSINESS_SLIDES[0].live && BUSINESS_SLIDES[0].ms === undefined && !/useState/.test(code(MOCKS)) && /<div class="smk-frame bz-frame" role="img" aria-label="A digital product on Storelib: Ancestral Kitchen/.test(html))
}

console.log("\nDigital: smooth and cheap")
{
  const own = motion.split("\n").filter((l) => /\.bk/.test(l) && /animation/.test(l))
  check("every moment is under .bz-on (restarts when shown, paused off screen by the section)", own.length >= 7 && own.every((l) => l.startsWith(".bz-on ")))
  const keys = [...motion.matchAll(/@keyframes bk-[\w-]+\{([\s\S]*?\})\}/g)].map((m) => m[1]).join("")
  const props = [...keys.matchAll(/([a-z-]+):/g)].map((m) => m[1])
  check("its keyframes touch transform and opacity only", props.length > 0 && props.every((p) => ["transform", "opacity"].includes(p)), props)
  check("flat layers under one perspective: no preserve-3d, no will-change, filter or blur", /perspective:1600u/.test(rule(desk, ".bk")) && !/preserve-3d|will-change|filter:|blur\(|backdrop/.test(mocks))
  check("the cover turns on its left edge, the left page on the spine", rule(desk, ".bk-cover").includes("transform-origin:0 50%") && rule(desk, ".bk-left").includes("transform-origin:100% 50%"))
  check("the right page waits under the closed cover (it showed through as the book faded in)", /\.bz-on \.bk-right\{animation:bk-fade \.01s linear 1\.8s backwards\}/.test(motion))
  check("the book slides from centred closed to centred open, half a page on each layout", rule(desk, ".bk").includes("--bk-shift:-140u") && rule(desk, ".bk").includes("width:560u") && rule(phone, ".bk").includes("--bk-shift:-79u") && rule(phone, ".bk").includes("width:316u") && /@keyframes bk-slide\{from\{transform:translate3d\(var\(--bk-shift\),0,0\)\}\}/.test(motion))
  check("without motion it stands at its end: the cover turned away, the button paid", /opacity:0/.test(rule(desk, ".bk-cover")) && rule(desk, ".bk-btn>.a").includes("opacity:0") && !/\.bk[\w-]*[^{]*\{[^}]*animation/.test(desk + phone))
}

console.log("\nEvery picture the section names exists")
{
  const markup = [DigitalScene, PhysicalScene, CourseScene, ClubScene, CoachScene].map((S) => renderToStaticMarkup(createElement(S))).join("")
  const srcs = [...new Set([...markup.matchAll(/src="([^"]+)"/g)].map((m) => m[1]))]
  const designs = STORE_DESIGNS.flatMap((d) => STORE_DESIGN_WIDTHS.map((w) => `/home/showcase/bt-${d}-${w}.webp`))
  const missing = [...srcs, ...designs].filter((s) => s.startsWith("/") && !existsSync(`public${s.split("?")[0]}`))
  check("every src in the five scenes and every store design is in public/", srcs.length >= 6 && missing.length === 0, missing)
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 15 entries", /"tests\/home-landing-r15-business\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r16-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

/**
 * Landing round 15, business. The owner:
 *  - disliked "From a cookbook to a coaching call": the heading is "Ship it,
 *    stream it or book it" (what happens to a parcel, a course and a call),
 *    clean, not about a store, no banned words; its one accent word, "book",
 *    is Storelib's purple (#7c3aed, the page's heading accent), not the muted
 *    grey violet #7e6fb8 nor the slate green it was given after.
 *  - disliked the digital card's shelf of six with its hover and buy: it is
 *    one calm scene now, a product page and a buyer's phone on their Storelib
 *    library. A cookbook PDF, a video course and a sample pack are bought in
 *    turn; each lands at the top of the library, tinted as the real library
 *    marks a new purchase. CSS animations on opacity and transform only, run
 *    once per turn and paused off screen; no script, no layout per frame.
 *  - physical, courses, communities and bookings stay as they are.
 */
import { existsSync, readFileSync } from "node:fs"
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
const { BUSINESS_MOCK_CSS, DigitalScene, DIGITAL_FLOW, DIGITAL_OWNED, DIGITAL_BUY_S } = Mocks
const css = (BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? "").replace(/\/\*[\s\S]*?\*\//g, "")
const mocks = BUSINESS_MOCK_CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/calc\(([-\d.]+)\*var\(--u\)\)/g, "$1u")
const phoneAt = mocks.indexOf("@media(max-width:767px)")
const motionAt = mocks.indexOf("@media(prefers-reduced-motion:no-preference)")
const desk = mocks.slice(0, phoneAt)
const phone = mocks.slice(phoneAt, motionAt)
const motion = mocks.slice(motionAt)
const html = renderToStaticMarkup(createElement(BusinessCarousel))
const digital = renderToStaticMarkup(createElement(DigitalScene))
const mocksCode = code(MOCKS)
const sectionCode = code(SECTION)
const BANNED = /unlock|elevate|seamless|powerful|effortless|supercharge|transform|—|Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|enthusiasts|Studio Marlow|Kai Moreno|ceramic|\btotes?\b|After Dark|membership|Mondo Mango|Mara Lind|Idris Kane|Ruben Linde|Juno Kada|junokada|Five ways to get paid|From a cookbook to a coaching call|What sellers ask us|Shopify|Liquid|Materia/i
const rule = (src: string, sel: string) => src.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? ""
const words = [BUSINESS_HEADING, BUSINESS_SUB, ...BUSINESS_SLIDES.flatMap((s) => [s.label, s.line, s.alt]), digital.replace(/<[^>]+>/g, " ")].join(" ")

console.log("\nHeading: new words, Storelib's purple")
{
  check("the heading is \"Ship it, stream it or book it\"", BUSINESS_HEADING === "Ship it, stream it or book it" && html.includes('aria-label="Ship it, stream it or book it"'))
  check("not a disliked heading, not about a store", !/cookbook to a coaching call|Five ways to get paid|Sell files, parcels/i.test(sectionCode) && !/\bstore\b|your store|storefront/i.test(BUSINESS_HEADING))
  check("one accented word, book", BUSINESS_ACCENT.join() === "book" && (html.match(/data-story-accent="true"/g) ?? []).length === 1)
  check("the accent is the page's purple, not the muted violet or the green", BUSINESS_ACCENT_COLOR === "#7c3aed" && css.includes(".biz .biz-h{--story-accent:#7c3aed;") && !/7e6fb8|46605c/i.test(read(SECTION)))
  check("the same purple as the story heading's own accent", /--story-accent:#7c3aed/.test(read("app/globals.css")))
  check("on a phone each verb keeps its it (no balanced break after stream)", /\.biz \.biz-h\{max-width:10\.5ch;[^}]*text-wrap:wrap\}/.test(css))
  check("no banned words, em dashes, disliked names or other brands", !BANNED.test(words))
}

console.log("\nDigital: a product page and a buyer's library")
{
  check("three products bought in turn: a cookbook PDF, a video course, a sample pack", DIGITAL_FLOW.map((p) => p.kind).join() === "Cookbook, PDF,Video course,Sample pack" && DIGITAL_FLOW.every((p) => /^\$\d+$/.test(p.price)))
  check("their pictures and the library's older ones exist", [...DIGITAL_FLOW, ...DIGITAL_OWNED].every((p) => existsSync(`public${p.src}`)))
  check("a pane per product on the page, the last standing at rest", (digital.match(/class="bl-pane"/g) ?? []).length === 3 && /\.bl-pane\{[^}]*opacity:0\}/.test(desk) && /\.bl-pane:last-child\{opacity:1\}/.test(desk))
  check("its button buys, then says it is in the library", (digital.match(/<span class="bs-btn bl-buy"><span class="a">Buy for \$\d+<\/span><span class="b">[\s\S]*?In your library<\/span><\/span>/g) ?? []).length === 3)
  check("the library is the real row's phone layout: picture, name, maker and date, Download or Open, More", (digital.match(/class="bl-row"/g) ?? []).length === DIGITAL_FLOW.length + DIGITAL_OWNED.length && /<b class="bl-title">Library<\/b>/.test(digital) && /Open<\/span><span class="bl-more">/.test(digital) && (digital.match(/Download<\/span>/g) ?? []).length === 5)
  check("the newest purchase on top, tinted the library's #f7f5ff", /\.bl-row::after\{[^}]*background:#f7f5ff;opacity:0\}/.test(desk) && /\.bl-row:first-child::after\{opacity:1\}/.test(desk) && digital.indexOf("Drums One Shots") < digital.lastIndexOf("Daily Mobility"))
  check("not a scene a visitor uses: a labelled picture, no script, no state", !BUSINESS_SLIDES.find((s) => s.id === "digital")?.live && !/DIGITAL_PRODUCTS|DIGITAL_DEMO|bd-shelf|bd-item|setPeek|setOwned/.test(mocksCode) && !/useState/.test(mocksCode))
  check("the turn is three purchases and a moment to stand", BUSINESS_SLIDES.find((s) => s.id === "digital")?.ms === Math.round((DIGITAL_BUY_S * 3 + 0.8) * 1000) && html.includes("--biz-ms:10400ms"))
}

console.log("\nDigital: smooth and cheap")
{
  const own = motion.split("\n").filter((l) => /\.bl-/.test(l) && /animation/.test(l))
  check("every moment is under .bz-on (restarts when shown, paused off screen by the section)", own.length >= 7 && own.every((l) => l.startsWith(".bz-on ")))
  check("the list is one layer stepping a row down at each purchase, one timeline", /\.bz-on \.bl-d\{animation:bl-drop 8\.7s linear both\}/.test(motion) && /@keyframes bl-drop\{0%\{transform:translate3d\(0,calc\(var\(--row\) \* -3\),0\)\}17\.24%/.test(motion) && (digital.match(/class="bl-d"/g) ?? []).length === 1)
  const keys = [...motion.matchAll(/@keyframes bl-[\w-]+\{([\s\S]*?\})\}/g)].map((m) => m[1]).join("")
  const props = [...keys.matchAll(/([a-z-]+):/g)].map((m) => m[1])
  check("its keyframes touch transform and opacity only", props.length > 0 && props.every((p) => ["transform", "opacity", "animation-timing-function"].includes(p)), props)
  check("the highlight is an ::after (the section's off screen pause covers * and *::after)", !/\.bl-[\w-]+::before/.test(mocks) && /\.biz:not\(\[data-live\]\) \.bz-on \*,\.biz:not\(\[data-live\]\) \.bz-on \*::after\{animation-play-state:paused!important\}/.test(css))
  check("no will-change, filter or blur added", !/will-change|filter:|blur\(|backdrop/.test(mocks))
  check("without motion it stands at its end (all moments inside the no-preference block)", !/\.bl-[\w-]+[^{]*\{[^}]*animation/.test(desk) && !/\.bl-[\w-]+[^{]*\{[^}]*animation/.test(phone))
}

console.log("\nDigital on a phone")
{
  check("the page on top, its button full width, the list hidden behind nothing", rule(phone, ".bl-card").includes("height:190u") && rule(phone, ".bl-info .bl-buy").includes("position:absolute") && rule(phone, ".bl-gets").includes("display:none"))
  check("the phone under it, running off the card's foot", rule(phone, ".bl-phone").includes("top:220u") && 220 + 420 > 520)
}

console.log("\nThe other four stay")
{
  check("physical, courses, communities and bookings keep their scenes", BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings" && BUSINESS_SLIDES[1].live === true && /\.bs-store\{background:radial-gradient/.test(desk) && /\.bz-on \.bp-bar i\{animation:bz-play/.test(motion))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 14 entries", /"tests\/home-landing-r14-everything\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r15-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

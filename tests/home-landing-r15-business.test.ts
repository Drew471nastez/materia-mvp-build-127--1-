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
const { BUSINESS_MOCK_CSS, DigitalScene } = Mocks
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
  /* Changed on purpose (landing round 16): the owner disliked "Ship it, stream it or book it": "A page that fits what you sell", "fits" accented (tests/home-landing-r16-business.test.ts). */
  check("the heading is \"Ship it, stream it or book it\"", BUSINESS_HEADING === "A page that fits what you sell" && html.includes('aria-label="A page that fits what you sell"'))
  check("not a disliked heading, not about a store", !/cookbook to a coaching call|Five ways to get paid|Sell files, parcels/i.test(sectionCode) && !/\bstore\b|your store|storefront/i.test(BUSINESS_HEADING))
  check("one accented word, book", BUSINESS_ACCENT.join() === "fits" && (html.match(/data-story-accent="true"/g) ?? []).length === 1)
  check("the accent is the page's purple, not the muted violet or the green", BUSINESS_ACCENT_COLOR === "#7c3aed" && css.includes(".biz .biz-h{--story-accent:#7c3aed;") && !/7e6fb8|46605c/i.test(read(SECTION)))
  check("the same purple as the story heading's own accent", /--story-accent:#7c3aed/.test(read("app/globals.css")))
  check("on a phone each verb keeps its it (no balanced break after stream)", /* Changed on purpose (landing round 16): no verbs left to keep together; two balanced lines. */ /\.biz \.biz-h\{max-width:none;[^}]*text-wrap:balance\}/.test(css))
  check("no banned words, em dashes, disliked names or other brands", !BANNED.test(words))
}

/*
  Changed on purpose (landing round 16): the owner asked for another picture of a digital product. The product page
  and the buyer's library are gone; the scene is one cookbook that is bought and opens to its first spread, pinned in
  tests/home-landing-r16-business.test.ts. What stays from this round: a labelled picture, no script, every moment
  under .bz-on on transform and opacity.
*/
console.log("\nDigital: replaced in round 16")
{
  check("the library scene is gone", !/bl-pane|bl-phone|bl-drop|DIGITAL_FLOW|DIGITAL_OWNED/.test(mocksCode + mocks) && !/useState/.test(mocksCode) && !BUSINESS_SLIDES.find((s) => s.id === "digital")?.live)
}

console.log("\nThe other four stay")
{
  check("physical, courses, communities and bookings keep their scenes", BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings" && BUSINESS_SLIDES[1].live === true && /\.bs-store\{background:radial-gradient/.test(desk) && /\.bz-on \.bp-bar i\{animation:bz-play/.test(motion))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 14 entries", /"tests\/home-landing-r14-everything\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r15-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

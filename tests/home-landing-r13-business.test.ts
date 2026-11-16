/**
 * Landing round 13, business. The owner:
 *  - wanted a better heading than "One store, every kind of product", compact,
 *    specific and natural, with far less purple: "Five ways to get paid", one
 *    accented word in a greyer violet, and a line of at most ten words.
 *  - disliked the green banner of Applied AI Club: the banner is now the
 *    club's photograph under a soft ink shade, the logo white, the page under
 *    it a quiet grey, no green.
 *  - asked for the mobility course and Ancestral Kitchen on the digital card
 *    (their pictures from earlier rounds, public/home/sell-map): two tiles and
 *    one order that pays and downloads.
 *  - asked for the physical card to be an endless, layered 3D line of store
 *    designs (from the owner's own theme export): one in front, the others
 *    stacked behind it in perspective, smooth and cheap. Six cards walk six
 *    places on one keyframe animation each, a step apart, transform and
 *    opacity only; it runs only while its scene is chosen (a phone: its card
 *    in view or beside it) and pauses with the section off screen.
 *  - keeps round 12's phone layout, a row of whole cards on the browser's own
 *    snap scroll.
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
const { BUSINESS_MOCK_CSS, DigitalScene, PhysicalScene, ClubScene, DIGITAL_PRODUCTS, DIGITAL_ORDER, STORE_DESIGNS, STORE_DESIGN_WIDTHS, STORE_STEP_S, STORE_GLIDE_S, STORE_LOOP_S } = Mocks
const css = (BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? "").replace(/\/\*[\s\S]*?\*\//g, "")
const mocks = BUSINESS_MOCK_CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/calc\(([-\d.]+)\*var\(--u\)\)/g, "$1u")
const phoneAt = mocks.indexOf("@media(max-width:767px)")
const motionAt = mocks.indexOf("@media(prefers-reduced-motion:no-preference)")
const desk = mocks.slice(0, phoneAt)
const phone = mocks.slice(phoneAt, motionAt)
const motion = mocks.slice(motionAt)
const html = renderToStaticMarkup(createElement(BusinessCarousel))
const digital = renderToStaticMarkup(createElement(DigitalScene))
const physical = renderToStaticMarkup(createElement(PhysicalScene))
const club = renderToStaticMarkup(createElement(ClubScene))
const BANNED = /unlock|elevate|seamless|powerful|effortless|supercharge|transform|—|Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|enthusiasts|Studio Marlow|Kai Moreno|ceramic|\btotes?\b|After Dark|membership|Mondo Mango|Mara Lind|Shopify|Liquid|Materia/i
const rule = (src: string, sel: string) => src.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? ""

console.log("\nHeading: specific, short, far less purple")
{
  check("Five ways to get paid", BUSINESS_HEADING === "Five ways to get paid" && html.includes('aria-label="Five ways to get paid"'))
  check("one accented word, and it is in the heading", BUSINESS_ACCENT.length === 1 && BUSINESS_ACCENT[0] === "paid" && (html.match(/data-story-accent="true"/g) ?? []).length === 1)
  check("the accent is a greyer violet than the page's, set on this heading only", BUSINESS_ACCENT_COLOR === "#7e6fb8" && css.includes(`.biz .biz-h{--story-accent:${BUSINESS_ACCENT_COLOR};`))
  check("the line names the five kinds in at most ten words", BUSINESS_SUB === "Downloads, goods, courses, communities and calls, one checkout." && BUSINESS_SUB.split(/\s+/).length <= 10)
  check("no banned words, em dashes or other brands in the copy", !BANNED.test([BUSINESS_HEADING, BUSINESS_SUB, ...BUSINESS_SLIDES.flatMap((s) => [s.label, s.line, s.alt]), digital, physical, club].join(" ")))
}

console.log("\nDigital: the mobility course and Ancestral Kitchen")
{
  check("the two products, priced, from one store", DIGITAL_PRODUCTS.map((p) => `${p.name} ${p.price}`).join() === "Ancestral Kitchen $34,Daily Mobility $79" && DIGITAL_ORDER.total === "$113" && digital.includes("from Ruth Calder"))
  check("their pictures are the earlier rounds' own, small", ["ancestral-kitchen-cookbook", "mobility-course"].every((n) => digital.includes(`/home/sell-map/${n}.webp`) && statSync(`public/home/sell-map/${n}.webp`).size < 60_000))
  check("two tiles and one order card listing both, with the total", (digital.match(/class="bd-tile bd-tile-\d"/g) ?? []).length === 2 && (digital.match(/class="bs-card bd-card"/g) ?? []).length === 1 && /Total<\/span><b>\$113<\/b>/.test(digital))
  check("the moment in the button: Pay, Downloading the cookbook, Ready in your library", /<span class="a">Pay \$113<\/span><span class="b">[\s\S]*?Downloading the cookbook<\/span><span class="c">[\s\S]*?Ready in your library<\/span>/.test(digital))
  check("the ground is the cookbook picture's own paper", /\.bs-digital\{background:#e6dfd1\}/.test(desk))
  check("on a phone the tiles stand side by side over the order", rule(phone, ".bd-tile-1").includes("left:186u") && rule(phone, ".bd-card").includes("bottom:14u"))
  check("Slow Mornings, Night Face Oil and their photographs are gone", !/Slow Mornings|Night Face Oil|bz-ebook|bz-eggs|bz-oil|be-cover|be-page|bo-thumb/.test(code(MOCKS) + code(SECTION)) && ["bz-ebook", "bz-eggs", "bz-oil"].every((n) => !existsSync(`public/home/showcase/${n}.webp`)))
}

console.log("\nPhysical: an endless 3D line of store designs")
{
  check("six store designs, each a 4:5 webp at three widths, small", STORE_DESIGNS.length === 6 && STORE_DESIGN_WIDTHS.join() === "380,560,760" && STORE_DESIGNS.every((d) => STORE_DESIGN_WIDTHS.every((w) => existsSync(`public/home/showcase/bt-${d}-${w}.webp`) && statSync(`public/home/showcase/bt-${d}-${w}.webp`).size < (w === 760 ? 56_000 : 40_000))))
  const bytes = (w: number) => STORE_DESIGNS.reduce((n, d) => n + statSync(`public/home/showcase/bt-${d}-${w}.webp`).size, 0)
  check("the whole line is light: under 100 KB on a phone, 160 KB on a laptop", bytes(380) < 100_000 && bytes(560) < 160_000, [bytes(380), bytes(560), bytes(760)])
  check("each picture is sized, chosen by srcset for its drawn width, decoded off the thread", (physical.match(/<img [^>]*srcSet="\/home\/showcase\/bt-\w+-380\.webp 380w, \/home\/showcase\/bt-\w+-560\.webp 560w, \/home\/showcase\/bt-\w+-760\.webp 760w"[^>]*width="560" height="700"[^>]*decoding="async"/g) ?? []).length === 6)
  check("each card a step later in the loop (negative delays)", STORE_DESIGNS.every((_, i) => physical.includes(`--d:${+(-i * STORE_STEP_S).toFixed(3)}s`)) && STORE_LOOP_S === 14.4 && STORE_GLIDE_S < STORE_STEP_S)
  check("the stage holds the 3D: perspective and preserve-3d", /\.bt-stage\{[^}]*perspective:1500u;[^}]*transform-style:preserve-3d\}/.test(desk))
  check("each card rests at its own place (the line whole without motion)", STORE_DESIGNS.every((_, i) => new RegExp(`\\.bt-card:nth-child\\(${i + 1}\\)\\{transform:translate3d\\(`).test(desk)) && /\.bt-card:nth-child\(1\)\{transform:translate3d\(0u,0,0u\) rotateY\(0deg\);opacity:1\}/.test(desk))
  const walk = desk.match(/@keyframes bt-walk\{([\s\S]*?\})\}/)?.[1] ?? ""
  const props = walk.match(/[a-z-]+(?=:)/g) ?? []
  check("the walk moves transform and opacity only (and eases its glides)", walk.length > 0 && props.every((p) => ["transform", "opacity", "animation-timing-function"].includes(p)), [...new Set(props)])
  check("the walk holds at each of six places, then glides", (walk.match(/\d+(\.\d+)?%\{/g) ?? []).length === 13)
  check("the phone draws the same walk closer together, by the same name", /@keyframes bt-walk\{/.test(phone) && /\.bt-stage\{width:276u;height:345u;/.test(phone))
  check("it runs only on a chosen scene, endless, from its own delay", /\.bz-on \.bt-card\{animation:bt-walk 14\.4s linear var\(--d,0s\) infinite both\}/.test(motion))
  check("it is the only loop, and it pauses off screen with the section", (motion.match(/infinite/g) ?? []).length === 1 && /\.biz:not\(\[data-live\]\) \.bz-on \*/.test(css))
  check("no filter, blur or will-change anywhere in the scenes", !/filter|blur\(|will-change|backdrop/.test(mocks))
  check("physical's turn on a computer is four moves long", BUSINESS_SLIDES[1].id === "physical" && BUSINESS_SLIDES[1].ms === STORE_STEP_S * 4000)
}

console.log("\nCommunity: no green")
{
  check("the banner is the club's photograph in its own colours under a soft ink shade", !/mix-blend-mode/.test(rule(desk, ".bs-com-pic")) && /linear-gradient\(to right,rgba\(17,17,20,\.82\)/.test(rule(desk, ".bs-com-cover::after")))
  check("no green left in the club: banner, logo, button, page, tags", !/#123227|#d9f969|#f3f6ef|#e3e8dc|#e4ebdc/i.test(mocks + club) && club.includes('fill="#fff"'))
  check("the page under the banner is a quiet grey, not white", rule(desk, ".bs-com").includes("background:#f5f5f3"))
}

console.log("\nThe phone keeps round 12's row of cards")
{
  check("a row of whole cards on the browser's snap scroll", /\.biz-rail\{display:flex;[^}]*scroll-snap-type:x mandatory/.test(css) && /Math\.abs\(i - railAt\) <= 1 \? "biz-slide bz-on" : "biz-slide"/.test(code(SECTION)))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 12 entries", /"tests\/home-landing-r12-perf\.test\.ts",[\s\S]{0,800}"tests\/home-landing-r13-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

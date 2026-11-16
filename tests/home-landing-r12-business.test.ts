/**
 * Landing round 12, business ("One store, every kind of product"). The owner:
 *  - liked the courses, communities and bookings cards, and disliked the
 *    digital card (the row of covers, "the high-end Lightroom presets") and
 *    the physical card (the tee, cap, tote and print). Both are rebuilt like
 *    the liked three: one real product, photographed, inside a believable
 *    Storelib page, with one moment on it. Digital is Slow Mornings, an
 *    e-book (its cover in front of a page from inside; bought, the PDF
 *    downloads in the button). Physical is Night Face Oil (its photograph
 *    and two details as a gallery; a size picked, added to the cart).
 *  - disliked the whole section on a phone. Below 768px the five kinds are a
 *    row of cards that slides under the thumb on the browser's own scroll
 *    with snap points: each card its name, its line and its scene drawn at
 *    360 x 520, the next card showing at the right; no row of words cut at
 *    the edges, no autoplay, no script moving the row.
 *  The heading and its line, the computer's index, the ring clock, courses,
 *  communities and bookings stay.
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
const { BUSINESS_HEADING, BUSINESS_SUB, BUSINESS_SLIDES, BUSINESS_STYLES, BusinessCarousel, BUSINESS_RAIL_QUERY } = Section
const { BUSINESS_MOCK_CSS, DigitalScene, PhysicalScene, CourseScene, ClubScene, CoachScene, DIGITAL_PRODUCT, PHYSICAL_PRODUCT } = Mocks
const css = (BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? "").replace(/\/\*[\s\S]*?\*\//g, "")
const mocks = BUSINESS_MOCK_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
const desk = mocks.split("@media(max-width:767px)")[0]
const phone = mocks.slice(mocks.indexOf("@media(max-width:767px)"), mocks.indexOf("@media(prefers-reduced-motion:no-preference)"))
const motion = mocks.slice(mocks.indexOf("@media(prefers-reduced-motion:no-preference)"))
const html = renderToStaticMarkup(createElement(BusinessCarousel))
const digital = renderToStaticMarkup(createElement(DigitalScene))
const physical = renderToStaticMarkup(createElement(PhysicalScene))
const pic = (n: string) => `public/home/showcase/${n}.webp`
const small = (n: string) => existsSync(pic(n)) && statSync(pic(n)).size < 120 * 1024
const BANNED = /unlock|elevate|seamless|powerful|effortless|supercharge|transform your|—|Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|enthusiasts|Studio Marlow|Kai Moreno|ceramic|\btotes?\b|After Dark|membership|Mondo Mango|Mara Lind|Shopify|Liquid/i

console.log("\nHeading and line kept")
{
  check("the heading and its line are round 11's", BUSINESS_HEADING === "One store, every kind of product" && BUSINESS_SUB === "Downloads, merch, courses, communities and calls, each with checkout." && BUSINESS_SUB.split(/\s+/).length <= 10)
  check("five kinds in the same order", BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings")
}

console.log("\nDigital: one e-book on its page, not a row of covers or presets")
{
  check("Slow Mornings by Ana Folau, $16", DIGITAL_PRODUCT.name === "Slow Mornings" && DIGITAL_PRODUCT.kind === "E-book" && DIGITAL_PRODUCT.price === "$16" && digital.includes("by Ana Folau · 96 pages · PDF and EPUB"))
  check("no presets, no Lightroom, no row of covers anywhere in the section", !/preset|Lightroom|Highland|bd-rail|bd-track|bd-slot|DIGITAL_PRODUCTS|DIGITAL_STEP_S/i.test(code(MOCKS) + code(SECTION) + digital) && !/presets/i.test(BUSINESS_SLIDES[0].line))
  check("its cover: a real photograph under a printed title band, with the light along the spine", /class="be-cover"><img src="\/home\/showcase\/bz-ebook\.webp"[^>]*loading="eager"[\s\S]*?class="be-cover-band"><i>Ana Folau<\/i><b>Slow Mornings<\/b><em>40 breakfasts worth waking for<\/em>/.test(digital) && /\.be-cover::before\{[^}]*linear-gradient\(to right/.test(desk))
  check("a page from inside behind it: its own photograph, a recipe in the book's serif, a page number", /class="be-page"><img src="\/home\/showcase\/bz-eggs\.webp"[\s\S]*?<b>Soft eggs on rye<\/b>[\s\S]*?class="be-page-n">14</.test(digital) && small("bz-eggs") && small("bz-ebook"))
  check("the buy card lists the four chapters with their pages", (digital.match(/<li><i>\d<\/i><b>[^<]+<\/b><em>p\. \d+<\/em><\/li>/g) ?? []).length === 4)
  check("the moment is in the button: Buy, Downloading the PDF over a fill, Downloaded", /class="bs-btn bs-press be-buy"><span class="be-fill"><\/span><span class="a">Buy for \$16<\/span><span class="b">[\s\S]*?Downloading Slow-Mornings\.pdf<\/span><span class="c">[\s\S]*?Downloaded<\/span>/.test(digital))
  check("at rest (reduced motion) it stands downloaded: Buy and Downloading hidden, the fill hidden", /\.be-buy>\.a,\.be-buy>\.b\{opacity:0\}/.test(desk) && /\.be-fill\{[^}]*opacity:0\}/.test(desk))
  check("the fill grows by transform (scaleX), not width", /@keyframes be-fill\{0%\{opacity:1;transform:scaleX\(0\)\}/.test(motion) && !/be-fill\{[^}]*width:\s*\d/.test(motion))
}

console.log("\nPhysical: one product photographed, not merch")
{
  check("Night Face Oil by Marisol Vega, $38, three sizes, 30 ml picked", PHYSICAL_PRODUCT.name === "Night Face Oil" && PHYSICAL_PRODUCT.price === "$38" && PHYSICAL_PRODUCT.options.join() === "15 ml,30 ml,50 ml" && PHYSICAL_PRODUCT.options[PHYSICAL_PRODUCT.pick] === "30 ml")
  check("no tee, cap, tote or print left in the scene or its pictures", !/bz-tee|bz-cap|bz-tote|bz-print|Studio Tee|Studio Cap|Market Tote|Field Study|PHYSICAL_PRODUCTS|TeeScene/.test(code(MOCKS) + code(SECTION) + physical) && !["bz-tee", "bz-cap", "bz-tote", "bz-print", "bz-presets", "bz-drums"].some((n) => existsSync(pic(n))))
  check("one real photograph, small, used for the main view, two details and the cart note", (physical.match(/<img src="\/home\/showcase\/bz-oil\.webp"/g) ?? []).length === 5 && small("bz-oil"), (physical.match(/<img src="\/home\/showcase\/bz-oil\.webp"/g) ?? []).length)
  check("the gallery: three thumbnails, the first ringed, the details are the same photograph cropped by transform", (physical.match(/class="bo-thumb bo-thumb-[abc]"/g) ?? []).length === 3 && /\.bo-thumb-a::after\{[^}]*box-shadow:inset 0 0 0 2u #18181b/.test(desk.replace(/calc\(([\d.]+)\*var\(--u\)\)/g, "$1u")) && /\.bo-thumb-b \.smk-pic\{[^}]*transform:scale\(/.test(desk))
  check("its card: name, maker, price, a line, the size picker, shipping and the button", ["Night Face Oil", "by Marisol Vega · Small batch, cold pressed", "$38", "Three drops before bed.", "Ships in 2 days, tracked", "Add to cart", "Added to cart"].every((w) => physical.includes(w)))
  check("the moment: the size ringed, the button pressed, Added to cart, the cart note", /\.bz-on \.bo-ring\{animation:bz-pop /.test(motion) && /\.bz-on \.bs-oil \.bs-press\{animation:bz-press /.test(motion) && /\.bz-on \.bs-oil \.bs-swap \.b\{animation:bz-in /.test(motion) && /\.bz-on \.bo-added\{animation:bz-rise /.test(motion))
  check("the turns are the usual length again (no loop inside a scene)", BUSINESS_SLIDES.every((s) => s.ms === undefined) && !/infinite/.test(motion))
}

console.log("\nEvery moment on the compositor")
{
  const frames = motion.match(/@keyframes [\w-]+\{[\s\S]*?\}\}/g) ?? []
  const props = frames.flatMap((f) => f.replace(/@keyframes [\w-]+\{/, "").match(/[a-z-]+(?=:)/g) ?? [])
  check("every keyframe moves only opacity and transform", frames.length >= 15 && props.every((p) => ["opacity", "transform", "animation-timing-function"].includes(p)), [...new Set(props)])
}

console.log("\nA phone: a row of cards on the browser's own scroll")
{
  check("the phone layout is below 768px", BUSINESS_RAIL_QUERY === "(max-width: 767px)")
  check("the layout is read with useSyncExternalStore on matchMedia, false on the server", /useSyncExternalStore\(subscribeRail, railNow, railOnServer\)/.test(code(SECTION)) && /const railOnServer = \(\) => false/.test(code(SECTION)))
  check("the row: edge to edge, scroll snap to each card's start, one card a flick, no scrollbar", /\.biz-rail\{display:flex;gap:var\(--home-edge,20px\);margin:0 calc\(var\(--home-edge,20px\) \* -1\);[^}]*overflow-x:auto;[^}]*overscroll-behavior-x:contain;scroll-snap-type:x mandatory;[^}]*scrollbar-width:none/.test(css) && /\.biz-card\{flex:none;width:calc\(100% - 22px\);scroll-snap-align:start;scroll-snap-stop:always\}/.test(css))
  check("the last card can stop at the left edge too (a spacer after it)", /\.biz-rail::after\{content:"";flex:none;width:22px\}/.test(css))
  check("nothing moves the row by script and nothing listens to the finger on it", !/scrollTo|scrollLeft\s*=|scrollBy|touchmove|onTouch|onPointerMove/.test(code(SECTION).slice(code(SECTION).indexOf("const railRef"))) && !/railRef[\s\S]{0,400}onPointerDown/.test(code(SECTION)))
  check("the card in view is read only after the row has been still (debounced), never per frame", /settle\.current = setTimeout\([\s\S]*?BUSINESS_RAIL_SETTLE_MS\)/.test(code(SECTION)) && Section.BUSINESS_RAIL_SETTLE_MS >= 100 && !/requestAnimationFrame/.test(code(SECTION)))
  check("a card's moment plays when it is in view or beside it", /Math\.abs\(i - railAt\) <= 1 \? "biz-slide bz-on" : "biz-slide"/.test(code(SECTION)))
  check("each card carries its own name (h3) and line above its scene", /<div className="biz-card-h">\s*<h3 id=\{`biz-card-\$\{s\.id\}`\}>\{s\.label\}<\/h3>\s*<p>\{s\.line\}<\/p>/.test(read(SECTION)))
  check("no autoplay and no row of words on a phone", /data-auto=\{\(t\.playing && !rail\) \|\| undefined\}/.test(code(SECTION)) && /const run = t\.run && !held && !rail/.test(code(SECTION)) && /\{rail \? \(/.test(code(SECTION)))
  check("the scenes are drawn at 360 x 520 on a phone", /\.bz-frame\{aspect-ratio:360\/520\}/.test(phone) && /\.bz-frame>\.smk\{--w:360\}/.test(phone))
  check("the computer keeps its index, its stage and the ring clock", /role="tablist"/.test(html) && (html.match(/role="tab"/g) ?? []).length === 5 && /e\.animationName === "biz-ring-b"\) advance\(\)/.test(code(SECTION)) && /\.bz-frame\{aspect-ratio:1100\/570;/.test(desk))
}

console.log("\nThe three the owner liked")
{
  const course = renderToStaticMarkup(createElement(CourseScene))
  const club = renderToStaticMarkup(createElement(ClubScene))
  const coach = renderToStaticMarkup(createElement(CoachScene))
  check("course, community and booking are drawn as before on a computer", course.includes("Mixing in key, for new DJs") && club.includes("Build one AI tool a week") && coach.includes("Booked for Thu 19, 17:30") && /\.bs-ccard\{position:absolute;left:50%;top:calc\(22\*var\(--u\)\);bottom:calc\(22\*var\(--u\)\);width:calc\(720\*var\(--u\)\)/.test(desk))
  check("no banned words or names in the section, its alt texts or its scenes", !BANNED.test([BUSINESS_HEADING, BUSINESS_SUB, ...BUSINESS_SLIDES.flatMap((s) => [s.label, s.line, s.alt]), html, digital, physical, course, club, coach].join(" ")))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 11 entries", /"tests\/home-landing-r11-stability\.test\.ts",[\s\S]{0,3000}"tests\/home-landing-r12-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

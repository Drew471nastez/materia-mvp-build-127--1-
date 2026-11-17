/**
 * Landing round 14, business. The owner:
 *  - disliked "Five ways to get paid": the heading is "From a cookbook to a
 *    coaching call", the two ends of what the cards show (real things on
 *    them), not a store's jargon and not the Everything section's "Sell what
 *    you make" again; one accent word in the same quiet violet.
 *  - physical: keep the 3D line of store designs turning by itself, but let
 *    people drag it (mouse and touch), very smooth, and make it much cheaper
 *    to run; its grey was too grey. The line is one position moved by a
 *    drag (pointer events, drawn once a frame) and by glides (one Web
 *    Animation per card on transform and opacity, so on the compositor); a
 *    fling stops on a design, a tap brings a side card forward; it turns by
 *    itself after a pause, only while its scene is shown and on screen;
 *    five cards drawn at most, no will-change, pictures at 380 and 560 wide.
 *  - digital: disliked its ground and motion; a shelf of six real looking
 *    downloads a visitor can point at (or tap), open and buy, the download
 *    happening in the button; a clean pale ground.
 *  - phones: the section looked cut off; each card is now the whole column,
 *    a neighbour never shows, and a line of five under the row tells where
 *    you are and takes you to any card.
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
const { BUSINESS_HEADING, BUSINESS_SUB, BUSINESS_ACCENT, BUSINESS_ACCENT_COLOR, BUSINESS_SLIDES, BUSINESS_STYLES, BUSINESS_PLAY_RESUME_MS, BusinessCarousel } = Section
const { BUSINESS_MOCK_CSS, DigitalScene, PhysicalScene, DIGITAL_PRODUCTS, DIGITAL_DEMO, STORE_DESIGNS, STORE_DESIGN_WIDTHS, STORE_IDLE_MS, storePlace } = Mocks
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
const mocksCode = code(MOCKS)
const sectionCode = code(SECTION)
const BANNED = /unlock|elevate|seamless|powerful|effortless|supercharge|transform|—|Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|enthusiasts|Studio Marlow|Kai Moreno|ceramic|\btotes?\b|After Dark|membership|Mondo Mango|Mara Lind|Idris Kane|Ruben Linde|Juno Kada|junokada|Five ways to get paid|What sellers ask us|Shopify|Liquid|Materia/i
const rule = (src: string, sel: string) => src.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? ""

console.log("\nHeading: not five ways to get paid")
{
  /* Changed on purpose (landing round 15): the owner asked for a better heading: "Sell files, parcels or your time". */
  check("From a cookbook to a coaching call", BUSINESS_HEADING === "Sell files, parcels or your time" && html.includes('aria-label="Sell files, parcels or your time"'))
  /* Changed on purpose (landing round 15): the owner disliked the violet; the accent is "time", in the slate green of the bookings card's photograph. */
  check("one accented word, call, in the same quiet violet", BUSINESS_ACCENT.join() === "time" && (html.match(/data-story-accent="true"/g) ?? []).length === 1 && BUSINESS_ACCENT_COLOR === "#46605c")
  check("not the Everything section's \"Sell what you make\" again", !/Sell what you make/i.test(BUSINESS_HEADING))
  check("the heading is wide enough for two lines on a computer", /\.biz \.biz-h\{[^}]*max-width:19ch/.test(css))
  check("no store jargon, banned words, em dashes, disliked names or other brands", !/\bstore\b|checkout page|storefront/i.test(BUSINESS_HEADING) && !BANNED.test([BUSINESS_HEADING, BUSINESS_SUB, ...BUSINESS_SLIDES.flatMap((s) => [s.label, s.line, s.alt]), digital, physical, ...DIGITAL_PRODUCTS.flatMap((p) => [p.name, p.kind, p.by, ...p.gets, p.doing, p.done])].join(" ")))
}

console.log("\nDigital: a shelf a visitor can use")
{
  check("six products, each a different kind, priced", DIGITAL_PRODUCTS.length === 6 && new Set(DIGITAL_PRODUCTS.map((p) => p.kind)).size === 6 && DIGITAL_PRODUCTS.every((p) => /^\$\d+$/.test(p.price)))
  check("the cookbook, the mobility course, a LUT pack, a sample pack, a Notion template and a PDF guide", ["Ancestral Kitchen", "Daily Mobility", "Cine Tones", "Drums One Shots", "Creator Planner", "Pricing Your Work"].every((n) => DIGITAL_PRODUCTS.some((p) => p.name === n)) && /LUT pack/.test(digital) && /Sample pack/.test(digital) && /Notion template/.test(digital) && /Guide, PDF/.test(digital))
  check("their pictures exist and are small (earlier rounds' own, two covers drawn for it)", DIGITAL_PRODUCTS.every((p) => existsSync(`public${p.src}`) && statSync(`public${p.src}`).size < 40_000) && ["dg-creator-planner", "dg-pricing-guide"].every((n) => existsSync(`public/home/showcase/${n}.webp`)))
  check("each product is a button, pressed when chosen", (digital.match(/<button type="button" class="bd-item" aria-pressed="(true|false)" aria-label="[^"]+, [^"]+, \$\d+"/g) ?? []).length === 6)
  check("a pane per product, one shown, the others inert and hidden from readers", (digital.match(/class="bd-pane"/g) ?? []).length === 6 && (digital.match(/data-on="true"/g) ?? []).length === 1 && (digital.match(/inert=""/g) ?? []).length === 5)
  check("each pane: what comes in it, and a button that buys it and downloads in place", (digital.match(/class="bd-gets"/g) ?? []).length === 6 && /<button type="button" class="bs-btn bd-buy"><span class="bd-fill"><\/span><span class="a">Buy for \$\d+<\/span><span class="b">[\s\S]*?<\/span><span class="c">/.test(digital))
  check("pointing at a product shows it (a mouse), a tap or click chooses it", /onPointerEnter=\{\(e\) => \{\s*if \(e\.pointerType === "mouse"\) setPeek\(i\)/.test(mocksCode) && /onClick=\{\(\) => \{\s*setSel\(i\)/.test(mocksCode) && /onPointerLeave=\{\(\) => setPeek\(null\)\}/.test(mocksCode))
  check("it shows itself only until someone touches it, and only while on", /if \(!on \|\| mine \|\| matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return/.test(mocksCode) && /onPointerDown=\{take\} onKeyDown=\{take\}/.test(mocksCode) && DIGITAL_DEMO.order.length === 3 && DIGITAL_DEMO.buyMs < 6500 - 1800)
  check("a clean pale ground, not round 13's beige", /\.bs-digital\{background:#ecf1ec\}/.test(desk) && !/#e6dfd1/.test(mocks))
  check("the moment runs on transform and opacity, only once a product is bought", /\.bd-buy\[data-go\]>\.bd-fill\{animation:be-fill/.test(motion) && /\.bd-fill\{[^}]*transform:scaleX\(0\)/.test(desk) && !/\.bz-on \.bd-/.test(motion))
  check("on a phone: three by two covers over the pane, nothing cut", rule(phone, ".bd-shelf").includes("grid-template-columns:repeat(3,104u)") && rule(phone, ".bd-view").includes("top:246u") && rule(phone, ".bd-view").includes("bottom:14u") && rule(phone, ".bd-cap").includes("display:none"))
  check("round 13's order card is gone", !/bd-tile|bd-card|bd-lines|DIGITAL_ORDER|Ready in your library/.test(mocksCode))
}

console.log("\nPhysical: the line turns by itself and under a drag, cheaply")
{
  check("six designs, pictures at 380 and 560 wide only (the 760s gone), small", STORE_DESIGN_WIDTHS.join() === "380,560" && STORE_DESIGNS.every((d) => existsSync(`public/home/showcase/bt-${d}-380.webp`) && statSync(`public/home/showcase/bt-${d}-560.webp`).size < 40_000 && !existsSync(`public/home/showcase/bt-${d}-760.webp`)))
  check("the pictures' sizes match their drawn width", (physical.match(/sizes="\(max-width: 767px\) 66vw, \(max-width: 1279px\) 27vw, 21vw"/g) ?? []).length === 6)
  check("places: front, two each side, one hidden behind; any position is a picture", /* Changed on purpose (landing round 15): more depth: side cards further apart and back, a little smaller. */ storePlace(0).o === 1 && storePlace(0).s === 1 && storePlace(1).x === 268 && storePlace(1).s < 1 && storePlace(-2).o === 0.55 && storePlace(3).o === 0 && storePlace(-3).o === 0 && Math.abs(storePlace(0.5).x - 134) < 0.01 && storePlace(9).x === storePlace(3).x)
  check("five cards drawn at most: the one behind is hidden for real", /* Changed on purpose (landing round 15): written only when it changes. */ /show\(i, f\.opacity > 0\.001\)/.test(mocksCode) && /cards\[i\]\.style\.visibility = v \? "visible" : "hidden"/.test(mocksCode) && /\.bt-card:nth-child\(4\)\{[^}]*visibility:hidden\}/.test(desk))
  check("a drag: pointer events on the stage, sideways only, drawn once a frame", /stage\.addEventListener\("pointerdown", down\)/.test(mocksCode) && /stage\.addEventListener\("pointermove", move\)/.test(mocksCode) && /requestAnimationFrame\(\(\) => \{\s*raf = 0\s*paint\(q\)/.test(mocksCode) && /\.bt-stage\{[^}]*touch-action:pan-y;cursor:grab/.test(desk) && /\.bt-stage\[data-drag\]\{cursor:grabbing\}/.test(desk))
  check("let go: on with its speed to the nearest design, at most two away; a tap brings a side card forward", /let to = Math\.round\(q \+ v \* 240\)/.test(mocksCode) && /to = Math\.max\(base - 2, Math\.min\(base \+ 2, to\)\)/.test(mocksCode) && /if \(k && e\.type === "pointerup"\) glideTo\(base \+ k/.test(mocksCode))
  check("glides are Web Animations on transform and opacity (the compositor), keyframed at each place passed", /* Changed on purpose (landing round 15): one timing for the move and the drawing order. */ /const timing: KeyframeAnimationOptions = \{ duration: dur, easing: ease\.css, fill: "forwards" \}/.test(mocksCode) && /c\.animate\(frames, timing\)/.test(mocksCode) && /transform: `translate3d\(/.test(mocksCode) && !/\.animate\([^)]*(left|top|width|height|filter)/.test(mocksCode))
  check("a finger stops a glide where it is", /const where = \(\) => \(glide \? glide\.from \+ \(glide\.to - glide\.from\) \* glide\.ease\.at\(/.test(mocksCode) && /const down = [\s\S]{0,140}halt\(\)/.test(mocksCode))
  check("it turns by itself after a pause, only while on, never with reduced motion", STORE_IDLE_MS >= 2000 && /if \(!on \|\| drag \|\| reduce\.matches\) return/.test(mocksCode) && /Math\.max\(hold, idleUntil - now\(\)\)/.test(mocksCode))
  check("flat cards under one perspective, in an order set from their distance to the front (no 3D scene to sort)", /* Changed on purpose (landing round 15): a closer perspective, and the order keyframed on the glide's own clock instead of timers. */ /\.bt-stage\{[^}]*perspective:1200u;/.test(desk) && !/preserve-3d/.test(desk) && Mocks.storeLayer(0) === 3 && Mocks.storeLayer(1) === 2 && Mocks.storeLayer(-2) === 1 && Mocks.storeLayer(3) === 0 && /\.bt-card:nth-child\(1\)\{[^}]*z-index:3/.test(desk) && /c\.animate\(zs, timing\)/.test(mocksCode) && !/layers\.push\(setTimeout/.test(mocksCode))
  check("no CSS loop left, no will-change, no filter", !/bt-walk|infinite/.test(mocks) && !/will-change|filter|blur\(|backdrop/.test(mocks + mocksCode.replace(/\.filter\(/g, "")))
  check("arrow keys turn it too", /tabIndex=\{0\}/.test(mocksCode) && /e\.key === "ArrowRight" \? 1 : e\.key === "ArrowLeft" \? -1/.test(mocksCode))
  check("the ground is clean light, not round 13's grey", !/#ecebe7/.test(mocks) && /\.bs-store\{background:radial-gradient\([^}]*#fff 0%/.test(desk))
}

console.log("\nThe section tells the two usable scenes when they are shown")
{
  check("digital and physical are labelled groups, not pictures; the rest stay pictures", BUSINESS_SLIDES.filter((s) => s.live).map((s) => s.id).join() === "digital,physical" && /<div className="smk-frame bz-frame" role="group" aria-label=\{alt\}>/.test(sectionCode))
  check("on = the chosen scene on screen (a phone: the card in view)", /<KindScene i=\{i\} on=\{state === "active" && t\.live\} \/>/.test(sectionCode) && /<KindScene i=\{i\} on=\{i === railAt && t\.live\} \/>/.test(sectionCode))
  check("a scene put away is inert", /inert=\{state !== "active"\}/.test(sectionCode))
  check("a finger on a usable scene holds the turn longer", BUSINESS_PLAY_RESUME_MS >= 6000 && /closest\?\.\("\.bs-digital, \.bt-stage"\)/.test(sectionCode))
}

console.log("\nPhones: every card whole")
{
  check("a card is the whole column, the gap the page's edge, so no neighbour shows", /\.biz-card\{flex:none;width:100%;scroll-snap-align:start;scroll-snap-stop:always\}/.test(css) && /\.biz-rail\{display:flex;gap:var\(--home-edge,20px\);margin:0 calc\(var\(--home-edge,20px\) \* -1\);padding:0 var\(--home-edge,20px\)/.test(css) && !/\.biz-rail::after/.test(css))
  check("a line of five under the row: its marker follows the scroll, one transform a frame", /className="biz-dots"/.test(sectionCode) && /thumb\.style\.transform = `translate3d\(/.test(sectionCode) && /\.biz-dot-thumb\{[^}]*width:calc\(100% \/ 5\)/.test(css))
  check("each part of the line goes to its card", /onClick=\{\(\) => showCard\(i\)\}/.test(sectionCode) && /aria-current=\{i === railAt \|\| undefined\}/.test(sectionCode))
  check("the community card's event stands inside its page on a phone", rule(phone, ".bs-com").includes("height:326u") && rule(phone, ".bs-feed").includes("top:350u") && rule(phone, ".bs-com-host em").includes("display:none"))
}

console.log("\nMeasured")
check("a check script measures the phones, the drag and the frames", existsSync("scripts/check-business-r14.mjs") && /setCPUThrottlingRate/.test(read("scripts/check-business-r14.mjs")))

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 13 entries", /"tests\/home-landing-r13-pricing\.test\.ts",[\s\S]{0,8000}"tests\/home-landing-r14-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

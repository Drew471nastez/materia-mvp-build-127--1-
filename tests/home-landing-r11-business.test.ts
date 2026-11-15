/**
 * Landing round 11, business. The owner:
 *  - "I don't like the heading 'What will you sell?', and this section should
 *    have a subheading, max 10 words": the heading is "Sell what you make",
 *    with one line under it of nine words.
 *  - "the Content Calendar digital product is not cool; something else": the
 *    Notion calendar cover is gone; Low Room Drums, a sample pack with a real
 *    photograph, its name set big and one bar of its sound as a waveform.
 *  - Applied AI Club "should have another heading in the cover and a
 *    different colour, not white", its mark "more real, clean, looking like a
 *    real product": a deep green banner with the club's logo (a drawn mark and
 *    a wordmark), the line "Build one AI tool a week" as its heading, the page
 *    under it a pale green.
 *  - "add more examples going around and changing, at least 3 examples in
 *    physical products": four products of one store (tee, cap, tote, print),
 *    each in turn with its own ground, buy card, option picked and "added"
 *    note, on CSS loops of opacity and transform only.
 *  The stage size, the index, the ring clock, autoplay, courses and bookings
 *  stay as round 10 left them.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as Section from "@/components/marketing/home/business-carousel"
import { BUSINESS_MOCK_CSS, ClubScene, CoachScene, CourseScene, DIGITAL_PRODUCTS, DigitalScene, PHYSICAL_PRODUCTS, PHYSICAL_STEP_S, TeeScene } from "@/components/marketing/home/showcase-mocks/business-mocks"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const SECTION = "components/marketing/home/business-carousel.tsx"
const MOCKS = "components/marketing/home/showcase-mocks/business-mocks.tsx"
const { BUSINESS_HEADING, BUSINESS_SLIDES, BUSINESS_STYLES, BusinessCarousel } = Section
const BUSINESS_SUB = (Section as Record<string, unknown>).BUSINESS_SUB as string
const css = (BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? "").replace(/\/\*[\s\S]*?\*\//g, "")
const mocks = BUSINESS_MOCK_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
const desk = mocks.split("@media(max-width:767px)")[0]
const html = renderToStaticMarkup(createElement(BusinessCarousel))
const U = (n: number) => `calc(${n}*var(--u))`
const rule = (sel: string) => desk.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? ""
const BANNED = /unlock|elevate|seamless|powerful|effortless|supercharge|transform your|—/i
const small = (n: string) => { const p = `public/home/showcase/${n}.webp`; return existsSync(p) && statSync(p).size < 120 * 1024 }

console.log("\nA new heading and a line under it")
{
  check("the heading is no longer the question", (BUSINESS_HEADING as string) !== "What will you sell?" && BUSINESS_HEADING === "Sell what you make" && !html.includes("What will you sell"))
  check("the subheading is at most ten words", typeof BUSINESS_SUB === "string" && BUSINESS_SUB.trim().split(/\s+/).length <= 10, BUSINESS_SUB)
  check("it stands under the heading, in the heading block", /<div class="biz-head"><h2[^>]*id="biz-title"[\s\S]*?<\/h2><p class="biz-sub">[^<]+<\/p><\/div><div class="biz-body">/.test(html))
  check("it is a quiet line: body size, grey, set close under the heading", /\.biz-sub\{margin:clamp\(8px,\.9vw,14px\) 0 0;[^}]*font-size:clamp\(16px,1\.25vw,19px\);[^}]*color:#65616e\}/.test(css))
  check("no banned words or em dashes in the heading, the line, the index or the alt texts", !BANNED.test([BUSINESS_HEADING, BUSINESS_SUB, ...BUSINESS_SLIDES.flatMap((s) => [s.label, s.line, s.alt])].join(" ")))
}

console.log("\nDigital: a sample pack in place of the calendar")
{
  const d = renderToStaticMarkup(createElement(DigitalScene))
  check("no Notion template or Content Calendar anywhere in the scene", !/Content Calendar|Notion/.test(d) && !/bc-notion|bc-month|DAYS_ON/.test(code(MOCKS)))
  check("five products, the second the Low Room Drums sample pack", DIGITAL_PRODUCTS.map((p) => p.id).join() === "lut,drums,book,presets,font" && DIGITAL_PRODUCTS[1].name === "Low Room Drums" && DIGITAL_PRODUCTS[1].kind === "Sample pack")
  check("its cover: a real photograph, the name set big, a volume tag, a waveform and the specs", /class="bc bc-drums"><img src="\/home\/showcase\/bz-drums\.webp"[^>]*loading="eager"[\s\S]*?class="bc-vol">Vol\. 2<[\s\S]*?class="bc-big"><span>Low Room<\/span><span>Drums<\/span>[\s\S]*?class="bc-wave">(<i style="--h:[\d.]+"><\/i>){20,}<\/span><span class="bc-spec">/.test(d))
  check("the waveform bars are drawn by transform (scaleY), not height", /\.bc-wave i\{[^}]*height:100%;[^}]*transform:scaleY\(var\(--h\)\)\}/.test(mocks))
  check("the photograph is small (under 120 KB)", small("bz-drums"))
  check("the index line no longer says templates", BUSINESS_SLIDES[0].line === "Sample packs, presets, e-books")
}

console.log("\nCommunities: a green banner with the club's own logo")
{
  const c = renderToStaticMarkup(createElement(ClubScene))
  check("the banner is the club's green, not white or black", /\.bs-com-cover\{[^}]*background:#123227;/.test(rule(".bs-com-cover") ? `.bs-com-cover{${rule(".bs-com-cover")}}` : ""))
  check("the page under it is a pale green, not white", rule(".bs-com").includes("background:#f3f6ef") && !/background:#fff[;}]/.test(rule(".bs-com")))
  check("its photograph is laid into the green (luminosity, static)", /mix-blend-mode:luminosity/.test(rule(".bs-com-pic")))
  check("a real logo: a drawn mark (svg) and the wordmark beside it, no letter in a box", /class="bs-com-logo"><svg viewBox="0 0 32 32"[\s\S]*?<\/svg><b>applied<i>ai<\/i>club<\/b>/.test(c) && !/bs-com-mark/.test(c + code(MOCKS)))
  check("another heading in the cover: the club's promise, not its name again", /class="bs-com-word"><b>Build one AI tool a week<\/b><i>Live builds every Wednesday at 6 pm<\/i>/.test(c) && !c.includes("Build something real with AI"))
  check("the join button wears the club's green", /\.bs-com-head \.bs-btn\{[^}]*background:#123227\}/.test(mocks))
  check("the club, its host, its members and its feed stay", ["Applied AI Club", "Hosted by Sam Adeyemi", "2,480 members", "Live build: an inbox agent", "Priya N."].every((w) => c.includes(w)))
}

console.log("\nPhysical: four products in turn")
{
  const t = renderToStaticMarkup(createElement(TeeScene))
  check("at least three products, here four: tee, cap, tote, print", PHYSICAL_PRODUCTS.length >= 3 && PHYSICAL_PRODUCTS.map((p) => p.id).join() === "tee,cap,tote,print")
  check("each has its photograph, name, price, options and shipping line in the scene", PHYSICAL_PRODUCTS.every((p) => t.includes(`/home/showcase/${p.pic}.webp`) && t.includes(p.name) && t.includes(p.price) && (p.options as readonly string[]).every((o) => t.includes(`<i>${o}</i>`)) && t.includes(p.ship)))
  check("each photograph is real, baked onto its own flat ground and small", PHYSICAL_PRODUCTS.every((p) => small(p.pic) && /^#[0-9a-f]{6}$/.test(p.ground)))
  check("one layer per product (its ground and photo), one card text per product, one added note per product", (t.match(/class="bt-item"/g) ?? []).length === 4 && (t.match(/class="bt-info"/g) ?? []).length === 4 && (t.match(/class="bt-added"/g) ?? []).length === 4)
  check("the store's four thumbnails in the card, a ring on the one on show", (t.match(/<i style="background:#[0-9a-f]{6}"><img/g) ?? []).length >= 4 && t.includes('class="bt-thumb-ring"'))
  check("at rest (reduced motion) the first product stands, the others are hidden", /\.bt-item\{position:absolute;inset:0;opacity:0\}\n\.bt-item\[data-p="0"\]\{opacity:1\}/.test(mocks) && /\.bt-info\[data-p="0"\]\{opacity:1\}/.test(mocks))
  const motion = mocks.slice(mocks.indexOf("@media(prefers-reduced-motion:no-preference)"))
  check("the row runs on one clock set back by each product's place, like the digital covers", /\.bz-on \.bt-item\{animation:bt-show [\d.]+s linear calc\(var\(--p\) \* 2\.8s - 11\.2s\) infinite\}/.test(motion) && /\.bz-on \.bt-info\{animation:bt-info /.test(motion) && /\.bz-on \.bt-added\{animation:bt-toast /.test(motion))
  check("the last product fades out over the first, the others only fade in (no two grounds show through each other)", /\.bt-item\[data-p="0"\]\{animation-name:bt-show-a\}/.test(motion) && /\.bt-item\[data-p="3"\]\{animation-name:bt-show-z\}/.test(motion))
  const frames = motion.match(/@keyframes bt-[\w-]+\{[\s\S]*?\}\}/g) ?? []
  check("every physical keyframe moves only opacity and transform", frames.length >= 9 && frames.every((f) => f.replace(/@keyframes [\w-]+\{/, "").match(/[a-z-]+(?=:)/g)!.every((p) => ["opacity", "transform", "animation-timing-function"].includes(p))), frames.length)
  const kind = BUSINESS_SLIDES.find((s) => s.id === "physical")!
  check("the turn lasts the four products, ending while the last is still on show", kind.ms === Math.round(PHYSICAL_STEP_S * 4 * 1000 - 400))
  check("no cart icon with a count that would be wrong after the second add", !/bs-cart|ShoppingBag/.test(code(MOCKS)))
  check("the photographs load with the scene (eager), so none pops in mid turn", (t.match(/loading="lazy"/g) ?? []).length === 0)
}

console.log("\nRound 10 kept")
{
  check("the stage is still drawn at 1100 x 570, 400 x 640 on a phone", /\.bz-frame\{aspect-ratio:1100\/570;/.test(mocks) && /\.bz-frame\{aspect-ratio:400\/640\}/.test(mocks))
  check("from 1280px the stage still stops at 66svh", /minmax\(0,calc\(66svh \* 1100 \/ 570\)\)/.test(css))
  check("five words, one ring, the ring still the clock", (html.match(/role="tab"/g) ?? []).length === 5 && (html.match(/class="biz-ring"/g) ?? []).length === 1 && /e\.animationName === "biz-ring-b"\) advance\(\)/.test(code(SECTION)))
  const course = renderToStaticMarkup(createElement(CourseScene))
  const coach = renderToStaticMarkup(createElement(CoachScene))
  check("courses and bookings unchanged", course.includes("Mixing in key, for new DJs") && course.includes("by Tomás Reyes · 16 lessons · 3 h 10 min") && coach.includes("Booked for Thu 19, 17:30") && rule(".bs-ccard").includes(`width:${U(720)}`) && rule(".bs-book").includes(`width:${U(440)};height:${U(460)}`))
  check("none of the names the owner banned", !/Nadia Brooks|The Loop|Nordline|Static Bloom|Maren Holt|enthusiasts|Studio Marlow|Kai Moreno|ceramic|Dust & Tape|Weeknight Pasta|sourdough|Golden Hour/i.test(html + [DigitalScene, TeeScene, ClubScene].map((s) => renderToStaticMarkup(createElement(s))).join("")))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 10 entries", /"tests\/home-landing-r10-checkout\.test\.ts",[\s\S]{0,2000}"tests\/home-landing-r11-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

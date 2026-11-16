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
// Changed on purpose (landing round 12): the owner disliked the digital row (presets) and the four merch products; digital is one e-book and physical one oil (tests/home-landing-r12-business.test.ts), so round 11's sample pack and turning products are gone.
import { BUSINESS_MOCK_CSS, ClubScene, CoachScene, CourseScene, DigitalScene, PhysicalScene as TeeScene } from "@/components/marketing/home/showcase-mocks/business-mocks"

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
  check("the heading is no longer the question", (BUSINESS_HEADING as string) !== "What will you sell?" && /* Lead (landing round 11): "Sell what you make" is already section 3's heading, so this one names what the section shows. */ /* Changed on purpose (landing round 13): "Five ways to get paid". */ /* Changed on purpose (landing round 14): "From a cookbook to a coaching call" (the owner disliked round 13's). */ BUSINESS_HEADING === "From a cookbook to a coaching call" && !html.includes("What will you sell"))
  check("the subheading is at most ten words", typeof BUSINESS_SUB === "string" && BUSINESS_SUB.trim().split(/\s+/).length <= 10, BUSINESS_SUB)
  check("it stands under the heading, in the heading block", /<div class="biz-head"><h2[^>]*id="biz-title"[\s\S]*?<\/h2><p class="biz-sub">[^<]+<\/p><\/div><div class="biz-body">/.test(html))
  check("it is a quiet line: body size, grey, set close under the heading", /\.biz-sub\{margin:clamp\(8px,\.9vw,14px\) 0 0;[^}]*font-size:clamp\(16px,1\.25vw,19px\);[^}]*color:#65616e\}/.test(css))
  check("no banned words or em dashes in the heading, the line, the index or the alt texts", !BANNED.test([BUSINESS_HEADING, BUSINESS_SUB, ...BUSINESS_SLIDES.flatMap((s) => [s.label, s.line, s.alt])].join(" ")))
}

console.log("\nDigital: no calendar")
{
  const d = renderToStaticMarkup(createElement(DigitalScene))
  // Changed on purpose (landing round 14): the owner asked for a Notion template among the shelf's six downloads; round 11's drawn calendar scene stays gone.
  check("no Notion template or Content Calendar anywhere in the scene", !/Content Calendar/.test(d) && !/bc-notion|bc-month|DAYS_ON/.test(code(MOCKS)))
  // Changed on purpose (landing round 12): one e-book in place of the row with the sample pack; its line names no presets.
  check("the index line no longer says templates (or presets)", !/template|preset/i.test(BUSINESS_SLIDES[0].line))
  // Changed on purpose (landing round 13): the e-book's pictures are gone; the store designs are pinned in tests/home-landing-r13-business.test.ts.
  check("the photographs are small (under 120 KB)", small("bz-ai-club") && !small("bz-ebook") && !small("bz-eggs"))
}

console.log("\nCommunities: a green banner with the club's own logo")
{
  const c = renderToStaticMarkup(createElement(ClubScene))
  // Changed on purpose (landing round 13): the owner disliked the green. The banner is the club's photograph under a soft ink shade; the page under it a quiet warm grey, still not white.
  check("the banner is the photograph, no green", !/#123227|#d9f969|#f3f6ef|#e4ebdc/.test(mocks) && /linear-gradient\(to right,rgba\(17,17,20,\.82\)/.test(mocks))
  check("the page under it is a quiet grey, not white", rule(".bs-com").includes("background:#f5f5f3") && !/background:#fff[;}]/.test(rule(".bs-com")))
  check("its photograph is static, in its own colours (no blend)", !/mix-blend-mode/.test(rule(".bs-com-pic")))
  check("a real logo: a drawn mark (svg) and the wordmark beside it, no letter in a box", /class="bs-com-logo"><svg viewBox="0 0 32 32"[\s\S]*?<\/svg><b>applied<i>ai<\/i>club<\/b>/.test(c) && !/bs-com-mark/.test(c + code(MOCKS)))
  check("another heading in the cover: the club's promise, not its name again", /class="bs-com-word"><b>Build one AI tool a week<\/b><i>Live builds every Wednesday at 6 pm<\/i>/.test(c) && !c.includes("Build something real with AI"))
  // Changed on purpose (landing round 13): the button is the page's ink, like every other scene's.
  check("the join button wears the page's ink", /\.bs-com-head \.bs-btn\{height:calc\(42\*var\(--u\)\);margin:0\}/.test(mocks))
  check("the club, its host, its members and its feed stay", ["Applied AI Club", "Hosted by Sam Adeyemi", "2,480 members", "Live build: an inbox agent", "Priya N."].every((w) => c.includes(w)))
}

/* Changed on purpose (landing round 12): the owner disliked the four turning products (tee, cap, tote, print); physical is one photographed oil (tests/home-landing-r12-business.test.ts). What stays from round 11 is pinned here. */
console.log("\nPhysical: what round 11 settled")
{
  const t = renderToStaticMarkup(createElement(TeeScene))
  check("no cart icon with a count", !/bs-cart|ShoppingBag/.test(code(MOCKS)))
  check("the photographs load with the scene (eager), so none pops in", (t.match(/loading="lazy"/g) ?? []).length === 0)
  check("no tote anywhere", !/tote/i.test(t + code(MOCKS)))
}

console.log("\nRound 10 kept")
{
  // Changed on purpose (landing round 12): 360 x 520 on a phone, each kind a card in a sliding row.
  check("the stage is still drawn at 1100 x 570, 360 x 520 on a phone", /\.bz-frame\{aspect-ratio:1100\/570;/.test(mocks) && /\.bz-frame\{aspect-ratio:360\/520\}/.test(mocks))
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

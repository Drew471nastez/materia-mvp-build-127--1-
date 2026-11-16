/**
 * Landing round 10, business ("What will you sell?"). The owner:
 *  - "'What will you sell?' occupies too much height of the entire page;
 *    reduce it a little": the line under the heading goes and the stage is
 *    shorter, so on a laptop (1440 x 800) the heading, the index and the
 *    stage are one screen.
 *  - "the height is too big, reduce it just a little, 5 to 10%": the five
 *    scenes are drawn at 1100 x 570 instead of 1040 x 600, about a tenth
 *    shorter at the same width, every scene the same picture (the 60 design
 *    pixels gained across go to the gaps, nothing is cropped).
 *  - "get rid of the subheading": gone, with its constant.
 *  The index, the ring clock, autoplay and the five scenes stay as round 9 drew them.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as Section from "@/components/marketing/home/business-carousel"
// Changed on purpose (landing round 12): the physical scene is PhysicalScene (Night Face Oil); the tee is gone.
import { BUSINESS_MOCK_CSS, ClubScene, CoachScene, CourseScene, DigitalScene, PhysicalScene as TeeScene } from "@/components/marketing/home/showcase-mocks/business-mocks"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const SECTION = "components/marketing/home/business-carousel.tsx"
const { BUSINESS_HEADING, BUSINESS_SLIDES, BUSINESS_STYLES, BusinessCarousel } = Section
const css = (BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? "").replace(/\/\*[\s\S]*?\*\//g, "")
const mocks = BUSINESS_MOCK_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
const desk = mocks.split("@media(max-width:767px)")[0]
const html = renderToStaticMarkup(createElement(BusinessCarousel))
const U = (n: number) => `calc(${n}*var(--u))`
const rule = (sel: string) => desk.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? ""

console.log("\nNo line under the heading")
{
  // Changed on purpose (landing round 11): the owner asked for a new heading and a subheading of at most ten words; the old round 10 line stays gone.
  // Changed on purpose (landing round 13): the owner asked for a better heading; "Five ways to get paid" (tests/home-landing-r13-business.test.ts).
  // Changed on purpose (landing round 14): "From a cookbook to a coaching call".
  check("the heading is the new short line", (BUSINESS_HEADING as string) === "From a cookbook to a coaching call" && html.includes('id="biz-title"'))
  check("the round 10 line under the heading stays gone; round 11's own line is at most ten words", !/Each one gets its own page and checkout|Downloads, things you ship/.test(code(SECTION)) && String((Section as Record<string, unknown>).BUSINESS_SUB).split(/\s+/).length <= 10)
  check("the heading block holds the heading and that one line", /<div class="biz-head"><h2[^>]*id="biz-title"[\s\S]*?<\/h2><p class="biz-sub">[^<]+<\/p><\/div><div class="biz-body">/.test(html))
}

console.log("\nA shorter stage, every scene the same picture")
{
  check("the stage is drawn at 1100 x 570 on a computer (was 1040 x 600): about 10% shorter at one width", /\.bz-frame\{aspect-ratio:1100\/570;/.test(mocks) && /\.bz-frame>\.smk\{--w:1100\}/.test(mocks) && Math.abs((570 / 1100) / (600 / 1040) - 0.898) < 0.01)
  // Changed on purpose (landing round 12): on a phone each kind is a card in a sliding row, drawn at 360 x 520.
  check("the phone has its own drawing, 360 x 520", /@media\(max-width:767px\)\{\n  \.bz-frame\{aspect-ratio:360\/520\}\n  \.bz-frame>\.smk\{--w:360\}/.test(mocks))
  check("from 1280px the stage stops at 66svh tall (vh before it for older browsers) and the index takes what is left", /\.biz-body\{grid-template-columns:minmax\(clamp\(232px,18vw,330px\),1fr\) minmax\(0,calc\(66vh \* 1100 \/ 570\)\);grid-template-columns:minmax\(clamp\(232px,18vw,330px\),1fr\) minmax\(0,calc\(66svh \* 1100 \/ 570\)\)/.test(css))
  check("the index is still five equal rows as tall as the stage", /\.biz-tabs\{display:grid;grid-template-rows:repeat\(5,minmax\(0,1fr\)\)/.test(css))
  // Each scene inside the new 570 high drawing: nothing reaches past its bottom.
  // Changed on purpose (landing round 12): digital is one e-book (cover 360 high from 96, its page from 122, 348 high) and physical one oil (its photograph 26 from top and bottom); both end inside the stage.
  // Changed on purpose (landing round 13): digital is two tiles and an order (404 tall, 83 from the top); physical is a line of store designs (420 tall, centred).
  // Changed on purpose (landing round 14): digital is a shelf and a pane, both inside the stage.
  check("digital: the two tiles and the order end inside the stage", rule(".bd-shelf").includes(`top:${U(62)}`) && rule(".bd-view").includes(`top:${U(62)};width:${U(440)};height:${U(426)}`) && 62 + 426 < 570)
  check("physical: the line of store designs is centred and inside the stage", rule(".bt-stage").includes(`width:${U(336)};height:${U(420)}`) && 420 < 570)
  check("course: the card 22 from top and bottom, the player 248 high", rule(".bs-ccard").includes(`top:${U(22)};bottom:${U(22)};width:${U(720)}`) && rule(".bp-player").includes(`height:${U(248)}`))
  check("community: the club's page 26 from top and bottom, the feed beside it from the same line", rule(".bs-com").includes(`left:${U(56)};top:${U(26)};bottom:${U(26)};width:${U(520)}`) && rule(".bs-feed").includes(`left:${U(616)};right:${U(56)};top:${U(26)}`))
  check("booking: the coach photo full height, the card (460) centred", rule(".bs-coach-photo").includes(`top:0;bottom:0;width:${U(540)}`) && rule(".bs-book").includes(`right:${U(64)};top:50%;width:${U(440)};height:${U(460)}`) && 460 < 570)
}

console.log("\nRound 9 kept as designed")
{
  check("five words, each a tab with its panel, one ring on the chosen one", (html.match(/role="tab"/g) ?? []).length === 5 && (html.match(/class="biz-ring"/g) ?? []).length === 1 && BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings")
  check("the ring is still the clock and autoplay still runs", /e\.animationName === "biz-ring-b"\) advance\(\)/.test(code(SECTION)) && /const run = t\.run && !held/.test(code(SECTION)))
  const scenes = [DigitalScene, TeeScene, CourseScene, ClubScene, CoachScene].map((s) => renderToStaticMarkup(createElement(s))).join("")
  // Changed on purpose (landing round 12): digital is Slow Mornings and physical Night Face Oil (the owner disliked the covers and the tee).
  check("the five scenes say the same things", /* Changed on purpose (landing round 11): Applied AI Club and the tee stay, now among others. */ /* Changed on purpose (landing round 13): Ancestral Kitchen and the store designs (bt-sora) replace Slow Mornings and Night Face Oil. */ ["Ancestral Kitchen", "bt-sora", "Mixing in key, for new DJs", "Applied AI Club", "Talia Moreno", "Booked for Thu 19, 17:30"].every((w) => scenes.includes(w)))
  check("no banned words or em dashes in what changed", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(BUSINESS_HEADING + BUSINESS_SLIDES.map((s) => s.alt).join(" ")))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 9 entries", /"tests\/home-landing-r9-business\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r10-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

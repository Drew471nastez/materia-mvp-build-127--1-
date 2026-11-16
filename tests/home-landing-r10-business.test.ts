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
import { BUSINESS_MOCK_CSS, ClubScene, CoachScene, CourseScene, DigitalScene, TeeScene } from "@/components/marketing/home/showcase-mocks/business-mocks"

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
  check("the heading is the new short line", (BUSINESS_HEADING as string) === "One store, every kind of product" && html.includes('id="biz-title"'))
  check("the round 10 line under the heading stays gone; round 11's own line is at most ten words", !/Each one gets its own page and checkout|Downloads, things you ship/.test(code(SECTION)) && String((Section as Record<string, unknown>).BUSINESS_SUB).split(/\s+/).length <= 10)
  check("the heading block holds the heading and that one line", /<div class="biz-head"><h2[^>]*id="biz-title"[\s\S]*?<\/h2><p class="biz-sub">[^<]+<\/p><\/div><div class="biz-body">/.test(html))
}

console.log("\nA shorter stage, every scene the same picture")
{
  check("the stage is drawn at 1100 x 570 on a computer (was 1040 x 600): about 10% shorter at one width", /\.bz-frame\{aspect-ratio:1100\/570;/.test(mocks) && /\.bz-frame>\.smk\{--w:1100\}/.test(mocks) && Math.abs((570 / 1100) / (600 / 1040) - 0.898) < 0.01)
  check("the phone keeps its 400 x 640 drawing (the section is shorter there by the line that went)", /@media\(max-width:767px\)\{\n  \.bz-frame\{aspect-ratio:400\/640\}\n  \.bz-frame>\.smk\{--w:400\}/.test(mocks))
  check("from 1280px the stage stops at 66svh tall (vh before it for older browsers) and the index takes what is left", /\.biz-body\{grid-template-columns:minmax\(clamp\(232px,18vw,330px\),1fr\) minmax\(0,calc\(66vh \* 1100 \/ 570\)\);grid-template-columns:minmax\(clamp\(232px,18vw,330px\),1fr\) minmax\(0,calc\(66svh \* 1100 \/ 570\)\)/.test(css))
  check("the index is still five equal rows as tall as the stage", /\.biz-tabs\{display:grid;grid-template-rows:repeat\(5,minmax\(0,1fr\)\)/.test(css))
  // Each scene inside the new 570 high drawing: nothing reaches past its bottom.
  check("digital: the row sits in a wider rail, centred left of the card; covers (350) and card (368) stand centred", rule(".bd-rail").includes(`width:${U(740)}`) && rule(".bd-track").includes(`left:${U(352)}`) && rule(".bd-card").includes(`right:${U(64)};top:50%`) && rule(".bd-cover").includes(`height:${U(350)}`))
  check("physical: the tee photo a square that ends inside the stage (12 + 546 < 570)", rule(".bt-photo").includes(`left:${U(64)};top:${U(12)};width:${U(546)};height:${U(546)}`) && 12 + 546 < 570 && rule(".bt-card").includes(`right:${U(64)};top:50%`))
  check("course: the card 22 from top and bottom, the player 248 high", rule(".bs-ccard").includes(`top:${U(22)};bottom:${U(22)};width:${U(720)}`) && rule(".bp-player").includes(`height:${U(248)}`))
  check("community: the club's page 26 from top and bottom, the feed beside it from the same line", rule(".bs-com").includes(`left:${U(56)};top:${U(26)};bottom:${U(26)};width:${U(520)}`) && rule(".bs-feed").includes(`left:${U(616)};right:${U(56)};top:${U(26)}`))
  check("booking: the coach photo full height, the card (460) centred", rule(".bs-coach-photo").includes(`top:0;bottom:0;width:${U(540)}`) && rule(".bs-book").includes(`right:${U(64)};top:50%;width:${U(440)};height:${U(460)}`) && 460 < 570)
}

console.log("\nRound 9 kept as designed")
{
  check("five words, each a tab with its panel, one ring on the chosen one", (html.match(/role="tab"/g) ?? []).length === 5 && (html.match(/class="biz-ring"/g) ?? []).length === 1 && BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings")
  check("the ring is still the clock and autoplay still runs", /e\.animationName === "biz-ring-b"\) advance\(\)/.test(code(SECTION)) && /const run = t\.run && !held/.test(code(SECTION)))
  const scenes = [DigitalScene, TeeScene, CourseScene, ClubScene, CoachScene].map((s) => renderToStaticMarkup(createElement(s))).join("")
  check("the five scenes say the same things", /* Changed on purpose (landing round 11): Applied AI Club and the tee stay, now among others. */ ["Cine Tones LUT Pack", "Midnight Studio Tee", "Mixing in key, for new DJs", "Applied AI Club", "Talia Moreno", "Booked for Thu 19, 17:30"].every((w) => scenes.includes(w)))
  check("no banned words or em dashes in what changed", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(BUSINESS_HEADING + BUSINESS_SLIDES.map((s) => s.alt).join(" ")))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 9 entries", /"tests\/home-landing-r9-business\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r10-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

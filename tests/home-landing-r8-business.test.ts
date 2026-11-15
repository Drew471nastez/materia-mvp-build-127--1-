/**
 * Landing round 8, business: "Keep the One store for everything you sell
 * section, of course." The section is back after the ideas section, with a
 * plainer heading, the ideas section's pill tabs on autoplay (a filling line
 * in the chosen pill, paused on hover, touch, off screen and a hidden tab),
 * one stage as wide as the showcase cards, and five moving scenes: a Second
 * Brain Notion template on a tablet, headphones shot on yellow, the course
 * as it was, an AI community and a strength coach's booking.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BUSINESS_HEADING, BUSINESS_SLIDES, BUSINESS_STYLES, BUSINESS_SUB, BUSINESS_TOUCH_RESUME_MS, BusinessCarousel } from "@/components/marketing/home/business-carousel"
import { BUSINESS_MOCK_CSS, BrainScene, ClubScene, CoachScene, CourseScene, HeadphonesScene } from "@/components/marketing/home/showcase-mocks/business-mocks"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const SECTION = "components/marketing/home/business-carousel.tsx"
const MOCKS = "components/marketing/home/showcase-mocks/business-mocks.tsx"
const sectionCss = BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? ""

console.log("\nBack on the page, right after the ideas section")
{
  const page = read("app/(storelib)/(marketing)/page.tsx")
  const at = (s: string) => page.indexOf(s)
  check("the page draws it after the ideas and before the possibilities", at("<LazyIdeasComeToLife />") > 0 && at("<LazyBusinessCarousel />") > at("<LazyIdeasComeToLife />") && at("<LazyBusinessCarousel />") < at('<LazySection name="possibilities"'))
  const lazy = read("components/marketing/home/lazy-sections.tsx")
  check("its lazy box loads the section and its stylesheets ahead", /LazyBusinessCarousel = lazySection\(\(\) => import\("\.\/business-carousel"\)/.test(lazy) && /name: "business"/.test(lazy) && /m\.BUSINESS_STYLES/.test(lazy))
  check("its box has a height from 390 to 1920 (a phone term and a wide one)", /name: "business",[\s\S]{0,400}minHeight: "var\(--lz, max\(calc\(160vw \+ 245px/.test(lazy))
}

console.log("\nA clearer, simpler heading")
{
  check("the heading is a short question, not the old line", BUSINESS_HEADING === "What will you sell?" && !read(SECTION).includes("One store for everything you sell."))
  const words = `${BUSINESS_HEADING} ${BUSINESS_SUB} ${BUSINESS_SLIDES.map((s) => s.alt).join(" ")}`
  check("no banned words, no em dash, no 'fans' or 'enthusiasts'", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|\bfans\b|enthusiast/i.test(words) && !/—/.test(words + read(MOCKS)))
  check("the heading block, pills and stage use the page's one width and heading inset", /\.biz-head\{[^}]*max-width:var\(--home-max,2020px\)[^}]*calc\(var\(--home-edge[^}]*\+ var\(--home-head-inset,14px\)\)/.test(sectionCss) && /\.biz-stage-wrap\{[^}]*max-width:var\(--home-max,2020px\)[^}]*padding:0 var\(--home-edge/.test(sectionCss))
}

console.log("\nPill tabs like the ideas section, on autoplay with a filling line")
{
  const html = renderToStaticMarkup(createElement(BusinessCarousel))
  check("five tabs in the owner's order", BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings" && (html.match(/role="tab"/g) ?? []).length === 5)
  check("the pill family of the ideas section: grey track, 30px pills, the chosen one white", /\.biz-tabs\{[^}]*border-radius:999px;background:#f1f1f2/.test(sectionCss) && /\.biz-tab\{[^}]*height:30px;padding:0 13px[^}]*font-size:13px/.test(sectionCss) && /\.biz-tab\[aria-selected="true"\]::before\{opacity:1;transform:none\}/.test(sectionCss))
  check("the chosen pill carries the turn's line, and it is the clock", (html.match(/class="biz-prog"/g) ?? []).length === 1 && /onAnimationEnd=\{t\.advance\}/.test(read(SECTION)))
  check("the line fills by transform only, paused unless the section runs", /\.biz-prog\{[^}]*transform-origin:0 50%;animation:biz-prog 1s linear both paused\}/.test(sectionCss) && /\.biz\[data-run\] \.biz-prog\{animation-play-state:running\}/.test(sectionCss) && /@keyframes biz-prog\{from\{transform:scaleX\(0\)\}to\{transform:scaleX\(1\)\}\}/.test(sectionCss))
  const src = code(SECTION)
  check("picking a tab shows it and autoplay carries on (go, never select)", /onClick=\{\(\) => go\(i\)\}/.test(src) && !/t\.select\(/.test(src))
  check("a finger on the stage holds the turn, released a moment after", BUSINESS_TOUCH_RESUME_MS === 2500 && /onPointerDown=\{hold\}/.test(src) && /onPointerCancel=\{letGo\}/.test(src) && /const run = t\.run && !held/.test(src))
  check("a resting mouse holds it (use-auto-tabs hoverProps) and off screen or a hidden tab holds everything", /\{\.\.\.t\.hoverProps\}/.test(src) && /data-live=\{t\.live \|\| undefined\}/.test(src) && /\.biz:not\(\[data-live\]\) \.bz-on \*,\.biz:not\(\[data-live\]\) \.bz-on \*::after\{animation-play-state:paused!important\}/.test(sectionCss))
  check("on a phone the short labels, in a row that scrolls inside itself", /\.biz-tab-l\{display:none\}/.test(sectionCss) && /\.biz-tabs\{[^}]*overflow-x:auto;overscroll-behavior-x:contain/.test(sectionCss))
  check("reduced motion: no line, scenes stand finished", /prefers-reduced-motion:reduce\)\{[^]*\.biz-prog\{display:none\}/.test(sectionCss) && /@media\(prefers-reduced-motion:no-preference\)\{\n\.bz-on/.test(BUSINESS_MOCK_CSS))
  check("a scene put away is hidden, not content-visibility (a scene shown again stood empty)", /\.biz-slide\[data-pane="rest"\]\{[^}]*visibility:hidden/.test(sectionCss) && !/content-visibility/.test(sectionCss.replace(/\/\*[\s\S]*?\*\//g, "")))
}

console.log("\nMoving scenes, transform and opacity only")
{
  const all = BUSINESS_MOCK_CSS + sectionCss
  const frames = [...all.matchAll(/@keyframes ([\w-]+)\{((?:[^{}]*\{[^}]*\})*)\}/g)]
  const props = new Set(frames.flatMap((m) => [...m[2].matchAll(/([a-z-]+):/g)].map((p) => p[1])))
  check("every keyframe animates only transform and opacity", frames.length >= 15 && [...props].every((p) => p === "transform" || p === "opacity"), [...props])
  check("each scene has its own moment", [/\.bn-fill\{animation:bz-tick/, /\.bs-swap \.b\{animation:bz-in/, /\.bp-bar i\{animation:bz-play/, /\.bs-post\{animation:bz-rise/, /\.bs-ring-day\{animation:bz-day/].every((r) => r.test(BUSINESS_MOCK_CSS)))
  check("the moments run only on the chosen scene (and the one fading out)", /className=\{on \? "biz-slide bz-on" : "biz-slide"\}/.test(read(SECTION)) && /const on = state === "active" \|\| state === "leaving"/.test(read(SECTION)))
  check("nothing in the scenes is a transition (every change is one of those keyframes)", !/transition:/.test(BUSINESS_MOCK_CSS))
}

console.log("\nThe five examples")
{
  const brain = renderToStaticMarkup(createElement(BrainScene))
  check("digital: Second Brain, a dark Notion dashboard on a tablet, with cover, four areas and an overview", brain.includes("Second Brain") && brain.includes("bz-brain-cover.webp") && (brain.match(/class="bn-tile"/g) ?? []).length === 4 && brain.includes("Overview") && /class="bs-tablet"/.test(brain) && !/Studio OS/.test(read(MOCKS)))
  const phones = renderToStaticMarkup(createElement(HeadphonesScene))
  check("physical: a product shot on a colour backdrop, not a tee on light grey", phones.includes("HN1 Studio Headphones") && phones.includes("bz-headphones.webp") && /\.bs-phones\{background:#f5c518\}/.test(BUSINESS_MOCK_CSS) && !/hp-tee|Tour Tee/.test(read(MOCKS)))
  const course = renderToStaticMarkup(createElement(CourseScene))
  check("course: kept as it was (Tomás Reyes, the DJ photo, $79, the four lessons)", course.includes("Mixing in key, for new DJs") && course.includes("bz-dj.webp") && course.includes("$79") && ["Counting bars and phrases", "Beatmatching by ear", "Mixing in key", "Your first 30 minute set"].every((l) => course.includes(l)))
  const club = renderToStaticMarkup(createElement(ClubScene))
  check("community: an AI community with its own name (not AI Builders), no 'enthusiasts'", club.includes("Applied AI Club") && !/AI Builders|enthusiast/i.test(club) && (club.match(/class="bs-post"/g) ?? []).length === 3)
  const coach = renderToStaticMarkup(createElement(CoachScene))
  check("booking: a fitness creator with a real photograph, a day and time picked and booked", coach.includes("Talia Moreno") && /Strength coach/.test(coach) && coach.includes("bz-coach.webp") && coach.includes("Booked for Thu 19, 17:30"))
  const banned = /Nadia Brooks|The Loop|LaSalle at dusk|Nails by Bea|Nordline Coffee|Charla Circle|Static Bloom|Wildcamp|Weeknight Pasta|sourdough|Golden Hour|Drawing Basics|Saturday Run Club|Dust & Tape|Elena Ruiz|Second Serve|Ines Duarte|Priya Raman/i
  check("none of the banned or retired sample names", !banned.test(read(MOCKS) + read(SECTION)))
  const pics = ["bz-brain-cover", "bz-brain-daily", "bz-brain-work", "bz-brain-health", "bz-brain-goals", "bz-headphones", "bz-ai-club", "bz-coach", "bz-dj"].map((n) => `public/home/showcase/${n}.webp`)
  check("every photograph is a small webp (under 120 KB)", pics.every((p) => existsSync(p) && statSync(p).size < 120 * 1024), pics.filter((p) => !existsSync(p) || statSync(p).size >= 120 * 1024))
  const every = brain + phones + course + club + coach
  check("every picture is lazy and sized", !/<img(?![^>]*loading="lazy")[^>]*>/.test(every) && !/<img(?![^>]*width=)[^>]*>/.test(every))
  check("the scenes are pictures: labelled, nothing inside takes the pointer", BUSINESS_SLIDES.every((s) => s.alt.length > 60) && /\.biz-stage \.smk\{pointer-events:none/.test(sectionCss))
  check("phones get their own layout (400 x 640), computers 1200 x 600", /\.bz-frame\{aspect-ratio:1200\/600/.test(BUSINESS_MOCK_CSS) && /@media\(max-width:767px\)\{\n  \.bz-frame\{aspect-ratio:400\/640\}\n  \.bz-frame>\.smk\{--w:400\}/.test(BUSINESS_MOCK_CSS))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the last home-landing entry", /"tests\/home-landing-r7-lower\.test\.ts",[\s\S]{0,400}"tests\/home-landing-r8-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

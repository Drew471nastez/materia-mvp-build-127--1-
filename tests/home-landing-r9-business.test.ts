/**
 * Landing round 9, business ("What will you sell?"). The owner:
 *  - "I don't like the pill shapes and the underline under the pill there;
 *    come up with another design, more smooth and clean": the five kinds are
 *    plain words (an index beside the stage on a computer, one row over it on
 *    a phone), the chosen one with a small ring that closes as its turn runs.
 *  - Digital: "the Second Brain you created looks like very bad UI ... add
 *    different digital products moving in a carousel": five covers pass in a
 *    slow row, the one in the middle full size, the buy card naming it.
 *  - Physical: "I don't like the yellow headphones thing, get rid of it":
 *    the shared Midnight Studio Tee on a calm ground, a size picked, in the cart.
 *  - Communities: "add more realistic things to the Applied AI Club community
 *    cover": a banner with the club's photograph, mark, name and host.
 *  - Courses and bookings: "I love it", kept.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BUSINESS_SLIDE_MS, BUSINESS_SLIDES, BUSINESS_STYLES, BusinessCarousel } from "@/components/marketing/home/business-carousel"
// Changed on purpose (landing round 12): the row of digital covers and the tee are gone (the owner disliked both); digital is one e-book and physical one photographed product (tests/home-landing-r12-business.test.ts).
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
const css = (BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? "").replace(/\/\*[\s\S]*?\*\//g, "")
const html = renderToStaticMarkup(createElement(BusinessCarousel))

console.log("\nThe tab control: words and a ring, not pills with a line")
{
  check("five words, each a tab with its panel", (html.match(/role="tab"/g) ?? []).length === 5 && BUSINESS_SLIDES.every((s) => html.includes(`id="biz-tab-${s.id}"`) && html.includes(`aria-controls="biz-slide-${s.id}"`)))
  check("nothing pill shaped: no 999px radius, no track behind the words, no fill under them", !/999px/.test(css) && !/\.biz-tabs\{[^}]*background/.test(css) && !/\.biz-tab\{[^}]*(?:background:#|box-shadow)/.test(css) && !/biz-prog|scaleX/.test(css) && !html.includes("biz-prog"))
  check("the chosen word is dark, the others grey", /\.biz-tab\{[^}]*color:#a1a1aa/.test(css) && /\.biz-tab\[aria-selected="true"\]\{color:#18181b\}/.test(css))
  check("one ring, on the chosen word, drawn as two turning halves", (html.match(/class="biz-ring"/g) ?? []).length === 1 && /<span class="biz-ring"[^>]*><i class="a"><b><\/b><\/i><i class="b"><b><\/b><\/i><\/span>/.test(html))
  check("the ring is the clock: its second half closing brings the next kind", /e\.animationName === "biz-ring-b"\) advance\(\)/.test(code(SECTION)) && /onAnimationEnd=\{turnEnd\}/.test(code(SECTION)))
  check("it turns on transform alone, paused unless the section runs", /@keyframes biz-ring-a\{0%\{transform:rotate\(-180deg\)\}50%,100%\{transform:rotate\(0deg\)\}\}/.test(css) && /\.biz\[data-auto\] \.biz-ring b\{animation:biz-ring-a var\(--biz-ms,6500ms\) linear both paused\}/.test(css) && /\.biz\[data-auto\]\[data-run\] \.biz-ring b\{animation-play-state:running\}/.test(css))
  // Changed on purpose (landing round 11): physical turns through its four products too, so it has its own length as well.
  // Changed on purpose (landing round 12): no scene loops any more (one e-book, one oil), so every turn is the usual length.
  // Changed on purpose (landing round 13): physical's turn is four moves of its line of store designs; the others the usual length.
  // Changed on purpose (landing round 14): digital's turn is 8 s, long enough for the shelf to show itself and its bought product to stand a moment.
  check("every kind's turn is the usual length but physical's", BUSINESS_SLIDE_MS === 6500 && BUSINESS_SLIDES.every((s) => s.id === "physical" ? s.ms === 9600 : /* Changed on purpose (landing round 16): one purchase, the usual turn. */ s.ms === undefined) && html.includes(`--biz-ms:6500ms`)) /* Changed on purpose (landing round 15): digital's turn is three purchases of 3.2 s and a moment for the last to stand, 10.4 s. */
  const src = code(SECTION)
  check("autoplay stays: picking a word never stops it; hover, a finger, off screen and a hidden tab hold it", /onClick=\{\(\) => go\(i\)\}/.test(src) && !/t\.select\(/.test(src) && /\{\.\.\.t\.hoverProps\}/.test(src) && /onPointerDown=\{hold\}/.test(src) && /const run = t\.run && !held/.test(src) && /data-live=\{t\.live \|\| undefined\}/.test(src))
  check("arrow keys move along the row and down the index", /NEXT_KEYS = \["ArrowRight", "ArrowDown"\]/.test(src) && /PREV_KEYS = \["ArrowLeft", "ArrowUp"\]/.test(src))
  // Changed on purpose (landing round 12): a second timer, the phone row's settle (the card in view read once the row is still).
  // Changed on purpose (landing round 14): the phone row's marker is one transform a frame while it scrolls; still no interval and no layout reads per frame.
  check("no per-frame JavaScript: no rAF, no timer but the finger's release and the phone row's settle", !/setInterval|getBoundingClientRect/.test(src) && (src.match(/requestAnimationFrame\(/g) ?? []).length === 1 && (src.match(/setTimeout\(/g) ?? []).length === 2)
}

console.log("\nThe layout: an index beside the stage, a row over it on a phone")
{
  check("one box in the page's width holds the words and the stage", /\.biz-body\{[^}]*display:grid;grid-template-columns:minmax\(0,1fr\)[^}]*max-width:var\(--home-max,2020px\)[^}]*padding:0 var\(--home-edge/.test(css))
  const wide = css.match(/@media\(min-width:1280px\)\{([\s\S]*?)\n\}/)?.[1] ?? ""
  // Changed on purpose (landing round 10): the stage stops at 66svh tall and the index takes what is left beside it.
  check("from 1280px: two columns, the index as tall as the stage in five equal rows with hairlines", /\.biz-body\{grid-template-columns:minmax\(clamp\(232px,18vw,330px\),1fr\) minmax\(0,calc\(66vh \* 1100 \/ 570\)\)/.test(wide) && /\.biz-tabs\{display:grid;grid-template-rows:repeat\(5,minmax\(0,1fr\)\)/.test(wide) && /\.biz-tab\{[^}]*border-top:1px solid #ececee/.test(wide))
  check("the index says what each kind covers", /\.biz-tab-d\{display:block/.test(wide) && /\.biz-tab-s,\.biz-tab-d\{display:none\}/.test(css) && BUSINESS_SLIDES.every((s) => s.line.length > 12 && html.includes(s.line)))
  check("below that: one row that slides inside itself, never the page", /\.biz-tabs\{display:flex;[^}]*overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none\}/.test(css))
  check("a word is a 44px touch target at 16px on a phone", /\.biz-tab\{[^}]*min-height:44px[^}]*font-size:16px/.test(css))
  // Changed on purpose (landing round 10): about a tenth shorter on a computer, the same scenes drawn at 1100 x 570.
  // Changed on purpose (landing round 12): a phone's card is drawn at 360 x 520 (tests/home-landing-r12-business.test.ts).
  check("the stage is drawn at 1100 x 570 on a computer, 360 x 520 on a phone", /\.bz-frame\{aspect-ratio:1100\/570/.test(BUSINESS_MOCK_CSS) && /\.bz-frame>\.smk\{--w:1100\}/.test(BUSINESS_MOCK_CSS) && /@media\(max-width:767px\)\{\n  \.bz-frame\{aspect-ratio:360\/520\}/.test(BUSINESS_MOCK_CSS))
}

/* Changed on purpose (landing round 12): the owner disliked the row of covers ("the high-end Lightroom presets") and the tee; digital is one e-book, Slow Mornings, physical one oil, both pinned in tests/home-landing-r12-business.test.ts. What stays from round 9 is pinned here. */
console.log("\nDigital and physical: what round 9 removed stays removed")
{
  const d = renderToStaticMarkup(createElement(DigitalScene))
  // Changed on purpose (landing round 13): two digital products and one order card.
  // Changed on purpose (landing round 14): digital is a shelf of six with the cookbook and the course on it.
  /* Changed on purpose (landing round 15): digital is a product page with three products bought in turn, the cookbook and the course among them. */
  // Changed on purpose (landing round 18): six products, each its own card in one column, no order card.
  check("digital is two products with one order card", /* Changed on purpose (landing round 16): one book and its buy card. */ /* Changed on purpose (landing round 17): one file and its buy card. */ d.includes("Ancestral Kitchen") && (d.match(/class="dz-card[ "]/g) ?? []).length === 6)
  check("the Second Brain tablet is gone, with its pictures", !/Second Brain|bs-tablet|bn-|Brain/.test(code(MOCKS)) && ["cover", "daily", "work", "health", "goals"].every((n) => !existsSync(`public/home/showcase/bz-brain-${n}.webp`)))
  const t = renderToStaticMarkup(createElement(TeeScene))
  // Changed on purpose (landing round 13): physical is six store designs in a line, each a sixth of the loop apart.
  // Changed on purpose (landing round 14): the line moves by script (drag, fling, its own turn), so no per card delay.
  check("physical: six store designs, a step apart", (t.match(/class="bt-card"/g) ?? []).length === 6)
  check("the headphones and the yellow are gone", !/headphone|HN1|Halfnote|#f5c518|bs-spot/i.test(code(MOCKS)) && !existsSync("public/home/showcase/bz-headphones.webp"))
}

console.log("\nCommunity: a real banner. Courses and bookings kept")
{
  const c = renderToStaticMarkup(createElement(ClubScene))
  // Changed on purpose (landing round 11): the owner wanted another heading in the cover, a colour that is not white, and a real logo: a green banner, the club's logo, its promise as the heading.
  check("the banner: the club's photograph, its logo, its line set large and its host", /class="bs-com-cover">.*bz-ai-club\.webp.*class="bs-com-logo".*class="bs-com-word"><b>Build one AI tool a week<\/b>.*Hosted by Sam Adeyemi/.test(c))
  // Changed on purpose (landing round 13): no green: a soft ink shade from the left under the words.
  check("the photograph runs under a soft ink shade where the words stand", /\.bs-com-cover::after\{[^}]*linear-gradient\(to right,rgba\(17,17,20,\.82\)/.test(BUSINESS_MOCK_CSS))
  check("the rest of the club as it was: the event, three spaces, three posts", c.includes("Live build: an inbox agent") && (c.match(/class="bs-post"/g) ?? []).length === 3 && c.includes("Join for $12"))
  const course = renderToStaticMarkup(createElement(CourseScene))
  check("course kept: Tomás Reyes, the DJ photo, $79, four lessons", course.includes("Mixing in key, for new DJs") && course.includes("bz-dj.webp") && course.includes("$79") && (course.match(/<li/g) ?? []).length === 4)
  const coach = renderToStaticMarkup(createElement(CoachScene))
  check("booking kept: Talia Moreno, a day and a time picked and booked", coach.includes("Talia Moreno") && coach.includes("bz-coach.webp") && coach.includes("Booked for Thu 19, 17:30"))
}

console.log("\nSmooth and clean")
{
  const all = BUSINESS_MOCK_CSS + css
  const frames = [...all.matchAll(/@keyframes ([\w-]+)\{((?:[^{}]*\{[^}]*\})*)\}/g)]
  const props = new Set(frames.flatMap((m) => [...m[2].matchAll(/([a-z-]+):/g)].map((p) => p[1])))
  // Changed on purpose (landing round 12): the digital row and the physical loop are gone, so fewer keyframes.
  check("every keyframe moves only transform and opacity", frames.length >= 15 && [...props].every((p) => p === "transform" || p === "opacity" || p === "animation-timing-function"), [...props])
  // Changed on purpose (landing round 14): the shelf eases its pane and hover on opacity and transform only; the physical ground is a soft light (radial), the others flat.
  check("no transition in the scenes, no filter or blur anywhere, no gradient on the grounds", (BUSINESS_MOCK_CSS.match(/transition:[^;}]*/g) ?? []).every((t) => /^transition:((opacity|transform|visibility)[^,]*,?)+$/.test(t.replace(/\([^)]*\)/g, ""))) && !/filter:|blur\(/.test(all) && !/\.bs-(?:digital|tee|course|club)\{background:[^#]/.test(BUSINESS_MOCK_CSS))
  check("off screen or a hidden tab: every moment waits", /\.biz:not\(\[data-live\]\) \.bz-on \*,\.biz:not\(\[data-live\]\) \.bz-on \*::after\{animation-play-state:paused!important\}/.test(css))
  check("the moments run only with motion allowed", /@media\(prefers-reduced-motion:no-preference\)\{\n\.bz-on/.test(BUSINESS_MOCK_CSS) && !/\n\.bz-on[^\n]*animation/.test(BUSINESS_MOCK_CSS.split("@media(prefers-reduced-motion:no-preference){")[0]))
  const every = [DigitalScene, TeeScene, CourseScene, ClubScene, CoachScene].map((s) => renderToStaticMarkup(createElement(s))).join("")
  // Changed on purpose (landing round 12): no moving row of covers; the digital and physical photographs load with their scene (on a phone the scenes stand in a row that slides).
  check("every picture is sized and decoded off the main thread; all lazy but the digital and physical photographs", !/<img(?![^>]*width=)[^>]*>/.test(every) && !/<img(?![^>]*decoding="async")[^>]*>/.test(every) && !/<img(?![^>]*(?:loading="lazy"|loading="eager"[^>]*class="smk-pic))[^>]*>/.test(every))
  // Changed on purpose (landing round 13): the oil and e-book photographs are gone with their scenes.
  const pics = ["bz-ai-club", "bz-coach", "bz-dj"].map((n) => `public/home/showcase/${n}.webp`)
  check("every photograph is a small webp (under 120 KB)", pics.every((p) => existsSync(p) && statSync(p).size < 120 * 1024), pics.filter((p) => !existsSync(p) || statSync(p).size >= 120 * 1024))
  const words = `${BUSINESS_SLIDES.map((s) => `${s.alt} ${s.line}`).join(" ")} ${every.replace(/<[^>]+>/g, " ")}`
  check("no banned words, names or em dashes", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|\bfans\b|enthusiast|Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|Weeknight Pasta|sourdough|Golden Hour|Drawing Basics|Saturday Run Club|Dust & Tape|Elena Ruiz|Shopify|Liquid/i.test(words) && !/—/.test(words + read(MOCKS) + read(SECTION)))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 8 entries", /"tests\/home-landing-r8-business\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

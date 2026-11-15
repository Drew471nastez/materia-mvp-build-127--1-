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
import { BUSINESS_MOCK_CSS, ClubScene, CoachScene, CourseScene, DIGITAL_PRODUCTS, DIGITAL_STEP_S, DigitalScene, TeeScene } from "@/components/marketing/home/showcase-mocks/business-mocks"

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
  check("each kind's turn is its own length (digital shows three covers)", BUSINESS_SLIDE_MS === 6500 && BUSINESS_SLIDES[0].ms === Math.round(DIGITAL_STEP_S * 3000 + 500) && html.includes(`--biz-ms:${BUSINESS_SLIDES[0].ms}ms`) && BUSINESS_SLIDES.slice(1).every((s) => s.ms === undefined))
  const src = code(SECTION)
  check("autoplay stays: picking a word never stops it; hover, a finger, off screen and a hidden tab hold it", /onClick=\{\(\) => go\(i\)\}/.test(src) && !/t\.select\(/.test(src) && /\{\.\.\.t\.hoverProps\}/.test(src) && /onPointerDown=\{hold\}/.test(src) && /const run = t\.run && !held/.test(src) && /data-live=\{t\.live \|\| undefined\}/.test(src))
  check("arrow keys move along the row and down the index", /NEXT_KEYS = \["ArrowRight", "ArrowDown"\]/.test(src) && /PREV_KEYS = \["ArrowLeft", "ArrowUp"\]/.test(src))
  check("no per-frame JavaScript: no rAF, no timer but the finger's release", !/requestAnimationFrame|setInterval|getBoundingClientRect/.test(src) && (src.match(/setTimeout\(/g) ?? []).length === 1)
}

console.log("\nThe layout: an index beside the stage, a row over it on a phone")
{
  check("one box in the page's width holds the words and the stage", /\.biz-body\{[^}]*display:grid;grid-template-columns:minmax\(0,1fr\)[^}]*max-width:var\(--home-max,2020px\)[^}]*padding:0 var\(--home-edge/.test(css))
  const wide = css.match(/@media\(min-width:1200px\)\{([\s\S]*?)\n\}/)?.[1] ?? ""
  check("from 1200px: two columns, the index as tall as the stage in five equal rows with hairlines", /\.biz-body\{grid-template-columns:clamp\(236px,19\.5vw,330px\) minmax\(0,1fr\)/.test(wide) && /\.biz-tabs\{display:grid;grid-template-rows:repeat\(5,minmax\(0,1fr\)\)/.test(wide) && /\.biz-tab\{[^}]*border-top:1px solid #ececee/.test(wide))
  check("the index says what each kind covers", /\.biz-tab-d\{display:block/.test(wide) && /\.biz-tab-s,\.biz-tab-d\{display:none\}/.test(css) && BUSINESS_SLIDES.every((s) => s.line.length > 12 && html.includes(s.line)))
  check("below that: one row that slides inside itself, never the page", /\.biz-tabs\{display:flex;[^}]*overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none\}/.test(css))
  check("a word is a 44px touch target at 16px on a phone", /\.biz-tab\{[^}]*min-height:44px[^}]*font-size:16px/.test(css))
  check("the stage is drawn at 1040 x 600 on a computer, 400 x 640 on a phone", /\.bz-frame\{aspect-ratio:1040\/600/.test(BUSINESS_MOCK_CSS) && /\.bz-frame>\.smk\{--w:1040\}/.test(BUSINESS_MOCK_CSS) && /@media\(max-width:767px\)\{\n  \.bz-frame\{aspect-ratio:400\/640\}/.test(BUSINESS_MOCK_CSS))
}

console.log("\nDigital: covers in a slow row")
{
  const d = renderToStaticMarkup(createElement(DigitalScene))
  check("five products: a LUT pack, a Notion template, an e-book, a preset pack, a font", DIGITAL_PRODUCTS.map((p) => p.id).join() === "lut,notion,book,presets,font" && DIGITAL_PRODUCTS.every((p) => d.includes(p.name) && d.includes(p.price)))
  check("the shared Cine Tones LUT Pack leads, $29, on its black cover with the graded still", DIGITAL_PRODUCTS[0].name === "Cine Tones LUT Pack" && DIGITAL_PRODUCTS[0].price === "$29" && d.includes("/home/everything/lut-still.webp") && /\.bc-lut\{background:#0a0a0b\}/.test(BUSINESS_MOCK_CSS))
  check("the row carries the set and the covers round its ends, so it starts again unseen", (d.match(/class="bd-slot"/g) ?? []).length === 8 && /const SLOTS = \[4, 0, 1, 2, 3, 4, 0, 1\]/.test(read(MOCKS)))
  check("one buy card, a page for each product stacked in it", (d.match(/class="bs-card bd-card"/g) ?? []).length === 1 && (d.match(/class="bd-info"/g) ?? []).length === 5)
  check("the row, the covers and the card run one clock, each set back by its place", /\.bz-on \.bd-track\{animation:bd-run 13s linear infinite\}/.test(BUSINESS_MOCK_CSS) && /\.bz-on \.bd-cover\{animation:bd-focus 13s linear calc\(var\(--p\) \* 2\.6s - 13s\) infinite\}/.test(BUSINESS_MOCK_CSS) && /\.bz-on \.bd-info\{animation:bd-info 13s linear calc\(var\(--p\) \* 2\.6s - 13s\) infinite\}/.test(BUSINESS_MOCK_CSS))
  check("the row glides a cover at a time and ends where it began", /@keyframes bd-run\{0%,13\.08%\{transform:translate3d\(calc\(var\(--pitch\) \* -1\.5\),0,0\)/.test(BUSINESS_MOCK_CSS) && /100%\{transform:translate3d\(calc\(var\(--pitch\) \* -6\.5\),0,0\)\}\}/.test(BUSINESS_MOCK_CSS))
  check("at rest (and with reduced motion) the first cover is in the middle, full size, with its card", /\.bd-slot\[data-p="0"\] \.bd-cover\{transform:none;opacity:1\}/.test(BUSINESS_MOCK_CSS) && /\.bd-info\[data-p="0"\]\{opacity:1\}/.test(BUSINESS_MOCK_CSS))
  check("the Second Brain tablet is gone, with its pictures", !/Second Brain|bs-tablet|bn-|Brain/.test(code(MOCKS)) && ["cover", "daily", "work", "health", "goals"].every((n) => !existsSync(`public/home/showcase/bz-brain-${n}.webp`)))
  check("cover lettering is sized in the cover's own width, nothing under 4.8% of it", [...BUSINESS_MOCK_CSS.matchAll(/font-size:([\d.]+)cqw/g)].every((m) => Number(m[1]) >= 4.8))
}

console.log("\nPhysical: the Midnight Studio Tee")
{
  const t = renderToStaticMarkup(createElement(TeeScene))
  check("the shared black tee, $32, on a calm ground the photograph shares", t.includes("Midnight Studio Tee") && t.includes("$32") && t.includes("bz-tee.webp") && /\.bs-tee\{background:#eeedea\}/.test(BUSINESS_MOCK_CSS))
  check("a size is picked (the ring comes to rest on M) and it goes in the cart", ["XS", "S", "M", "L", "XL"].every((s) => t.includes(`<i>${s}</i>`)) && /\.bt-ring\{[^}]*transform:translate3d\(calc\(\(100% \+ calc\(8\*var\(--u\)\)\) \* 2\),0,0\)\}/.test(BUSINESS_MOCK_CSS) && /\.bz-on \.bt-ring\{animation:bt-size/.test(BUSINESS_MOCK_CSS) && t.includes("Added to cart") && t.includes("Size M · $32"))
  check("the headphones and the yellow are gone", !/headphone|HN1|Halfnote|#f5c518|bs-spot/i.test(code(MOCKS)) && !existsSync("public/home/showcase/bz-headphones.webp"))
}

console.log("\nCommunity: a real banner. Courses and bookings kept")
{
  const c = renderToStaticMarkup(createElement(ClubScene))
  check("the banner: the club's photograph, its mark, its name set large, its line and its host", /class="bs-com-cover">.*bz-ai-club\.webp.*class="bs-com-mark".*class="bs-com-word"><b>Applied AI Club<\/b><i>Build something real with AI, every week<\/i>.*Hosted by Sam Adeyemi/.test(c))
  check("the photograph runs into the banner's black under the words", /\.bs-com-cover::after\{[^}]*linear-gradient\(to right,#0c0d10 28%/.test(BUSINESS_MOCK_CSS))
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
  check("every keyframe moves only transform and opacity (the digital row also eases inside its keyframes)", frames.length >= 18 && [...props].every((p) => p === "transform" || p === "opacity" || p === "animation-timing-function"), [...props])
  check("no transition in the scenes, no filter or blur anywhere, no gradient on the grounds", !/transition:/.test(BUSINESS_MOCK_CSS) && !/filter:|blur\(/.test(all) && !/\.bs-(?:digital|tee|course|club)\{background:[^#]/.test(BUSINESS_MOCK_CSS))
  check("off screen or a hidden tab: every moment waits", /\.biz:not\(\[data-live\]\) \.bz-on \*,\.biz:not\(\[data-live\]\) \.bz-on \*::after\{animation-play-state:paused!important\}/.test(css))
  check("the moments run only with motion allowed", /@media\(prefers-reduced-motion:no-preference\)\{\n\.bz-on/.test(BUSINESS_MOCK_CSS) && !/\n\.bz-on[^\n]*animation/.test(BUSINESS_MOCK_CSS.split("@media(prefers-reduced-motion:no-preference){")[0]))
  const every = [DigitalScene, TeeScene, CourseScene, ClubScene, CoachScene].map((s) => renderToStaticMarkup(createElement(s))).join("")
  check("every picture is lazy, sized and decoded off the main thread", !/<img(?![^>]*loading="lazy")[^>]*>/.test(every) && !/<img(?![^>]*width=)[^>]*>/.test(every) && !/<img(?![^>]*decoding="async")[^>]*>/.test(every))
  const pics = ["bz-tee", "bz-ebook", "bz-presets", "bz-ai-club", "bz-coach", "bz-dj"].map((n) => `public/home/showcase/${n}.webp`)
  check("every photograph is a small webp (under 120 KB)", pics.every((p) => existsSync(p) && statSync(p).size < 120 * 1024), pics.filter((p) => !existsSync(p) || statSync(p).size >= 120 * 1024))
  const words = `${BUSINESS_SLIDES.map((s) => `${s.alt} ${s.line}`).join(" ")} ${every.replace(/<[^>]+>/g, " ")}`
  check("no banned words, names or em dashes", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|\bfans\b|enthusiast|Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|Weeknight Pasta|sourdough|Golden Hour|Drawing Basics|Saturday Run Club|Dust & Tape|Elena Ruiz|Shopify|Liquid/i.test(words) && !/—/.test(words + read(MOCKS) + read(SECTION)))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the round 8 entries", /"tests\/home-landing-r8-business\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

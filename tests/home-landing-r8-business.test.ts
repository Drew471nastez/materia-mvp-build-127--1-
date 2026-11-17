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
import { BUSINESS_HEADING, BUSINESS_SLIDES, BUSINESS_STYLES, BUSINESS_TOUCH_RESUME_MS, BusinessCarousel } from "@/components/marketing/home/business-carousel"
/* Changed on purpose (landing round 9): the Second Brain tablet and the yellow headphones are gone (the owner: "very bad UI", "get rid of it"); a row of digital covers and the Midnight Studio Tee stand in their places. */
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
  // Changed on purpose (landing round 11): the owner did not like "What will you sell?"; the heading is "One store, every kind of product" (tests/home-landing-r11-business.test.ts).
  // Changed on purpose (landing round 13): "Five ways to get paid" (tests/home-landing-r13-business.test.ts).
  // Changed on purpose (landing round 14): "From a cookbook to a coaching call".
  check("the heading is short, not the old line", /* Changed on purpose (landing round 15): "Sell files, parcels or your time". */ /* Changed on purpose (landing round 16): the owner disliked "Ship it, stream it or book it": "A page that fits what you sell", "fits" in the same purple. */ (BUSINESS_HEADING as string) === "A page that fits what you sell" /* Changed on purpose (landing round 15): the owner disliked "From a cookbook to a coaching call" and the green after it: "Ship it, stream it or book it", "book" in Storelib violet. */ && !read(SECTION).includes("One store for everything you sell."))
  // Changed on purpose (landing round 10): the line under the heading is gone ("it doesn't make sense").
  const words = `${BUSINESS_HEADING} ${BUSINESS_SLIDES.map((s) => s.alt).join(" ")}`
  check("no banned words, no em dash, no 'fans' or 'enthusiasts'", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|\bfans\b|enthusiast/i.test(words) && !/—/.test(words + read(MOCKS)))
  /* Changed on purpose (landing round 9): the words and the stage share one box (.biz-body), two columns from 1280px. */
  check("the heading block and the body use the page's one width and heading inset", /\.biz-head\{[^}]*max-width:var\(--home-max,2020px\)[^}]*calc\(var\(--home-edge[^}]*\+ var\(--home-head-inset,14px\)\)/.test(sectionCss) && /\.biz-body\{[^}]*max-width:var\(--home-max,2020px\)[^}]*padding:0 var\(--home-edge/.test(sectionCss))
}

/* Changed on purpose (landing round 9): the owner, "I don't like the pill shapes and the underline under the pill there": plain words, the chosen one with a ring that closes as its turn runs. */
console.log("\nThe five kinds as words, on autoplay with a closing ring")
{
  const html = renderToStaticMarkup(createElement(BusinessCarousel))
  check("five tabs in the owner's order", BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings" && (html.match(/role="tab"/g) ?? []).length === 5)
  check("no pill, no track and no line under a word", !/border-radius:999px/.test(sectionCss) && !/biz-prog/.test(sectionCss + html) && /\.biz-tab\{[^}]*border:0;background:none/.test(sectionCss))
  check("the chosen word carries the turn's ring, and it is the clock", (html.match(/class="biz-ring"/g) ?? []).length === 1 && /onAnimationEnd=\{turnEnd\}/.test(read(SECTION)) && /e\.animationName === "biz-ring-b"\) advance\(\)/.test(read(SECTION)))
  check("the ring closes by transform only, paused unless the section runs", /\.biz\[data-auto\] \.biz-ring b\{animation:biz-ring-a var\(--biz-ms,6500ms\) linear both paused\}/.test(sectionCss) && /\.biz\[data-auto\]\[data-run\] \.biz-ring b\{animation-play-state:running\}/.test(sectionCss) && /@keyframes biz-ring-b\{0%,50%\{transform:rotate\(0deg\)\}100%\{transform:rotate\(180deg\)\}\}/.test(sectionCss))
  const src = code(SECTION)
  check("picking a tab shows it and autoplay carries on (go, never select)", /onClick=\{\(\) => go\(i\)\}/.test(src) && !/t\.select\(/.test(src))
  check("a finger on the stage holds the turn, released a moment after", BUSINESS_TOUCH_RESUME_MS === 2500 && /onPointerDown=\{hold\}/.test(src) && /onPointerCancel=\{letGo\}/.test(src) && /const run = t\.run && !held/.test(src))
  check("a resting mouse holds it (use-auto-tabs hoverProps) and off screen or a hidden tab holds everything", /\{\.\.\.t\.hoverProps\}/.test(src) && /data-live=\{t\.live \|\| undefined\}/.test(src) && /\.biz:not\(\[data-live\]\) \.bz-on \*,\.biz:not\(\[data-live\]\) \.bz-on \*::after\{animation-play-state:paused!important\}/.test(sectionCss))
  // Changed on purpose (landing round 12): a phone has no row of words; the five kinds are a row of cards on snap scroll (tests/home-landing-r12-business.test.ts). A tablet's row of words still scrolls inside itself.
  check("on a phone a row of cards, on a tablet a row of words that scrolls inside itself", /\.biz-rail\{[^}]*overflow-x:auto;[^}]*scroll-snap-type:x mandatory/.test(sectionCss) && /\.biz-tabs\{[^}]*overflow-x:auto;overscroll-behavior-x:contain/.test(sectionCss))
  check("reduced motion: the ring stands closed (it only turns under data-auto), scenes stand finished", !/\n\.biz-ring b\{[^}]*animation/.test(sectionCss) && /\.biz-ring>\.b b\{left:0;transform:rotate\(180deg\)\}/.test(sectionCss) && /@media\(prefers-reduced-motion:no-preference\)\{\n\.bz-on/.test(BUSINESS_MOCK_CSS))
  check("a scene put away is hidden, not content-visibility (a scene shown again stood empty)", /\.biz-slide\[data-pane="rest"\]\{[^}]*visibility:hidden/.test(sectionCss) && !/content-visibility/.test(sectionCss.replace(/\/\*[\s\S]*?\*\//g, "")))
}

console.log("\nMoving scenes, transform and opacity only")
{
  const all = BUSINESS_MOCK_CSS + sectionCss
  const frames = [...all.matchAll(/@keyframes ([\w-]+)\{((?:[^{}]*\{[^}]*\})*)\}/g)]
  /* Changed on purpose (landing round 9): the digital row eases each glide inside its keyframes, so a timing function may stand beside transform and opacity. */
  const props = new Set(frames.flatMap((m) => [...m[2].matchAll(/([a-z-]+):/g)].map((p) => p[1])).filter((p) => p !== "animation-timing-function"))
  check("every keyframe animates only transform and opacity", frames.length >= 15 && [...props].every((p) => p === "transform" || p === "opacity"), [...props])
  // Changed on purpose (landing round 11): the physical scene's button swaps on a loop as long as one product's turn (bt-swap-b), since four products go in the cart one after another.
  // Changed on purpose (landing round 12): digital downloads in its button (be-fill), physical adds the oil to the cart (bz-in on its button).
  // Changed on purpose (landing round 13): physical is the line of store designs walking (bt-walk).
  // Changed on purpose (landing round 14): the download moment plays when a product is bought, and the store designs glide by Web Animations.
  /* Changed on purpose (landing round 15): the digital moment is the library's list stepping down a row at each purchase. */
  check("each scene has its own moment", [/* Changed on purpose (landing round 16): the book opening. */ /\.bk-cover\{animation:bk-cover/, /\.bp-bar i\{animation:bz-play/, /\.bs-post\{animation:bz-rise/, /\.bs-ring-day\{animation:bz-day/].every((r) => r.test(BUSINESS_MOCK_CSS)))
  check("the moments run only on the chosen scene (and the one fading out)", /className=\{on \? "biz-slide bz-on" : "biz-slide"\}/.test(read(SECTION)) && /const on = state === "active" \|\| state === "leaving"/.test(read(SECTION)))
  // Changed on purpose (landing round 14): the shelf answers a pointer with transitions, on opacity and transform only.
  check("nothing in the scenes is a transition (every change is one of those keyframes)", (BUSINESS_MOCK_CSS.match(/transition:[^;}]*/g) ?? []).every((t) => /^transition:((opacity|transform|visibility)[^,]*,?)+$/.test(t.replace(/\([^)]*\)/g, ""))))
}

console.log("\nThe five examples")
{
  /* Changed on purpose (landing round 9): digital is five covers in a row, physical is the shared black tee. */
  const brain = renderToStaticMarkup(createElement(DigitalScene))
  // Changed on purpose (landing round 12): the owner disliked the row of covers; digital is one e-book, Slow Mornings, on its page.
  // Changed on purpose (landing round 13): the owner named the mobility course and Ancestral Kitchen for the digital card.
  check("digital: the mobility course and Ancestral Kitchen, no Second Brain tablet", /* Changed on purpose (landing round 16): Ancestral Kitchen alone. */ brain.includes("Ancestral Kitchen") && brain.includes("dg-kitchen-cover.webp") && !/Second Brain|bs-tablet|bz-brain/.test(code(MOCKS)))
  const phones = renderToStaticMarkup(createElement(TeeScene))
  // Changed on purpose (landing round 12): the owner disliked the tee, cap, tote and print; physical is Night Face Oil on a warm ground.
  // Changed on purpose (landing round 13): physical is a line of store designs on a quiet ground.
  // Changed on purpose (landing round 14): the ground is cleaner light, not round 13's grey.
  check("physical: store designs on a calm ground, no headphones on yellow", phones.includes("bt-sora-560.webp") && /\.bs-store\{background:radial-gradient\(/.test(BUSINESS_MOCK_CSS) && !/headphones|#f5c518|hp-tee|Tour Tee/i.test(code(MOCKS)))
  const course = renderToStaticMarkup(createElement(CourseScene))
  check("course: kept as it was (Tomás Reyes, the DJ photo, $79, the four lessons)", course.includes("Mixing in key, for new DJs") && course.includes("bz-dj.webp") && course.includes("$79") && ["Counting bars and phrases", "Beatmatching by ear", "Mixing in key", "Your first 30 minute set"].every((l) => course.includes(l)))
  const club = renderToStaticMarkup(createElement(ClubScene))
  check("community: an AI community with its own name (not AI Builders), no 'enthusiasts'", club.includes("Applied AI Club") && !/AI Builders|enthusiast/i.test(club) && (club.match(/class="bs-post"/g) ?? []).length === 3)
  const coach = renderToStaticMarkup(createElement(CoachScene))
  check("booking: a fitness creator with a real photograph, a day and time picked and booked", coach.includes("Talia Moreno") && /Strength coach/.test(coach) && coach.includes("bz-coach.webp") && coach.includes("Booked for Thu 19, 17:30"))
  const banned = /Nadia Brooks|The Loop|LaSalle at dusk|Nails by Bea|Nordline Coffee|Charla Circle|Static Bloom|Wildcamp|Weeknight Pasta|sourdough|Golden Hour|Drawing Basics|Saturday Run Club|Dust & Tape|Elena Ruiz|Second Serve|Ines Duarte|Priya Raman/i
  // Changed on purpose (landing round 13): the comments name the retired examples (Slow Mornings, Night Face Oil) to say why they went; the code does not use them.
  check("none of the banned or retired sample names", !banned.test(code(MOCKS) + code(SECTION)))
  // Changed on purpose (landing round 12): the presets and the tee are gone; the oil and the e-book's inside page came.
  // Changed on purpose (landing round 13): the e-book and oil photographs are gone with their scenes.
  const pics = ["bz-ai-club", "bz-coach", "bz-dj"].map((n) => `public/home/showcase/${n}.webp`)
  check("every photograph is a small webp (under 120 KB)", pics.every((p) => existsSync(p) && statSync(p).size < 120 * 1024), pics.filter((p) => !existsSync(p) || statSync(p).size >= 120 * 1024))
  const every = brain + phones + course + club + coach
  /* Changed on purpose (landing round 9): the covers in the digital row (.bc-still) load with the scene; clipped by the row's rail, a lazy one was only asked for as it slid in. */
  // Changed on purpose (landing round 11): the four physical products turn in place too, so their pictures (smk-pic bt-pic, and the same files in the card and the note) load with the scene.
  // Changed on purpose (landing round 12): on a phone the scenes stand in a row that slides, so the digital and physical photographs load with their scene (loading="eager", smk-pic).
  check("every picture is sized, and lazy but for the digital and physical photographs", !/<img(?![^>]*(?:loading="lazy"|loading="eager"[^>]*class="smk-pic))[^>]*>/.test(every) && !/<img(?![^>]*width=)[^>]*>/.test(every))
  check("the scenes are pictures: labelled, nothing inside takes the pointer", BUSINESS_SLIDES.every((s) => s.alt.length > 60) && /\.biz-stage \.smk\{pointer-events:none/.test(sectionCss))
  /* Changed on purpose (landing round 9): the stage stands beside the index on a computer, so it is drawn at 1040 x 600. */
  // Changed on purpose (landing round 10): "the height is too big, reduce it just a little, 5 to 10%": 1100 x 570.
  // Changed on purpose (landing round 12): a phone's card is drawn at 360 x 520, so its name and the whole card stand on one phone screen.
  check("phones get their own layout (360 x 520), computers 1100 x 570", /\.bz-frame\{aspect-ratio:1100\/570/.test(BUSINESS_MOCK_CSS) && /@media\(max-width:767px\)\{\n  \.bz-frame\{aspect-ratio:360\/520\}\n  \.bz-frame>\.smk\{--w:360\}/.test(BUSINESS_MOCK_CSS))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the last home-landing entry", /"tests\/home-landing-r7-lower\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r8-business\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

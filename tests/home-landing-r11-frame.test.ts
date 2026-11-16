/**
 * ===========================================================================
 *  HOME, LANDING ROUND 11: THE FRAME
 * ===========================================================================
 * The owner, on an iPhone and on a computer:
 *
 *   the sheet     "The purple section should come up as you scroll down as
 *                 an actual sheet modal, very smooth and clean": the purple
 *                 sheet rises on every screen now (round 9 kept it to a
 *                 mouse), transform alone, a CSS scroll-driven animation,
 *                 eased over three quarters of a screen; without a timeline
 *                 it is simply there.
 *   the ink       "the filling of the headings should be more smooth, clean,
 *                 buttery": longer scroll, wider per-word ramp, a slower
 *                 fallback.
 *   the entrance  "all sections, graphics and images appear too abruptly,
 *                 stuttering": every picture fades in once decoded through
 *                 one capture-phase load listener; on a phone a block comes
 *                 up 12px over 700ms on a calm curve; once only; lazy boxes
 *                 ask for their pictures when they are drawn ahead.
 *   the FAQ       "the questions should not be purple".
 *   the footer    "the Storelib icon in the footer should not be outlined".
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SHEET_CSS, SHEET_RISE, SHEET_RISE_SPAN, SHEET_RISE_EASE, ScrollRevealPanel } from "@/components/marketing/scroll-reveal-panel"
import { REVEAL_CSS, IMG_FADE_MS, IMG_SKIP, TOUCH_MS, TOUCH_RISE_PX, TOUCH_EASE } from "@/components/marketing/landing-story"
import { STORY_CSS, WORD_SPREAD, INK_FALLBACK_MS, StoryHeading } from "@/components/marketing/story-heading"
import { FaqSection } from "@/components/marketing/faq-section"
import { MarketingFooter } from "@/components/marketing/footer"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/** Source without comments. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform your)\b|—/i

console.log("\n── the purple sheet rises on every screen ──")
{
  const motion = SHEET_CSS.slice(SHEET_CSS.indexOf("@supports (animation-timeline:view())"))
  check("only where scroll-driven animations exist and motion is welcome: no pointer or hover condition", /^@supports \(animation-timeline:view\(\)\) \{\s*@media \(prefers-reduced-motion:no-preference\) \{/.test(motion) && !/\(hover|\(pointer/.test(SHEET_CSS))
  check("a smaller rise, fixed in svh so the URL bar never moves it, the same on both sides of the join", SHEET_RISE === "clamp(88px,13svh,150px)" && (SHEET_CSS.match(/clamp\(88px,13svh,150px\)/g) ?? []).length === 2)
  check("over three quarters of a screen (it was half), eased in and out", SHEET_RISE_SPAN === "75svh" && SHEET_RISE_EASE === "cubic-bezier(.45,0,.4,1)" && /animation-timing-function:cubic-bezier\(\.45,0,\.4,1\);animation-timeline:view\(\);animation-range:cover var\(--srp-rise\) cover calc\(var\(--srp-rise\) \+ 75svh\)/.test(SHEET_CSS))
  check("the timeline is set after the shorthand (which would reset it)", /animation:srp-rise both;animation-timing-function:[^;]+;animation-timeline:view\(\)/.test(SHEET_CSS))
  check("transform alone, one keyframe", /@keyframes srp-rise\{from\{transform:translate3d\(0,var\(--srp-rise\),0\)\}to\{transform:translate3d\(0,0,0\)\}\}/.test(SHEET_CSS) && (SHEET_CSS.match(/@keyframes/g) ?? []).length === 1 && !/opacity|filter|box-shadow/.test(motion))
  check("nothing held: no sticky, no script, no vh that the URL bar moves", !/sticky|100vh|lvh|dvh/.test(SHEET_CSS) && !/"use client"|addEventListener|requestAnimationFrame|IntersectionObserver/.test(code("components/marketing/scroll-reveal-panel.tsx")))
  check("without a timeline (or with reduced motion) the sheet is simply there: the rise is 0 outside the block", /--srp-rise:0px;--srp-next-rise:0px/.test(SHEET_CSS))
  const html = renderToStaticMarkup(createElement(ScrollRevealPanel, { tone: "purple", arrive: "rise", children: "x" }))
  check("the page's purple sheet is the rising one", /data-sheet="purple" data-sheet-rise=""/.test(html) && /<ScrollRevealPanel tone="purple" arrive="rise">/.test(read("app/(storelib)/(marketing)/page.tsx")))
}

console.log("\n── the headings fill more gently ──")
{
  const css = read("app/globals.css")
  check("each word takes four words of the wave (it was 2.4)", WORD_SPREAD === 4 && STORY_CSS.includes("(var(--word-count) + 4) - var(--word-index)) / 4,1)"))
  check("still a smoothstep in colour alone", /3 - 2 \* var\(--word-on\)/.test(STORY_CSS) && /color:color-mix\(in oklab/.test(STORY_CSS))
  check("over a longer stretch of scroll: from the top showing to 70% of the screen (was 76px in, to 68%)", (css.match(/animation-range:cover 12px entry calc\(25% \+ 64px \+ 70svh\)/g) ?? []).length === 2 && !/cover 76px entry/.test(css))
  check("the fallback's single transition is 1.8s on a softer curve (was 1.1s)", INK_FALLBACK_MS === 1800 && /transition:--story-progress 1800ms cubic-bezier\(\.33,0,\.2,1\)/.test(STORY_CSS))
}

console.log("\n── every picture fades in once decoded ──")
{
  const story = code("components/marketing/landing-story.tsx")
  check("one capture-phase load (and error) listener on the landing root", /root\.addEventListener\("load", onPicture, true\)/.test(story) && /root\.addEventListener\("error", onPicture, true\)/.test(story))
  check("shown after decode()", /img\.decode\(\)\.then\(go, go\)/.test(story))
  check("a picture already complete is left alone", /if \(img\.complete \|\| img\.matches\(IMG_SKIP\)\) return/.test(story) && /if \(img\.complete \|\| "img" in img\.dataset\) continue/.test(story))
  check("at first only a picture below the screen is held; one a section adds later is held as it arrives", /if \(!entry\.isIntersecting && \(skipped \|\| box\.top > innerHeight\)\) holdPicture\(img\)/.test(story) && /if \(fresh\) holdPicture\(img\)/.test(story) && /record\.addedNodes\.forEach\(\(node\) => discover\(node, true\)\)/.test(story))
  check("opacity only, as an animation (never replacing a picture's own transitions), and the mark goes when it ends", IMG_FADE_MS === 450 && REVEAL_CSS.includes('img[data-img="wait"]{opacity:0}') && REVEAL_CSS.includes('img[data-img="in"]{animation:landing-img-in 450ms ease-out}') && /@keyframes landing-img-in\{from\{opacity:0\}\}/.test(REVEAL_CSS) && /delete img\.dataset\.img/.test(story))
  check("the fade runs out off screen too (the section pause leaves it)", /animationName !== "landing-img-in"/.test(story))
  check("not the showcase's (its own queue) and not the logo", IMG_SKIP.includes(".build-showcase img") && IMG_SKIP.includes("img[data-storelib-logo]"))
  check("no picture hidden under reduced motion", /if \(reduced\) return/.test(story) && REVEAL_CSS.indexOf('img[data-img="wait"]') > REVEAL_CSS.indexOf("@media (prefers-reduced-motion:no-preference)"))
  check("no timer", !/setTimeout|setInterval/.test(story))
}

console.log("\n── a calmer entrance on a phone, once ──")
{
  const phone = REVEAL_CSS.slice(REVEAL_CSS.indexOf("@media (max-width:767px),(hover:none) and (pointer:coarse){"))
  check("700ms, 12px, a calm curve with a soft start", TOUCH_MS === 700 && TOUCH_RISE_PX === 12 && TOUCH_EASE === "cubic-bezier(.25,.6,.3,1)" && phone.includes("transition:opacity 700ms cubic-bezier(.25,.6,.3,1) var(--reveal-delay,0ms),translate 700ms") && phone.includes('[data-reveal="wait"][data-reveal="wait"]{translate:0 12px}'))
  check("a heading fades as one piece, its words still", phone.includes('.story-heading[data-reveal="wait"][data-reveal="wait"]{opacity:0;translate:none}') && phone.includes("[data-story-word][data-story-word]{transition:none;opacity:1;translate:none}"))
  const story = code("components/marketing/landing-story.tsx")
  check("once: a block shown is let go and never hidden again", /reveal\?\.unobserve\(el\)/.test(story) && (story.match(/dataset\.reveal = "wait"/g) ?? []).length === 1)
  const lazy = code("components/marketing/home/lazy-section.tsx")
  /* Changed on purpose (landing round 12): built sections are never skipped, so this machinery is gone. */ check("no draw-ahead picture switch (the boxes are never skipped)", !/eagerPictures/.test(lazy))
}

console.log("\n── the FAQ heading is not purple ──")
{
  const home = renderToStaticMarkup(createElement(FaqSection, { editorial: true }))
  const heading = /<h2[^>]*story-heading[\s\S]*?<\/h2>/.exec(home)?.[0] ?? ""
  check("no accent word in the heading", heading.length > 0 && !/data-story-accent/.test(heading) && !/accent=/.test(code("components/marketing/faq-section.tsx")))
  check("no violet anywhere in the section", !/#7c3aed|#8b5cf6|#c4b5fd|#bca3ff|violet|purple-/i.test(home))
  const plain = renderToStaticMarkup(createElement(StoryHeading, { text: "Frequently asked questions" }))
  check("a heading without accents inks every word to the ink colour", (plain.match(/data-story-word=""/g) ?? []).length === 3 && !/data-story-accent/.test(plain))
}

console.log("\n── the footer draws the app icon ──")
{
  const footer = renderToStaticMarkup(createElement(MarketingFooter))
  check("the colourful logo picture, 40px", /<img[^>]*data-storelib-logo=""[^>]*>/.test(footer) && /width="40"/.test(/<img[^>]*data-storelib-logo=""[^>]*>/.exec(footer)?.[0] ?? "") && !/data-storelib-logo="outline"/.test(footer))
  check("the outline drawing is gone from the logo component", !/outline|STORELIB_S_PATH|<svg/.test(code("components/brand/storelib-logo.tsx")))
}

console.log("\n── copy and registration ──")
{
  for (const f of ["components/marketing/scroll-reveal-panel.tsx", "components/marketing/landing-story.tsx", "components/marketing/story-heading.tsx", "components/marketing/home/lazy-section.tsx", "components/marketing/faq-section.tsx"])
    check(`no banned words or em dashes: ${f}`, !BANNED.test(read(f)))
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after round 10's", /"tests\/home-landing-r10-checkout\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r11-frame\.test\.ts",/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

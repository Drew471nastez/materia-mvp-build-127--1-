/**
 * ===========================================================================
 *  HOME, LANDING ROUND 4: THE FRAME
 * ===========================================================================
 * What the owner asked of the page's frame this round, held in place:
 *
 *   The sheets      a sheet comes up "realistically" like a phone's sheet: a
 *                   little narrower than the page, settling to full width as
 *                   it takes the screen, while the block behind holds, shrinks
 *                   a little and dims. CSS scroll-driven (view timelines),
 *                   transform and opacity only, no script, reversible, off
 *                   for reduced motion and without view timelines.
 *   Make the work   does not arrive as a sheet: the first white ground is
 *                   flat and runs on under the showcase, which is not held.
 *   The globe       the order pill is told where to go a few times a second
 *                   and glides on the compositor (no style change per frame),
 *                   the move path reads no layout, drawing stays in a worker.
 *   The app         no purple: on the page's dark close.
 *   The close       a new closing call on the dark, running into the footer
 *                   with no lit seam.
 *   The questions   a neutral plus in the text colour that becomes a minus,
 *                   an answer opened by grid rows, hairlines, no purple.
 *   Dot grid        one small reusable background, transform only, paused
 *                   off screen, still under reduced motion.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ScrollRevealBackdrop, ScrollRevealPanel, SHEET_CSS } from "@/components/marketing/scroll-reveal-panel"
import { DOT_FIELD_CSS } from "@/components/marketing/home/dot-field"

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
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|passive income)\b/i
const keyframes = (css: string) => [...css.matchAll(/@keyframes [\w-]+\{((?:[^{}]*\{[^}]*\})*)\}/g)].map((m) => m[1]).join("")

console.log("\n── The sheet (round 5: plain) ──")
{
  // Changed on purpose (landing round 5): the scroll-driven rise, the hold and the dimming are gone (the owner: glitches with black, cut corners, stutter); tests/home-landing-r5-frame.test.ts pins what replaced them.
  const src = code("components/marketing/scroll-reveal-panel.tsx")
  check("no script: no client directive, no hook, no listener", !/"use client"/.test(src) && !/\buse[A-Z]\w*\(/.test(src) && !/addEventListener|requestAnimationFrame/.test(src))
// Changed on purpose (landing round 8): the purple sheet rises again (the owner: "come up as a sheet like we had it before"): one keyframe of transform alone, on a view timeline, no scale, no opacity.
  check("one keyframe, transform only, on a view timeline", (SHEET_CSS.match(/@keyframes/g) || []).length === 1 && /@keyframes srp-rise\{from\{transform:translate3d\(0,var\(--srp-rise\),0\)\}to\{transform:translate3d\(0,0,0\)\}\}/.test(SHEET_CSS) && !/opacity|scale/.test(keyframes(SHEET_CSS)) && /animation-timeline:view\(\)/.test(SHEET_CSS))
  check("still one scrollbar: nothing scrolls or clips", !/overflow/.test(SHEET_CSS))
  // Changed on purpose (landing round 8): no flat ground: every join is drawn by the lower block (rounded top over the upper's square foot, its fillets in the upper's colour).
  const rise = renderToStaticMarkup(createElement(ScrollRevealPanel, { tone: "purple", arrive: "rise", children: createElement("p", null, "x") }))
  check("no flat ground; a rising sheet is marked", !/data-sheet-flat/.test(SHEET_CSS) && /<div data-sheet="purple" data-sheet-rise="" data-band="purple">/.test(rise))
  const plain = renderToStaticMarkup(createElement(ScrollRevealBackdrop, { children: createElement("p", null, "x") }))
  check("a dark stretch is plain", /<div data-sheet-backdrop=""><p>x<\/p><\/div>$/.test(plain))
  check("the purple sheet still sets the band colours", /\[data-sheet="purple"\]\{--srp-bg:#24104f;--band-ink:#fff;--band-muted:#cdc2f7;--band-line:rgba\(255,255,255,\.16\)/.test(SHEET_CSS))
}

console.log("\n── The page ──")
{
  const page = code("app/(storelib)/(marketing)/page.tsx").replace(/\{\s*\}/g, "")
  // Changed on purpose (landing round 5): nothing is held anywhere, so no hold props.
// Changed on purpose (landing round 8): Make the work sits on a white sheet whose rounded top lies over the showcase's square foot; the purple rises.
  check("the hero and showcase are not held, and Make the work sits on a white sheet under them", /<ScrollRevealBackdrop>\s*<Hero \/>\s*<BuildShowcase \/>\s*<\/ScrollRevealBackdrop>\s*<ScrollRevealPanel tone="white">\s*<LazyEverythingInOnePlace \/>/.test(page))
  check("the later grounds are sheets over plain blocks, nothing held", /<ScrollRevealBackdrop>\s*<LazyCheckoutScene \/>/.test(page) && /<ScrollRevealPanel tone="white">\s*<LazyAudienceOwnership \/>/.test(page) && /<ScrollRevealPanel tone="purple" arrive="rise">/.test(page) && !/\bhold\b/.test(page))
  /* Changed on purpose (landing round 7): the owner asked for the purple's dots more subtle and clean, so they are a little sparser there (gap 22). */
  check("a dot grid over the top of the purple, limited to about a screen and a half", /<ScrollRevealPanel tone="purple" arrive="rise">\s*<DotField tone="purple" fade="bottom"(?: gap=\{\d+\})? style=\{\{ height: "min\(100%, 1600px\)" \}\} \/>/.test(page)) // Changed on purpose (landing round 11): the owner wants the purple's dots "more visible", so the field reaches further down the sheet before it fades.
  // Changed on purpose (landing round 9): the owner moved the app up onto a white sheet; the closing call is alone above the footer, after the questions.
  check("the close is dark (no purple): the closing call alone", /<\/LazySection>\s*<\/ScrollRevealPanel>\s*<ScrollRevealBackdrop>\s*<FinalCta \/>\s*<\/ScrollRevealBackdrop>\s*<\/LandingStory>/.test(page) && (page.match(/<ScrollRevealPanel tone="purple"/g) || []).length === 1)
  check("the measured lazy heights are still written in", /LAZY_SECTION_HEIGHTS_CSS/.test(page))
}

console.log("\n── The globe in Make the work ──")
{
  const draw = code("components/marketing/home/everything-globe-draw.ts")
  const globe = code("components/marketing/home/everything-globe.tsx")
  const every = Number(/const PILL_EVERY = (\d+)/.exec(draw)?.[1])
  /* Changed on purpose (landing round 5): the owner saw the pill "glitch and stutter, move and flash" as it chased the city; it is now a notification in one fixed place, told only on and off (tests/home-landing-r5-top). */
  /* Changed on purpose (landing round 6): the owner wants the notification "where the rocket landed"; it is told once per landing where the city is and where the spin takes it (never per frame, no re-aiming), and leaves early if the city turns away (tests/home-landing-r6-globe). */
  check("the pill is told only when an order lands (with where) and when it leaves, never re-aimed", Number.isNaN(every) && /host\.onPill\(\{ i, on: true, x0: /.test(draw) && /host\.onPill\(\{ i: st\.pill, on: false \}\)/.test(draw))
  /* Changed on purpose (landing round 6): placed by a transform on its pin once per landing, then one compositor animation along with the city; never moved per frame. */
  check("placed once per landing, by transform only", /pin\.style\.transform = `translate\(/.test(globe) && (globe.match(/pin\.animate\(/g) || []).length === 1 && !/style\.(left|top) =/.test(globe))
  const move = globe.slice(globe.indexOf("const onMove"), globe.indexOf("const onUp"))
  check("the move path reads no layout: a drag passes straight on, the lean uses a box read once", /driver\.pointer\(\{ kind: "move"/.test(move) && (move.match(/getBoundingClientRect/g) || []).length === 1 && /if \(!rect\) \{/.test(move) && !/offset(Width|Height|Left|Top)|getComputedStyle/.test(move))
  check("drawing stays in a worker that owns the canvas", /transferControlToOffscreen/.test(globe) && /new Worker\(url\)/.test(globe))
  check("no attribute rewritten when nothing changed", /if \(el\.hasAttribute\("data-on"\) !== p\.on\)/.test(globe))
}

console.log("\n── Run your business from anywhere ──")
{
  const src = code("components/marketing/home/app-anywhere.tsx")
  const css = read("components/marketing/home/app-anywhere.module.css")
  // Changed on purpose (landing round 9): the owner wants the section white, earlier in the page; it draws its own white ground by its own class, with one black stage in it.
  check("white by its own class (no purple ground), wherever the page puts it", !/#7c3aed|purple/i.test(src) && !/\$\{m\.root\} bg-white/.test(src) && /className=\{`\$\{m\.root\} \$\{s\.section\}/.test(src) && /\.section \{\s*background: #fff;\s*color: #18181b;/.test(css))
  // Changed on purpose (landing round 9): on white the heading is in its light form, the hairlines are dark, and the picture is a black stage with thin rings.
  // Changed on purpose (landing round 11): the owner's photograph again (round 8's section), on the white; no black stage.
  check("the heading in its light form, faint dark hairlines, the owner's photograph", /accent=\{\["anywhere"\]\} \/>/.test(src) && /border-bottom: 1px solid rgba\(24, 24, 27, 0\.09\)/.test(css) && /storelib-app-720\.webp/.test(src) && !/\.card \{/.test(css))
}

console.log("\n── The closing call ──")
{
  const src = code("components/marketing/home/final-cta.tsx")
  /* Changed on purpose (landing round 5): the owner asked to remove the "See creators on Storelib" button, so the close keeps one way in. */
  check("a new line, one way in, on a dot grid", /Start selling <em>what you make\.<\/em>/.test(src) && /\/signup\?intent=sell/.test(src) && !/href="\/explore"/.test(src) && /<DotField fade="close" scatter \/>/.test(src)) // Changed on purpose (landing round 12): the way in is an email field (action="/signup", intent=sell) and the dots are scattered. // Changed on purpose (landing round 8): fade="close"
  check("light on dark, a white button", /\.fcta-title\{[^}]*color:#fafafa/.test(src) && /\.fcta-primary\{background:#fff;color:#18181b\}/.test(src))
  // Changed on purpose (landing round 8): the footer starts on the call's own black (no seam) but has a top edge again: a hairline faded at both ends and a faint light under it.
  check("no seam into the footer, but a top edge of its own on the home page", /footer\.storelib-footer\{background-color:#050506;background-image:radial-gradient\(ellipse 60% 140px at 50% 0%,rgba\(255,255,255,\.045\),transparent 100%\),linear-gradient\(180deg,#050506 0%/.test(src) && /footer\.storelib-footer::before\{content:"";background:linear-gradient\(90deg,transparent 4%/.test(src))
  check("no purple glow, no em dash, no banned word", !/124,\s*58,\s*237|#7c3aed|violet/i.test(src) && !/—/.test(read("components/marketing/home/final-cta.tsx")) && !BANNED.test(src.replace(/transform/g, "")))
}

console.log("\n── The questions ──")
{
  const src = code("components/marketing/faq-section.tsx")
  check("a neutral plus in the text colour that turns into a minus; no purple anywhere", /\.faq-mark\{[^}]*color:currentColor/.test(src) && /\.faq-q\[aria-expanded="true"\] \.faq-mark::after\{transform:rotate\(0deg\)\}/.test(src) && !/violet|#7c3aed|purple/i.test(src))
  check("the answer opens by its grid row, nothing measured", /\.faq-a\{display:grid;grid-template-rows:0fr;transition:grid-template-rows/.test(src) && /\.faq-item\[data-open\] \.faq-a\{grid-template-rows:1fr\}/.test(src) && !/ResizeObserver|scrollHeight|maxHeight/.test(src))
  check("calm list: hairlines, not pill cards", /\.faq-item\{border-bottom:1px solid #e9e9ee\}/.test(src) && !/rounded-2xl|shadow-\[/.test(src))
  check("accessible: a real button with aria-expanded and aria-controls", /<button type="button" className="faq-q" aria-expanded=\{isOpen\} aria-controls=\{id\}/.test(src))
  check("reduced motion: it simply opens", /@media \(prefers-reduced-motion:reduce\)\{\.faq-q,\.faq-mark::before,\.faq-mark::after,\.faq-a,\.faq-a p\{transition:none\}\}/.test(src))
  check("no em dash in the answers", !/—/.test(read("components/marketing/faq-section.tsx")))
}

console.log("\n── The dot grid ──")
{
  const src = code("components/marketing/home/dot-field.tsx")
  const props = [...keyframes(DOT_FIELD_CSS).matchAll(/([a-z-]+):/g)].map((m) => m[1])
  /* Changed on purpose (landing round 5): the dot field is one canvas now (scattered dots, a light that follows the mouse), so its CSS has no keyframes; the canvas fades in once. */
  check("no CSS animation: the canvas draws the motion, the CSS only fades it in once", props.length === 0 && /\.dotf canvas\{[^}]*transition:opacity/.test(DOT_FIELD_CSS))
  check("one canvas, scattered dots drawn in batches by alpha, the device pixel ratio capped", /<canvas ref=\{canvasRef\}/.test(src) && /Math\.min\(DOT_FIELD_MAX_DPR/.test(src) && /ctx\.fill\(\)/.test(src))
  check("runs only on screen and with the tab visible; no React state", /IntersectionObserver/.test(src) && /visibilitychange/.test(src) && /cancelAnimationFrame/.test(src) && !/useState/.test(src))
  check("still under reduced motion; behind the content; takes no pointer", /&& !reduced/.test(src) && /\.dotf\{position:absolute;inset:0;z-index:-1;[^}]*pointer-events:none/.test(DOT_FIELD_CSS))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

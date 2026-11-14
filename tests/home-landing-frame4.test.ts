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

console.log("\n── The sheet rises like a sheet ──")
{
  const src = code("components/marketing/scroll-reveal-panel.tsx")
  check("no script: no client directive, no hook, no listener", !/"use client"/.test(src) && !/\buse[A-Z]\w*\(/.test(src) && !/addEventListener|requestAnimationFrame/.test(src))
  const kf = keyframes(SHEET_CSS)
  const props = [...kf.matchAll(/([a-z-]+):/g)].map((m) => m[1])
  check("its keyframes move transform and opacity only", props.length > 0 && props.every((p) => p === "transform" || p === "opacity"), props)
  check("rising: a little narrower (scaled about its top edge), full width as it takes the screen", /@keyframes srp-rise\{from\{transform:scale\(var\(--srp-rise\)\)\}to\{transform:none\}\}/.test(SHEET_CSS) && /--srp-rise:\.9\d+/.test(SHEET_CSS) && /transform-origin:50% 0;animation:srp-rise linear both;animation-timeline:view\(\);animation-range:entry 0% entry 100%/.test(SHEET_CSS))
  /* Changed on purpose (landing round 4, integration): the block behind only dims, by a dark layer over it; no shrink and not its own opacity (both composited the whole section every frame: most of the slow frames under the sheets, measured on a production build). */
  check("the block behind dims under the sheet coming over it", !/srp-recede/.test(SHEET_CSS) && /@keyframes srp-dim\{from\{opacity:0\}to\{opacity:calc\(1 - var\(--srp-dim\)\)\}\}/.test(SHEET_CSS) && /\[data-sheet-hold\]>\[data-sheet-backdrop\]::after,\[data-sheet-hold\]>\[data-sheet\]::after\{[^}]*animation:srp-dim linear forwards/.test(SHEET_CSS))
  check("a held block stops animating and painting once the next sheet covers it", /\[data-sheet-hold\]\[data-sheet-covered\]>\*\{visibility:hidden\}/.test(SHEET_CSS) && /animation-play-state:paused!important/.test(SHEET_CSS))
  check("timed by the hold box's own view timeline: rising as it enters, dimming over its last screen", /\[data-sheet-hold\]\{view-timeline:--srp-box block\}/.test(SHEET_CSS) && /animation-timeline:--srp-box;animation-range:contain calc\(100% - var\(--srp-cover\)\) contain 100%/.test(SHEET_CSS)) /* Changed on purpose (landing round 4, integration): the last screen times the dimming layer now. */
  check("only where the browser has view timelines and motion is welcome", /@supports \(animation-timeline:view\(\)\)\{\s*@media \(prefers-reduced-motion:no-preference\)/.test(SHEET_CSS) && SHEET_CSS.indexOf("animation:") > SHEET_CSS.indexOf("@supports (animation-timeline:view())"))
  check("dimming only while the block is really held (not on a tall window, not a phone's showcase)", /@media \(max-height:1400px\) and \(prefers-reduced-motion:no-preference\)\{\s*\[data-sheet-hold\]>\[data-sheet-backdrop\]::after/.test(SHEET_CSS) && /\[data-sheet-hold="wide"\]>\*,\[data-sheet-hold="wide"\]>\*::after\{animation:none\}/.test(SHEET_CSS)) /* Changed on purpose (landing round 4, integration): the dimming layer replaced the shrink. */
  check("still one scrollbar: nothing scrolls or clips", !/overflow/.test(SHEET_CSS))
  const flat = renderToStaticMarkup(createElement(ScrollRevealPanel, { tone: "white", arrive: "flat", children: createElement("p", null, "x") }))
  check("a flat ground: no rise, a square top, fillets that round the dark block above", /<div data-sheet="white" data-sheet-flat="">/.test(flat) && /\[data-sheet\]:not\(\[data-sheet-flat\]\)\{transform-origin/.test(SHEET_CSS) && /\[data-sheet\]\[data-sheet-flat\]\{border-top-left-radius:0;border-top-right-radius:0\}/.test(SHEET_CSS) && /\[data-sheet\]\[data-sheet-flat\]::before\{content:"";position:absolute;[^}]*radial-gradient\(circle at 100% 0,transparent/.test(SHEET_CSS))
  const plain = renderToStaticMarkup(createElement(ScrollRevealBackdrop, { hold: false, children: createElement("p", null, "x") }))
  check("a dark stretch can be plain, not held", plain === '<div data-sheet-backdrop=""><p>x</p></div>')
  check("the purple sheet still sets the band colours", /\[data-sheet="purple"\]\{--srp-bg:#24104f;--band-ink:#fff;--band-muted:#cdc2f7;--band-line:rgba\(255,255,255,\.16\)/.test(SHEET_CSS))
}

console.log("\n── The page ──")
{
  const page = code("app/(storelib)/(marketing)/page.tsx").replace(/\{\s*\}/g, "")
  check("the hero and showcase are not held, and Make the work sits on a flat ground", /<ScrollRevealBackdrop hold=\{false\}>\s*<Hero \/>\s*<BuildShowcase \/>\s*<\/ScrollRevealBackdrop>\s*<ScrollRevealPanel tone="white" arrive="flat">\s*<LazyEverythingInOnePlace \/>/.test(page))
  check("the later grounds rise as sheets over held blocks", /<ScrollRevealBackdrop>\s*<LazyCheckoutScene \/>/.test(page) && /<ScrollRevealPanel tone="white" hold>\s*<LazyAudienceOwnership \/>/.test(page) && /<ScrollRevealPanel tone="purple" hold>/.test(page))
  check("a dot grid over the top of the purple, limited to about a screen", /<ScrollRevealPanel tone="purple" hold>\s*<DotField tone="purple" fade="bottom" style=\{\{ height: "min\(100%, 1100px\)" \}\} \/>/.test(page))
  check("the close is dark (no purple): the app, then the closing call", /<ScrollRevealBackdrop hold=\{false\}>\s*<LazyAppAnywhere \/>\s*<FinalCta \/>\s*<\/ScrollRevealBackdrop>\s*<\/LandingStory>/.test(page) && (page.match(/<ScrollRevealPanel tone="purple"/g) || []).length === 1)
  check("the measured lazy heights are still written in", /LAZY_SECTION_HEIGHTS_CSS/.test(page))
}

console.log("\n── The globe in Make the work ──")
{
  const draw = code("components/marketing/home/everything-globe-draw.ts")
  const globe = code("components/marketing/home/everything-globe.tsx")
  const every = Number(/const PILL_EVERY = (\d+)/.exec(draw)?.[1])
  /* Changed on purpose (landing round 5): the owner saw the pill "glitch and stutter, move and flash" as it chased the city; it is now a notification in one fixed place, told only on and off (tests/home-landing-r5-top). */
  check("the pill is told only when an order lands and when it leaves, never where to go", Number.isNaN(every) && /host\.onPill\(\{ i, on: true \}\)/.test(draw) && /host\.onPill\(\{ i: st\.pill, on: false \}\)/.test(draw))
  check("no glide on the page: the pill is never moved", !/el\.animate\(/.test(globe) && !/style\.transform/.test(globe))
  const move = globe.slice(globe.indexOf("const onMove"), globe.indexOf("const onUp"))
  check("the move path reads no layout: a drag passes straight on, the lean uses a box read once", /driver\.pointer\(\{ kind: "move"/.test(move) && (move.match(/getBoundingClientRect/g) || []).length === 1 && /if \(!rect\) \{/.test(move) && !/offset(Width|Height|Left|Top)|getComputedStyle/.test(move))
  check("drawing stays in a worker that owns the canvas", /transferControlToOffscreen/.test(globe) && /new Worker\(url\)/.test(globe))
  check("no attribute rewritten when nothing changed", /if \(el\.hasAttribute\("data-on"\) !== p\.on\)/.test(globe))
}

console.log("\n── Run your business from anywhere ──")
{
  const src = code("components/marketing/home/app-anywhere.tsx")
  const css = read("components/marketing/home/app-anywhere.module.css")
  check("no purple and no white wrapper: drawn for the dark close", !/#7c3aed|violet|purple/i.test(src) && !/\$\{m\.root\} bg-white/.test(src) && /className=\{`\$\{m\.root\} \$\{s\.section\}/.test(src) && /\.section \{\s*background: transparent;\s*color: #fafafa;/.test(css))
  check("the heading in its dark form, faint hairlines, the photo in a thin light edge (no card)", /accent=\{\["anywhere"\]\} dark \/>/.test(src) && /border-top: 1px solid rgba\(255, 255, 255, 0\.1\)/.test(css) && /box-shadow: 0 0 0 1px rgba\(255, 255, 255, 0\.08\)/.test(css))
}

console.log("\n── The closing call ──")
{
  const src = code("components/marketing/home/final-cta.tsx")
  check("a new line, two ways in, on a dot grid", /Start selling <em>what you make\.<\/em>/.test(src) && /href="\/signup\?intent=sell"/.test(src) && /href="\/explore"/.test(src) && /<DotField fade="edges" \/>/.test(src))
  check("light on dark, a white button", /\.fcta-title\{[^}]*color:#fafafa/.test(src) && /\.fcta-primary\{background:#fff;color:#18181b\}/.test(src))
  check("no seam into the footer: no lit top edge or glow under it on the home page", /footer\.storelib-footer\{background-color:#050506;background-image:linear-gradient\(180deg,#050506 0%,#030304 100%\);box-shadow:none\}/.test(src) && /footer\.storelib-footer::before\{content:none\}/.test(src))
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
  check("its only motion is the light's transform", props.length > 0 && props.every((p) => p === "transform"))
  check("dots from one CSS radial gradient; the light cut out of the same grid by a mask", /\.dotf-dots\{background-image:radial-gradient\(/.test(DOT_FIELD_CSS) && /\.dotf-lit\{-webkit-mask-image:radial-gradient\(/.test(DOT_FIELD_CSS))
  check("paused unless on screen and the tab visible", /animation-play-state:paused\}/.test(DOT_FIELD_CSS) && /\.dotf\[data-run\] \.dotf-light\{animation-play-state:running\}/.test(DOT_FIELD_CSS) && /IntersectionObserver/.test(src) && /visibilitychange/.test(src) && !/useState/.test(src))
  check("still under reduced motion; behind the content; takes no pointer", /@media \(prefers-reduced-motion:reduce\)\{\.dotf-light\{animation:none;transform:none\}\}/.test(DOT_FIELD_CSS) && /\.dotf\{position:absolute;inset:0;z-index:-1;[^}]*pointer-events:none/.test(DOT_FIELD_CSS))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

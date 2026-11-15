/**
 * Landing round 8 (frame): at every join of two grounds the lower block
 * carries the rounded corners and the upper one is square, with nothing but
 * the upper's own colour behind the corners; the purple sheet comes up over
 * the white as a sheet again (transform only, tied to the scroll, nothing
 * held); Unlimited possibilities moved out of the creators' stretch; one
 * cheap entrance for headings (word by word) and section bodies; the two
 * flips that read as late are quicker.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SHEET_CSS, ScrollRevealBackdrop, ScrollRevealPanel } from "@/components/marketing/scroll-reveal-panel"
import { BAND_CSS, REVEAL_BODIES, REVEAL_CSS, REVEAL_HEADINGS } from "@/components/marketing/landing-story"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const B = ":is([data-sheet],[data-sheet-backdrop])"

console.log("\nEvery join: the lower block is rounded at the top, the upper one square at its foot")
{
  check("one rule for every join, whatever the two grounds: lap by the radius, round the top, clip to it", SHEET_CSS.includes(`${B}+${B}{margin-top:calc((var(--srp-r) + var(--srp-rise)) * -1);border-top-left-radius:var(--srp-r);border-top-right-radius:var(--srp-r);overflow:clip}`))
  check("no block rounds its foot (no border-radius shorthand, no bottom radius)", !/border-radius:(?!0\})/.test(SHEET_CSS) && !/border-bottom-(left|right)-radius/.test(SHEET_CSS))
  check("a sheet above leaves the room at its foot in its own colour", SHEET_CSS.includes(`[data-sheet]:has(+${B}){padding-bottom:calc(var(--srp-pad) + var(--srp-r) + var(--srp-next-rise))}`))
  check("a dark stretch above does the same", SHEET_CSS.includes(`[data-sheet-backdrop]:has(+${B}){padding-bottom:calc(var(--srp-r) + var(--srp-next-rise))}`))
  check("a dark stretch paints its own ground (so its colour, not a third one, is behind a corner)", /\[data-sheet-backdrop\]\{--srp-bg:#050506;background:#050506\}/.test(SHEET_CSS))
  check("the checkout's stretch is the checkout's own black, so the corner under it matches", /\[data-sheet-backdrop\]:has\(\.cmc\)\{--srp-bg:#000;background:#000\}/.test(SHEET_CSS) && /\.cmc\{position:relative;background:#000;/.test(read("components/marketing/home/checkout-scene.tsx")))
  check("blocks paint in page order: their own stacking contexts, no z-index", SHEET_CSS.includes(`${B}{--srp-r:clamp(22px,4.2vw,48px);--srp-pad:clamp(10px,1.8vw,28px);--srp-rise:0px;--srp-next-rise:0px;position:relative;isolation:isolate}`) && !/z-index/.test(SHEET_CSS))
  check("the clip is overflow: clip (not a scroll box: the checkout's sticky scene and the one scrollbar stay)", !/overflow:(hidden|auto|scroll)|clip-path/.test(SHEET_CSS))
  check("no fillets, no flat ground left", !/data-sheet-flat|::before|radial-gradient\(circle/.test(SHEET_CSS))
  const white = renderToStaticMarkup(createElement(ScrollRevealPanel, { tone: "white", children: createElement("p", null, "x") }))
  const dark = renderToStaticMarkup(createElement(ScrollRevealBackdrop, { children: createElement("p", null, "x") }))
  check("a sheet and a dark stretch are each one plain block", /<\/style><div data-sheet="white"><p>x<\/p><\/div>$/.test(white) && /<\/style><div data-sheet-backdrop=""><p>x<\/p><\/div>$/.test(dark))
  check("the map card casts no shadow on purple (its lazy box's paint containment cut it off in a hard line above the join)", /\[data-band\] \.cmm-card\{box-shadow:inset 0 0 0 1px rgba\(255,255,255,\.08\)\}/.test(BAND_CSS) && !/\.cmm-card\{[^}]*0 40px 80px/.test(BAND_CSS))
}

console.log("\nThe purple sheet comes up as a sheet: transform only, tied to the scroll, nothing held")
{
  const rise = renderToStaticMarkup(createElement(ScrollRevealPanel, { tone: "purple", arrive: "rise", children: createElement("p", null, "x") }))
  check("arrive=rise marks the sheet", /<div data-sheet="purple" data-sheet-rise="" data-band="purple">/.test(rise))
  check("only where scroll-driven animations exist and motion is welcome", /@supports \(animation-timeline:view\(\)\) \{\s*@media \(prefers-reduced-motion:no-preference\) \{/.test(SHEET_CSS))
  check("the rise is a stable length (svh, clamped 96 to 160px), the same on both sides of the join", (SHEET_CSS.match(/clamp\(96px,14svh,160px\)/g) || []).length === 2 && SHEET_CSS.includes(`${B}:has(+[data-sheet-rise]){--srp-next-rise:clamp(96px,14svh,160px)}`))
  check("a view timeline from where its top shows to half a screen later", /\[data-sheet-rise\]\{--srp-rise:clamp\(96px,14svh,160px\);animation:srp-rise linear both;animation-timeline:view\(\);animation-range:cover var\(--srp-rise\) cover calc\(var\(--srp-rise\) \+ 50svh\)\}/.test(SHEET_CSS))
  check("one keyframe, transform alone", /@keyframes srp-rise\{from\{transform:translate3d\(0,var\(--srp-rise\),0\)\}to\{transform:translate3d\(0,0,0\)\}\}/.test(SHEET_CSS) && (SHEET_CSS.match(/@keyframes/g) || []).length === 1)
  check("nothing held, no script", !/sticky|100s?vh|lvh|dvh/.test(SHEET_CSS) && !/"use client"|addEventListener|requestAnimationFrame|IntersectionObserver/.test(code("components/marketing/scroll-reveal-panel.tsx")))
  const page = code("app/(storelib)/(marketing)/page.tsx").replace(/\{\s*\}/g, "")
  check("the page's purple sheet rises", /<ScrollRevealPanel tone="purple" arrive="rise">/.test(page) && !/arrive="flat"/.test(page))
}

console.log("\nUnlimited possibilities moved out of the creators' stretch")
{
  const page = code("app/(storelib)/(marketing)/page.tsx").replace(/\{\s*\}/g, "")
  check("the ideas run straight on into the creators", /<LazyIdeasComeToLife \/>\s*<LazyCreatorsCarousel \/>/.test(page))
  check("it opens the last white sheet, before what you could earn, in its lazy box", /<ScrollRevealPanel tone="white">\s*<LazySection name="possibilities" minHeight="clamp\(380px, 23vw \+ 254px, 720px\)">\s*<ProductMarquee \/>\s*<\/LazySection>\s*<LazyEarningsCalculator \/>/.test(page))
  check("it is on the page once", (page.match(/<ProductMarquee \/>/g) || []).length === 1)
}

console.log("\nOne entrance for headings and section bodies")
{
  const story = code("components/marketing/landing-story.tsx")
  check("one IntersectionObserver for every block, let go once shown", (story.match(/new IntersectionObserver\(/g) || []).length === 2 && /reveal\?\.unobserve\(el\)/.test(story))
  check("hidden only by script, only when first seen wholly below the screen or in a skipped lazy box", /entry\.boundingClientRect/.test(story) && /box\.top > innerHeight/.test(story) && /box\.width === 0 && box\.height === 0/.test(story) && /el\.dataset\.reveal = "wait"/.test(story))
  check("no reveal at all under reduced motion (script and stylesheet)", /prefers-reduced-motion: reduce/.test(story) && /^\s*@media \(prefers-reduced-motion:no-preference\)\{/m.test(REVEAL_CSS) && (REVEAL_CSS.match(/opacity:0/g) || []).length === 2)
  check("opacity and the translate property only, 650ms on cubic-bezier(.22,1,.36,1)", /transition:opacity \.65s cubic-bezier\(\.22,1,\.36,1\) var\(--reveal-delay,0ms\),translate \.65s cubic-bezier\(\.22,1,\.36,1\)/.test(REVEAL_CSS) && !/transform|filter|height|top:|margin-top/.test(REVEAL_CSS.replace(/margin-block:-\.08em/, "")))
  check("a heading comes up word by word, 40ms apart, at most ten steps", /\[data-story-word\]\{transition:opacity \.6s [^;]+;transition-delay:calc\(min\(var\(--word-index,0\),10\) \* 40ms\)\}/.test(REVEAL_CSS) && /\.story-heading\[data-reveal="wait"\] \[data-story-word\]\{opacity:0;translate:0 \.5em\}/.test(REVEAL_CSS))
  check("words are inline blocks at all times, so marking a heading reflows nothing", /^\[data-landing-story\] \.story-heading:not\(\[data-story-showcase\]\):not\(\.ideas-h\) \[data-story-word\]\{display:inline-block;padding-block:\.08em;margin-block:-\.08em\}/m.test(REVEAL_CSS.trim()))
  check("lead lines follow by 90ms, main blocks by 170ms", /--reveal-delay:90ms/.test(REVEAL_CSS) && /--reveal-delay:170ms/.test(REVEAL_CSS))
  check("nothing animated twice: AnimateOnScroll and the platform risers are skipped", /\[data-story-reveal\],\[class\*='__reveal'\]/.test(story) && /target\.closest\(OWN_ENTRANCE\) \|\| target\.querySelector\(OWN_ENTRANCE\)/.test(story))
  check("the showcase heading, the ideas' turning lines and the checkout scene are not listed", /:not\(\[data-story-showcase\]\):not\(\.ideas-h\)/.test(REVEAL_HEADINGS) && !/cmc/.test(REVEAL_HEADINGS + REVEAL_BODIES))
  check("the everything and how it works cards keep their own entrance (only their headings are listed)", /\.ev-h/.test(REVEAL_HEADINGS) && /\.cmh-h/.test(REVEAL_HEADINGS) && !/\.ev-|\.cmh-/.test(REVEAL_BODIES))
  check("its stylesheet is one hoisted style", /<style href="home-reveal" precedence="default">/.test(read("components/marketing/landing-story.tsx")))
}

console.log("\nThe flips: quicker, and they set off at once")
{
  const integ = code("components/marketing/home/integrations-section.tsx")
  check("the app tile turns in 680ms (was 900)", /const TURN_MS = 680/.test(integ))
  check("its first half sets off at once and meets the second at the same speed (1.25)", /rotateY\(0deg\)", easing: "cubic-bezier\(0\.25, 0\.05, 0\.6, 0\.5\)"/.test(integ) && /offset: 0\.5, easing: "cubic-bezier\(0\.3, 0\.375, 0\.4, 1\)"/.test(integ))
  const ideas = read("components/marketing/home/ideas-come-to-life.tsx")
  check("the ideas heading hands over with no empty moment: in by 4.5%, out from 31% to 35%", /@keyframes ideas-flip\{0%\{opacity:0;transform:translate3d\(0,\.45em,0\)\}4\.5%,31%\{opacity:1;transform:none\}35%,100%\{opacity:0;transform:translate3d\(0,-\.4em,0\)\}\}/.test(ideas))
  check("on the page's one curve", /ideas-flip \$\{IDEAS_HEADINGS\.length \* IDEAS_HEADING_S\}s cubic-bezier\(\.22,1,\.36,1\) infinite both paused/.test(ideas))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

/**
 * ===========================================================================
 *  HOME, LANDING ROUND 7 (MARQUEE): PHOTOS AND WORDS FOR THE POSSIBILITIES,
 *  APP ICONS EDGE TO EDGE, AND A CREATORS RAIL THAT FOLLOWS THE FINGER
 * ===========================================================================
 * components/marketing/product-marquee.tsx, home/integrations-section.tsx
 * (+ its module css) and home/creators-carousel.tsx.
 *
 * The owner, after round 6:
 *   - "Unlimited possibilities": no pills. Two full-width rows drifting in
 *     opposite directions, each thing a tilted rounded-square photo (some
 *     turned into diamonds) and its name in large dark type, fading to white
 *     at both sides.
 *   - "Connect your favorite apps": the icons full width, edge to edge.
 *   - "Storelib is for creators": the swipe smoother and more realistic, and
 *     working with the autoplay, above all on a phone.
 *   - Every section's heading and boxed content on the showcase's width.
 *
 * Measured in a browser by scripts/check-creators-swipe.mjs (CDP touch at
 * iPhone 13 emulation).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MARQUEE_ROWS, MARQUEE_TILTS, ProductMarquee } from "@/components/marketing/product-marquee"
import { IntegrationsSection, INTEGRATION_ROW_SIZES, INTEGRATION_STEP_SHARE } from "@/components/marketing/home/integrations-section"
import { AXIS_SLOP, CREATORS_CSS } from "@/components/marketing/home/creators-carousel"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/** The source without its comments: what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\n── Unlimited possibilities: photos and words ──")
{
  const src = read("components/marketing/product-marquee.tsx")
  const html = renderToStaticMarkup(createElement(ProductMarquee))
  const items = MARQUEE_ROWS.flatMap((r) => r.items)
  check("two rows, one drifting left and one right", MARQUEE_ROWS.map((r) => r.direction).join() === "left,right")
  check("every item is a photo and its name, no pill and no emoji", (html.match(/<li class="um-item"><span class="um-pic"/g) ?? []).length === items.length * 3 && !/um-chip|um-emoji/.test(src))
  check("each photo is a small local WebP under 40 KB", items.every((i) => {
    const f = join(root, "public/home/possibilities", `${i.photo}.webp`)
    return existsSync(f) && statSync(f).size < 40_000
  }))
  check("no photo twice", new Set(items.map((i) => i.photo)).size === items.length)
  check("the photos are tilted a few degrees, both ways, and some are diamonds", MARQUEE_TILTS.some((t) => t < 0) && MARQUEE_TILTS.some((t) => t > 0 && t < 15) && MARQUEE_TILTS.filter((t) => t === 45).length >= 2 && MARQUEE_TILTS.every((t) => t === 45 || Math.abs(t) <= 12))
  check("a diamond's photo stands upright inside it", /\.um-pic\[data-diamond\] img\{transform:rotate\(-45deg\) scale\(1\.42\)\}/.test(src) && /data-diamond=""/.test(html))
  // Changed on purpose (landing round 9): the owner found the words and photos too big; about an eighth smaller.
  check("rounded squares, the word large and dark", /\.um-pic\{[^}]*border-radius:24%/.test(src) && /\.um-item\{[^}]*font-size:clamp\(18px,1\.75vw,31px\)[^}]*color:#18181b/.test(src))
  // Changed on purpose (landing round 9): the room between items shrank with them.
  check("generous spacing between items", /\.um-item\{[^}]*margin-right:clamp\(40px,4\.8vw,92px\)/.test(src))
  check("both ends fade to white, standing still over the moving track", /\.um-row::before\{left:0;background:linear-gradient\(90deg,#fff/.test(src) && /\.um-row::after\{right:0;background:linear-gradient\(270deg,#fff/.test(src) && !/mask-image/.test(src))
  check("endless: three equal copies, one copy per lap, transform only", (html.match(/<ul class="um-copy"/g) ?? []).length === 6 && /to\{transform:translate3d\(calc\(-100% \/ 3\),0,0\)\}/.test(src))
  check("paused off screen and in a background tab", /\.um\[data-um-paused\] \.um-track[^{]*\{animation-play-state:paused\}/.test(src) && /document\.hidden/.test(src))
  check("reduced motion: still, one copy, no fades", /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.um-track\{animation:none[\s\S]*\.um-copy\[aria-hidden\]\{display:none\}[\s\S]*\.um-row::before,\.um-row::after\{display:none\}/.test(src))
  check("the photos are on the page from the start, at low priority (no square popping in as it drifts on screen)", !/loading="lazy"/.test(html) && /fetchPriority="low"/i.test(html))
  const physical = items.filter((i) => /^(Merch|Hoodies|Vinyl records|Art prints|Candles|Ceramics|Jewelry|Tote bags)$/.test(i.label)).length
  // Changed on purpose (landing round 11): the owner asked for more digital products ("don't add ceramics, or totes"); a few things that ship stay.
  check("mostly digital, a few things that ship", physical >= 2 && physical / items.length <= 0.25, { physical, of: items.length })
  check("communities, never memberships", items.some((i) => i.label === "Communities") && !items.some((i) => /membership/i.test(i.label)))
  check("the heading on the shared width, set in like the showcase's", /\.um-head\{[^}]*max-width:var\(--home-max,2020px\)[^}]*padding-inline:calc\(var\(--home-edge,[^)]*\)\) \+ var\(--home-head-inset,14px\)\)/.test(src) && /<header class="um-head">/.test(html))
}

console.log("\n── Connect your favorite apps: edge to edge ──")
{
  const css = read("components/marketing/home/integrations-section.module.css").replace(/\/\*[\s\S]*?\*\//g, "")
  const src = read("components/marketing/home/integrations-section.tsx")
  const html = renderToStaticMarkup(createElement(IntegrationsSection))
  check("no solid white strip: the icons run the whole screen", !/--solid/.test(css) && !/1210px/.test(css))
  check("the fades are short ramps at the screen's edges", /\.rows::before,\s*\.rows::after \{[\s\S]*?width: clamp\(40px, 11vw, 220px\);/.test(css))
  // Changed on purpose (landing round 11): the owner asked for a smaller gap; the sets are longer, so 1/12 of the screen still never shows an icon twice.
  check("no icon seen twice, at any width: a tile and its gap are at least 1/12 of the screen", INTEGRATION_ROW_SIZES.every((n) => (n - 1) * INTEGRATION_STEP_SHARE >= 1) && /--gap: max\(20px, calc\(100vw \/ 13 - var\(--tile\)\)\);/.test(css)) // Changed on purpose (landing round 12): 1/13 of the screen now.
  check("standing still (reduced motion), the icons sit close again", /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.tile \{\s*margin-right: var\(--row-gap\);/.test(css))
  check("the heading in the shared box, set in like the showcase's", /<div class="home-wrap"><div class="[^"]*ml-\[var\(--home-head-inset,14px\)\]/.test(html) && !/max-w-\[1400px\]/.test(src))
}

console.log("\n── Storelib is for creators: a finger on the rail ──")
{
  const src = code("components/marketing/home/creators-carousel.tsx")
  /* Changed on purpose (landing round 9): the owner: the swipe took too long to start. The gesture is components/marketing/rail-gesture.ts, shared with the showcase: 4px, across only when clearly more across than down, a finger read from touch events. */
  const gesture = code("components/marketing/rail-gesture.ts")
  check("the axis is decided after 4px, across only when clearly more across than down", (AXIS_SLOP as number) === 4 && /bindRailGesture\(viewport, \{/.test(src) && /Math\.hypot\(dx, dy\) < RAIL_AXIS\.slop/.test(gesture) && /Math\.abs\(dx\) > Math\.abs\(dy\) \* RAIL_AXIS\.ratio \? "x" : "y"/.test(gesture))
  check("down is the page's: the rail lets go at once", /if \(d\.axis === "y"\) \{\s*end\(t, false\)/.test(gesture) && CREATORS_CSS.includes("touch-action:pan-y"))
  check("pointer capture only once the rail has the gesture", /if \(travel\(e\.clientX, e\.clientY, e\.timeStamp\) && !was && !held\?\.finger\) \{\s*try \{\s*el\.setPointerCapture\(e\.pointerId\)/.test(gesture))
  check("the rail follows the finger 1:1 from where the axis was decided, with no jump for the slop", /d\.startX = x/.test(gesture) && /if \(drag\) drag\.fromX = x/.test(src) && /x = drag\.fromX - dx/.test(src))
  /* Changed on purpose (landing round 8): the owner: "smooth, butterish, optimized, no lag or stutter". The finger's moves are drawn once a frame, and only in a frame the finger moved (no loop while it holds still). */
  check("drawn once a frame, not once an event", /if \(!paintFrame\) paintFrame = requestAnimationFrame\(paint\)/.test(src) && !/const frame = \(t: number\)/.test(src))
  /* Changed on purpose (landing round 8): the throw is the same decay, e every COAST_TAU, played as a Web Animation on the compositor instead of a frame loop. */
  check("a throw coasts and slows smoothly (exponential decay)", /const by = v \* COAST_TAU \* \(1 - Math\.exp\(-ms \/ tauMs\)\)/.test(src) && /play\("coast"/.test(src) && /const COAST_TAU = 0\.42/.test(read("components/marketing/home/creators-carousel.tsx")))
  check("the throw's speed is the finger's over its last moves; a finger that stopped throws nothing", /RAIL_AXIS\.velocityWindowMs/.test(code("components/marketing/rail-gesture.ts")) && /t - b\.t <= RAIL_AXIS\.restMs/.test(code("components/marketing/rail-gesture.ts")))
  /* Changed on purpose (landing round 8): easing back in is a compositor curve with the smootherstep's end slopes (0, then twice the average), not a frame loop. */
  check("touching holds the rail; autoplay waits, then eases back in from a standstill, no jump", /holdUntil = performance\.now\(\) \+ RESUME_AFTER_MS/.test(src) && /play\("in", \(want \* RAMP_UP_MS\) \/ 2000, RAMP_UP_MS, "cubic-bezier\(\.5,0,\.75,\.5\)"/.test(src))
  check("waiting out a hold costs no frames (one timer)", /holdTimer = window\.setTimeout\(update, wait \+ 1\)/.test(src) && /clearTimeout\(holdTimer\)/.test(src))
  check("cruising is still handed to the compositor", /track\.animate\(/.test(src) && /play\("cruise", loop, \(loop \/ want\) \* 1000/.test(src))
  check("the heading on the shared width, set in like the showcase's", /\.cc-section \.cc-head\{[^}]*max-width:var\(--home-max,2020px\)[^}]*padding-inline:calc\(var\(--cc-gutter\) \+ var\(--home-head-inset,14px\)\)/.test(CREATORS_CSS) && /--cc-gutter:var\(--home-edge,/.test(CREATORS_CSS))
  /* Changed on purpose (landing round 8): the owner: "full width, not with a fade". The rail runs edge to edge at every width, no mask; at rest its first card is on the content edge (tests/home-landing-r8-rails.test.ts). */
  check("the rail runs edge to edge with no fade, its first card on the content edge", !/mask-image/.test(CREATORS_CSS) && /padding:10px var\(--cc-start\) 8px/.test(CREATORS_CSS))
  check("the browser check is there", /Input\.dispatchTouchEvent/.test(read("scripts/check-creators-swipe.mjs")))
}

console.log("\n── Words ──")
{
  const words = [...MARQUEE_ROWS.flatMap((r) => r.items.map((i) => i.label)), renderToStaticMarkup(createElement(ProductMarquee)).replace(/<style[^>]*>[\s\S]*?<\/style>/g, "") /* Changed on purpose (landing round 9): the section's stylesheet now carries an href, so its tag has attributes. */.replace(/<[^>]+>/g, " ")].join(" ")
  check("no banned words or em dashes", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(words) && !/—/.test(words))
  check("no banned sample content", !/weeknight pasta|sourdough|golden hour|wheel throwing|drawing basics|run club|\bfans?\b/i.test(words))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}

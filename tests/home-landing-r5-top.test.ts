/**
 * ===========================================================================
 *  HOME, LANDING ROUND 5 (TOP): THE SHOWCASE SWIPE, "MAKE THE WORK", THE GLOBE
 * ===========================================================================
 * components/marketing/build-showcase.tsx, use-showcase-motion.ts,
 * components/marketing/home/everything-in-one-place.tsx and the globe
 * (everything-globe.tsx, everything-globe-draw.ts).
 *
 * The owner, round 5, on an iPhone:
 *   - The showcase under the hero: the swipe "doesn't initialize, it thinks
 *     that I want to scroll the page". It must be smooth with momentum,
 *     autoplay must not interfere and must come back. The cards a little
 *     bigger and lower, cut a little by the section's bottom edge.
 *   - Make the work: a new heading (the old one "really bad"), no "creators
 *     and Storelib" labels, no knitting course, a simple LUT pack cover.
 *   - The globe: the order notifications "glitch and stutter, move and
 *     flash"; dragging must not lag on a low end phone, and a sideways drag
 *     must not block the page's vertical scroll.
 *
 * Measured in a browser (iPhone 13 emulation, CDP touch events) when this
 * was written: a 220px flick moved the rail to 476 and 824px with momentum,
 * a vertical swipe on the cards scrolled the page 350 to 410px and left the
 * rail where it was, autoplay moved it again about 4s after the last touch,
 * no long tasks; the notification stood at one place for 10s of frames.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SHOWCASE_NATIVE, SHOWCASE_RAIL } from "@/components/marketing/use-showcase-motion"
import { EverythingInOnePlace, EVERYTHING_HEADING, EVERYTHING_SLIDES, EVERYTHING_SUPPORT } from "@/components/marketing/home/everything-in-one-place"
import { createGlobeEngine, type GlobePill, type V3 } from "@/components/marketing/home/everything-globe-draw"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const hook = read("components/marketing/use-showcase-motion.ts")
const showcase = read("components/marketing/build-showcase.tsx")
const evSrc = read("components/marketing/home/everything-in-one-place.tsx")
const globe = read("components/marketing/home/everything-globe.tsx")
const draw = read("components/marketing/home/everything-globe-draw.ts")
const everything = renderToStaticMarkup(createElement(EverythingInOnePlace))
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

console.log("\n── The showcase: a native swipe on a touch screen ──")
check("a touch screen or a phone width gets the browser's own scroller, a mouse from 768px keeps RailMotion", /const NATIVE = "\(max-width: 767px\), \(pointer: coarse\)"/.test(hook) && /\(native\.matches \? startNative : startRail\)/.test(hook) && /new RailMotion\(el, items, snaps, SHOWCASE_RAIL,/.test(hook))
check("the rail scrolls natively and snaps, with momentum, and a swipe at an end is not the back gesture", /\.build-showcase-track \{[^}]*overflow-x:auto;overflow-y:hidden;[^}]*overscroll-behavior-x:contain;scroll-snap-type:x mandatory/.test(showcase))
check("both axes stay the browser's on the native rail (it decides the axis itself)", /\.build-showcase-track \{[^}]*touch-action:pan-x pan-y pinch-zoom/.test(showcase))
check("cards and groups snap at their start, the phone's on the gutter", /\.build-showcase-group \{[^}]*scroll-snap-align:start/.test(showcase) && /scroll-padding-inline:var\(--showcase-gutter\)/.test(showcase) && /\.build-showcase-slide\{flex:0 0 var\(--showcase-card\);width:var\(--showcase-card\);scroll-snap-align:start/.test(showcase)) /* Changed on purpose (landing round 6): the phone card is a 4:3 card 78% of the screen wide, its caption under it. */
check("the RailMotion rail turns the snapping off", /\.build-showcase-track\[data-rail-ready\] \{[^}]*scroll-snap-type:none/.test(showcase))
const native = hook.slice(hook.indexOf("function startNative"), hook.indexOf("export function useShowcaseMotion"))
check("nothing on the native rail runs per frame or holds a touch", !/requestAnimationFrame\(step/.test(native) && /"touchstart", onTouchStart, passive/.test(native) && /"touchend", onTouchEnd, passive/.test(native) && !/"touchmove"/.test(native))
check("autoplay is one smooth scrollTo a card", /el\.scrollTo\(\{ left: stops\[next\], behavior: "smooth" \}\)/.test(native))
/* Changed on purpose (landing round 6): autoplay waits idleMs after the reader's last scroll (momentum included), not resumeMs after the finger lifts; tests/home-landing-r6-showcase.test.ts pins it. */
check("a touch pauses it and it comes back after the reader's last scroll, from where the reader left it", /const onTouchStart = \(\) => \{\s*touching = true\s*hold\(\)/.test(native) && /lastRead \+ SHOWCASE_NATIVE\.idleMs/.test(native) && /if \(Math\.abs\(stops\[i\] - x\) < Math\.abs\(stops\[at\] - x\)\) at = i/.test(native))
check("it runs only on screen, in a visible tab, with motion allowed", /const canPlay = \(\) => visible && !paused && !document\.hidden && !reduce\.matches/.test(native) && /if \(touching \|\| due > now\)/.test(native) && /"visibilitychange", onVisibility/.test(native))
/* Changed on purpose (landing round 6): back 6s after the reader's last scroll (it was 4s after the finger lifted). */
check("the timing: a card every 4.2s, back 6s after the reader's last scroll", SHOWCASE_NATIVE.intervalMs === 4200 && SHOWCASE_NATIVE.idleMs === 6000)
check("card places are read once per layout change, never during a swipe", /resize\?\.observe\(viewport\)/.test(native) && (native.match(/s\.offsetLeft/g) ?? []).length === 1)
check("the mouse rail's tuning is unchanged", SHOWCASE_RAIL.swipeMaxSteps === 3 && SHOWCASE_RAIL.swipeVelocity === 110)

console.log("\n── The showcase: the cards inside the section ──")
/* Changed on purpose (landing round 6): the owner saw the captions cut by the section's edge; the cards now end inside it with room under their captions, and a phone card is a 4:3 card (tests/home-landing-r6-showcase.test.ts). */
check("phone cards are 4:3, no longer 60% of the width tall", /--showcase-card:min\(78vw,440px\)/.test(showcase) && !/--showcase-height/.test(showcase) && !/51\.5vw/.test(showcase))
check("padding under the cards", /\.build-showcase-card \{[^}]*padding:clamp\(72px,7vw,112px\) 0 clamp\(36px,3\.6vw,64px\)\}/.test(showcase) && /\.build-showcase-card\{padding:64px 0 clamp\(36px,9vw,56px\)\}/.test(showcase))
check("the rail no longer runs past the bottom edge", !/margin-bottom:calc\([^)]*\* -\.(12|028)\)/.test(showcase))
check("the section clips it in its own rounded corners, and holds the margin (a flow root)", /\.build-showcase \{[^}]*display:flow-root;[^}]*overflow:hidden;overflow:clip/.test(showcase))

console.log("\n── Make the work: words and pictures ──")
check("a new heading in the two tones", EVERYTHING_HEADING.lead === "Sell what you make." && EVERYTHING_HEADING.rest === "Get paid worldwide." && /<span class="ev-h-mute">Get paid worldwide\.<\/span>/.test(everything))
check("the old heading is gone", !/Sell anything, anywhere|Support included/.test(text(everything)))
check("no Storelib support / From a buyer labels over the threads", !/Storelib support|From a buyer/.test(everything) && EVERYTHING_SUPPORT.every((r) => !("title" in r)))
check("no \"to Storelib\" or \"at Storelib\" filler in the support card", !/to Storelib\?|at Storelib reads/.test(text(everything)))
const course = EVERYTHING_SLIDES.find((s) => s.kind === "course")
check("the course is a home Pilates course, and its numbers add up", course?.name === "28 Day Mat Pilates" && course.stats[0][1] === "$39.00" && course.stats[1][1] === "412" && 39 * 412 === 16068 && course.stats[2][1] === "$16,068.00")
check("no knitting course, no casting on", !/Knit Your First Sweater|Casting on/i.test(everything))
check("the course photo exists and is small", existsSync(join(root, "public/home/everything/pilates.webp")) && statSync(join(root, "public/home/everything/pilates.webp")).size < 120_000)
const luts = EVERYTHING_SLIDES.find((s) => s.kind === "luts")
check("the LUT pack is a cover: one photo split flat and graded, its name and count", luts?.img.endsWith("/lut-cover.webp") === true && /<span class="ev-lut-name">Cine Tones<\/span>/.test(everything) && /<span class="ev-lut-count">12 LUTs<\/span>/.test(everything) && /class="ev-lut-flat"/.test(everything))
check("none of the panel: no looks, no file name", !/ev-lut-look|ev-lut-file|\.cube/.test(everything) && !/function LutPack/.test(evSrc))
check("the cover photo exists and is small", existsSync(join(root, "public/home/everything/lut-cover.webp")) && statSync(join(root, "public/home/everything/lut-cover.webp")).size < 120_000)
check("the old pictures are gone", !existsSync(join(root, "public/home/everything/course.webp")) && !existsSync(join(root, "public/home/everything/lut-frame.webp")))
const words = [EVERYTHING_HEADING.lead, EVERYTHING_HEADING.rest, ...EVERYTHING_SLIDES.map((s) => s.name), JSON.stringify(EVERYTHING_SUPPORT)].join(" ")
check("no em dashes, no banned words, no fans", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|fans?)\b/i.test(words))

console.log("\n── The globe: the notification ──")
check("the notification has one fixed place and comes and goes by opacity and transform only", /\.ev-globe-pill\{position:absolute;left:16px;bottom:16px;[^}]*opacity:0;transform:translate3d\(0,10px,0\);will-change:opacity,transform;[^}]*transition:opacity \.28s ease,transform \.28s ease\}/.test(evSrc) && /\.ev-globe-pill\[data-on\]\{opacity:1;transform:translate3d\(0,0,0\);/.test(evSrc))
check("its layer is kept for good (no promotion flash)", !/\.ev-globe-pill\[data-on\]\{[^}]*will-change/.test(evSrc))
check("the page never positions it", !/style\.(transform|left|top)/.test(globe) && !/\.animate\(/.test(globe) && !/getBoundingClientRect\(\)[^\n]*pill/.test(globe))

/* The engine: a fake host, a canvas that records nothing, and frames by hand. */
const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true }) as unknown as CanvasRenderingContext2D
const fakeCanvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
let rafCb: ((t: number) => void) | null = null
const pills: GlobePill[] = []
const cities: V3[] = [[0, 0, 1], [0.1, 0.1, 0.99]]
const engine = createGlobeEngine(
  {
    canvas: fakeCanvas,
    ctx,
    makeCanvas: () => fakeCanvas,
    raf: (cb) => {
      rafCb = cb
      return 1
    },
    caf: () => {
      rafCb = null
    },
    onPill: (p) => pills.push(p),
    onDrawn: () => {},
  },
  new Float32Array([0, 0, 1, 0, 1, 0]),
  cities,
  [0, 0.2, 0.98],
)
engine.size(400, 300, 2)
engine.reduced(false)
engine.run(true)
let t = 0
let frames = 0
for (let i = 0; i < 1200 && rafCb; i++) {
  t += 8.33
  const cb: (t: number) => void = rafCb
  rafCb = null
  cb(t)
  frames++
}
check("the engine only says on and off, never where", pills.length > 0 && pills.every((p) => Object.keys(p).sort().join() === "i,on"), pills.slice(0, 4))
check("every notification is followed by its leaving", pills.filter((p) => p.on).length >= 1 && pills.filter((p) => !p.on).length >= pills.filter((p) => p.on).length - 1)
check("on a 120Hz display it draws at most about 60 times a second", /const FRAME_MIN_MS = 15/.test(draw) && /if \(t - st\.drawnAt < \(st\.slow && !st\.dragging \? SLOW_FRAME_IDLE_MS : FRAME_MIN_MS\)\)/.test(draw))
check("heavy drawing steps the canvas down to fewer device pixels, then the idle spin to 30fps", /st\.dpr = st\.dprCeil = Math\.max\(1, st\.dpr - 0\.5\)/.test(draw) && /const SLOW_FRAME_IDLE_MS = 30/.test(draw))

console.log("\n── The globe: on a phone ──")
check("device pixels at most 2x, 1.5x on a phone with four cores or 4 GB or less", /return cores <= 4 \|\| memory <= 4 \? 1\.5 : 2/.test(globe) && /Math\.min\(globeDprCap\(\), window\.devicePixelRatio/.test(globe))
check("a finger waits 8px: mostly vertical is the page's, sideways is captured then", /if \(Math\.abs\(dx\) < 8 && Math\.abs\(dy\) < 8\) return/.test(globe) && /if \(Math\.abs\(dy\) >= Math\.abs\(dx\)\) \{\s*touch = null/.test(globe) && /touch-action:pan-y/.test(evSrc))
check("a finger turns the globe about its axis only", /take\(e, touch\.y0\)/.test(globe) && /y: touch && touch\.id === e\.pointerId \? touch\.y0 : e\.clientY/.test(globe))
check("the globe still stops off screen and in a hidden tab", /driver\.run\(st\.visible && st\.shown && st\.live && !st\.reduced\)/.test(globe))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

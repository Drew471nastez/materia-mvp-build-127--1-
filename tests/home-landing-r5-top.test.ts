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
import { SHOWCASE_AUTOPLAY, SHOWCASE_GESTURE } from "@/components/marketing/use-showcase-motion"
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

console.log("\n── The showcase: one swipe on every screen ──")
/*
  Changed on purpose (landing round 8): the owner, on an iPhone and on a desktop: the pull to swipe "doesn't initialize",
  "I have to make the whole drag too long", make it like the creators rail. Round 5's native scroll snap on touch screens and
  RailMotion under a mouse are one engine now, the creators rail's (axis after 8px, 1:1, a flick is a card, a compositor
  glide, autoplay that waits for the reader); tests/home-landing-r8-rails.test.ts pins it. What round 5 kept still holds:
  before the script the rail is the browser's own scroller, vertical swipes stay the page's, nothing runs per frame.
*/
check("before the script the rail scrolls natively and snaps, and a swipe at an end is not the back gesture", /\.build-showcase-track \{[^}]*overflow-x:auto;overflow-y:hidden;[^}]*overscroll-behavior-x:contain;scroll-snap-type:x mandatory/.test(showcase))
check("before the script both axes stay the browser's", /\.build-showcase-track \{[^}]*touch-action:pan-x pan-y pinch-zoom/.test(showcase))
check("cards and groups snap at their start, the phone's on the gutter", /\.build-showcase-group \{[^}]*scroll-snap-align:start/.test(showcase) && /scroll-padding-inline:var\(--showcase-gutter\)/.test(showcase) && /\.build-showcase-slide\{flex:0 0 var\(--showcase-card\);width:var\(--showcase-card\);scroll-snap-align:start/.test(showcase)) /* Changed on purpose (landing round 6): the phone card is a 4:3 card 78% of the screen wide, its caption under it. */
check("the script's rail turns the snapping off and leaves vertical pans to the page", /\.build-showcase-track\[data-rail-ready\] \{[^}]*touch-action:pan-y pinch-zoom;[^}]*scroll-snap-type:none/.test(showcase))
/* Changed on purpose (landing round 9): the one engine reads its pointer through components/marketing/rail-gesture.ts. */
check("one engine for touch and mouse, no second rail", !/startNative|RailMotion|const NATIVE =/.test(hook) && /const gesture = bindRailGesture\(el, \{/.test(hook))
check("it runs only on screen, in a visible tab, with motion allowed", /const canPlay = \(\) => visible && !paused && !document\.hidden && !reduce\.matches/.test(hook) && /"visibilitychange", onVisibility/.test(hook))
check("autoplay: a card every 4.2s, back 5s after the reader's last input", SHOWCASE_AUTOPLAY.intervalMs === 4200 && SHOWCASE_AUTOPLAY.idleMs === 5000)
check("card places are read once per layout change, never during a swipe", /resize\?\.observe\(viewport\)/.test(hook) && (hook.match(/s\.offsetLeft/g) ?? []).length === 1)
/* Changed on purpose (landing round 9): the axis is read after 4px (rail-gesture.ts), the owner had to pull too long. */
check("a short flick is a card", (SHOWCASE_GESTURE.axisSlop as number) === 4 && SHOWCASE_GESTURE.flickVelocity <= 200 && SHOWCASE_GESTURE.flickDistanceMax <= 30)

console.log("\n── The showcase: the cards inside the section ──")
/* Changed on purpose (landing round 6): the owner saw the captions cut by the section's edge; the cards now end inside it with room under their captions, and a phone card is a 4:3 card (tests/home-landing-r6-showcase.test.ts). */
check("phone cards are 4:3, no longer 60% of the width tall", /--showcase-card:min\(78vw,440px\)/.test(showcase) && !/--showcase-height/.test(showcase) && !/51\.5vw/.test(showcase))
// Changed on purpose (landing round 7): the owner: "the bottom padding of the section under the hero is too short"; 52 to 96px under the caption line, 44 to 64px on a phone (tests/home-landing-r7-frame.test.ts).
check("padding under the cards", /\.build-showcase-card \{[^}]*padding:clamp\(72px,7vw,112px\) 0 clamp\(52px,5\.4vw,96px\)\}/.test(showcase) && /\.build-showcase-card\{padding:64px 0 clamp\(44px,12vw,64px\)\}/.test(showcase))
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
/* Changed on purpose (landing round 6): the owner wanted the pack "without the 12, just LUT pack" on a bold black cover; tests/home-landing-r6-everything pins it. */
check("the LUT pack is a cover: one graded still and its name, no count", luts?.img.endsWith("/lut-still.webp") === true && /<span class="ev-lut-name"><span>Cine<\/span><span>Tones<\/span><\/span>/.test(everything) && !/ev-lut-count|12 LUTs/.test(everything))
check("none of the panel: no looks, no file name", !/ev-lut-look|ev-lut-file|\.cube/.test(everything) && !/function LutPack/.test(evSrc))
/* Changed on purpose (landing round 6): the cover's photo is the graded film still. */
check("the cover photo exists and is small", existsSync(join(root, "public/home/everything/lut-still.webp")) && statSync(join(root, "public/home/everything/lut-still.webp")).size < 120_000)
check("the old pictures are gone", !existsSync(join(root, "public/home/everything/course.webp")) && !existsSync(join(root, "public/home/everything/lut-frame.webp")))
const words = [EVERYTHING_HEADING.lead, EVERYTHING_HEADING.rest, ...EVERYTHING_SLIDES.map((s) => s.name), JSON.stringify(EVERYTHING_SUPPORT)].join(" ")
check("no em dashes, no banned words, no fans", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|fans?)\b/i.test(words))

console.log("\n── The globe: the notification ──")
/* Changed on purpose (landing round 7): the round 5 lower left corner is gone; the globe (GLOBE_NOTICE_CSS) places the notification over its city, as it already did. */
check("the notification comes and goes by opacity and transform only", /\.ev-globe-pill\{display:flex;[^}]*opacity:0;transform:translate3d\(0,10px,0\);will-change:opacity,transform;[^}]*transition:opacity \.28s ease,transform \.28s ease\}/.test(evSrc) && /\.ev-globe-pill\[data-on\]\{opacity:1;transform:translate3d\(0,0,0\);/.test(evSrc))
check("its layer is kept for good (no promotion flash)", !/\.ev-globe-pill\[data-on\]\{[^}]*will-change/.test(evSrc))
/* Changed on purpose (landing round 6): the owner wants it "where the rocket landed": the page places it once per landing by a transform on its pin (no left or top, no layout read per frame) and lets one animation carry it with the city. */
check("the page places it once per landing, by transform only", /pin\.style\.transform = `translate\(/.test(globe) && !/style\.(left|top) =/.test(globe) && !/getBoundingClientRect\(\)[^\n]*pill/.test(globe))

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
/* Changed on purpose (landing round 6): the engine says where the city is when the notification comes on (once), and only off when it leaves. */
check("the engine says where only when it comes on, and only off when it leaves", pills.length > 0 && pills.every((p) => (p.on ? Object.keys(p).sort().join() === "i,ms,on,x0,x1,y0,y1" : Object.keys(p).sort().join() === "i,on")), pills.slice(0, 4))
check("every notification is followed by its leaving", pills.filter((p) => p.on).length >= 1 && pills.filter((p) => !p.on).length >= pills.filter((p) => p.on).length - 1)
/* Changed on purpose (landing round 6): the owner called dragging laggy; a drag and the coast after a throw draw every display frame, only the idle spin is held to about 60. */
check("on a 120Hz display the idle spin draws at most about 60 times a second", /const FRAME_MIN_MS = 15/.test(draw) && /if \(!st\.dragging && !coasting\(\) && t - st\.drawnAt < \(st\.slow \? SLOW_FRAME_IDLE_MS : FRAME_MIN_MS\)\)/.test(draw))
check("heavy drawing steps the canvas down to fewer device pixels, then the idle spin to 30fps", /st\.dpr = st\.dprCeil = Math\.max\(1, st\.dpr - 0\.5\)/.test(draw) && /const SLOW_FRAME_IDLE_MS = 30/.test(draw))

console.log("\n── The globe: on a phone ──")
/* Changed on purpose (landing round 8): the owner asked for a lighter globe; a phone draws at 1.5x (1.25x low end), elsewhere 2x or 1.5x low end. */
check("device pixels at most 2x, 1.5x on a phone with four cores or 4 GB or less", /if \(phone\) return lowEnd \? 1\.25 : 1\.5/.test(globe) && /return lowEnd \? 1\.5 : 2/.test(globe) && /Math\.min\(globeDprCap\(\), window\.devicePixelRatio/.test(globe))
check("a finger waits 8px: mostly vertical is the page's, sideways is captured then", /if \(Math\.abs\(dx\) < 8 && Math\.abs\(dy\) < 8\) return/.test(globe) && /if \(Math\.abs\(dy\) >= Math\.abs\(dx\)\) \{\s*touch = null/.test(globe) && /touch-action:pan-y/.test(evSrc))
check("a finger turns the globe about its axis only", /take\(e, touch\.y0\)/.test(globe) && /y: touch && touch\.id === e\.pointerId \? touch\.y0 : e\.clientY/.test(globe))
check("the globe still stops off screen and in a hidden tab", /driver\.run\(st\.visible && st\.shown && st\.live && !st\.reduced\)/.test(globe))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

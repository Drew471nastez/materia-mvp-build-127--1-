/**
 * ===========================================================================
 *  HOME, LANDING ROUND: THE SHOWCASE UNDER THE HERO AND "MAKE THE WORK"
 * ===========================================================================
 * components/marketing/build-showcase.tsx (+ use-showcase-motion.ts, the
 * optional glide and momentum in lib/ui/rail-motion.ts) and
 * components/marketing/home/everything-in-one-place.tsx.
 *
 * The owner: pull to drag and swipe the showcase with the mouse and the
 * finger, butter smooth, autoplay kept; a calm community picture; the
 * Midnight Studio Tee on a light grey, rounded tile; a realistic digital
 * product instead of the Golden Hour preset box, and no Golden Hour preset
 * anywhere; a course picture that is not the camera; "Build a store that
 * looks like you" as a continuous carousel of real looking stores; less
 * "fans" in the copy.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_CARDS, EVERYTHING_SLIDES, EVERYTHING_STORES, EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"
import { SHOWCASE_EXAMPLES } from "@/components/marketing/build-showcase"
import { SHOWCASE_RAIL } from "@/components/marketing/use-showcase-motion"
import { SHOWCASE_MOTION, chooseSwipeTarget, glideCurve } from "@/lib/ui/rail-motion"

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
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")
const showcase = read("components/marketing/build-showcase.tsx")
const hook = read("components/marketing/use-showcase-motion.ts")
const rail = read("lib/ui/rail-motion.ts")
const src = read("components/marketing/home/everything-in-one-place.tsx")
const globe = read("components/marketing/home/everything-globe.tsx")
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
const css = EVERYTHING_STYLES[0]?.css ?? ""

console.log("\n── the showcase: pull to drag and swipe, butter smooth ──")
check("the showcase rail runs on its own tuning, with the glide and momentum", /new RailMotion\(el, items, snaps, SHOWCASE_RAIL,/.test(hook) && !!SHOWCASE_RAIL.glideSettle && SHOWCASE_RAIL.swipeMaxSteps === 3)
check("the shared tuning is untouched: no glide, one step a gesture (the possibilities rail reads it)", SHOWCASE_MOTION.glideSettle === undefined && SHOWCASE_MOTION.swipeMaxSteps === undefined && SHOWCASE_MOTION.dragThreshold === 6 && SHOWCASE_MOTION.maxFlickVelocity === 6000)
check("the hand still holds the rail exactly, and autoplay is kept", SHOWCASE_RAIL.dragSensitivity === 1 && SHOWCASE_RAIL.autoplayStepMs > 0 && SHOWCASE_RAIL.autoplayIntervalMs > 0 && SHOWCASE_RAIL.compositor === true)
check("a release settles on the glide when it is configured", /if \(this\.config\.glideSettle\) \{\s*const g = glideCurve\(this\.x, to, limited, this\.config\.glideSettle\)/.test(rail))
check("vertical swipes stay the page's on a phone, and the rail has the pointer events", /\.build-showcase-track\[data-rail-ready\] \{overflow:visible;touch-action:pan-y pinch-zoom/.test(showcase) && /"pointerdown"/.test(rail) && /setPointerCapture/.test(rail))
{
  const g = SHOWCASE_RAIL.glideSettle!
  /* A whole desktop group (1316px) after a 300px pull released at 400px/s. */
  const from = 300
  const to = 1316
  const curve = glideCurve(from, to, 400, g)
  const xs: number[] = []
  for (let t = 0; t <= curve.duration; t += 1000 / 120) xs.push(curve.at(t))
  check("the glide starts where the hand let go and ends on the group", Math.abs(curve.at(0) - from) < 1e-9 && Math.abs(curve.at(curve.duration) - to) < 1e-9)
  check("it only ever moves forward and never passes its place (no overshoot, no bounce)", xs.every((x, i) => i === 0 || x >= xs[i - 1] - 1e-9) && Math.max(...xs) <= to + 1e-9)
  check("a whole group takes about half a second, not a long float", curve.duration >= 400 && curve.duration <= 560, curve.duration)
  const slope0 = (curve.at(1) - curve.at(0)) * 1000
  check("it leaves without a jolt: far under the old launch of half the spring's top speed", slope0 < 0.5 * Math.sqrt(360) * (to - from) * 0.4, Math.round(slope0))
  const fast = glideCurve(0, 900, 2400, g)
  const fastStart = (fast.at(0.5) - fast.at(0)) * 2000
  check("a flick is carried on at the hand's own speed (no jump either way)", Math.abs(fastStart - 2400) < 60, Math.round(fastStart))
  const huge = glideCurve(0, 300, 6000, g)
  const hugeXs = Array.from({ length: 200 }, (_, i) => huge.at((huge.duration * i) / 199))
  check("a very hard flick shortens the glide rather than passing its place", huge.duration < g.maxMs && Math.max(...hugeXs) <= 300 + 1e-9, huge.duration)
  const at60 = Array.from({ length: 30 }, (_, i) => curve.at(i * (1000 / 60)))
  const at120 = Array.from({ length: 30 }, (_, i) => curve.at(2 * i * (1000 / 120)))
  check("a function of time, the same at 60 and 120Hz", at60.every((x, i) => Math.abs(x - at120[i]) < 1e-9))
}
{
  const snaps = [0, 286, 392, 678, 784, 1070]
  const one = chooseSwipeTarget(0, 60, 3000, snaps, 0, SHOWCASE_MOTION)
  const many = chooseSwipeTarget(0, 60, 3000, snaps, 0, SHOWCASE_RAIL)
  const soft = chooseSwipeTarget(0, 60, 300, snaps, 0, SHOWCASE_RAIL)
  check("without momentum a flick is one step, as before", one === 286, one)
  check("with it a hard flick on a phone carries through up to three cards, and no further", many > 286 && many <= 678, many)
  check("a soft swipe is still one card", soft === 286, soft)
}
check("no showcase caption leans on fans", SHOWCASE_EXAMPLES.every((e) => !/\bfans?\b/i.test(e.label + " " + e.alt)))

console.log("\n── make the work: the four products ──")
const all = src + html
check("no Golden Hour preset anywhere in the section", !/golden hour/i.test(all) && !/presets\.webp/.test(all) && !existsSync(join(root, "public/home/everything/presets.webp")))
check("no preset box, gradient membership card or camera picture left behind", !/store-cam|store-album|ev-p-cut/.test(all) && !existsSync(join(root, "public/home/everything/store-cam.webp")))
const tee = EVERYTHING_SLIDES.find((s) => s.tab === "Merch")
check("the Midnight Studio Tee sits on a light grey, rounded tile", tee?.name === "Midnight Studio Tee" && tee.kind === "tee" && /\.ev-p-media\{[^}]*border-radius:12px;[^}]*background:#ededed\}/.test(css))
const digital = EVERYTHING_SLIDES.find((s) => s.tab === "Digital")
check("the digital product is a real one: a PDF guide with its cover", digital?.kind === "guide" && /class="ev-p-book"/.test(html) && /class="ev-p-book-title">Sourdough at Home</.test(html))
const course = EVERYTHING_SLIDES.find((s) => s.tab === "Course")
check("the course is a lesson on its video, not a camera", course?.kind === "course" && !/camera|manual/i.test(course.name) && /class="ev-p-lesson"/.test(html))
const community = EVERYTHING_SLIDES.find((s) => s.tab === "Community")
check("the community is people together (a photo), not a gradient card", community?.kind === "community" && !/Inner Circle/.test(all))
for (const s of EVERYTHING_SLIDES) check(`${s.tab}: its picture exists and is small`, existsSync(join(root, "public", s.img)) && statSync(join(root, "public", s.img)).size < 120 * 1024)
check("no purple gradients behind the products or the support thread", !/#a947a8|#7c3aed|#5b21b6|#c2417a|#a8326a|#7b3fc4|#4a3fbf/.test(css))

console.log("\n── make the work: a store that looks like you ──")
check("five or more stores, each a real Storelib store's layout", EVERYTHING_STORES.length >= 5 && (html.match(/class="ev-st ev-st-/g) ?? []).length === EVERYTHING_STORES.length * 2 && /<span class="ev-st-tabs"><span data-on="">Home<\/span><span>Products<\/span><span>Communities<\/span><\/span>/.test(html))
check("every store picture is local and exists", EVERYTHING_STORES.every((s) => [s.cover, s.avatar, ...s.products.map((p) => p.src)].every((u) => u.startsWith("/home/") && existsSync(join(root, "public", u)))))
check("it drifts without a stop, on the compositor: one linear loop of transform", /\.ev-s-track\{[^}]*animation:ev-stores \d+s linear infinite\}/.test(css) && /@keyframes ev-stores\{from\{transform:translate3d\(0,0,0\)\}to\{transform:translate3d\(-50%,0,0\)\}\}/.test(css) && /class="ev-s-track ev-loop"/.test(html))
check("it pauses off screen and stands still under reduced motion", /\.ev\[data-platform-live="false"\] \.ev-loop/.test(css) && /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.ev-loop,[^{]*\{animation:none !important\}/.test(css))

console.log("\n── words ──")
check("no fans in the section's words", !/\bfans?\b/i.test(text(html)) && EVERYTHING_CARDS.every((c) => !/\bfans?\b/i.test(c.lead + c.rest)))
check("no em dash and no banned words", !/—|\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text(html)))

console.log("\n── the globe in development ──")
check("a second effect run on the same canvas draws on a fresh one instead of throwing", /canvas\.setAttribute\("data-offscreen", ""\)/.test(globe) && /if \(canvas\.hasAttribute\("data-offscreen"\)\) \{/.test(globe) && /if \(surface !== canvas\) surface\.remove\(\)/.test(globe))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

/**
 * Landing round 19, perf. The owner: "make sure the whole storelib.com home
 * page on mobile phones, graphics and sections, don't glitch or take too much
 * performance; everything works smooth, clean, optimized, no lags or
 * stutters."
 *
 * Measured on a production build with scripts/check-home-sections-perf.mjs
 * (390x844 at 3x, touch, 4x CPU, flicks down the page and back up), the
 * costliest thing on the page was the creators rail: on a touch screen every
 * leg of its motion was written from script a frame at a time (round 12, so a
 * finger lands on the place that is drawn), and each written frame of the slow
 * drift made Chromium re-layer the whole page: 8.5ms of layerizing a frame
 * around the rail, 1.4 with the drift on the compositor. Only the fast legs (a
 * throw's coast, a nudge) stay the page's frames on a touch screen; the drift
 * and its ease in and out (30px a second at most, half a pixel a frame of
 * compositor lead) run on the compositor, as they do under a mouse.
 */
import { readFileSync } from "node:fs"
import { FRAME_LEGS } from "@/components/marketing/home/creators-carousel"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const creators = code("components/marketing/home/creators-carousel.tsx")
const probe = read("scripts/check-home-sections-perf.mjs")
const runner = read("scripts/run-push-tests.mjs")

console.log("\nThe creators rail: only the fast legs are the page's frames on a touch screen")
check("the frame legs are a throw's coast and a nudge", FRAME_LEGS.has("coast") && FRAME_LEGS.has("nudge") && FRAME_LEGS.size === 2)
check("the drift and its ease in and out are not", !FRAME_LEGS.has("cruise") && !FRAME_LEGS.has("in") && !FRAME_LEGS.has("out"))
check("a leg is the page's frames only on a touch screen and only when it is a fast one", /const frames = touch\.matches && FRAME_LEGS\.has\(kind\)/.test(creators))
check("the other legs are the compositor's, the drift looping without end", /anim = track\.animate\(\[\{ transform: tf\(from\) \}, \{ transform: tf\(from \+ by\) \}\], kind === "cruise" \? \{ duration: ms, iterations: Infinity, easing: "linear" \}/.test(creators))
check("a press during the drift pauses it, reads its place and writes it, then lets go", /anim\.pause\(\)\s*const m = getComputedStyle\(track\)\.transform\s*if \(m && m !== "none"\) x = -new DOMMatrixReadOnly\(m\)\.m41\s*motion = null\s*paint\(\)\s*anim\.cancel\(\)/.test(creators))
check("a press during a coast keeps the place last written (round 12)", /if \(motion\.frames\) \{\s*x = \(anim as FrameLeg\)\.at\(\)/.test(creators))
check("away from the screen a leg of either kind pauses", /if \(live\(\)\) motion\.anim\.play\(\)\s*else motion\.anim\.pause\(\)/.test(creators) && /if \(!live\(\)\) anim\.pause\(\)/.test(creators))
check("the layer is still asked for only while the rail is live", /const want = live\(\) \? "transform" : ""/.test(creators))

console.log("\nThe probe that found it")
check("scripts/check-home-sections-perf.mjs gives frames, style, layout, paint, layerize, commit, layers and long tasks to each section", /Layerize/.test(probe) && /UpdateLayoutTree/.test(probe) && /LayerTree\.enable/.test(probe) && /longtask/.test(probe) && /Input\.dispatchTouchEvent/.test(probe) && /setCPUThrottlingRate", \{ rate: 4 \}/.test(probe))
check("as a phone: 390x844 at 3x with touch", /width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true/.test(probe))
check("no machine paths in it", !/\/home\/user|claude-0/.test(probe))
check("this suite runs with the push suite, after round 18's", runner.indexOf('"tests/home-landing-r19-perf.test.ts"') > runner.indexOf('"tests/home-landing-r18-business.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

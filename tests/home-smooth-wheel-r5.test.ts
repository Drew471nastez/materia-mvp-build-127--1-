/**
 * HOME PAGE, ROUND 5: the desktop mouse wheel glides (components/marketing/smooth-wheel.tsx),
 * ported from the Materia theme's assets/smooth-scroll.js at the owner's request.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SMOOTH_WHEEL_EASE, SMOOTH_WHEEL_MIN_WIDTH, SMOOTH_WHEEL_MULT } from "@/components/marketing/smooth-wheel"

let failed = 0
function check(name: string, ok: boolean) {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const src = read("components/marketing/smooth-wheel.tsx")
const page = read("app/(storelib)/(marketing)/page.tsx")

console.log("\n── the home page's smooth wheel ──")
check("the theme's own numbers: a fifth of the way each frame, a small boost, from 1025px", SMOOTH_WHEEL_EASE === 0.2125 && SMOOTH_WHEEL_MULT === 1.08 && SMOOTH_WHEEL_MIN_WIDTH === 1025)
check("drawn once on the home page", /import \{ SmoothWheel \} from "@\/components\/marketing\/smooth-wheel"/.test(page) && (page.match(/<SmoothWheel \/>/g) || []).length === 1)
check("one native scroller: it moves the page with window.scrollTo, never a transform", /window\.scrollTo\(0, Math\.round\(current\)\)/.test(src) && !/translate/.test(src))
check("off for touch, coarse pointers and reduced motion", /prefers-reduced-motion: reduce/.test(src) && /pointer: coarse/.test(src) && /maxTouchPoints/.test(src))
check("leaves Ctrl (zoom), sideways wheels and boxes that can scroll themselves alone", /e\.ctrlKey/.test(src) && /Math\.abs\(e\.deltaX\) > Math\.abs\(e\.deltaY\)/.test(src) && /nestedCanScroll\(e\.target, e\.deltaY\)/.test(src))
check("stands aside while a modal or a menu holds the page", /data-modal-any/.test(src) && /data-scroll-locked/.test(src))
check("the frame loop runs only while gliding", /if \(running\) requestAnimationFrame\(loop\)/.test(src) && /running = false/.test(src))
check("the wheel listener can prevent the native scroll, the others are passive", /addEventListener\("wheel", onWheel, \{ passive: false \}\)/.test(src) && /addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(src))
check("taken off when the page goes", /removeEventListener\("wheel", onWheel\)/.test(src))

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")

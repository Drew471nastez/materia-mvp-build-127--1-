/**
 * HOME PAGE, ROUND 5: the desktop mouse wheel glided (components/marketing/smooth-wheel.tsx),
 * ported from the Materia theme's assets/smooth-scroll.js at the owner's request.
 *
 * Changed on purpose (landing round 12): the owner, "too smooth and delayed";
 * scrolling must feel real time, accurate and clean. The glide moved the page
 * a fifth of the remaining way each frame, so a trackpad's 52px reached its
 * place 26 frames (about 450ms) after the first move, with 4% of it done one
 * frame in. No easing of that kind can reach the target within one frame, so
 * the glide is gone and the browser's own scrolling runs: a trackpad answers
 * in the frame it moves, a mouse notch gets the browser's own short animation.
 * The pins below now hold that it stays gone, and that nothing else on the
 * page takes the wheel from the browser.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

let failed = 0
function check(name: string, ok: boolean) {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const page = read("app/(storelib)/(marketing)/page.tsx")

/* Every script of the home page's own sections. */
const files: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const p = `${dir}/${name}`
    if (statSync(join(process.cwd(), p)).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(name)) files.push(p)
  }
}
walk("components/marketing/home")
files.push("components/marketing/landing-story.tsx", "components/marketing/hero.tsx", "components/marketing/build-showcase.tsx", "components/marketing/scroll-reveal-panel.tsx")

console.log("\n── the home page scrolls natively ──")
// Changed on purpose (landing round 12): was "the theme's own numbers" (ease 0.2125, mult 1.08, from 1025px); the glide is removed.
check("the glide is gone: no smooth-wheel component", !existsSync(join(process.cwd(), "components/marketing/smooth-wheel.tsx")))
// Changed on purpose (landing round 12): was "drawn once on the home page".
check("the home page draws no wheel glide", !/SmoothWheel|smooth-wheel"/.test(page.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")))
// Changed on purpose (landing round 12): was "the wheel listener can prevent the native scroll"; now no home section may.
const takers = files.filter((f) => existsSync(join(process.cwd(), f)) && /addEventListener\(\s*["'](wheel|mousewheel)["'][^)]*passive:\s*false/.test(read(f)))
check("no home section takes the wheel from the browser (no wheel listener with passive: false)", takers.length === 0)
const scrollers = files.filter((f) => existsSync(join(process.cwd(), f)) && /window\.scrollTo\(0, Math\.round/.test(read(f)))
check("nothing on the home page moves the page frame by frame with window.scrollTo", scrollers.length === 0)

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")

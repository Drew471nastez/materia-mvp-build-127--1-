/**
 * ===========================================================================
 *  HOME, LANDING ROUND 12: THE FRAME (scrolling and page-wide performance)
 * ===========================================================================
 * The owner:
 *
 *   the wheel     "the smooth scroll is too smooth and delayed": scrolling
 *                 must be real time, accurate and clean. The wheel glide
 *                 (round 5) is removed; the browser's own scroll runs.
 *   the frames    "the whole landing page must be smooth with no stutters,
 *                 lag or glitches on all mobile browsers": from the round's
 *                 audit (390x844 touch at 4x CPU, the whole page flicked
 *                 down and back up):
 *                   the entrance's scroll listener read scrollY inside the
 *                   scroll event, which lays the page out before the frame
 *                   does it again: the costliest script on the page. It now
 *                   only asks, and the position is read after the frame;
 *                   a section away from the screen kept every animation that
 *                   started after it went away (a rail's own timer moving
 *                   its cards): each start is now heard and rested too.
 *   the entrance  round 11's reveal and picture fade stay as they were.
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { IMG_FADE_MS, STORY_LIVE_AHEAD, TOUCH_MS, TOUCH_RISE_PX, REVEAL_CSS } from "@/components/marketing/landing-story"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`, detail ?? "")
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const story = code("components/marketing/landing-story.tsx")
const page = code("app/(storelib)/(marketing)/page.tsx")

console.log("\n── the wheel: the browser's own ──")
check("no wheel glide on the home page", !existsSync(join(process.cwd(), "components/marketing/smooth-wheel.tsx")) && !/SmoothWheel/.test(page))
check("the page has no wheel listener that can stop the native scroll", !/addEventListener\("wheel"/.test(story) && !/addEventListener\("wheel"/.test(page))

console.log("\n── the entrance's scroll listener lays nothing out ──")
const onScroll = story.match(/const onScroll = \(\) => \{([\s\S]*?)\n    \}/)?.[1] ?? ""
check("the scroll event only asks: no scrollY, no layout read in it", onScroll.length > 0 && !/scrollY|innerHeight|getBoundingClientRect|scrollTop/.test(onScroll), onScroll)
check("once per frame: a flag, then a task queued from the next frame", /if \(asked\) return/.test(onScroll) && /requestAnimationFrame\(\(\) => window\.setTimeout\(measure, 0\)\)/.test(onScroll))
check("the position and the speed are read in that task", /const measure = \(\) => \{\s*asked = false[\s\S]*?const y = window\.scrollY/.test(story))
check("still one passive listener, taken off when the page goes", /window\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(story) && /window\.removeEventListener\("scroll", onScroll\)/.test(story))

console.log("\n── a section away keeps nothing running ──")
check("an animation or transition that starts in a section reported away is paused and handed to it", /root\.addEventListener\("animationstart", onStart\)/.test(story) && /root\.addEventListener\("transitionrun", onStart\)/.test(story) && /closest<HTMLElement>\('\[data-story-in-view="false"\]'\)/.test(story) && /for \(const a of started\) a\.pause\(\)/.test(story))
check("only that element's own clock animations, never scroll-driven ones, never a picture's fade", /el\.getAnimations\(\)\.filter/.test(story) && /a\.timeline !== document\.timeline/.test(story) && /name === "landing-img-in"\) return/.test(story))
check("the rested list grows, it is never replaced (they all play again when it comes back)", /resting\.set\(away, \[\.\.\.\(resting\.get\(away\) \?\? \[\]\), \.\.\.started\]\)/.test(story) && /resting\.set\(section, \[\.\.\.\(resting\.get\(section\) \?\? \[\]\), \.\.\.running\]\)/.test(story))
check("taken off when the page goes", /removeEventListener\("animationstart", onStart\)/.test(story) && /removeEventListener\("transitionrun", onStart\)/.test(story))
check("sections still wake a screen ahead", STORY_LIVE_AHEAD === "100% 0px")

console.log("\n── round 11's entrance kept ──")
check("pictures fade in once decoded, 450ms", IMG_FADE_MS === 450 && /landing-img-in/.test(REVEAL_CSS))
check("on touch a block comes up 12px over 700ms", TOUCH_MS === 700 && TOUCH_RISE_PX === 12)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

/**
 * Wave 17 (paint). The owner's iPhone recording of round 9: as he scrolled up
 * and down through the middle of the page, blocks came on screen empty and
 * were filled a few frames later: the rows of apps, the AI card's terminal,
 * the app's phone on its black stage, the contacts list, on every change of
 * direction. What was empty was always what waited for something at the
 * screen's edge: an entrance that hid a block until it was on screen, a
 * moving part paused until its section was on screen, a small picture that
 * was fetched or decoded only as it was drawn. So, on a phone or any touch
 * screen nothing waits for an entrance, a section's loops run from a screen
 * ahead, and the small pictures of those sections load with them.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { LIVE_AHEAD, TOUCH_SCREEN_QUERY } from "@/components/marketing/home/platform-motion"
import { REVEAL_CSS, STORY_LIVE_AHEAD } from "@/components/marketing/landing-story"
import { IntegrationsSection } from "@/components/marketing/home/integrations-section"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const code = (p: string) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const DIR = "components/marketing/home"

console.log("\nOn a touch screen nothing waits for an entrance")
{
  const story = code("components/marketing/landing-story.tsx")
  check("a touch screen is the page's phone test: under 768px, or no hover and a coarse pointer", TOUCH_SCREEN_QUERY.replace(/\s/g, "") === "(max-width:767px),(hover:none)and(pointer:coarse)" && /@media \(max-width:767px\),\(hover:none\) and \(pointer:coarse\)/.test(REVEAL_CSS))
  check("the page's entrance asks once whether it is on a touch screen", /const touch = touchScreen\(\)/.test(story))
  check("there every section's own entrance is marked as soon as it is in the page", /if \(touch\) showNow\(block as HTMLElement\)\s*else ahead\.observe\(block\)/.test(story))
  check("and no block is hidden for the page's own entrance", /if \(touch\) return\s*const targets = /.test(story))
  check("a computer keeps both entrances", /ahead\.observe\(block\)/.test(story) && /el\.dataset\.reveal = "wait"/.test(story))
  const motion = code(`${DIR}/platform-motion.tsx`)
  check("a platform section's stage is shown a screen ahead on a touch screen", /const early = touchScreen\(\)/.test(motion) && /if \(near && early\) markSeen\(\)/.test(motion) && /rootMargin: LIVE_AHEAD, threshold: 0/.test(motion))
  check("and at the screen's edge on a computer, as before", /if \(onScreen\) markSeen\(\)/.test(motion) && /rootMargin = "120px 0px"/.test(motion))
  const analytics = code(`${DIR}/analytics-showcase.tsx`)
  check("what is working: its blocks do not wait on a touch screen", /prefers-reduced-motion: reduce\)"\)\.matches\) return\s*if \(touchScreen\(\)\) return/.test(analytics))
}

console.log("\nLoops run from a screen ahead")
{
  check("a screen either way", LIVE_AHEAD === "100% 0px" && STORY_LIVE_AHEAD === "100% 0px")
  const story = code("components/marketing/landing-story.tsx")
  check("a section away from the screen rests only beyond a screen (it was 100px)", /\{ rootMargin: STORY_LIVE_AHEAD \}/.test(story) && !/rootMargin: "100px 0px"/.test(story))
  const motion = code(`${DIR}/platform-motion.tsx`)
  check("data-platform-live is true a screen ahead; the script loops keep their own margin", /const value = String\(\(near \|\| onScreen\) && !document\.hidden && !reduced\)/.test(motion) && /const live = onScreen && !document\.hidden && !reduced/.test(motion))
  const ai = code(`${DIR}/ai-tools-section.tsx`)
  check("the terminal runs a screen before it arrives", /\{ rootMargin: LIVE_AHEAD \}/.test(ai) && !/threshold: 0\.25/.test(ai))
  const audience = code(`${DIR}/audience-ownership.tsx`)
  check("the contacts run a screen before they arrive", /\{ rootMargin: LIVE_AHEAD \}/.test(audience) && !/threshold: 0\.35/.test(audience))
}

console.log("\nThe small pictures load with their section and are drawn with it")
{
  const html = renderToStaticMarkup(createElement(IntegrationsSection))
  const imgs = html.match(/<img[^>]*>/g) ?? []
  check("the apps' marks: sized, not lazy, not async", imgs.length > 10 && imgs.every((t) => /width="90" height="90"/.test(t) && !/loading="lazy"/.test(t) && !/decoding="async"/.test(t)))
  const app = code(`${DIR}/app-anywhere.tsx`)
  check("the app's thumbnails: not lazy, not async", (app.match(/<img [^>]*width=\{96\} height=\{96\}[^>]*>/g) ?? []).length === 2 && !/loading="lazy"|decoding="async"/.test(app))
  const audience = code(`${DIR}/audience-ownership.tsx`)
  check("the faces: not async", /width=\{44\} height=\{44\} className=\{s\.face\}/.test(audience) && !/decoding="async"/.test(audience))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

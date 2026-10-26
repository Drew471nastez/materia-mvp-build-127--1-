/**
 * Round AD5: the buyer's Library > Courses without the progress pills, and
 * the dark platform header with depth. scripts/check-library-courses.mjs and
 * scripts/check-home-hero.mjs measure both in a browser; this pins the words
 * and the source.
 */
import { readCode, readSource } from "./_source"
import { courseAction, courseProgressLine } from "../lib/courses/progress-line"
import { BUYER_HEADER_DARK_BG, headerChrome } from "../lib/platform/header-chrome"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`) }
}

console.log("\nLibrary > Courses: one line and one action per course")
check("in progress: the lessons done of all", courseProgressLine({ status: "in_progress", completed: 4, total: 12 }) === "4 of 12 lessons")
check("not started: says so, with how many lessons", courseProgressLine({ status: "not_started", completed: 0, total: 9 }) === "Not started · 9 lessons" && courseProgressLine({ status: "not_started", completed: 0, total: 1 }) === "Not started · 1 lesson")
check("finished: Finished", courseProgressLine({ status: "completed", completed: 8, total: 8 }) === "Finished")
check("a course with no lessons yet says that", courseProgressLine({ status: "not_started", completed: 0, total: 0 }) === "No lessons yet")
check("Continue, Start, Watch again", courseAction("in_progress") === "Continue" && courseAction("not_started") === "Start" && courseAction("completed") === "Watch again")

const index = readCode("components/courses/courses-index.tsx")
check("no progress switch: no tab list, no In progress / Not started / Completed labels", !/role="tablist"|ProgressSwitch|"In progress"|"Completed"/.test(index))
check("no ring on the card: a thin bar instead", !/CourseRing/.test(index) && /data-course-bar=""/.test(index) && /h-\[3px\]/.test(index) && /role="progressbar"/.test(index))
check("finished courses come after the rest, under a quiet line", /const open = shown\.filter\(\(c\) => c\.status !== "completed"\)/.test(index) && /const finished = shown\.filter\(\(c\) => c\.status === "completed"\)/.test(index) && /data-courses-finished=""/.test(index))
check("the bar is ink on a faint track in both looks", /var\(--sl-course-ink, #1a1a2e\)/.test(index) && /var\(--sl-course-track, #eceef1\)/.test(index))
check("on a phone a card is a row, from 640px the cover is on top", /sm:flex-col sm:items-stretch/.test(index) && /w-\[112px\] shrink-0/.test(index))
check("the skeleton waits in the new shape", /grid grid-cols-1 gap-2\.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3/.test(readCode("components/library/library-skeletons.tsx")))

console.log("\nThe dark header has depth")
const dark = headerChrome(false)
check("a near black a step above the dark look's page (#111113) and the hero's panel (#0e0e10)", BUYER_HEADER_DARK_BG === "#16161a")
check("a hairline at its foot", dark.headerBorder === "border-b border-white/[0.08]")
check("its depth class is kept", dark.root.startsWith("platform-header-depth "))
const css = readSource("app/globals.css")
check("scrolled, a soft black shadow, from a shared token", /\.platform-header-depth\[data-scrolled\] \{\s*box-shadow: var\(--bar-depth-dark-raised\);/.test(css) && /* Round 24 (the owner): about 15% lighter than it was (0.35 and 0.6). */ /--bar-depth-dark-raised: 0 1px 2px rgba\(0, 0, 0, 0\.3\), 0 9px 24px -10px rgba\(0, 0, 0, 0\.51\);/.test(css))
const header = readCode("components/platform/platform-header-client.tsx")
check("the header writes data-scrolled itself, from a passive scroll listener, only when it changes", /window\.addEventListener\("scroll", read, \{ passive: true \}\)/.test(header) && /if \(now === was\) return/.test(header) && /el\.setAttribute\("data-scrolled", ""\)/.test(header))
check("the stand in and the avatar ring use the same colour, written out for Tailwind", /bg-\[#16161a\]/.test(readCode("components/marketing/conditional-header.tsx")) && /ring-offset-\[#16161a\]/.test(header))
const darkCss = readSource("app/theme-dark.css")
check("the dark look keeps the hairline's strength", /#platform-header-root\[data-header-tone="dark"\] > header \{\s*border-bottom-color: rgba\(255,255,255,0\.08\);/.test(darkCss))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

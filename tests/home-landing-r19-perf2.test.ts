/**
 * Landing round 19, perf2. A page-wide phone audit (390x844, 3x, touch, 4x
 * CPU, production build) found "See your ideas come to life" running about
 * 116 animations at once with its website builder on screen, every one
 * restyled on each main frame of a scroll (5 to 7ms of style a frame, 35 to
 * 56% of frames dropped there).
 *
 * In Chromium a running animation is restyled every main frame while it is in
 * its active time, even where its keyframes hold a value; one waiting out its
 * delay, or done and holding its end, is not (4x CPU: 300 holding animations
 * 3.8ms of style a frame, 300 waiting out a delay 0.1ms). So:
 *   - the typing is one run of text behind a window that opens a character at
 *     a time (two transforms each for the page and the field, step-end at each
 *     character's edge) and one caret: five animations, was 44 (one per
 *     character and one caret per character in the field);
 *   - every once-only animation of the moment is cut to the stretches where
 *     its value changes (a delay up to each, `forwards` between), so at any
 *     moment only the few that are changing are restyled;
 *   - Publish plays once with the moment (it looped, so a tab chosen by hand
 *     pressed Publish again by itself every 11.6s with no pointer).
 * The same values at the same times: the picture is the one it was.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BUILDER_CSS, BUILDER_MOMENT_CSS, STZ_EDIT, SteezSite, TYPE_EDGES, WB_DURATION_MS, WebsiteBuilderMock, windowed } from "@/components/marketing/home/showcase-mocks/builder-mocks"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const T = WB_DURATION_MS / 1000
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
const site = renderToStaticMarkup(createElement(SteezSite, { rings: true }))
const ideas = code("components/marketing/home/ideas-come-to-life.tsx")
const runner = read("scripts/run-push-tests.mjs")

console.log("\nThe typing: one run behind a window, one caret")
check("the page's heading: the new words are one run in a window, no span per character", /<span class="wx-now" aria-hidden="true"><span class="wx-win"><span class="wx-txt">Winter Drop &#x27;26<\/span><\/span><\/span>/.test(site))
check("the field: the same run, and one caret after it", /<span class="wx-now" aria-hidden="true"><span class="wx-win"><span class="wx-txt">Winter Drop &#x27;26<\/span><\/span><i class="wx-car"><\/i><\/span>/.test(wb) && (wb.match(/class="wx-car"/g) ?? []).length === 1)
check("no character spans and no per-character delays left", !/animation-delay/.test(wb) && !/\.wx-now i/.test(BUILDER_CSS) && !/sxk-ed-(ch|car)/.test(BUILDER_CSS))
const typing = [...BUILDER_CSS.matchAll(/\{animation:(sxk-ty-[\w-]+) /g)].map((m) => m[1])
check("five animations type the words: the page's window and text, the field's window, text and caret", typing.join() === "sxk-ty-page-win,sxk-ty-page-txt,sxk-ty-field-win,sxk-ty-field-txt,sxk-ty-field-car", typing)
check("each steps (step-end), a key press, not a slide", [...BUILDER_CSS.matchAll(/animation:sxk-ty-[\w-]+ [\d.]+s step-end /g)].length === 5)
const inc = (xs: readonly number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1])
check("an edge for every character, in order, in both types", TYPE_EDGES.page.length === STZ_EDIT.now.length && TYPE_EDGES.field.length === STZ_EDIT.now.length && inc(TYPE_EDGES.page) && inc(TYPE_EDGES.field))
const kfOf = (css: string, name: string) => css.match(new RegExp(`@keyframes ${name}\\{((?:[^{}]*\\{[^{}]*\\})*)\\}`))?.[1] ?? ""
const win = kfOf(BUILDER_MOMENT_CSS, "sxk-ty-page-win")
const txt = kfOf(BUILDER_MOMENT_CSS, "sxk-ty-page-txt")
const steps = (body: string) => [...body.matchAll(/translateX\((-?[\d.]+)em\)/g)].map((m) => Number(m[1]))
const ws = steps(win)
const ts = steps(txt)
check("the window steps left of each edge by what is not typed yet, the text back by the same: the letters stand still", ws.length >= STZ_EDIT.now.length - 1 && ws.every((w, i) => Math.abs(w + ts[i]) < 1e-9), { ws, ts })
check("hidden until the first character, whole and still after the last", /^0%,[\d.]+%\{opacity:0;/.test(win) && /100%\{opacity:1;transform:none\}$/.test(win) && /100%\{transform:none\}$/.test(txt))
const car = kfOf(BUILDER_MOMENT_CSS, "sxk-ty-field-car")
check("the caret steps along the field's edges and goes a little after the last", TYPE_EDGES.field.every((x) => car.includes(`translateX(${x}em)`)) && /100%\{opacity:0;/.test(car))
check("at rest the new words and the caret are hidden (reduced motion keeps the old words)", /\n\.wx-win\{[^}]*opacity:0/.test(BUILDER_CSS) && /\n\.wx-car\{[^}]*opacity:0/.test(BUILDER_CSS) && /\n\.wx-win\{[^}]*overflow-x:clip/.test(BUILDER_CSS))

console.log("\nEach once-only animation runs only where it moves")
type Frame = { t: number; decl: string }
const framesOf = (body: string, start: number, len: number): Frame[] =>
  [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, sel, decl]) => sel.split(",").map((s) => ({ t: start + (parseFloat(s) / 100) * len, decl }))).sort((a, b) => a.t - b.t)
const rulesOf = (css: string) => [...css.matchAll(/\{animation:([^}]+)\}\}/g)].map((m) => m[1])
const momentRules = rulesOf(BUILDER_MOMENT_CSS)
const liveRules = rulesOf(BUILDER_CSS).filter((r) => /^sxk-(ty|ed|stz|cur|wx)-/.test(r))
check("the moment as written plays every animation once, for the whole moment (Publish too, landing round 19)", momentRules.length > 20 && momentRules.every((r) => / var\(--bm-t\) \S+ 1 both$/.test(r)), momentRules.filter((r) => !/1 both$/.test(r)))
check("nothing of the website builder loops", !liveRules.some((r) => /infinite/.test(r)))
let same = true
const bad: string[] = []
for (const r of momentRules) {
  const name = r.split(" ")[0]
  const orig = framesOf(kfOf(BUILDER_MOMENT_CSS, name), 0, T)
  const live = liveRules.find((x) => x.startsWith(`${name} `))
  if (!live) { same = false; bad.push(`${name}: no rule`); continue }
  const parts = live.split(",").map((p) => p.trim().split(" "))
  const wins = parts.map(([n, dur, , delay, , fill]) => ({ n, dur: parseFloat(dur), delay: parseFloat(delay), fill, frames: framesOf(kfOf(BUILDER_CSS, n), parseFloat(delay), parseFloat(dur)) }))
  if (!wins.every((w, i) => w.fill === (i ? "forwards" : "both"))) { same = false; bad.push(`${name}: fills`) }
  /* Every keyframe as written is met at its time, or falls in a hold whose value is that keyframe's. */
  for (const f of orig) {
    const at = wins.flatMap((w) => w.frames).find((g) => Math.abs(g.t - f.t) < 0.003 && g.decl === f.decl)
    const before = wins.filter((w) => w.delay <= f.t + 0.003)
    const holding = before.length ? before[before.length - 1].frames[before[before.length - 1].frames.length - 1] : wins[0].frames[0]
    const held = holding && (f.t >= holding.t - 0.003 || !before.length) && holding.decl === f.decl
    if (!at && !held) { same = false; bad.push(`${name} @${f.t.toFixed(3)}s ${f.decl}`) }
  }
}
check("the same values at the same times: each keyframe as written is met, or held, at its time", same, bad.slice(0, 6))
/* At any moment, how many rules are in their active time (a delay or a finished run costs nothing). */
const spans = liveRules.flatMap((r) => r.split(",").map((p) => p.trim().split(" ")).map(([, dur, , delay]) => [parseFloat(delay), parseFloat(delay) + parseFloat(dur)]))
const busiest = Math.max(...Array.from({ length: Math.round(T * 50) }, (_, i) => i / 50).map((t) => spans.filter(([a, b]) => t >= a && t < b).length))
check(`at most a dozen of the moment's ${liveRules.length} rules move at once (${busiest}); before, every one ran for the whole moment`, busiest <= 12, busiest)
check("windowed leaves a looping animation as it is", windowed("@keyframes sxk-x{0%,50%{opacity:0}60%,100%{opacity:1}}\n.a{animation:sxk-x var(--bm-t) linear infinite both}") === "@keyframes sxk-x{0%,50%{opacity:0}60%,100%{opacity:1}}\n.a{animation:sxk-x var(--bm-t) linear infinite both}")
check("and cuts a once-only one at a long hold that names every property, never at one that does not", (() => {
  const out = windowed("@keyframes sxk-y{0%,10%{opacity:0}20%,60%{opacity:1}70%,100%{opacity:0}}\n.a{animation:sxk-y var(--bm-t) linear 1 both}", 10)
  const kept = windowed("@keyframes sxk-z{0%,10%{opacity:0;transform:none}20%{opacity:1}60%{opacity:1}70%,100%{opacity:0;transform:none}}\n.a{animation:sxk-z var(--bm-t) linear 1 both}", 10)
  return out.includes(".a{animation:sxk-y 1s linear 1s 1 both,sxk-y-w2 1s linear 6s 1 forwards}") && kept.includes(".a{animation:sxk-z 6s linear 1s 1 both}")
})())

console.log("\nOnly the tab in front, only on screen")
check("the moment's animations attach only under the live panel", liveRules.length > 0 && [...BUILDER_CSS.matchAll(/\{([^{}]*)\{animation:sxk-(?:ty|ed|stz|cur|wx)-/g)].every((m) => m[1].split(/,(?![^(]*\))/).every((s) => s.trim().startsWith("[data-mock-live]"))))
check("a panel is live only when it is the one in front and the section is on screen", /data-mock-live=\{\(state === "active" && t\.live\) \|\| undefined\}/.test(ideas))
check("this suite runs with the push suite, after round 19's perf", runner.indexOf('"tests/home-landing-r19-perf2.test.ts"') > runner.indexOf('"tests/home-landing-r19-perf.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

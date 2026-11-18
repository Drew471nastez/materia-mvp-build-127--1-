/**
 * LANDING ROUND 16, HOW IT WORKS (the home page's "Take tips" and "Use your
 * own domain" cards; the domain reel is shared with /pricing's bento)
 *
 * The owner:
 *   1. "Use your own domain": much smoother and cleaner, as smooth as a
 *      120Hz screen allows. It stepped: each row was a 1.8s hold and a 1.2s
 *      move that set off at speed, the rows were a fractional number of
 *      pixels tall so the text rested between pixels, and the pointer
 *      pressed at every step. Now one move per row that takes the whole
 *      step, starting and ending at rest, rows a whole number of pixels, the
 *      two lists their own layers, the pointer still.
 *   2. "Take tips": smoother and cleaner, and a better cover photograph
 *      (a film camera at a valley's edge, Unsplash, webp at two widths).
 *      The chosen amount is one pill that glides; the button's words roll;
 *      a 12 second loop with room between the steps.
 *
 * Measured on the dev server with Playwright (scratchpad t2/measure.mjs):
 * rAF deltas and a DevTools trace with the domain card on screen at 390 and
 * 1440, the list's position read every frame, and the cards' animations set
 * to fixed times for motion frames.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HowItWorks, HOW_COVER, HOW_IT_WORKS_STYLES, HOW_TIP_LOOP_S, TIP_RESET_S } from "@/components/marketing/home/how-it-works"
import { DomainReel, DOMAIN_CSS, DOMAIN_EASE, DOMAIN_ENDINGS, DOMAIN_STEP_S } from "@/app/(storelib)/(marketing)/pricing/domain-reel"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const how = renderToStaticMarkup(createElement(HowItWorks))
const css = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const reel = renderToStaticMarkup(createElement(DomainReel))
const keyframes = (sheet: string, name: string) => new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`).exec(sheet)?.[1] ?? ""
const onlyCompositor = (body: string) => body.length > 0 && !/(top|left|right|bottom|height|width|margin|padding|filter|color|background)\s*:/.test(body.replace(/transform:[^;}]*/g, "").replace(/opacity:[^;}]*/g, ""))
/** A CSS cubic-bezier's slope at its two ends (dy/dx of the first and last handles). */
const bezierEnds = (e: string) => {
  const [x1, y1, x2, y2] = (/cubic-bezier\(([^)]*)\)/.exec(e)?.[1] ?? "").split(",").map(Number)
  return { start: y1 / x1, end: (1 - y2) / (1 - x2) }
}

console.log("\n1. Use your own domain: a glide, not steps")
{
  const kf = keyframes(DOMAIN_CSS, "pz-reel")
  const stops = [...kf.matchAll(/([\d.]+)%(?:,[\d.]+%)?\{/g)].map((m) => m[0])
  check("no holds: one keyframe a row, none held across two stops", stops.length === DOMAIN_ENDINGS.length + 1 && stops.every((s) => !s.includes(",")), stops)
  check("the whole loop is seven glides of 2.6s", DOMAIN_STEP_S === 2.6 && new RegExp(`animation:pz-reel ${(DOMAIN_ENDINGS.length * DOMAIN_STEP_S).toFixed(1)}s cubic-bezier\\(\\.7,0,\\.3,1\\) infinite`).test(DOMAIN_CSS))
  const ends = bezierEnds(DOMAIN_EASE)
  check("each glide starts and ends at rest (zero slope at both ends), so one runs into the next without a jolt", ends.start === 0 && ends.end === 0, ends)
  check("it still ends where it began", /100%\{transform:translate3d\(0,-50%,0\)\}/.test(DOMAIN_CSS))
  check("transform only, and the only keyframes are the reel's", (DOMAIN_CSS.match(/@keyframes /g) ?? []).length === 1 && onlyCompositor(kf) && !/opacity/.test(kf))
  check("the pointer rests: no press, no second animation", !/pz-press/.test(DOMAIN_CSS) && !/pz-d-cursor[^"]*ev-loop/.test(reel) && !/\.pz-d-cursor\{[^}]*animation/.test(DOMAIN_CSS))
  check("the two lists are their own layers, so their text is drawn once and moved", /\.pz-d-track\{[^}]*will-change:transform;backface-visibility:hidden/.test(DOMAIN_CSS) && (reel.match(/pz-d-track[^"]*ev-loop/g) ?? []).length === 2)
  check("a row is a whole number of pixels where round() is known, and the column and pill are put on whole pixels", /@supports \(width:round\(1\.5px,1px\)\)\{\.pz-d\{--R:round\(down,clamp\(34px,min\(14\.5cqh,12cqw\),66px\),2px\);--pp:round\(calc\(var\(--R\) \* \.11\),1px\);--top:round\(down,calc\(50% - var\(--R\) \* 2\.5\),1px\)\}\}/.test(DOMAIN_CSS) && /\.pz-d-col\{[^}]*top:var\(--top\)/.test(DOMAIN_CSS) && /\.pz-d-pill\{[^}]*top:calc\(var\(--top\) \+ var\(--R\) \* 2 - var\(--pp\)\)/.test(DOMAIN_CSS))
  check("in the pill an address passing through fades well inside its edges (a still mask on a window the pill's full height)", /\.pz-d-window\{display:block;height:calc\(var\(--R\) \+ var\(--pp\) \* 2\);overflow:hidden;-webkit-mask-image:linear-gradient\(transparent 0%,#000 26%,#000 74%,transparent 100%\)/.test(DOMAIN_CSS) && /\.pz-d-track-pill\{margin-top:calc\(var\(--R\) \* -2 \+ var\(--pp\)\)\}/.test(DOMAIN_CSS))
  check("the pill is centred by its margins, not by a fractional translate", /\.pz-d-pill\{[^}]*width:max-content;[^}]*margin-inline:auto/.test(DOMAIN_CSS) && !/\.pz-d-pill\{[^}]*transform/.test(DOMAIN_CSS))
  check("still under reduced motion, on www.mayalane.com", /@media \(prefers-reduced-motion:reduce\)\{\.pz-d-track\{animation:none;will-change:auto;transform:none\}\}/.test(DOMAIN_CSS) && DOMAIN_ENDINGS[2] === "com")
  check("paused off screen on the home page", css.includes(".cmh-card:not([data-commerce-live]) .ev-loop{animation-play-state:paused}"))
}

console.log("\n2. Take tips: a real cover photograph")
{
  check("a photograph, not the drawn mesas", !/data-cover="red"/.test(how) && !/HOW_COVER_REDS|TipCover/.test(read("components/marketing/home/how-it-works.tsx").replace(/\/\*[\s\S]*?\*\//g, "")))
  const img = /<span class="cmh-tp-cover"><img [^>]*><\/span>/.exec(how)?.[0] ?? ""
  // Changed on purpose (landing round 17): the owner disliked Ines Duarte and her cover; Finn Hollis, a surf filmmaker, under a surfing cover (tests/home-landing-r17-small.test.ts).
  check("two webp widths for 1x and 2x, sized, lazy, decoded off the main thread", /srcSet="\/home\/how\/finn-cover-600\.webp 600w, \/home\/how\/finn-cover-1000\.webp 1000w"/i.test(img) && /src="\/home\/how\/finn-cover-1000\.webp"/.test(img) && /width="1000"/.test(img) && /height="425"/.test(img) && /loading="lazy"/.test(img) && /decoding="async"/.test(img) && /alt=""/.test(img), img)
  check("the files exist, are small, and are the cover's own shape (100:42.5)", [["600", 30], ["1000", 40]].every(([w, kb]) => existsSync(`public/home/how/finn-cover-${w}.webp`) && statSync(`public/home/how/finn-cover-${w}.webp`).size < Number(kb) * 1024) && Math.abs(HOW_COVER.height / HOW_COVER.width - 0.425) < 0.002)
  check("it covers its box", /\.cmh-tp-cover img\{display:block;width:100%;height:100%;object-fit:cover/.test(css) && /\.cmh-tp-cover\{[^}]*height:34%/.test(css))
  check("the round 14 photograph the owner disliked is not back", !existsSync("public/home/how/ines-cover.webp"))
}

console.log("\n3. Take tips: smoother and cleaner")
{
  check("one dark pill glides from $3 to $5, the white amounts held still inside it", /class="cmh-a cmh-tp-sel"/.test(how) && /class="cmh-a cmh-tp-sel-in"/.test(how) && !/cmh-tp-on[35]?\b/.test(how + css))
  check("  a chip and its gap: the pill moves its own width and .5em; the inside a quarter of its row and .125em the other way", /translate3d\(calc\(100% \+ \.5em\),0,0\)/.test(keyframes(css, "cmh-tp-sel")) && /translate3d\(calc\(-25% - \.125em\),0,0\)/.test(keyframes(css, "cmh-tp-sel-in")) && /\.cmh-tp-sel\{[^}]*width:calc\(\(100% - 1\.5em\) \/ 4\)/.test(css) && /\.cmh-tp-sel-in\{[^}]*gap:\.5em;width:calc\(400% \+ 1\.5em\)/.test(css))
  check("the glides and the button's words on a curve that starts and ends at rest", /\.cmh-tp-sel,\.cmh-tp-sel-in,\.cmh-tp-l3,\.cmh-tp-l5\{animation-timing-function:cubic-bezier\(\.65,0,\.35,1\)\}/.test(css))
  check("the button's words roll (a rise with the fade), clipped by the button", /translate3d\(0,-\.7em,0\)/.test(keyframes(css, "cmh-tp-l3")) && /translate3d\(0,\.7em,0\)/.test(keyframes(css, "cmh-tp-l5")) && /\.cmh-tp-btn\{[^}]*overflow:hidden/.test(css))
  check("taps are softer and stay inside their buttons", /\.cmh-tp-tap\{[^}]*rgba\(24,24,27,\.16\)/.test(css) && /\.cmh-tp-pay\{[^}]*overflow:hidden/.test(css))
  check("a 12 second loop, the reset at 8s while the picker is hidden (out by 6.45s, back from 10.3s)", HOW_TIP_LOOP_S === 12 && TIP_RESET_S === 8 && /53\.75%,85\.833%\{opacity:0\}/.test(keyframes(css, "cmh-tp-pick")))
  const names = ["cmh-tp-sel", "cmh-tp-sel-in", "cmh-tp-l3", "cmh-tp-l5", "cmh-tp-tap1", "cmh-tp-tap2", "cmh-tp-tap3", "cmh-tp-press", "cmh-tp-paypress", "cmh-tp-scrim", "cmh-tp-sheet", "cmh-tp-pick", "cmh-tp-thx"]
  check("every tip keyframe moves transform and opacity only", names.every((n) => onlyCompositor(keyframes(css, n))), names.filter((n) => !onlyCompositor(keyframes(css, n))))
  check("reduced motion shows the finished frame", /\.cmh-tp-l5,\.cmh-tp-thx\{opacity:1\}/.test(css) && /\.cmh-tp-l3,\.cmh-tp-pick\{opacity:0\}/.test(css))
}

console.log("\nCopy")
{
  const text = how.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ")
  check("no banned words, no em dash", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform your|—/i.test(text))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

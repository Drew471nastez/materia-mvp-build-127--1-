/**
 * Landing round 11, stability. The owner, on a real iPhone: headings and
 * elements jump and stutter while scrolling up and down.
 *
 * Safari has no scroll anchoring (overflow-anchor is not in WebKit), so a
 * section above the screen that changes height moves everything on screen by
 * as much. Measured in WebKit (iPhone 13, scripts/check-landing-stability.mjs):
 * a skipped box shows its placeholder height (measured in Chromium) until it
 * is first drawn, and WebKit draws the sections a little differently (the
 * checkout 11.7px shorter, the map 12.6 taller, pricing 47 shorter, the
 * questions 29 taller). Read upwards from a page put back halfway down (a
 * reload, a return), each one drawn above the screen moved the screen, up to
 * 12px at once. Chromium anchored the scroll and showed nothing.
 *
 *   kept exactly        a box's real height is kept as its
 *                       contain-intrinsic-size unrounded, from the slicing
 *                       measure, and again as it stops being drawn (the
 *                       observer's entry has it, no layout read)
 *   measured early      a server-drawn box (possibilities, pricing, the
 *                       questions) is laid out once in a calm idle slot and
 *                       kept, not left at its guess until first drawn
 *   held above          where the browser does not anchor the scroll, a box
 *                       wholly above the screen that changes height anyway is
 *                       answered in the same frame (a ResizeObserver runs
 *                       after layout, before paint): the scroll moves by as
 *                       much while the page stands still; during a fling (a
 *                       script scroll on iOS stops it dead) the box's own top
 *                       margin takes it, and is traded for a scroll later
 *
 * After: nothing on screen moved by more than 1px against the scroll in
 * WebKit or Chromium, steady, flung, with the toolbar coming and going,
 * with pictures and fonts 4s late, and read upwards after a restore.
 */
import { readFileSync } from "node:fs"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const src = code("components/marketing/home/lazy-section.tsx")
const fn = (name: string) => src.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}\\n`))?.[0] ?? ""

console.log("\nA box keeps the height it was drawn at, exactly")
{
  const keep = fn("keepHeight")
  check("the measured height is kept unrounded, and the box counts as known", /box\.style\.containIntrinsicSize = `auto \$\{height\}px`/.test(keep) && /known\.add\(box\)/.test(keep) && !/Math\.round/.test(keep))
  check("a mounted section keeps what the slicing measured (no rounding left anywhere)", /const stopSlicing = layOutInSlices\(el, keep\)/.test(src) && /keepHeight\(el, height\)/.test(src) && !/containIntrinsicSize = `auto \$\{Math\.round/.test(src))
  const draw = fn("watchDraw")
  check("as it stops being drawn, it keeps the height the observer's entry has (no layout read)", /if \(!e\.isIntersecting && box\.style\.contentVisibility === "visible" && e\.boundingClientRect\.height > 0\) box\.style\.containIntrinsicSize = `auto \$\{e\.boundingClientRect\.height\}px`/.test(draw))
  check("a box drawn once is known", /if \(e\.isIntersecting\) known\.add\(box\)/.test(draw))
}

console.log("\nServer-drawn boxes are measured while idle, not left at their guess")
{
  const next = fn("settleNext")
  check("laid out unskipped for one read, skipped again in the same task, and kept", /box\.style\.contentVisibility = "visible"\s+const height = box\.getBoundingClientRect\(\)\.height\s+box\.style\.contentVisibility = was\s+keepHeight\(box, height\)/.test(next))
  check("nearest first, one per calm idle slot with room, boxes already known skipped", /farness\(a\) - farness\(b\)/.test(next) && /deadline\.timeRemaining\(\) < IDLE_ROOM_MS\) return idle\(settleNext\)/.test(next) && /known\.has\(b\)/.test(next))
  check("started after load", /void afterLoad\(\)\.then\(\(\) => idle\(settleNext\)\)/.test(fn("settleLater")))
  check("every LazySection box is measured, watched for distance, drawn ahead and held", /settleLater\(el\)\s+const unwatch = watchDistance\(el\)\s+const undraw = watchDraw\(el\)\s+const unhold = holdAbove\(el\)/.test(src))
}

console.log("\nA box that changes height above the screen moves nothing on it")
{
  const hold = fn("holdAbove")
  check("only where the browser does not anchor the scroll itself (a second correction would double it)", /const anchored = \(\) => typeof CSS !== "undefined" && typeof CSS\.supports === "function" && CSS\.supports\("overflow-anchor", "auto"\)/.test(src) && /if \(typeof ResizeObserver !== "function" \|\| anchored\(\)\) return \(\) => \{\}/.test(hold))
  check("answered by a ResizeObserver (after layout, before paint: the same frame)", /holdWatch \?\?= new ResizeObserver\(/.test(hold) && /e\.borderBoxSize\?\.\[0\]\?\.blockSize \?\? e\.contentRect\.height/.test(hold))
  check("only a box that was wholly above the screen (one on screen changed in front of the reader, a question opened)", /if \(box\.getBoundingClientRect\(\)\.top \+ was > 0\) continue/.test(hold))
  check("standing still: the scroll moves by the difference", /if \(calm\(\)\) scrollWith\(h - was\)/.test(hold) && /const calm = \(\) => performance\.now\(\) - lastScroll >= CALM_MS/.test(src))
  check("mid-fling (a script scroll would stop it on iOS): the box's top margin takes it, owed", /const m = \(owed\.get\(box\) \?\? 0\) \+ h - was/.test(hold) && /box\.style\.marginTop = `\$\{-m\}px`/.test(hold) && /idle\(settleOwed\)/.test(hold))
  const owed = fn("settleOwed")
  check("the margin is traded for a scroll once calm, never while that box's top is on screen", /if \(!calm\(\)\) return idle\(settleOwed\)/.test(owed) && /if \(top > -1 && top < window\.innerHeight \+ 1\)/.test(owed) && /box\.style\.marginTop = ""\s+if \(top < 0\) scrollWith\(m\)/.test(owed))
  check("a lazy section is held from its first frame, empty or mounted (React keeps the same box)", /useEffect\(\(\) => \{\s+const el = ref\.current\s+return el \? holdAbove\(el\) : undefined\s+\}, \[\]\)/.test(src))
  check("both kinds of box are held", (src.match(/holdAbove\(el\)/g) || []).length === 2)
}

console.log("\nThe measurement")
{
  const probe = read("scripts/check-landing-stability.mjs")
  check("WebKit and Chromium as an iPhone 13", /webkit,chromium/.test(probe) && /devices\["iPhone 13"\]/.test(probe))
  check("steady, flung, the toolbar coming and going, late pictures and fonts, and a restore read upwards", /scroll,fling,urlbar,slow,restore/.test(probe) && /setViewportSize\(\{ width: 390, height: \(step \/ 3\) % 2 \? 750 : 664 \}\)/.test(probe) && /\["image", "font", "media"\]/.test(probe))
  check("read in the frame, after the page's ResizeObservers and before paint", /new ResizeObserver\(\(\) => \{/.test(probe) && /requestAnimationFrame\(\(\) => \{\s+window\.__probeDone/.test(probe))
  check("fails on anything on screen moved more than 1px against the scroll, or an incomplete run", /r\.maxAnchor > 1 \|\| r\.maxHeadLayout > 1/.test(probe) && /r\.steps < 40/.test(probe))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

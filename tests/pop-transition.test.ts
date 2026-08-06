/**
 * ===========================================================================
 *  THE POP OUT OF A CONVERSATION IS ONE MOVEMENT IN TWO FILES
 * ===========================================================================
 * Coming back from a conversation is two things animating at once:
 *
 *   · a copy of the conversation sliding off to the right   (lib/messages/pop-shot.ts)
 *   · the inbox underneath travelling back from the left    (app/globals.css)
 *
 * They look like two animations and they are not. The second is only allowed to
 * move as far as it does — a quarter of the viewport — BECAUSE the first is
 * covering the edge it would otherwise expose. That containment is exact:
 *
 *     at progress p the copy still covers  [W·p, W]
 *     the gap under the inbox is           [W − X(1−p), W]
 *
 * and the second lies inside the first for every X ≤ W at every p, but only
 * while both run on the same clock. Give them different durations or different
 * easings and the gap outruns the cover somewhere in the middle: a strip of
 * bare layout background, on screen, for a few frames. That artefact shipped
 * three times under three different names before this pair was arrived at, and
 * it is invisible in code review — the two numbers are in different files, in
 * different languages, and each looks perfectly reasonable on its own.
 *
 * So the agreement is a build failure rather than a comment. Changing the feel
 * of the pop is fine; changing it in one file is not.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const root = process.cwd()
const shot = readFileSync(join(root, "lib/messages/pop-shot.ts"), "utf8")
const css = readFileSync(join(root, "app/globals.css"), "utf8")

console.log("\nThe pop: the slide and the parallax must share a clock\n")

// ── The slide, as the module declares it ────────────────────────────────────
const slideMs = /const SLIDE_MS\s*=\s*(\d+)/.exec(shot)
check("pop-shot.ts declares SLIDE_MS", slideMs !== null)

const slideEase = /easing:\s*"(cubic-bezier\([^"]+\))"/.exec(shot)
check("pop-shot.ts declares an easing for the slide", slideEase !== null)

// ── The parallax, as the stylesheet declares it ─────────────────────────────
//
// Deliberately matched on the rule that carries `pop-return-deep` — the deep
// variant is the only one that runs alongside the copy, and the only one whose
// timing is load-bearing. The 22px fallback runs alone and may differ.
const deep = /animation:\s*pop-return-deep\s+(\d+)ms\s+(cubic-bezier\([^)]*\))/.exec(css)
check("globals.css animates pop-return-deep with an explicit duration and curve", deep !== null)

if (slideMs && slideEase && deep) {
  check(
    `durations agree (${slideMs[1]}ms)`,
    slideMs[1] === deep[1],
    `        pop-shot.ts SLIDE_MS = ${slideMs[1]}ms\n` +
      `        globals.css pop-return-deep = ${deep[1]}ms\n` +
      `        These must be equal, or the inbox's right edge is uncovered mid-slide.`,
  )
  check(
    `easings agree (${slideEase[1]})`,
    slideEase[1].replace(/\s+/g, "") === deep[2].replace(/\s+/g, ""),
    `        pop-shot.ts  = ${slideEase[1]}\n` +
      `        globals.css = ${deep[2]}\n` +
      `        Different curves cross at different times; the cover has to lead\n` +
      `        the gap at EVERY point, not just at the ends.`,
  )
}

// ── The offset may not exceed the viewport ──────────────────────────────────
//
// The containment holds for X ≤ W. Expressed as a percentage of the same box,
// so anything at or under 100% is safe and the check is that nobody has quietly
// switched it to a unit where that guarantee cannot be read off.
const deepFrom = /@keyframes pop-return-deep\s*\{[^}]*from\s*\{[^}]*translate3d\(\s*(-?[\d.]+)(%|px)/.exec(css)
check("pop-return-deep starts from an offset that can be checked", deepFrom !== null)
if (deepFrom) {
  const value = Math.abs(parseFloat(deepFrom[1]))
  const unit = deepFrom[2]
  check(
    `the parallax offset is within the covered width (${deepFrom[1]}${unit})`,
    unit === "%" ? value <= 100 : value <= 64,
    `        A percentage is of the element's own width, so anything up to 100%\n` +
      `        stays under the copy. A pixel value cannot be checked against the\n` +
      `        viewport here, so it is held to the 64px that is safe on the\n` +
      `        narrowest phone this app supports.`,
  )
}

// ── The two halves must be on one clock, not merely one duration ────────────
//
// Equal durations are not enough, and assuming they were is a bug this file was
// written after and still failed to catch. The copy starts moving on the click;
// the screen underneath cannot start until it MOUNTS, a frame later on a warm
// route and up to a hundred milliseconds on a cold one. Both then run their
// full length from their own start, so the one underneath is still travelling
// after the copy has gone — and for that overhang its right edge is offset with
// nothing covering it. A strip of bare background, at the end of every pop.
//
// The fix is a negative delay: the arriving screen joins an animation already
// in progress instead of starting a second one.
check(
  "pop-shot.ts records when the slide began",
  /slideStart\s*=\s*performance\.now\(\)/.test(shot),
)
check(
  "pop-shot.ts exposes how far in the slide already is",
  /export function popShotElapsed/.test(shot),
)
check(
  "the elapsed reading is null once the slide is over",
  /elapsed\s*>=\s*SLIDE_MS\s*\?\s*null/.test(shot),
  "        Past the end there is nothing to join, and a screen that started a\n" +
    "        25% parallax with no copy over it exposes a quarter of the viewport.",
)
check(
  "globals.css honours a delay rather than always starting from zero",
  /animation-delay:\s*var\(--pop-delay/.test(css),
  "        Without this the deep parallax always plays from its first frame,\n" +
    "        which is the desync above no matter how well the durations match.",
)
check(
  "the delay is cleared when the slide ends",
  /removeProperty\("--pop-delay"\)/.test(shot),
  "        Left set, the next arrival joins an animation that finished long ago.",
)

// ── The class the two sides agree on ────────────────────────────────────────
check(
  "pop-shot.ts sets the class the deep parallax is keyed on",
  /classList\.add\("pop-covered"\)/.test(shot),
)
check(
  "pop-shot.ts removes it again when the slide is over",
  /classList\.remove\("pop-covered"\)/.test(shot),
  "        Left behind, every later arrival on this screen would play the deep\n" +
    "        parallax with nothing covering it — a quarter-screen of background.",
)
check(
  "globals.css keys the deep parallax on pop-covered",
  /html\.pop-return\.pop-covered/.test(css),
)

// ── The copy must never outlive the animation ───────────────────────────────
check(
  "the copy is removed on finish AND on cancel",
  /addEventListener\("finish", done\)/.test(shot) && /addEventListener\("cancel", done\)/.test(shot),
)
check(
  "the copy has a timeout that removes it regardless",
  /setTimeout\(done,\s*SLIDE_MS\s*\+/.test(shot),
  "        A backgrounded tab can pause an animation mid-slide. Without this the\n" +
    "        app is left under a screenshot of a conversation, unusable.",
)
check(
  "an abandoned press drops the copy",
  /export function dropPopShot/.test(shot) && /setTimeout\(dropPopShot/.test(shot),
)

// ── It is a picture, not a screen ───────────────────────────────────────────
check("the copy is inert", /setAttribute\("inert"/.test(shot))
check("the copy is hidden from assistive technology", /setAttribute\("aria-hidden"/.test(shot))
check("the copy takes no pointer events", /pointerEvents\s*=\s*"none"/.test(shot))
check(
  "duplicate ids are stripped from the copy",
  /removeAttribute\("id"\)/.test(shot),
  "        cloneNode copies ids. Two elements with one id breaks every\n" +
    "        getElementById and every label/for pair on the live screen.",
)
check(
  "scroll offsets are carried across",
  /scrollTop\s*=\s*top/.test(shot),
  "        Without this the copy shows the OLDEST message in the thread while\n" +
    "        the screen behind it shows the newest.",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}

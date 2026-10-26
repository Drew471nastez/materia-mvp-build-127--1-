/**
 * ===========================================================================
 *  ROUND 19: THE EDITOR ON A PHONE, AT REST AND UNDER A FINGER
 * ===========================================================================
 * The owner: "no lags, no glitches, optimized for low end devices ... iOS
 * and Android smooth, and scrolling up and down doesn't block with the
 * touchscreen swipe". Measured with scripts/check-wb-touch-r19.mjs, a phone at
 * three device pixels to a CSS pixel with the CPU at a quarter speed:
 *
 *   A LOOP     a closed sheet's height went 453, 454, 453 every frame (its
 *              boxes measure in thirds of a pixel, rounded up), a render and
 *              a move of the sheet each time, for the whole visit
 *   A SPINNER  Publish's security line turned in a closed sheet for a panel
 *              nobody had opened: a style update and new layers every frame
 *   SOUND      a sound context the system would not run was woken on every
 *              key and press, a buffer made each time
 *
 * At rest the main thread went from busy 1813ms of 2000 to about 350; frames
 * dropped while a finger scrolls the canvas from 45% to about 11%.
 *
 * Read from source (comments out). Run with:  npm run test:push
 */
import { existsSync } from "node:fs"
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}`)
  }
}

const sheet = readCode("components/website-builder/mobile-editor-sheet.tsx")
const publish = readCode("components/website-builder/publish-panel.tsx")
const sounds = readCode("lib/website-builder/ask-sounds.ts")
const css = readCode("app/globals.css")

console.log("\nA sheet's height does not chase its own rounding")
check("a change under two pixels is no change", /setContentHeight\(\(was\) => \(was > 0 && Math\.abs\(was - next\) < 2 \? was : next\)\)/.test(sheet))

console.log("\nNothing turns in a sheet that is put away")
check("a closed sheet with no peek pauses what loops in it once it has slid away, and plays it as it opens", /a\.effect\?\.getComputedTiming\(\)\.iterations === Infinity\) a\.pause\(\)/.test(sheet) && /if \(a\.playState === "paused"\) a\.play\(\)/.test(sheet))
check("by the animations, not a style rule tried against every element", !/\[data-sheet-away\]/.test(css) && !/data-sheet-away/.test(sheet))
check("Publish's security spinner turns only while the panel is on screen", /shown && "animate-spin"/.test(publish) && /shown=\{active\}/.test(publish))

console.log("\nThe sound stops asking a context that will not run")
check("the silent unlocking buffer is played once per context", /if \(player\.unlocked === ctx\) return/.test(sounds))
check("and the gestures give up after a few tries", /\+\+player\.tries >= WAKE_TRIES/.test(sounds) && /const WAKE_TRIES = 6/.test(sounds))

console.log("\nThe probes")
const touch = existsSync("scripts/check-wb-touch-r19.mjs") ? readCode("scripts/check-wb-touch-r19.mjs") : ""
check("scripts/check-wb-touch-r19.mjs scrolls the canvas with a finger at a phone's pixels, and measures it at rest", /Input\.dispatchTouchEvent/.test(touch) && /at rest, the main thread is busy under 10% of the time/.test(touch) && /makes a finger wait for script/.test(touch))
check("the probe kit takes a device pixel ratio", /process\.env\.DSF/.test(readCode("scripts/canvas-probe-kit.mjs")))
check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/wb-r19.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

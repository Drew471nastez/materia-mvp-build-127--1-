/**
 * Image geometry — the arithmetic behind every card crop.
 *
 * These drive lib/images/geometry.ts, which is pure for exactly this reason:
 * everything that can actually be WRONG about resizing is numbers, and an
 * off-by-one in a crop rectangle is a sliver of the wrong photo down the edge
 * of every card in the feed — something no amount of looking at one image in a
 * browser reliably catches.
 *
 * Run with:  npm run test:push
 */

import {
  CENTER, LARGE_MAX, THUMB, clampFocal, coverCrop, fitWithin, thumbSizeFor,
} from "../lib/images/geometry"
import { readVariants, cardImage, detailImage, cardDimensions } from "../lib/images/variants"

let passed = 0, failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`) }
}
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  check(name, a === b, `got ${a}\n          want ${b}`)
}
function section(t: string) { console.log(`\n${t}`) }
const near = (a: number, b: number, tol = 0.51) => Math.abs(a - b) <= tol

function run() {
  section("fitWithin — bound the large variant, never upscale")
  eq("a 4000x3000 photo fits inside 1280x1600", fitWithin(4000, 3000, LARGE_MAX), { w: 1280, h: 960 })
  eq("a 3000x4000 portrait is bounded by HEIGHT", fitWithin(3000, 4000, LARGE_MAX), { w: 1200, h: 1600 })
  eq("a small photo is NOT enlarged", fitWithin(400, 500, LARGE_MAX), { w: 400, h: 500 })
  eq("an exactly-sized photo is untouched", fitWithin(1280, 1600, LARGE_MAX), { w: 1280, h: 1600 })
  {
    const r = fitWithin(4000, 3000, LARGE_MAX)
    check("aspect ratio is preserved", near(r.w / r.h, 4000 / 3000, 0.01))
  }
  eq("a degenerate size does not divide by zero", fitWithin(0, 0, LARGE_MAX), { w: 1, h: 1 })

  section("coverCrop — the 4:5 card window")
  {
    // A wide photo: full height, sides cropped.
    const c = coverCrop(4000, 3000, THUMB, CENTER)
    check("a wide photo keeps its full height", c.sh === 3000)
    check("and crops the sides to 4:5", near(c.sw, 3000 * 0.8))
    check("centred horizontally", near(c.sx, (4000 - 3000 * 0.8) / 2))
    check("the window is 4:5", near(c.sw / c.sh, 0.8, 0.001))
  }
  {
    // A tall photo: full width, top/bottom cropped.
    const c = coverCrop(3000, 6000, THUMB, CENTER)
    check("a tall photo keeps its full width", c.sw === 3000)
    check("and crops vertically to 4:5", near(c.sh, 3000 / 0.8))
    check("the window is 4:5", near(c.sw / c.sh, 0.8, 0.001))
  }
  {
    // 4:5 is 0.8 — TALLER than a square, so a square source is the "too wide"
    // case: full height, sides trimmed. (The first version of this test
    // asserted the opposite and was simply wrong about which way 4:5 leans.)
    const c = coverCrop(3000, 3000, THUMB, CENTER)
    check("a square photo keeps its full height", c.sh === 3000)
    check("and is cropped at the sides", near(c.sw, 2400))
  }
  {
    // THE CLAMP — the bug that puts a blank band across a card.
    const top = coverCrop(3000, 6000, THUMB, { x: 0.5, y: 0 })
    eq("focus at the very top clamps to the top edge", top.sy, 0)
    const bottom = coverCrop(3000, 6000, THUMB, { x: 0.5, y: 1 })
    check("focus at the very bottom clamps to the bottom edge", near(bottom.sy, 6000 - bottom.sh))
    check("and never runs past it", bottom.sy + bottom.sh <= 6000 + 0.01)
    const left = coverCrop(6000, 3000, THUMB, { x: 0, y: 0.5 })
    eq("focus at the far left clamps to 0", left.sx, 0)
    const right = coverCrop(6000, 3000, THUMB, { x: 1, y: 0.5 })
    check("focus at the far right stays inside", right.sx + right.sw <= 6000 + 0.01)
  }
  {
    // The window is 3750 tall on a 6000-tall photo, so its centre can only
    // travel between 1875 and 4125. y=0.4 (2400) is inside that; y=0.25 is not
    // and would be clamped — which is correct behaviour, not a bug, and is
    // covered by the clamp assertions above.
    const c = coverCrop(3000, 6000, THUMB, { x: 0.5, y: 0.4 })
    const centre = c.sy + c.sh / 2
    check("a reachable focal point is honoured exactly", near(centre, 6000 * 0.4, 1))
  }

  section("clampFocal — a focal point out of jsonb is untrusted")
  eq("a normal point passes through", clampFocal({ x: 0.3, y: 0.7 }), { x: 0.3, y: 0.7 })
  eq("out of range is clamped", clampFocal({ x: -5, y: 99 }), { x: 0, y: 1 })
  eq("NaN falls back to centre", clampFocal({ x: NaN, y: 0.2 }), { x: 0.5, y: 0.2 })
  eq("null is the centre", clampFocal(null), { x: 0.5, y: 0.5 })
  eq("a string is the centre", clampFocal({ x: "0.2" } as any), { x: 0.5, y: 0.5 })

  section("thumbSizeFor — capped, and never upscaled")
  eq("a big photo gets the full 800x1000", thumbSizeFor(4000, 3000), { w: 800, h: 1000 })
  eq("a big portrait too", thumbSizeFor(3000, 6000), { w: 800, h: 1000 })
  {
    const s = thumbSizeFor(300, 300)
    check("a small photo is not blown up", s.w < 800 && s.h < 1000)
    check("but keeps the 4:5 card shape", near(s.w / s.h, 0.8, 0.02))
  }

  section("variants — reading the jsonb column safely")
  eq("a non-array is empty", readVariants({ large: "x" }), [])
  eq("null is empty", readVariants(null), [])
  eq("an entry with no large is dropped", readVariants([{ thumb: "t" }]), [])
  {
    const v = readVariants([{ large: "L", thumb: "T", width: 1280, height: 1600, thumbWidth: 800, thumbHeight: 1000, focal: { x: 2, y: 0.3 } }])
    eq("a good entry survives", v.length, 1)
    eq("and its focal point is clamped", v[0].focal, { x: 1, y: 0.3 })
    eq("dimensions are kept", [v[0].width, v[0].thumbHeight], [1280, 1000])
  }
  eq("a garbage width becomes null", readVariants([{ large: "L", width: -3 }])[0].width, null)

  section("variants — THE FALLBACK RULE (this is what keeps old listings alive)")
  const withBoth = readVariants([{ large: "L", thumb: "T" }])
  const largeOnly = readVariants([{ large: "L" }])
  eq("a card prefers the thumbnail", cardImage(withBoth, "OLD"), "T")
  eq("a card falls back to large when there is no thumb", cardImage(largeOnly, "OLD"), "L")
  eq("a card falls back to the ORIGINAL url when there are no variants", cardImage([], "OLD"), "OLD")
  eq("and to null when there is nothing at all", cardImage([], null), null)
  eq("a detail page always takes the large one", detailImage(withBoth, "OLD"), "L")
  eq("even though the thumb exists", detailImage(withBoth, "OLD") !== "T", true)
  eq("detail falls back to the original url too", detailImage([], "OLD"), "OLD")

  section("card dimensions — reserving the box before load")
  eq("real dimensions are used when known", cardDimensions({ large: "L", thumbWidth: 640, thumbHeight: 800 }), { width: 640, height: 800 })
  eq("otherwise the house 4:5 size", cardDimensions(null), { width: 800, height: 1000 })
  {
    const d = cardDimensions(null)
    check("and it IS 4:5, so CSS and the attributes agree", near(d.width / d.height, 0.8, 0.001))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { console.log(`\nfailing: ${failures.join(", ")}`); process.exit(1) }
}
run()

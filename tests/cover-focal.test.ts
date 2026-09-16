/**
 * ===========================================================================
 *  POSITIONING THE COVER, IN THE FRAME THAT SHOWS IT
 * ===========================================================================
 * "There should be no slider thing there in the modal. The dragging and
 *  arranging should be only when I upload a cover, that's it only, and it
 *  should be in the same container there, compact and minimal."
 *
 * Two halves, checked two ways.
 *
 * THE MATHS, which is what a drag actually is, runs here as real functions:
 * the inversion, the clamp at both ends, and the fact that a drag is measured
 * from where it STARTED. That last one is not a detail — deriving each move
 * from the previous one accumulates a rounding error per pointermove, and a
 * slow drag across a 600px box ends up somewhere the finger never went.
 *
 * THE SHAPE of the control is read from the source, because "one box, no
 * slider" is a statement about what exists. A second 3:1 frame, or an
 * `<input type="range">` reappearing under it, is exactly the thing being
 * removed and exactly the thing a future edit would put back.
 *
 * The size of the open profile picture is geometry rather than structure, so
 * it is measured in a browser instead: scripts/check-avatar-lightbox.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CENTRE, focalFromDrag, nudge } from "../lib/images/use-focal-drag"

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
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

console.log("\nPositioning the cover\n")

const FRAME = { width: 600, height: 200 }

/**
 * THE PICTURE MOVES THE OPPOSITE WAY TO THE FINGER. Dragging down asks to see
 * what is above, which is a SMALLER y. Getting this backwards is the single
 * most likely way to break the control, and it still looks like it works.
 */
check(
  "dragging down brings what is above into view",
  focalFromDrag(CENTRE, 0, 40, FRAME).y < CENTRE.y,
  `got y ${focalFromDrag(CENTRE, 0, 40, FRAME).y} from 50`,
)
check(
  "dragging right brings what is left of it into view",
  focalFromDrag(CENTRE, 60, 0, FRAME).x < CENTRE.x,
  `got x ${focalFromDrag(CENTRE, 60, 0, FRAME).x} from 50`,
)

/** A drag of half the frame is 50 percentage points, in both axes. */
check("half a frame across is half the range", focalFromDrag(CENTRE, -300, 0, FRAME).x === 100)
check("half a frame down is half the range", focalFromDrag(CENTRE, -100, 0, { width: 200, height: 200 }).x === 100)

check("it stops at the top", focalFromDrag(CENTRE, 0, 9999, FRAME).y === 0)
check("it stops at the bottom", focalFromDrag(CENTRE, 0, -9999, FRAME).y === 100)
check("it stops at the left", focalFromDrag(CENTRE, 9999, 0, FRAME).x === 0)
check("it stops at the right", focalFromDrag(CENTRE, -9999, 0, FRAME).x === 100)

/**
 * A FRAME WITH NO SIZE. It happens: the drawer is still opening, or the box
 * has not been laid out. A division by zero here is `Infinity`, which clamps
 * to 0 or 100 and throws the cover to a corner on the first pointermove.
 */
{
  const out = focalFromDrag({ x: 30, y: 70 }, 25, 25, { width: 0, height: 0 })
  check("an unlaid-out frame leaves the point where it was", out.x === 30 && out.y === 70, JSON.stringify(out))
}

/**
 * MEASURED FROM THE START OF THE DRAG. Fifty moves of 6px must land in the
 * same place as one move of 300px, or a slow drag and a fast one over the
 * same distance give different answers.
 */
{
  const inOneGo = focalFromDrag(CENTRE, -300, 0, FRAME)
  let step = CENTRE
  for (let i = 1; i <= 50; i += 1) step = focalFromDrag(CENTRE, -6 * i, 0, FRAME)
  check("a slow drag lands where a fast one does", step.x === inOneGo.x && step.y === inOneGo.y, `${step.x} vs ${inOneGo.x}`)
}

/** The keyboard path, which is what let the slider go. */
check("arrow up moves it up", nudge(CENTRE, "ArrowUp").y < 50)
check("arrow down moves it down", nudge(CENTRE, "ArrowDown").y > 50)
check("arrow left moves it left", nudge(CENTRE, "ArrowLeft").x < 50)
check("arrow right moves it right", nudge(CENTRE, "ArrowRight").x > 50)
check("the arrow keys clamp too", nudge({ x: 0, y: 0 }, "ArrowUp").y === 0 && nudge({ x: 100, y: 100 }, "ArrowRight").x === 100)
check("a key this control does not own is left alone", nudge(CENTRE, "Enter") === null)
check("Tab is not swallowed", nudge(CENTRE, "Tab") === null)

/**
 * ---------------------------------------------------------------------------
 *  THE SHAPE OF THE CONTROL
 * ---------------------------------------------------------------------------
 */
const root = process.cwd()
const editor = readFileSync(join(root, "components/storefront/edit-profile-button.tsx"), "utf8")
const upload = readFileSync(join(root, "components/app/image-upload.tsx"), "utf8")

check(
  "no slider under the cover",
  !/type="range"/.test(editor) && !/type="range"/.test(upload),
  "an <input type=range> is back under the picture",
)
check(
  "there is one cover frame, not two",
  (editor.match(/aspectRatio="cover"/g) || []).length === 1 && !/CoverFocalPicker/.test(editor),
  "a second 3:1 box showing the same photograph",
)
/**
 * It was `cover ?` — any cover at all. That made the banner a live drag
 * surface every time the drawer was opened for any reason, and on a phone a
 * finger that grazes a 3:1 strip inside a sheet moves the creator's banner
 * with nothing to say it did. Placing a cover is part of ADDING one.
 */
check(
  "the drag reaches the frame only for a cover chosen in this session",
  /reposition=\{\s*cover && cover !== coverUrl/.test(editor),
  'an empty box saying "drag to position" is a control for a thing that does not exist',
)
check(
  "the frame carries the focal point through to the image",
  /objectPosition: focal\.objectPosition/.test(upload),
  "the box would drag without the picture moving",
)
check(
  "the drag surface does not scroll the sheet instead",
  /touch-none/.test(upload),
  "without touch-none the phone scrolls and the control does nothing where it matters most",
)
check(
  "the frame answers the keyboard",
  /tabIndex=\{0\}/.test(upload) && /onKeyDown/.test(readFileSync(join(root, "lib/images/use-focal-drag.ts"), "utf8")),
  "with the slider gone this is the only way in without a pointer",
)

/**
 * THE HOOK IS CALLED ABOVE EVERY EARLY RETURN. `ImageUpload` returns from four
 * different branches depending on `value`, `replaceOnly` and `reposition`, and
 * a hook under one of them is React error #310 — a blank page, not a misplaced
 * control. tests/hook-order covers the class; this covers this file, because
 * this is the file that just grew a fifth branch.
 */
{
  const hookAt = upload.indexOf("useFocalDrag(")
  const firstReturn = upload.search(/\n  if \([^)]*\) \{\n    return \(/)
  check(
    "useFocalDrag is called before the first early return",
    hookAt > 0 && firstReturn > 0 && hookAt < firstReturn,
    `hook at ${hookAt}, first conditional return at ${firstReturn}`,
  )
}

/**
 * ===========================================================================
 *  THE OPEN PROFILE PICTURE
 * ===========================================================================
 * Three things were reported about it in the creator page editor: the X in
 * the corner was cut off, pressing away from the picture did nothing, and it
 * opened too big. All three are measured for real in
 * scripts/check-avatar-lightbox-behaviour, which opens the actual component
 * with the actual Radix dialog and presses it.
 *
 * That probe needs a build and a browser, so it does not run on a push. What
 * is here is the shape of each fix, so putting one back is loud.
 */
{
  const lightboxSource = readFileSync(join(root, "components/storefront/avatar-lightbox.tsx"), "utf8")
  /*
    WITH THE COMMENTS TAKEN OUT. The note in that file explaining why
    `w-screen` was removed contains the word `w-screen`, so "is this class
    gone" matched the explanation of its removal and failed. Anything below
    asking whether code is still present reads the stripped copy; the checks
    about what the code says read the original.
  */
  const lightbox = lightboxSource
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

  /*
    `w-screen` is `100vw`, which INCLUDES the scrollbar; the overlay's
    `inset-0` does not. The panel was therefore wider than the overlay by the
    width of the gutter, and the close control, pinned to the panel's right
    edge, went into it. Measured at 1200px with a 15px scrollbar: overlay
    right 1185, panel right 1200, close right 1188.
  */
  check(
    "the open picture's panel is anchored where the overlay is",
    /className="inset-0 /.test(lightbox),
    "the panel has to be measured against the same box as the overlay",
  )
  check(
    "and not against 100vw, which includes the scrollbar",
    !/w-screen/.test(lightbox),
    "w-screen pushes anything pinned to the right edge into the scrollbar gutter",
  )

  /*
    Radix writes `pointer-events: auto` as an inline style on a modal
    dialog's content, and an inline style beats a class. So the old
    `pointer-events-none` on the panel never applied, the panel swallowed
    every press on empty space, and the dialog only closed on Escape or on
    the X. The ground is handled explicitly now.
  */
  check(
    "pressing the ground closes it, on the element the press reaches",
    /onPointerDown=\{\(e\) => \{\s*pressStartedOnGround\.current = e\.target === e\.currentTarget/.test(lightbox) &&
      /pressStartedOnGround\.current && e\.target === e\.currentTarget\) setOpen\(false\)/.test(lightbox),
    "without both halves, a drag off the photograph would close it too",
  )
  check(
    "and not by a class the library overrides inline",
    !/className="pointer-events-none/.test(lightbox),
    "pointer-events-none on the panel reads as working and does nothing",
  )

  /*
    420px was inside every percentage guard the size probe had and was still
    too big, twice reported. The cap is the number that bites on a big
    screen, so the cap is what is pinned here and in the probe.
  */
  const cap = lightbox.match(/width: "min\([^)]*?(\d+)px\)"/)?.[1]
  check(
    "the open picture is capped at 320px across",
    cap === "320",
    `the cap reads ${cap ?? "nothing"}. scripts/check-avatar-lightbox asserts the same number.`,
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}

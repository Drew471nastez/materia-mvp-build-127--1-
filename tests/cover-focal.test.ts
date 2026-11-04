/**
 * ===========================================================================
 *  POSITIONING AND ZOOMING THE COVER, IN THE FRAME THAT SHOWS IT
 * ===========================================================================
 * "There should be no slider thing there in the modal. The dragging and
 *  arranging should be only when I upload a cover, that's it only, and it
 *  should be in the same container there, compact and minimal."
 *
 * And later: "the cover banner image is glitching sometimes. Zoom in / zoom
 * out should work on phones, by touch fingers, no sliders."
 *
 * Two halves, checked two ways.
 *
 * THE MATHS, which is what a gesture actually is, runs here as real
 * functions from lib/images/cover-crop: the inversion (the picture follows
 * the finger), the clamp that keeps the photograph over the whole frame at
 * every step, the pinch that keeps the point under the fingers where it is,
 * and the fact that a gesture is measured from where it STARTED.
 *
 * THE SHAPE of the control is read from the source, because "one box, no
 * slider, no render per move" is a statement about what exists.
 *
 * The geometry in a real browser, fingers included, is
 * scripts/check-cover-crop.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  COVER_ZOOM_MAX,
  DEFAULT_COVER_CROP,
  coverCropStyle,
  cropFromGesture,
  cropFromSettings,
  cropFromTransform,
  imageRect,
  imageRectStyle,
  isDefaultCrop,
  clampPercent,
  roundCrop,
  transformBetween,
  zoomAbout,
  type CoverCrop,
} from "../lib/images/cover-crop"

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

console.log("\nPositioning and zooming the cover\n")

/* A 2:1 band (a phone, 390 by 192ish) holding a 4:3 photograph. */
const FRAME = { w: 400, h: 200 }
const PHOTO = { w: 1600, h: 1200 }
const C = DEFAULT_COVER_CROP

const drag = (from: CoverCrop, dx: number, dy: number) =>
  cropFromGesture(FRAME, PHOTO, from, { mid: { x: 200, y: 100 }, dist: 0 }, { mid: { x: 200 + dx, y: 100 + dy }, dist: 0 })
const pinch = (from: CoverCrop, at: { x: number; y: number }, scale: number) =>
  cropFromGesture(FRAME, PHOTO, from, { mid: at, dist: 100 }, { mid: at, dist: 100 * scale })

/** Does the photograph cover the frame, to a hundredth of a pixel? */
const covers = (c: CoverCrop) => {
  const r = imageRect(FRAME, PHOTO, c)
  return r.left <= 0.01 && r.top <= 0.01 && r.left + r.width >= FRAME.w - 0.01 && r.top + r.height >= FRAME.h - 0.01
}

/**
 * THE PICTURE FOLLOWS THE FINGER. Dragging down brings what is above into
 * view, which is a SMALLER y. Getting this backwards is the single most
 * likely way to break the control, and it still looks like it works.
 */
check("dragging down brings what is above into view", drag(C, 0, 40).y < 50, `got y ${drag(C, 0, 40).y}`)
{
  const zoomed = { ...C, zoom: 2 }
  check("dragging right brings what is left of it into view", drag(zoomed, 60, 0).x < 50, `got x ${drag(zoomed, 60, 0).x}`)
}
/** 1:1: the photograph moves exactly as far as the finger. */
{
  const zoomed = { ...C, zoom: 2 }
  const before = imageRect(FRAME, PHOTO, zoomed)
  const after = imageRect(FRAME, PHOTO, drag(zoomed, 37, -21))
  check(
    "the picture moves exactly as far as the finger",
    Math.abs(after.left - before.left - 37) < 0.01 && Math.abs(after.top - before.top + 21) < 0.01,
    `moved ${after.left - before.left}, ${after.top - before.top}`,
  )
}

/* At zoom 1 a 4:3 photo in a 2:1 band has nothing to crop sideways. */
check("an axis with nothing to crop keeps its position", drag(C, 80, 0).x === 50)

check("it stops at the top", drag(C, 0, 9999).y === 0)
check("it stops at the bottom", drag(C, 0, -9999).y === 100)
{
  const z = { ...C, zoom: 3 }
  check("it stops at the left", drag(z, 9999, 0).x === 0)
  check("it stops at the right", drag(z, -9999, 0).x === 100)
}

/**
 * THE PHOTOGRAPH ALWAYS COVERS THE FRAME. Four hundred random gestures, each
 * a drag and a pinch together, from random starting crops: not one of them
 * may uncover a pixel of the frame, and none may leave the zoom range.
 */
{
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  let worst = ""
  let ok = true
  for (let i = 0; i < 400; i++) {
    const start = { x: rnd() * 100, y: rnd() * 100, zoom: 1 + rnd() * 3 }
    const from = { mid: { x: rnd() * 400, y: rnd() * 200 }, dist: 20 + rnd() * 200 }
    const now = { mid: { x: rnd() * 1200 - 400, y: rnd() * 600 - 200 }, dist: 5 + rnd() * 600 }
    const out = cropFromGesture(FRAME, PHOTO, start, from, now)
    if (!covers(out) || out.zoom < 1 || out.zoom > COVER_ZOOM_MAX || out.x < 0 || out.x > 100 || out.y < 0 || out.y > 100) {
      ok = false
      worst = JSON.stringify({ start, from, now, out })
      break
    }
  }
  check("no gesture ever uncovers the frame or leaves the zoom range", ok, worst)
}

/** A pinch keeps the point between the fingers where it is. */
{
  const at = { x: 120, y: 70 }
  const before = imageRect(FRAME, PHOTO, C)
  const u = (at.x - before.left) / before.width
  const v = (at.y - before.top) / before.height
  const out = pinch(C, at, 1.8)
  const after = imageRect(FRAME, PHOTO, out)
  const ax = after.left + u * after.width
  const ay = after.top + v * after.height
  check("pinching zooms by the change in finger distance", Math.abs(out.zoom - 1.8) < 1e-9, `zoom ${out.zoom}`)
  check("and the point between the fingers stays under them", Math.abs(ax - at.x) < 0.01 && Math.abs(ay - at.y) < 0.01, `${ax}, ${ay}`)
}
check("pinching in past 1 stops at 1", pinch(C, { x: 200, y: 100 }, 0.3).zoom === 1)
check("pinching out stops at the maximum", pinch(C, { x: 200, y: 100 }, 40).zoom === COVER_ZOOM_MAX)

/**
 * MEASURED FROM THE START OF THE GESTURE. Fifty moves of 6px must land where
 * one move of 300px does, or a slow drag and a fast one over the same
 * distance give different answers.
 */
{
  const z = { ...C, zoom: 3 }
  const inOneGo = drag(z, -300, 0)
  let step = z
  for (let i = 1; i <= 50; i += 1) step = drag(z, -6 * i, 0)
  check("a slow drag lands where a fast one does", step.x === inOneGo.x && step.y === inOneGo.y, `${step.x} vs ${inOneGo.x}`)
}

/**
 * THE TRANSFORM UNDER THE FINGER IS EXACT. What the frame shows mid gesture
 * is the rest layout moved by `transformBetween`; it must put the picture
 * precisely where the committed crop will, or the picture jumps on release.
 */
{
  const rest = { x: 30, y: 60, zoom: 1.5 }
  const live = pinch(drag(rest, 25, -10), { x: 300, y: 50 }, 1.4)
  const a = imageRect(FRAME, PHOTO, rest)
  const b = imageRect(FRAME, PHOTO, live)
  const m = transformBetween(FRAME, PHOTO, rest, live).match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([\d.]+)\)/)
  const [tx, ty, k] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN]
  check(
    "the moving picture lands where the committed one is drawn",
    Math.abs(a.left + tx - b.left) < 0.02 && Math.abs(a.top + ty - b.top) < 0.02 && Math.abs(a.width * k - b.width) < 0.05,
    `left ${a.left + tx} vs ${b.left}, width ${a.width * k} vs ${b.width}`,
  )
}

/**
 * THE PAGE DRAWS THE SAME CROP. `coverCropStyle` is what the band renders
 * with. At zoom 1 it must be exactly the old object-fit: cover at its
 * object-position, so no cover saved before zoom existed moves by a pixel.
 */
{
  const s = coverCropStyle({ x: 20, y: 80, zoom: 1 })
  check(
    "zoom 1 is plain object-fit cover, as every saved cover was",
    s.left === "0%" && s.top === "0%" && s.width === "100%" && s.height === "100%" && s.objectFit === "cover" && s.objectPosition === "20% 80%",
    JSON.stringify(s),
  )
  /* The band's box, zoom 2, focal 25/75: 200% square of the band, offset so its 25% point is the band's 25% point. */
  const z = coverCropStyle({ x: 25, y: 75, zoom: 2 })
  check("a zoomed crop is a bigger box, placed, not a transform", z.width === "200%" && z.left === "-25%" && z.top === "-75%" && !("transform" in z), JSON.stringify(z))
  check("and it overrides the image's max-width, or it cannot be bigger", z.maxWidth === "none")
}

check("a crop nobody touched is the default", isDefaultCrop(cropFromSettings(null, undefined)))
check("a stored point with no zoom is zoom 1", cropFromSettings({ x: 10, y: 90 }, undefined).zoom === 1)
check("a zoom out of range from storage is clamped", cropFromSettings({ x: 10, y: 90 }, 99).zoom === COVER_ZOOM_MAX && cropFromSettings(null, -3).zoom === 1)
check("stored precision is two decimals and three", JSON.stringify(roundCrop({ x: 33.33333, y: 66.66666, zoom: 1.23456 })) === '{"x":33.33,"y":66.67,"zoom":1.235}')
check("the frame's own zoom step clamps too", zoomAbout(FRAME, PHOTO, C, 0.5).zoom === 1)

/**
 * NO NaN, WHATEVER ARRIVES. A picture whose size is not known yet (0 by 0),
 * a frame with no shape, a position that is not a number: each is drawn as
 * something finite, never as `NaN%` in a style or a save.
 */
{
  const allFinite = (c: CoverCrop) => [c.x, c.y, c.zoom].every(Number.isFinite)
  check("a position that is not a number is the middle", clampPercent(NaN) === 50 && clampPercent(Infinity) === 50 && roundCrop({ x: NaN, y: 20, zoom: NaN }).x === 50)
  const r0 = imageRect(FRAME, { w: 0, h: 0 }, { x: 30, y: 30, zoom: 2 })
  check("a picture with no size yet has a finite rect", [r0.left, r0.top, r0.width, r0.height].every(Number.isFinite))
  check(
    "and a gesture on it gives a finite crop",
    allFinite(cropFromGesture(FRAME, { w: 0, h: 0 }, C, { mid: { x: 10, y: 10 }, dist: 0 }, { mid: { x: 50, y: 40 }, dist: 0 })),
  )
  const bad = imageRectStyle(NaN, 0, { x: 30, y: 30, zoom: 2 })
  check("a shape that is not a number draws the box instead", !/NaN|Infinity/.test(JSON.stringify(bad)) && bad.objectFit === "cover")
}

/**
 * A GLIDE CAUGHT MID WAY STOPS WHERE IT IS. `cropFromTransform` reads the
 * crop back off a running transform; it has to be the exact inverse of
 * `transformBetween` or a finger landing on a double tap's glide jumps the
 * picture. Round-tripped over a spread of crops.
 */
{
  let worst = 0
  for (const rest of [C, { x: 20, y: 80, zoom: 1.5 }, { x: 90, y: 10, zoom: 3 }]) {
    for (const live of [{ x: 40, y: 60, zoom: 2 }, { x: 0, y: 100, zoom: 1 }, { x: 75, y: 25, zoom: 4 }]) {
      const t = transformBetween(FRAME, PHOTO, rest, live)
      const m = t.match(/translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\) scale\(([\d.]+)\)/)!
      const back = cropFromTransform(FRAME, PHOTO, rest, { tx: Number(m[1]), ty: Number(m[2]), k: Number(m[3]) })
      const ox = imageRect(FRAME, PHOTO, live).width - FRAME.w
      const oy = imageRect(FRAME, PHOTO, live).height - FRAME.h
      if (ox > 1) worst = Math.max(worst, Math.abs(back.x - live.x))
      if (oy > 1) worst = Math.max(worst, Math.abs(back.y - live.y))
      worst = Math.max(worst, Math.abs(back.zoom - live.zoom) * 100)
    }
  }
  check("a running transform reads back as the crop it draws", worst < 0.2, `worst difference ${worst}`)
}

/**
 * ---------------------------------------------------------------------------
 *  THE SHAPE OF THE CONTROL
 * ---------------------------------------------------------------------------
 */
const root = process.cwd()
const strip = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const editor = readFileSync(join(root, "components/storefront/edit-profile-button.tsx"), "utf8")
const upload = readFileSync(join(root, "components/app/image-upload.tsx"), "utf8")
const frameSrc = readFileSync(join(root, "components/app/cover-crop-frame.tsx"), "utf8")
const frame = strip(frameSrc)
const route = readFileSync(join(root, "app/api/creator-profile/route.ts"), "utf8")
const band = readFileSync(join(root, "components/store-builder/unified-section-renderer.tsx"), "utf8")

check(
  "no slider under the cover",
  !/type="range"/.test(editor) && !/type="range"/.test(upload) && !/type="range"/.test(frameSrc),
  "an <input type=range> is back under the picture",
)
check(
  "there is one cover frame, not two",
  (editor.match(/aspectRatio="cover"/g) || []).length === 1 && !/CoverFocalPicker/.test(editor),
  "a second 3:1 box showing the same photograph",
)
/**
 * The owner asked for pinch and drag on the banner that is there, not only a
 * new one. The frame always draws the saved crop, so it shows what the page
 * shows, and a finger places any cover; nothing is kept until Save.
 */
check(
  "any cover can be placed, not only one chosen in this session",
  /* In a memoised object now (coverReposition), so the brace after it is useMemo's, not JSX's. */
  /editable: !!cover \}(\}|\))/.test(editor),
  "an existing banner that cannot be zoomed or moved",
)
/* One statement a line since the handler became a stable callback (onCoverChange). */
check("a new picture starts from the middle at its own size", /setCover\(url\);?\s*setCrop\(DEFAULT_COVER_CROP\)/.test(editor))
check(
  "position and zoom are saved together, and nothing is stored for an untouched cover",
  /coverFocalPoint: isDefaultCrop\(crop\) \? null/.test(editor) && /coverZoom: crop\.zoom > 1 \? crop\.zoom : null/.test(editor),
)

/**
 * NO RENDER PER MOVE. The old drag called the parent's setState on every
 * pointermove, which re-rendered the whole profile form under the finger:
 * the "glitching". A move writes a transform in a frame callback; React is
 * told when the last finger lifts.
 */
{
  const move = frame.slice(frame.indexOf("const onPointerMove"), frame.indexOf("const onPointerEnd"))
  check("a move writes a transform in a frame callback, not React state", /schedule\(\)/.test(move) && !/onChange|setMoving\(|setNatural\(/.test(move.replace(/startMoving\(\)/g, "")))
  check("the parent hears once, on release", /commit\(liveRef\.current\)/.test(frame) && /notify\?\.\(rounded\)/.test(frame))
  check("and the paint is transform only", /img\.style\.transform = transformBetween/.test(frame))
}
check("two fingers pinch", /pts\.length > 1 \? Math\.hypot/.test(frame))
check("a trackpad pinch (ctrl + wheel) zooms, a plain wheel scrolls the form", /if \(!e\.ctrlKey && !e\.metaKey\) return/.test(frame) && /addEventListener\("wheel", onWheel, \{ passive: false \}\)/.test(frame))
check("Safari's trackpad gesture events zoom too", /addEventListener\("gesturechange"/.test(frame))
check("a double tap zooms in and back out", /DOUBLE_TAP_ZOOM/.test(frame))
check("the keyboard can do all of it", /case "ArrowLeft"/.test(frame) && /case "\+"/.test(frame) && /case "-"/.test(frame))
check(
  "the frame keeps its touches: touch-action none, and the sheet's own opt-out",
  /* Changed on purpose (r51): the gesture props are one object shared by the frame and the taller stage */ /touchAction: editable \? "none"/.test(frame) && /"data-sheet-no-drag": editable \? "" : undefined/.test(frame) && /\{\.\.\.gestureProps\}/.test(frame),
  "without both, a pinch scrolls the form or pulls the sheet down",
)
check(
  "the frame is not a .group, whose transforms globals.css strips on a phone",
  !/className=\{?`?[^`"]*\bgroup\b/.test(frame.slice(frame.indexOf("return (\n    <div"))),
)
check("one eager <img> at one URL, not a lazy next/image", /loading="eager"/.test(frame) && !/from "next\/image"/.test(frameSrc) && /coverEditorSrc\(value\)/.test(upload))
check("uploading is a thin bar, not a dark wash over the picture", !/bg-black\/55 backdrop-blur-\[1px\]/.test(upload.slice(upload.indexOf("if (value && replaceOnly && reposition)"), upload.indexOf("if (value && replaceOnly) {"))))
check("the corner controls are 44px to a thumb", /before:-inset-1\.5/.test(upload))

/**
 * THE HANDLERS READ THE LATEST PROPS, SO THEY ARE NEVER RE-MADE MID GESTURE.
 * `commit` used to depend on the crop and the aspect, which re-bound the
 * native wheel listeners on every change and dropped the timer that ends a
 * trackpad pinch: the frame was then stuck "moving", ignoring every value
 * the parent sent, Reset included.
 */
check("the hand-back reads refs and is made once", /const commit = React\.useCallback\(\(next: CoverCrop\) => \{[\s\S]*?cropRef\.current[\s\S]*?aspectRef\.current[\s\S]*?\}, \[\]\)/.test(frame))
check("a pinch still settling is finished when its listeners go, not dropped", /window\.clearTimeout\(wheelTimer\.current\)\s*wheelTimer\.current = null\s*if \(pointers\.current\.size === 0\) \{[\s\S]{0,120}commit\(liveRef\.current\)/.test(frame))
check("with nobody to tell, the picture goes back to the parent's crop", /const rounded = notify \? roundCrop\(next\) : current/.test(frame))
check("a finger on a glide stops it where it is, read off the running transform", /cropFromTransform\(f, n, restRef\.current/.test(frame))
check("a value from outside abandons a running glide (Reset during a double tap's glide)", /const running = animRef\.current\s*if \(running\) \{\s*animRef\.current = null\s*running\.anim\.cancel\(\)/.test(frame))
check("a capture taken away ends the finger, and only a real up is a tap", /* Changed on purpose (r51) */ /onLostPointerCapture: onPointerEnd/.test(frame) && /if \(e\.type !== "pointerup"\) return/.test(frame))
check("a picture's shape needs both sides before a gesture uses it", /img\.naturalWidth > 0 && img\.naturalHeight > 0/.test(frame))
check(
  "sideways, the frame is capped by height so the form around it still scrolls",
  /landscape:max-w-\[calc\(30vh\*var\(--cover-aspect\)\)\]/.test(frame) && /\["--cover-aspect" as string\]: String\(aspect\)/.test(frame),
  "scripts/check-cover-crop measures it at 667x375",
)

/**
 * REMOVE IS A CHANGE TO THE FORM. The X used to delete the file from storage
 * before Save, so Remove then Cancel left the live page pointing at a file
 * that was gone, and a builder draft deleted what the published page drew.
 */
{
  const remove = upload.slice(upload.indexOf("const handleRemove"), upload.indexOf("const handleDrop"))
  check("removing a picture does not delete the file before anything is saved", !/storage/.test(strip(remove)) && /onChange\(null\)/.test(remove))
}

/** THE SERVER CLAMPS WHAT A PUBLIC PAGE WILL DRAW. */
check("the route clamps the zoom it stores", /clampZoom\(raw\)/.test(route) && /next\.coverZoom = coverZoom \?\? undefined/.test(route))
check("and keeps two decimals of position", /Math\.round\(clampPercent\(n\) \* 100\) \/ 100/.test(route))
check(
  "an image URL that will not clean is ignored, not written as a clear",
  /return cleanUrl\(body\[key\]\) \?\? undefined/.test(route) && /const coverUrl = imageField\("coverUrl"\)/.test(route),
  "a bad value used to come out of the cleaner as null and delete the cover",
)
check(
  "a cover removed or replaced without a crop of its own starts from the middle at zoom 1",
  /if \(coverUrl !== undefined && \(coverUrl \?\? undefined\) !== header\.coverImageUrl\) \{\s*if \(coverFocalPoint === undefined\) next\.coverFocalPoint = undefined\s*if \(coverZoom === undefined\) next\.coverZoom = undefined/.test(route),
)
{
  const sidebar = readFileSync(join(root, "components/store-builder/sections-sidebar.tsx"), "utf8")
  const canvas = readFileSync(join(root, "components/store-builder/preview-canvas.tsx"), "utf8")
  check("the builder's cover thumbnail draws the zoom too", /coverCropStyle\(cropFromSettings\(settings\.coverFocalPoint, settings\.coverZoom\)\)/.test(sidebar))
  check(
    "every builder path that places a new cover at zoom 1 says so",
    (sidebar.match(/coverZoom: undefined/g) || []).length === 3 && /coverFocalPoint: focalPoint,\s*coverZoom: undefined/.test(canvas),
  )
}
check("the sheet's copy has no em dash in what a creator reads", !/setError\("[^"]*—/.test(editor) && !/either way —/.test(editor))

/** THE PAGE DRAWS WHAT THE FRAME DREW. */
check("the band draws the crop from the same function", /coverCropStyle\(crop\)/.test(band) && /cropFromSettings\(settings\.coverFocalPoint, settings\.coverZoom\)/.test(band))
check("and asks for pixels in proportion to the zoom", /sizes=\{coverSizes\(crop\.zoom\)\}/.test(band))

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

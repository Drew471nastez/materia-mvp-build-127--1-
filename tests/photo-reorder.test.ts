/**
 * ===========================================================================
 *  PICKING A PHOTO UP AND PUTTING IT SOMEWHERE ELSE
 * ===========================================================================
 *
 * Which photograph is first is the single most consequential decision on the
 * sell form — it is the one the whole marketplace sees — and until recently the
 * only way to change it was a drag that a finger could not perform, under a
 * caption that said it could.
 *
 * Two halves are checked here. The pure one — moveItem and indexAtPoint — is
 * run for real, because "did the reorder do the right thing" is arithmetic and
 * needs no browser. The half that IS the browser is checked by reading the
 * component, because the failures it has actually had were all structural:
 * capture on a node React was about to move, a hit test against geometry the
 * answer itself changes, a scale on the element being measured.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { indexAtPoint, moveItem, type Box } from "../lib/sell/reorder"

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

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const form = strip(read("components/sell/new-listing-form.tsx"))

console.log("\nThe arithmetic of moving one thing past another")

check(
  "moving a photo to the front makes it the cover",
  moveItem(["a", "b", "c", "d"], 2, 0).join("") === "cabd",
)

check(
  "moving forwards closes the gap behind it",
  // The classic off-by-one: splice out first, THEN insert, or a move to a later
  // index lands one short of where the finger was.
  moveItem(["a", "b", "c", "d"], 0, 2).join("") === "bcad",
)

check(
  "a move to where it already is returns the SAME array",
  (() => {
    const list = ["a", "b", "c"]
    return moveItem(list, 1, 1) === list
  })(),
  "        Identity is what lets the caller skip a render on a no-op swap.",
)

check(
  "an out-of-range move changes nothing",
  (() => {
    const list = ["a", "b", "c"]
    return moveItem(list, 5, 0) === list && moveItem(list, 0, 9) === list && moveItem(list, -1, 0) === list
  })(),
)

check(
  "the original array is never mutated",
  (() => {
    const list = ["a", "b", "c"]
    moveItem(list, 2, 0)
    return list.join("") === "abc"
  })(),
)

console.log("\nWhich slot the finger is over")

/** Three across, 100px tiles, 10px gutters — the sell grid, roughly. */
const grid: Box[] = [0, 1, 2, 3, 4, 5].map((i) => {
  const col = i % 3
  const row = Math.floor(i / 3)
  const left = col * 110
  const top = row * 150
  return { left, top, right: left + 100, bottom: top + 133 }
})

check(
  "a pointer in the middle of a tile is over that tile",
  indexAtPoint(grid, 50, 66) === 0 && indexAtPoint(grid, 270, 216) === 5,
)

check(
  "a pointer in the GUTTER still answers, and answers the nearer side",
  (() => {
    // Nearest centre rather than "inside a rectangle". A finger in the 10px
    // gutter is inside neither tile, and a hit test that answers "none" there
    // makes the drag stall exactly where you are trying to drop.
    const leftOfGap = indexAtPoint(grid, 104, 66)
    const rightOfGap = indexAtPoint(grid, 116, 66)
    return leftOfGap === 0 && rightOfGap === 1
  })(),
)

check(
  "a pointer off the grid entirely still answers with the nearest tile",
  indexAtPoint(grid, -400, -400) === 0 && indexAtPoint(grid, 9999, 9999) === 5,
  "        Dragging into the empty slots past the last photo has to park it at\n" +
    "        the end rather than stall.",
)

check(
  "an empty grid answers -1 rather than 0",
  indexAtPoint([], 10, 10) === -1,
)

console.log("\nStarting a drag without stealing the scroll")

check(
  "a finger has to hold; a mouse only has to move",
  (() => {
    // touch-action cannot express this, because it is read once at touch-start
    // and the decision is made 180ms later.
    return (
      /const HOLD_MS = \d+/.test(form) &&
      /const TOUCH_SLOP = \d+/.test(form) &&
      /const MOUSE_SLOP = \d+/.test(form) &&
      /if \(far > TOUCH_SLOP\) release\(false\)/.test(form) &&
      /if \(far < MOUSE_SLOP\) return\s*\n\s*begin\(d\.id\)/.test(form)
    )
  })(),
  "        Otherwise the whole tile is either undraggable or unscrollable.",
)

check(
  "a finger that moves before the hold gets its scroll back",
  // Not "cancel the drag and swallow the gesture" — the browser has to be left
  // holding a perfectly ordinary scroll, which means not preventing anything.
  /if \(drag\.current\?\.active && e\.cancelable\) e\.preventDefault\(\)/.test(form),
)

check(
  "the touchmove listener is registered at pointerdown, not at commit",
  (() => {
    // preventDefault can only stop a scroll that has not started. Registering
    // the listener when the hold fires is registering it one frame after the
    // only moment it could have worked.
    const arm = form.slice(form.indexOf("function arm("), form.indexOf("return {\n      /**"))
    return (
      /addEventListener\("touchmove", blockScroll, \{ passive: false \}\)/.test(arm) &&
      arm.indexOf('addEventListener("touchmove"') < arm.indexOf("hold.current = window.setTimeout")
    )
  })(),
)

check(
  "a press on a chip is that chip, not the start of a drag",
  // Delete and "Copertă" are buttons sitting on the tile; a slow tap on one of
  // them would otherwise cross HOLD_MS and pick the photo up instead.
  /if \(t\?\.closest\("button, a, input, textarea"\)\) return/.test(form),
)

check(
  "a drag that ends over the bin does not also press the bin",
  (() => {
    // pointerup is followed by a click on whatever is underneath, which after a
    // drag is a tile you never aimed at.
    return /function swallowNextClick\(\)/.test(form) && /swallowNextClick\(\)/.test(form.slice(form.indexOf("function release(")))
  })(),
)

check(
  "the grip still starts a drag on the first pixel",
  /grip: \(id: string\) => \(e: React\.PointerEvent\) => \{[\s\S]{0,200}?arm\(id, e, true\)/.test(form),
)

check(
  "one photo is not reorderable, and neither is one still uploading",
  /if \(!photo \|\| photo\.uploading \|\| photosRef\.current\.length < 2\) return/.test(form),
)

console.log("\nStaying under the finger")

check(
  "pointer capture is not used",
  (() => {
    // It fails on the very FIRST swap: reordering a keyed list makes React move
    // the existing DOM nodes, moving a node detaches it, and a detached element
    // loses its capture. The listeners go on window, which cannot be reordered
    // out from under them.
    return (
      !/setPointerCapture/.test(form) &&
      /window\.addEventListener\("pointermove", onMove, \{ passive: false \}\)/.test(form)
    )
  })(),
)

check(
  "the hit test runs against slots measured ONCE, not against the live tiles",
  (() => {
    // Testing against the tiles oscillates, because reordering moves them: the
    // geometry you are asking about is changed by the answer you just gave.
    // A trace of one steady upward drag came out 3→4, 4→3, 3→0, 0→3, 3→0.
    const frame = form.slice(form.indexOf("const frame = useCallback"), form.indexOf("const schedule = useCallback"))
    return /indexAtPoint\(slots\.current, d\.x, d\.y\)/.test(frame)
  })(),
)

check(
  "the slots are measured when the drag COMMITS, not when the finger lands",
  (() => {
    const begin = form.slice(form.indexOf("function begin("), form.indexOf("function onMove("))
    return /slots\.current = photosRef\.current\.map/.test(begin) && /d\.originIndex = at/.test(begin)
  })(),
)

check(
  "the dragged tile's offset is computed from its slot, not re-anchored a frame late",
  (() => {
    // The old version cleared the transform, forced a reflow and treated the
    // pointer as a new grab point inside a rAF — three main-thread writes per
    // swap, and one frame in which the tile is drawn a whole slot from the
    // finger. A transform is relative to where LAYOUT put the element, so the
    // offset that keeps it under the finger is closed-form.
    const paint = form.slice(form.indexOf("const paintDragged = useCallback"), form.indexOf("useLayoutEffect(() => {"))
    return (
      /const home = slots\.current\[d\.originIndex\]/.test(paint) &&
      /const cx = home && now \? home\.left - now\.left : 0/.test(paint) &&
      !/offsetWidth/.test(paint)
    )
  })(),
)

check(
  "and it is recomputed in the same commit that moved it",
  (() => {
    // A passive effect, or a rAF, is a frame in which the tile has already been
    // laid out in its new slot while still carrying the old offset.
    const fx = form.slice(form.indexOf("useLayoutEffect(() => {"))
    return fx.indexOf("paintDragged()") < fx.indexOf("const before = flipFrom.current")
  })(),
)

check(
  "moves are coalesced into one write per frame",
  (() => {
    // A finger on a 120Hz screen outruns the compositor, and the expensive half
    // is the hit test, because a swap re-renders the form.
    return (
      /const schedule = useCallback\(\(\) => \{\s*\n\s*if \(frameId\.current\) return/.test(form) &&
      /frameId\.current = requestAnimationFrame\(frame\)/.test(form)
    )
  })(),
)

check(
  "the tile that is moving is the one that is skipped by the FLIP",
  (() => {
    const fx = form.slice(form.indexOf("const before = flipFrom.current"))
    return /if \(id === dragging\) return/.test(fx.slice(0, 900))
  })(),
)

check(
  "the FLIP ends on an identity transform, not on `none`",
  (() => {
    // `none` removes the transform outright, which takes the element off its
    // compositor layer ON THE LAST FRAME of the movement.
    const fx = form.slice(form.indexOf("const before = flipFrom.current"))
    const body = fx.slice(0, 1200)
    return /el\.style\.transform = "translate3d\(0, 0, 0\)"/.test(body) && !/el\.style\.transform = ""\s*\n\s*\}\)/.test(body)
  })(),
)

console.log("\nThe scale is not on the thing being measured")

check(
  "the measured element carries the translate; a separate one carries the lift",
  (() => {
    // A scaled rect would poison both the slot measurement and the FLIP, and
    // every number in the drag would be 6% wrong. The outer div is the grid
    // cell and nothing else.
    const tile = form.slice(form.indexOf("ref={(el) => setTileEl(p.id, el)}"))
    const outer = tile.slice(0, 400)
    return (
      /className="relative aspect-\[3\/4\] select-none \[-webkit-touch-callout:none\]"/.test(outer) &&
      !/scale-\[1\.06\]/.test(outer) &&
      /scale-\[1\.06\]/.test(tile.slice(0, 1400))
    )
  })(),
)

check(
  "the lift is a CSS transition, so it is not fighting the imperative translate",
  (() => {
    const tile = form.slice(form.indexOf("ref={(el) => setTileEl(p.id, el)}"), form.indexOf("ref={fileRef}"))
    return /transition-\[transform,box-shadow\] duration-200/.test(tile)
  })(),
)

check(
  "the compositor layer is asked for before the tile starts moving, and released after",
  (() => {
    const begin = form.slice(form.indexOf("function begin("), form.indexOf("function onMove("))
    const release = form.slice(form.indexOf("function release("), form.indexOf("function arm("))
    return /el\.style\.willChange = "transform"/.test(begin) && /el\.style\.willChange = ""/.test(release)
  })(),
)

console.log("\nWhat the grid actually looks like")

check(
  "every slot is drawn, not only the ones with a photo in them",
  (() => {
    // "Add images — max 7", as a row of empty slots rather than one dashed
    // panel that says nothing about how many the listing wants.
    return /\{Array\.from\(\{ length: emptySlots \}\)\.map/.test(form) && /const PHOTO_COLS = 3/.test(form)
  })(),
)

check(
  "the grid is always a complete rectangle",
  (() => {
    // Ported from the component so the arithmetic itself is checked, not the
    // fact that some arithmetic exists.
    const MAX = 8
    const COLS = 3
    const slots = (n: number) =>
      Math.max(0, Math.min(MAX, Math.max(COLS, Math.ceil((n + 1) / COLS) * COLS)) - n)
    return (
      slots(0) === 3 && // an untouched form: one full row of "Adaugă"
      slots(1) === 2 &&
      slots(3) === 3 &&
      slots(5) === 1 &&
      slots(6) === 2 &&
      slots(8) === 0 && // full: no slot promising a ninth photo
      [0, 1, 2, 3, 4, 5, 6, 7, 8].every((n) => (n + slots(n)) % COLS === 0 || n + slots(n) === MAX)
    )
  })(),
)

check(
  "the empty state is the same grid, so nothing rearranges under your thumb",
  (() => {
    // It used to be a full-width dashed panel that was replaced by a grid the
    // moment the first photo landed.
    const section = form.slice(form.indexOf("{photos.length > 0 ? `${photos.length}"), form.indexOf("ref={fileRef}"))
    return !/Adaugă fotografii<\/span>/.test(section) && !/py-10/.test(section) && /grid grid-cols-3/.test(section)
  })(),
)

check(
  "the corners are the app's radius, not a smaller one",
  (() => {
    const section = form.slice(form.indexOf('<div className="mt-3 grid grid-cols-3'), form.indexOf("ref={fileRef}"))
    // rounded-xl is 12px and read as a thumbnail; the cards around it are 16px.
    return !/rounded-xl/.test(section) && (section.match(/rounded-2xl/g) ?? []).length >= 2
  })(),
)

check(
  "the cover says so in the brand colour, and is ringed",
  (() => {
    const section = form.slice(form.indexOf('<div className="mt-3 grid grid-cols-3'), form.indexOf("ref={fileRef}"))
    return /bg-\[#7c3aed\][^"]*text-white/.test(section) && /i === 0 && "ring-\[2\.5px\] ring-\[#7c3aed\]"/.test(section)
  })(),
)

check(
  "no tile chip blurs its backdrop",
  (() => {
    // A backdrop-filter under a transformed ancestor is re-sampled every frame
    // the ancestor moves — and these sit inside BOTH the sheet that slides and
    // the tile that drags. Four per tile against eight photos was the stutter
    // in tests/sheet-motion.test.ts, and this is where it comes back from.
    const section = form.slice(form.indexOf('<div className="mt-3 grid grid-cols-3'), form.indexOf("ref={fileRef}"))
    return !/backdrop-blur/.test(section)
  })(),
)

check(
  "the caption describes the gesture that exists",
  // It promised a drag that a finger could not perform for as long as the drag
  // was HTML5 drag-and-drop.
  /Ține apăsat pe o fotografie și trage ca să schimbi ordinea/.test(form),
)

check(
  "a tap still promotes to cover, for the move everybody actually makes",
  (() => {
    // The only one of the two a keyboard or an assistive device can perform.
    return /makeCover\(p\.id\)/.test(form) && /const makeCover = useCallback/.test(form)
  })(),
)

console.log("\nThe picker, as an object on the page")

check(
  "pressing Adaugă does not make it jump",
  (() => {
    // A tile that shrinks and springs back under a thumb reads as a misfire
    // rather than as feedback: the thing you were aiming at moved. The fill
    // going violet happens where the finger already is and moves nothing.
    const slots = form.slice(form.indexOf("{Array.from({ length: emptySlots })"), form.indexOf("ref={fileRef}"))
    return !/active:scale/.test(slots) && /active:bg-violet-50/.test(slots)
  })(),
)

check(
  "the empty slot's icon is a soft rounded square, not a flat circle",
  (() => {
    // A light grey glyph on a light grey tile disappears; the white ring and
    // the shadow under it are what stop that, and the square is the shape of
    // the thing it stands for.
    const slots = form.slice(form.indexOf("{Array.from({ length: emptySlots })"), form.indexOf("ref={fileRef}"))
    return /rounded-\[15px\] bg-neutral-100/.test(slots) && /ring-\[3px\] ring-white/.test(slots)
  })(),
)

console.log("\nThe reorder, per frame")

check(
  "only the tiles that move are measured",
  (() => {
    // Moving a photo one place left moves exactly two tiles; measuring all
    // eight was six rects nobody read, and every rect is a synchronous layout
    // flush the browser has to serve mid-drag.
    return (
      /const measureTiles = useCallback\(\(lo = 0, hi = Number\.MAX_SAFE_INTEGER\)/.test(form) &&
      /measureTiles\(Math\.min\(from, to\), Math\.max\(from, to\)\)/.test(form) &&
      /flipFrom\.current = measureTiles\(0, at\)/.test(form)
    )
  })(),
)

check(
  "reads are grouped and come before any write",
  (() => {
    // Interleaving getBoundingClientRect with style writes turns one layout
    // flush into one per tile.
    const fn = form.slice(form.indexOf("const measureTiles = useCallback"), form.indexOf("const paintDragged"))
    return !/\.style\./.test(fn)
  })(),
)

check(
  "a moving tile holds a compositor layer, and gives it back",
  (() => {
    // Built before the frame the movement starts on, or the browser builds it
    // ON that frame — the one frame of a 200ms animation anybody notices. And
    // released after, because a promoted layer per tile held for the life of
    // the form is memory the compositor cannot reuse.
    const fx = form.slice(form.indexOf("const before = flipFrom.current"))
    const body = fx.slice(0, 1800)
    return (
      /el\.style\.willChange = "transform"/.test(body) &&
      body.indexOf('el.style.willChange = "transform"') < body.indexOf("requestAnimationFrame") &&
      /"transitionend"/.test(body)
    )
  })(),
)

console.log("\nA page on a monitor, a sheet on a phone")

check(
  "the desktop column grows with the window; the phone one does not",
  (() => {
    // max-w-2xl at 16px gutters is the sheet the phone has always been, and it
    // stays exactly that. Above md it becomes a page.
    return /max-w-2xl px-4 pt-4 sm:pt-9 md:max-w-5xl md:px-6 lg:max-w-6xl lg:px-8/.test(form)
  })(),
)

check(
  "neither desktop column can be blown out by one long value",
  (() => {
    // A grid track is sized by its content unless told otherwise, so an
    // unbroken brand name in a Field row would push the column past the
    // container and take the page's horizontal scrollbar with it.
    return /md:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(0,1fr\)\]/.test(form)
  })(),
)

check(
  "the buttons are not pills",
  (() => {
    // A fully-rounded 48px bar reads as a chip rather than as the primary
    // action of the screen.
    const actions = form.slice(form.indexOf("const actionControls ="), form.indexOf("Publică anunțul"))
    return /rounded-lg bg-\[#7c3aed\]/.test(actions) && !/rounded-full/.test(actions)
  })(),
)

check(
  "and they do not bump either",
  (() => {
    const actions = form.slice(form.indexOf("const actionControls ="), form.indexOf("Publică anunțul"))
    return !/active:scale/.test(actions) && /active:bg-\[#6d28d9\]/.test(actions)
  })(),
)

check(
  "the placeholders name the field rather than writing the listing for you",
  (() => {
    // A worked example in the box is a paragraph you have to read and delete
    // before you can type, and it makes an empty field look full.
    return (
      /placeholder="Titlu"/.test(form) &&
      /placeholder="Descriere"/.test(form) &&
      !/DESCRIPTION_PLACEHOLDER/.test(form)
    )
  })(),
)

check(
  "price is asked before the attribute list, not after it",
  (() => {
    // It is the decision people arrive with and the one they change most; it
    // was sitting under eight rows of pickers.
    return form.indexOf("<SectionHeading>Preț</SectionHeading>") < form.indexOf("<SectionHeading>Detalii</SectionHeading>")
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}

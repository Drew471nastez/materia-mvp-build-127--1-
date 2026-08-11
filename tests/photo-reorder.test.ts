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

import { stripComments } from "./_source"

import { indexAtPoint, moveItem, type Box } from "../lib/sell/reorder"
import {
  brandDirectoryApplies,
  fieldsFor,
  SIZES,
  conditionsFor,
  sizesFor,
} from "../lib/marketplace/listing-taxonomy"

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
const strip = stripComments

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
  "the cover says so, and is ringed — in ink, not in violet",
  (() => {
    // NOTHING in this grid is the brand colour. Every tile is a photograph, and
    // a saturated accent laid over a wall of photographs competes with the only
    // thing on the screen that is supposed to be looked at. Black and white is
    // what a photo grid is set in everywhere it is done well.
    const section = form.slice(form.indexOf('<div className="mt-3 grid grid-cols-3'), form.indexOf("ref={fileRef}"))
    return (
      /bg-neutral-900[^"]*text-white/.test(section) &&
      /i === 0 && "ring-\[2\.5px\] ring-neutral-900"/.test(section) &&
      !/7c3aed/.test(section) &&
      !/violet/.test(section)
    )
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
  "an empty slot is the reference's media tile",
  (() => {
    // A chunky rounded square in light grey, ringed in white with a soft shadow
    // under it — the shape of the thing it stands for. A flat circle read as a
    // generic "add" button rather than as a picture that is not there yet.
    const slots = form.slice(form.indexOf("{Array.from({ length: emptySlots })"), form.indexOf("ref={fileRef}"))
    return (
      /rounded-\[17px\]/.test(slots) &&
      /ring-\[3px\] ring-white/.test(slots) &&
      /shadow-\[0_3px_10px/.test(slots) &&
      !/rounded-full bg-white/.test(slots)
    )
  })(),
)

check(
  "the press animation is still there",
  (() => {
    // Removed once as a fix for a bump nobody had asked to keep, and asked back
    // for twice. It stays through restyles.
    const slots = form.slice(form.indexOf("{Array.from({ length: emptySlots })"), form.indexOf("ref={fileRef}"))
    return /active:scale-\[0\.97\]/.test(slots)
  })(),
)

check(
  "the first empty slot still reads as the one to start on",
  (() => {
    // Eight identical squares say "eight things are missing"; one of them a
    // shade darker says "start here", which is the only thing an empty photo
    // grid has to communicate — and it says it in the greys the photographs
    // themselves will sit in, rather than in a brand colour competing with
    // them.
    const slots = form.slice(form.indexOf("{Array.from({ length: emptySlots })"), form.indexOf("ref={fileRef}"))
    return /bg-neutral-200\/80 text-neutral-600/.test(slots) && /bg-neutral-100 text-neutral-400/.test(slots)
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
  "the placeholders say what to do, and stop there",
  (() => {
    // "Titlu" was the label written twice; a worked example was a paragraph you
    // have to read and then delete before you can type, and it makes an empty
    // field look full. The instruction on its own is the whole of what a
    // placeholder is for.
    return (
      /placeholder="Adaugă un titlu"/.test(form) &&
      /placeholder="Adaugă o descriere"/.test(form) &&
      !/DESCRIPTION_PLACEHOLDER/.test(form) &&
      !/placeholder="[^"]*ex\.:/.test(form)
    )
  })(),
)

check(
  "price is asked before the attribute list, not after it",
  (() => {
    // It is the decision people arrive with and the one they change most; it
    // was sitting under eight rows of pickers.
    //
    // Matched on the heading TEXT rather than on the exact element. This asked
    // for the literal `<SectionHeading>Preț</SectionHeading>` and so began
    // failing the day the component grew an `info` prop and the call sites went
    // multi-line — with `indexOf` returning -1 for both sides, which compares
    // false and reports the ordering as wrong. The ordering had not changed.
    const at = (word: string) => {
      const m = new RegExp(`<SectionHeading[^>]*>\\s*${word}\\s*<`).exec(form)
      return m ? m.index : -1
    }
    const price = at("Preț")
    const details = at("Detalii")
    return price >= 0 && details >= 0 && price < details
  })(),
)

console.log("\nBeing told what is missing, where it is missing from")

check(
  "a gap knows which control it belongs to",
  (() => {
    // It used to be one sentence — "Mai lipsește: titlu, brand, preț." —
    // printed next to the Publish button at the bottom of a form four screens
    // long. The message about the empty title was as far from the title as it
    // is possible to be on that page.
    return /type GapKey =/.test(form) && /const gaps = useMemo/.test(form) && /function GapNote\(/.test(form)
  })(),
)

check(
  "every requirement the publish enforces has an anchor and a note",
  (() => {
    // "compare" is gone with the comparison price itself — see below.
    const keys = ["photos", "title", "description", "category", "brand", "condition", "size", "colour", "price"]
    return keys.every((k) => form.includes(`setGapEl("${k}"`) && form.includes(`gapFor("${k}")`))
  })(),
  "        A gap with no anchor is a gap the form cannot scroll to.",
)

check(
  "a refused publish takes you to the first one",
  (() => {
    const submit = form.slice(form.indexOf("const submit = useCallback"), form.indexOf("const submit = useCallback") + 900)
    return /setShowGaps\(true\)/.test(submit) && /showFirstGap\(gaps\[0\]\.key\)/.test(submit)
  })(),
)

check(
  "the scroll happens after the notes have been laid out",
  (() => {
    // Scrolling to an element that is about to get forty pixels taller lands in
    // the wrong place.
    const fn = form.slice(form.indexOf("const showFirstGap = useCallback"))
    return /requestAnimationFrame\(\(\) => \{[\s\S]{0,160}?scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/.test(
      fn.slice(0, 400),
    )
  })(),
  "        And `center`, because a phone header or a sticky action card would\n" +
    "        otherwise cover what it just scrolled to.",
)

check(
  "nothing is marked until a publish has actually been refused",
  (() => {
    // A form that turns amber while you are still filling it in is telling you
    // off for not having finished yet.
    return /const \[showGaps, setShowGaps\] = useState\(false\)/.test(form) && /if \(!showGaps\) return null/.test(form)
  })(),
)

check(
  "and the CLIENT's one-line summary by the button is gone",
  (() => {
    // It was the whole of the feedback, and it was in the one place on the page
    // that told you nothing about where to go. The server's own rejection still
    // prints a sentence, because a server saying no is a different event from a
    // form not being finished — and there is nothing on screen to anchor it to.
    return !/\$\{missing\.join/.test(form) && !/const missing = useMemo/.test(form)
  })(),
)

check(
  "Salvează refuses an EMPTY form, and refuses it the same way",
  (() => {
    // It asked for nothing at all: pressing it on an untouched form created an
    // empty row and left you looking at "Fără titlu — Fără preț" wondering what
    // you had just saved. And because it never refused, it never scrolled
    // anywhere either — so the one control that can be pressed by accident was
    // also the one that gave no feedback.
    const submit = form.slice(form.indexOf("const submit = useCallback"), form.indexOf("const submit = useCallback") + 1400)
    return (
      /if \(draft && !title\.trim\(\) && uploaded\.length === 0\)/.test(submit) &&
      /showFirstGap\("title"\)/.test(submit)
    )
  })(),
)

check(
  "and it asks for less than a publish does",
  (() => {
    // A draft is allowed to be half-written; one thing is enough to make it
    // worth keeping. It also replaces the title's message rather than stacking
    // a second note under the same field.
    return /const emptyDraft = showGaps && !title\.trim\(\) && uploaded\.length === 0/.test(form) &&
      /if \(key === "title" && emptyDraft\) return/.test(form)
  })(),
)

check(
  "no field glows violet when you type in it",
  (() => {
    // A four-pixel coloured halo around a text box is the browser's focus ring
    // wearing the brand colour, and on a form of eight fields it fires eight
    // times. The border going dark says the same thing without lighting up.
    return !/focus:ring-4 focus:ring-violet-100/.test(form) && /focus:border-neutral-900 focus:bg-white/.test(form)
  })(),
)

console.log("\nThings that had to be said, said properly")

check(
  "the comparison price is gone, and so is everything that explained it",
  (() => {
    // A second-hand marketplace has no list price to discount FROM: the "was"
    // figure was another number the same seller typed, and the percentage next
    // to it on the card was a saving nobody had ever been offered. The field,
    // its validation, its info sheet and its gap key all go together — half a
    // removal is a form that can still be refused for a rule with no control
    // left to fix it at.
    return (
      !/compareAt/.test(form) &&
      !/compareCents/.test(form) &&
      !/priceInfo/.test(form) &&
      !/Preț comparativ/.test(form) &&
      !/compare_at_cents/.test(form)
    )
  })(),
)

check(
  "and the space it left says what the buyer will actually see",
  (() => {
    // Prices are quoted inclusive of the protection fee everywhere a buyer
    // reads them, so without this a seller types 130, opens the feed, and finds
    // their own listing at 141 with no explanation anywhere.
    //
    // Both numbers, and an explanation reachable from the same place. The copy
    // is deliberately not pinned: this used to require the exact sentence and
    // failed when the line became a labelled row with the reasoning behind an
    // info mark, which states more than the sentence did rather than less.
    //
    // The number itself, formatted for display — not a mention of the helper.
    // A copy check is not enough here: the same sentence appears in the info
    // text beside the heading, so a version of this that only looked for the
    // words passed with the figure deleted.
    //
    // BOTH SIDES OF THE TRANSACTION, as figures rather than as prose. The
    // seller's line is `sellerReceivesCents` now, not the gross price: the
    // commission is five percent and it comes off this side, so "you still
    // receive 130" was accurate before that was surfaced and wrong after it.
    return (
      /formatPlatformMoney\(buyerPaysCents\(priceCents\)\)/.test(form) &&
      /formatPlatformMoney\(priceCents\)/.test(form) &&
      /incl\./.test(form) &&
      /openBuyerProtection\(\)/.test(form)
    )
  })(),
)

check(
  "the count badge is a black pill",
  (() => {
    // Tried outlined; the counter disappeared into the card it was sitting on.
    // At 10.5px a solid fill is a mark rather than a shout, which is what an
    // outline at this size could not manage.
    return /rounded-full bg-neutral-900 px-2 py-\[3px\] text-\[10\.5px\][^"]*text-white/.test(form)
  })(),
)

check(
  "only the first empty slot is captioned",
  (() => {
    // Eight tiles each captioned "Adaugă" is one word printed eight times to
    // say one thing, and the icon has already said it on the other seven.
    const slots = form.slice(form.indexOf("{Array.from({ length: emptySlots })"), form.indexOf("ref={fileRef}"))
    return /\{n === 0 && <span className="text-\[12\.5px\] font-semibold text-neutral-600">Adaugă<\/span>\}/.test(slots)
  })(),
)

check(
  "the quiet text on this form is not 400 weight",
  (() => {
    // Labels, hints, field values and input text were all at the browser
    // default against semibold headings, which is a page that looks like it
    // has been typed rather than set.
    return (
      (form.match(/font-medium/g) ?? []).length >= 12 &&
      !/text-\[13px\] text-neutral-500">/.test(form) &&
      !/py-3 text-\[15px\] outline-none/.test(form)
    )
  })(),
)


/* ===========================================================================
 *  ON A MONITOR IT IS A PAGE, OR A DIALOG — NEVER BOTH PAGES AT ONCE
 * ===========================================================================
 *
 * /products/new is an intercepted route, so a client navigation renders it in
 * the layout's @modal slot — a SIBLING of <main> — while the screen you came
 * from goes on rendering underneath. On a phone that is the whole point: the
 * sheet has something to slide over.
 *
 * Above 768px the form reverted to `md:static md:block`, and a static element
 * in a parallel slot simply joins the document flow. So on a desktop, pressing
 * VINDE left the feed exactly where it was and appended the entire sell form
 * beneath it: one scroll containing two pages, the second with no way out
 * because its only close button is `md:hidden`.
 */

const overlayCss = read("app/globals.css")

console.log("\nOne question, then the ones it opens")

check(
  "nothing but the category is asked until the category is answered",
  (() => {
    // Eight rows were drawn to everybody and most could not be answered by most
    // listings. A paperback was asked for its size, a vinyl record for its era,
    // a Pokémon card for its style — three questions with no answer, above three
    // that mattered, on the screen where somebody decides whether listing the
    // thing is worth the trouble.
    return (
      /gridTemplateRows: group \? "1fr" : "0fr"/.test(form) &&
      /Alege categoria și îți cerem doar detaliile care contează pentru ea/.test(form)
    )
  })(),
)

check(
  "and each row is gated on what the category can answer",
  (() => {
    return (
      /\{asks\("brand"\) && \(/.test(form) &&
      /\{asks\("size"\) && \(/.test(form) &&
      /\{asks\("colour"\) && \(/.test(form) &&
      /\{asks\("sources"\) && \(/.test(form) &&
      /\{asks\("era"\) && \(/.test(form) &&
      /\{asks\("style"\) && \(/.test(form)
    )
  })(),
)

check(
  "the publish cannot be refused over a row that was never drawn",
  (() => {
    // The single worst outcome here: a seller lists a book, presses Publish, and
    // is told a size is missing from a field that does not exist on the screen.
    // Both sides read the same function.
    return (
      /if \(asks\("brand"\) && !brand\)/.test(form) &&
      /if \(asks\("size"\) && !size\)/.test(form) &&
      /if \(asks\("colour"\) && !colour\)/.test(form)
    )
  })(),
)

check(
  "and the SERVER agrees with the form about which rows exist",
  (() => {
    // The API enforces the same checklist independently, so a rule that lived
    // only on the client would refuse the request the form had just allowed.
    const completeness = read("lib/marketplace/listing-completeness.ts")
    return (
      /asksFor\(groupId, "brand"\) && !v\.brand/.test(completeness) &&
      /asksFor\(groupId, "size"\) && !v\.size/.test(completeness) &&
      /asksFor\(groupId, "colour"\) && !v\.colour/.test(completeness)
    )
  })(),
)

check(
  "condition is asked of everything, and is not gated",
  // There is nothing on this marketplace whose condition does not matter.
  /<Field label="Stare"/.test(form) && !/asks\("condition"\)/.test(form),
)

check(
  "a picker does not cover the site header on a desktop",
  (() => {
    // It is a centred dialog there, not a full-screen push, so there was no
    // reason for it to take the search and the account menu off the screen.
    // 35 sits above the form's own desktop layer and below the sticky header.
    const picker = read("components/sell/picker-page.tsx")
    return /z-\[110\] md:z-\[35\]/.test(picker)
  })(),
)

check(
  "on a desktop, starting a listing goes to the page rather than the modal",
  (() => {
    // An interception only fires on a client navigation, so the fix is to stop
    // asking the router rather than to defeat it.
    const route = read("lib/marketplace/sell-route.ts")
    const header = read("components/platform/platform-header-client.tsx")
    const drawer = read("components/marketing/side-drawer.tsx")
    return (
      /min-width: 768px/.test(route) &&
      /window\.location\.assign\(href\)/.test(route) &&
      /isSellFormRoute\(targetPath\) && goToSellFormAsPage\(targetPath\)/.test(header) &&
      /isSellFormRoute\(href\) && goToSellFormAsPage\(href\)/.test(drawer)
    )
  })(),
)

check(
  "and it decides that BEFORE the canonical and native branches",
  (() => {
    // Those decide HOW to navigate; this decides whether the navigation may be
    // a soft one at all.
    const header = read("components/platform/platform-header-client.tsx")
    const fn = header.slice(header.indexOf("const onCanonicalNav = useCallback"))
    return fn.indexOf("goToSellFormAsPage") < fn.indexOf("shouldForceCanonicalNav")
  })(),
)

console.log("\nThe sell form on a large screen")

check(
  "an overlay never falls back into the document flow",
  (() => {
    // The single line that caused it. `md:static` may only be reachable when
    // this is the real page route.
    const at = form.indexOf('"sell-sheet fixed inset-0')
    const root = form.slice(at, at + 1800)
    return /sell-sheet-overlay/.test(root) && /:\s*"md:static md:z-auto md:block/.test(root)
  })(),
)

check(
  "and it is a bounded, scrolling panel rather than a full-height column",
  (() => {
    // Without a ceiling the panel grows to its content and the form runs off
    // the bottom of a laptop screen with the page behind unable to scroll —
    // the same "no way out", arrived at from the other side.
    return /md:max-h-\[88vh\]/.test(form) && /md:max-w-6xl/.test(form) && /md:rounded-2xl/.test(form)
  })(),
)

check(
  "the scroll stays inside it",
  (() => {
    // A page hands the scroll back to the document above md, because the form
    // is just a long page there. An overlay cannot: the document behind it is a
    // different screen.
    return /!overlay && "md:overflow-visible"/.test(form)
  })(),
)

check(
  "there is a way out of it on a desktop",
  (() => {
    // The phone's X is `md:hidden`, and a page does not need one — the site
    // header is right there. An overlay covers it, so without this the form was
    // a screen you could fill in and not leave.
    const header = form.slice(form.indexOf('<header className="mb-6 hidden md:'), form.indexOf("{/* Desktop splits the form in two"))
    return /\{overlay && \(/.test(header) && /onClick=\{requestClose\}/.test(header)
  })(),
)

check(
  "and it asks before throwing away a half-written listing",
  // requestClose, not a bare dismiss — the same guard the phone's X has.
  !/onClick=\{close\}/.test(form),
)

check(
  "the sticky action card does not clear a header that is not there",
  (() => {
    // `top-24` clears the site header on the real page. Inside an overlay there
    // is none, and 96px is a card that starts late with less room to travel.
    return /overlay \? "md:sticky md:top-4" : "md:sticky md:top-24"/.test(form)
  })(),
)

check(
  "and it does not take the site header down with it",
  (() => {
    // At z-95 the overlay covered the header, so opening the form from a
    // desktop took the search, the categories and the account menu with it, and
    // left nothing in their place. `md:z-30` puts it under the sticky header's
    // z-40 rather than pushing it down with a magic offset — the header goes on
    // painting at whatever height it happens to be.
    return /md:z-30/.test(form) && /md:pt-\[84px\]/.test(form)
  })(),
)

check(
  "the sell routes are not given a white lip they have no bar for",
  (() => {
    // Under the black header the shell draws a 20px strip with a white
    // rounded-t overlay — the concave transition into the white search bar. On
    // a route with no such bar and a #f6f6f7 background, that strip is a band
    // of white between the header and the page, curving at the corners because
    // it is the lip of something that is not there.
    const header = read("components/platform/platform-header-client.tsx")
    return (
      /const isSellRoute = pathname\.startsWith\("\/products\/new"\) \|\| pathname\.startsWith\("\/products\/edit"\)/.test(header) &&
      (header.match(/\{!isSellRoute && \(showCategories/g) ?? []).length === 2
    )
  })(),
)

check(
  "the desktop header is a bar rather than a band",
  (() => {
    // 81px of black on every page: the tallest thing on a marketplace should be
    // a photograph of something for sale. The logo comes down with it — 46px in
    // a 68px row is four pixels of air, which is a logo wedged into a bar.
    const header = read("components/platform/platform-header-client.tsx")
    return (
      /md:h-\[68px\]/.test(header) &&
      !/md:h-\[81px\]/.test(header) &&
      !/h-\[46px\] w-auto rounded-\[7px\]/.test(header)
    )
  })(),
)

check(
  "a desktop overlay arrives, and does not slide the viewport to do it",
  (() => {
    // A full-viewport slide at 1440px is exactly what the md rule above it was
    // written against; a dialog that simply exists on the next frame is what
    // every alert in this app already avoids.
    const block = overlayCss.slice(overlayCss.indexOf("@keyframes sell-overlay-enter"))
    return (
      /\.sell-sheet-overlay\.sell-sheet-enter/.test(overlayCss) &&
      /transform: scale\(0\.985\)/.test(block) &&
      !/translate3d/.test(block.slice(0, block.indexOf(".sell-sheet-overlay.sell-sheet-leave")))
    )
  })(),
)

check(
  "the desktop layout is two columns with gutters that grow",
  (() => {
    // The form itself was already responsive — this is what the flow bug was
    // hiding. Asserted so a future edit cannot quietly drop it.
    return (
      /md:grid md:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(0,1fr\)\]/.test(form) &&
      /md:max-w-5xl md:px-6 lg:max-w-6xl lg:px-8/.test(form)
    )
  })(),
)

check(
  "every picker is a centred dialog on a monitor, not a full-screen push",
  (() => {
    // Sliding a full-screen panel in from the right is the grammar of a device
    // you hold in one hand. On a 27-inch monitor it is a whole desktop being
    // replaced to pick a colour.
    const picker = read("components/sell/picker-page.tsx")
    return /min-width: 768px/.test(picker) && /isDesktop/.test(picker)
  })(),
)

check(
  "a book is never asked for a fashion brand",
  (() => {
    // The brand row is not a free-text box: it opens the BRAND DIRECTORY, which
    // is fashion. Listing a paperback and being offered Nike, Adidas and Zara is
    // not a slightly imprecise label — it is a question with no correct answer
    // in it, on a form whose whole job is to be answerable.
    //
    // Driven against the real table rather than grepped, because the point is
    // which groups resolve to which fields, and that is exactly what a lookup
    // can be wrong about while every line of it reads correctly.
    const media = ["ent-books", "ent-magazines", "ent-music", "ent-video"]
    const collectible = [
      "hobby-cards", "hobby-boardgames", "hobby-puzzles", "hobby-miniatures",
      "hobby-memorabilia", "hobby-coins", "hobby-stamps", "hobby-postcards",
    ]
    const offenders = [...media, ...collectible].filter((g) =>
      fieldsFor(g).includes("brand"),
    )
    if (offenders.length) console.log(`        ${offenders.join(", ")}`)
    return offenders.length === 0
  })(),
  "        lib/marketplace/listing-taxonomy.ts — a publisher field and a maker\n" +
    "        field would each be right, and each needs its own directory first.",
)

check(
  "and clothing still is, because there the directory is the right one",
  (() => {
    // The removal has to be about the groups the directory does not serve, not
    // about the field. Taking brand off a pair of trainers would be a far worse
    // bug than the one being fixed.
    return (
      fieldsFor("women-clothing").includes("brand") &&
      fieldsFor("men-shoes").includes("brand") &&
      fieldsFor("women-bags").includes("brand")
    )
  })(),
)

check(
  "a child's listing has a size it can honestly give",
  (() => {
    // THE WORST OF THIS FAMILY, because it is not a list with wrong entries in
    // it — it is a required question with no correct answer available. Kids
    // clothing asks for a size; the list held adult letters, adult waists and
    // adult shoe sizes, so a jumper for a three-year-old could only be filed
    // under one of those or left blank.
    const kids = sizesFor("kids-girls")
    const labels = kids.map((o) => o.label)
    return (
      kids.length > 0 &&
      labels.some((l) => /luni/.test(l)) &&
      labels.some((l) => /\bani\b/.test(l)) &&
      // And nothing adult in it.
      !labels.includes("XXL") &&
      !labels.some((l) => /^4[0-5] · încălțăminte$/.test(l))
    )
  })(),
  "        lib/marketplace/listing-taxonomy.ts — a question the form cannot\n" +
    "        accept an answer to is worse than one with wrong answers in it.",
)

check(
  "a shoe is not offered XXL, and a t-shirt is not offered shoe sizes",
  (() => {
    const shoes = sizesFor("men-shoes").map((o) => o.label)
    const tops = sizesFor("women-clothing").map((o) => o.label)
    return (
      shoes.every((l) => /încălțăminte/.test(l)) &&
      tops.some((l) => l === "M") &&
      !tops.some((l) => /încălțăminte/.test(l))
    )
  })(),
)

check(
  "and a size already stored still resolves to its label",
  (() => {
    // The union has to remain, or editing a listing's category would blank a
    // size that is perfectly valid — the picker narrows, the lookup does not.
    const all = SIZES.map((o) => o.id)
    return (
      all.includes("xxl") &&
      all.includes("k-3y") &&
      all.some((id) => id.startsWith("shoe") || /4[0-5]/.test(id)) &&
      // An unknown group shows everything rather than nothing: a dead end is
      // worse than a long list.
      sizesFor("hobby-gaming").length === SIZES.length
    )
  })(),
)

check(
  "the brand shortcut is only offered where the directory can answer it",
  (() => {
    // The seeded directory is fashion end to end — Nike, Zara, H&M, Shein. The
    // FIELD is still fine on a toy or a cosmetic, because the picker takes free
    // text; what is not fine is a shortcut list in which every entry is from
    // another department.
    return (
      brandDirectoryApplies("women-clothing") &&
      brandDirectoryApplies("men-shoes") &&
      brandDirectoryApplies("women-bags") &&
      !brandDirectoryApplies("women-beauty") &&
      !brandDirectoryApplies("kids-toys") &&
      !brandDirectoryApplies("hobby-instruments") &&
      !brandDirectoryApplies("ent-books") &&
      !brandDirectoryApplies(null)
    )
  })(),
)

check(
  "a book is not asked whether it still has its tag on",
  (() => {
    // The five rungs are right for everything; the WORDS were right for
    // clothing only. "Nou, cu etichetă", "Nepurtat", "Purtat de câteva ori" —
    // asked of a paperback, a board game or a lipstick, none of which is ever
    // worn and none of which has a tag.
    const book = conditionsFor("ent-books")
    const words = book.map((c) => `${c.label} ${c.hint}`).join(" ")
    return (
      !/etichet/i.test(words) &&
      !/purtat/i.test(words) &&
      /sigilat/i.test(words) &&
      /folosit/i.test(words)
    )
  })(),
  "        lib/marketplace/listing-taxonomy.ts — same ladder, same ids, the\n" +
    "        vocabulary the thing is actually sold in.",
)

check(
  "clothing keeps the tag language, because there it is the right language",
  (() => {
    const shirt = conditionsFor("women-clothing").map((c) => `${c.label} ${c.hint}`).join(" ")
    return /etichet/i.test(shirt) && /purtat/i.test(shirt) && !/sigilat/i.test(shirt)
  })(),
)

check(
  "and relabelling never becomes a second set of stored values",
  (() => {
    // Every listing ever filed carries one of these ids and the feed filters on
    // them. Two vocabularies is a relabelling; two ID SETS would mean a
    // listing's condition changing meaning the day its category was edited.
    const ids = (g: string) => conditionsFor(g).map((c) => c.id).join(",")
    return (
      ids("ent-books") === ids("women-clothing") &&
      ids("hobby-coins") === ids("men-shoes") &&
      // And an unknown group answers in the wording every existing listing was
      // written against, rather than retroactively restating them.
      ids(undefined as unknown as string) === ids("women-clothing") &&
      conditionsFor(null).some((c) => /etichet/i.test(c.label))
    )
  })(),
)

check(
  "the buyer reads the same sentence the seller chose",
  (() => {
    // The seller picks "Nou, sigilat" on a board game; if the product page
    // resolves that id against the clothing list it prints "Nou, cu etichetă"
    // — the listing saying something the seller did not.
    const detail = read("components/product/product-detail.tsx")
    return /labelOf\(conditionsFor\(product\.category\), product\.condition\)/.test(detail)
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}

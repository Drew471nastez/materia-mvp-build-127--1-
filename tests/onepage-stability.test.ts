/**
 * ===========================================================================
 *  THE PUBLISHED /links PAGE HOLDS STILL, AND ITS SLIDER FOLLOWS A FINGER
 * ===========================================================================
 * Reported from a phone on storelib.com/<creator>/links: the slider blinks
 * and flashes while you swipe it, the creator's avatar refreshes at random,
 * and there is a blur over the avatar nobody asked for. Then, after a first
 * round of fixes that measured well: "sliding smoothly with my finger left
 * and right to move the image gallery doesn't work at all", and autoplay does
 * not work on a phone either.
 *
 * ── THE BLINKING WAS ONE BUG ───────────────────────────────────────────────
 * `PageContent` was a component declared inside PublicOnePage's render, so it
 * was a new function identity every render, and React throws away a tree
 * whose element type changed. `buttonsVisible` flips on almost every scroll.
 * Measured with scripts/check-onepage-stability.mjs:
 *
 *     img churn on a scroll   12 removed, 12 added   ->   0 removed, 0 added
 *
 * A rebuilt <img> repaints from nothing, the avatar drops back to the grey
 * disc Radix shows while it re-resolves, and the carousel forgets itself.
 *
 * ── THE BLUR WAS ITS OWN ANSWER ────────────────────────────────────────────
 * `.media-deblur` ran blur(3px) to blur(0) with fill `both`, so the first
 * frame was always blurred and every mount replayed it. Both avatars in the
 * document sat at blur(3px) and blur(0px) a second after load. The hero image
 * had already grown an onLoad wiping `filter` and `animation` back off, which
 * says the effect was not wanted even where it was written.
 *
 * ── AND THE SLIDER WAS MEASURED WRONG ──────────────────────────────────────
 * The check that passed dispatched TouchEvent objects at the element. That
 * proves the handler runs and nothing else. A finger goes through the
 * browser's input pipeline first: touch-action, the compositor deciding
 * whether the gesture belongs to the page's own scroll, and whether the
 * touchmove is still cancellable by the time JavaScript sees it.
 *
 * Driving real touch input through that pipeline instead — CDP's
 * Input.dispatchTouchEvent, in scripts/check-onepage-drag.mjs — showed every
 * touchmove arriving with `cancelable: false`, so the preventDefault() the
 * drag depended on was a no-op and the page was free to move under the
 * finger. The same run found the slider's whole visible strip covered by the
 * cookie banner, which is fixed at z-9999 across the full width:
 *
 *     slider spans y 697..990 of an 844px viewport
 *     its centre hit-tests to DIV.fixed bottom-0 left-0 right-0 z-[9999]
 *     no part of the slider was reachable by a finger at all
 *
 * So the hand-rolled drag is gone. It rested on two guesses that have to come
 * out right every time: a direction lock decided from the first touchmove
 * past 6px, which a slightly vertical first wobble threw away, and a
 * preventDefault that never had the chance. A native scroll-snap row has
 * neither, because none of it is a guess — and it is what the group carousel
 * in the same file has always been, which nobody has reported as stuck.
 *
 * Autoplay had a separate bug with the same symptom. The wrapper used
 * onMouseEnter/onMouseLeave, and a tap on a phone fires the compatibility
 * mouse events: the first touch set `isHovered`, `mouseleave` often never
 * arrived, and the autoplay effect returned early for the rest of the visit.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  const live = read("components/onepage/public-onepage.tsx")
  /*
    THE EDITOR PREVIEW IS THE PUBLISHED PAGE NOW. It frames the live page's
    own component (components/onepage/live-preview.tsx, preview-document.tsx)
    instead of keeping a second drawing of it in phone-preview.tsx, which
    had drifted from the live page in every block (scripts/check-onepage-
    parity.mjs). So every rule below that is held of "the editor preview" is
    held of the code it now runs, the live page's, once this says it does.
  */
  const frame = read("components/onepage/preview-document.tsx")
  const framed = /<PublicOnePage onepage=\{page as never\} \/>/.test(frame) && /export \{ PhonePreview, MobilePreviewContent \} from "\.\/live-preview"/.test(read("components/onepage/phone-preview.tsx"))
  check("the editor preview draws the published page's own component, in a frame", framed)
  const preview = framed ? live : read("components/onepage/phone-preview.tsx")
  const both = [["the published page", live], ["the editor preview", preview]] as const

  console.log("\nThe page is not rebuilt every time it is scrolled")

  check(
    "the page body is a function that returns elements",
    /const renderPageContent = \(\{ isDesktop = false \}/.test(live),
  )
  check(
    "and it is called, not mounted as a component",
    /\{renderPageContent\(\{ isDesktop: true \}\)\}/.test(live) && /\{renderPageContent\(\)\}/.test(live),
  )
  check(
    "no component is declared inside the render any more",
    !/const PageContent = \(/.test(live),
    "a component declared in a render is a new type on every render, and a new type means a remount",
  )
  check(
    "and the note says why, where the next person will put one back",
    /A\n   \* component declared inside a render is a NEW function on every render/.test(live),
  )

  console.log("\nNo blur over the avatar")

  for (const [name, src] of both) {
    check(`${name} has no deblur keyframes`, !/@keyframes mediaDeblur/.test(src))
    check(`${name} applies no deblur class`, !/media-deblur"/.test(src))
  }
  check(
    "and the onLoad that used to wipe it back off is gone with it",
    !/style\.animation = 'none'/.test(live) && !/style\.animation = 'none'/.test(preview),
  )
  check(
    "the hero picture is fetched up front instead",
    /loading="eager"\s*\n\s*fetchPriority="high"/.test(live) && /fetchPriority="high"/.test(preview),
  )

  console.log("\nThe slider is a scroller, and the browser does the scrolling")

  for (const [name, src] of both) {
    check(
      `${name}: the row is a native scroller that snaps`,
      /overflowX: 'auto'/.test(src) && /scrollSnapType: 'x mandatory'/.test(src),
    )
    check(`${name}: its slides are snap targets`, /scrollSnapAlign: 'start'/.test(src))
    check(
      `${name}: nothing moves it by hand`,
      !/const writeTransform = useCallback/.test(src) && !/translate3d\(\$\{translateX\}px/.test(src),
      "the browser moves it, on the compositor, with momentum and snapping",
    )
    check(
      `${name}: no direction lock is left to guess wrong`,
      !/directionLockRef/.test(src) && !/lock = Math\.abs\(dx\) >= Math\.abs\(dy\)/.test(src),
      "a first sample slightly more vertical than horizontal threw the whole swipe away",
    )
    check(
      `${name}: no preventDefault the browser can ignore`,
      !/el\.addEventListener\('touchmove', onMove, \{ passive: false \}\)/.test(src),
      "measured on the deployed page, every touchmove arrived with cancelable false",
    )
    check(
      `${name}: a swipe past the end belongs to the slider`,
      /overscrollBehaviorX: 'contain'/.test(src),
    )
    check(
      `${name}: which slide is showing is read from the scroller`,
      /Math\.abs\(\(el\.children\[i\] as HTMLElement\)\.offsetLeft - el\.scrollLeft\)/.test(src),
    )
    check(
      `${name}: and the arrows and dots scroll it`,
      /el\.scrollTo\(\{ left: target\.offsetLeft, behavior: "smooth" \}\)/.test(src),
    )
    check(
      `${name}: the index is read once a frame, not once an event`,
      /if \(rafRef\.current !== null\) return/.test(src),
      "a touch scroll fires far more scroll events than there are frames to draw",
    )
  }

  console.log("\nAutoplay survives being touched")

  for (const [name, src] of both) {
    check(
      `${name}: hover comes from a mouse only`,
      /if \(e\.pointerType === "mouse"\) setIsHovered\(true\)/.test(src)
        && !/onMouseEnter=\{\(\) => setIsHovered\(true\)\}/.test(src),
      "a tap fires the compatibility mouse events, mouseleave often never arrives, and autoplay stopped for the rest of the visit",
    )
    check(
      `${name}: a finger only holds it off for a few seconds`,
      /heldUntilRef\.current = Date\.now\(\) \+ 3000/.test(src)
        && /if \(Date\.now\(\) < heldUntilRef\.current\) return/.test(src),
    )
    check(
      `${name}: and a tap on a dot or an arrow holds it off too`,
      /hold\(\); goToSlide\(idx\)/.test(src) && /hold\(\)\n    goToSlide\(currentIndex === 0/.test(src),
    )
  }

  console.log("\nThe dots follow the row instead of waiting for it")

  for (const [name, src] of both) {
    check(
      `${name}: a dot's size is a function of where the row is`,
      /const nearness = Math\.max\(0, 1 - Math\.abs\(progress - i\)\)/.test(src),
      "idx === currentIndex snaps at the halfway point in one step, however slowly the finger is moving",
    )
    check(
      `${name}: and no class flips on the current index`,
      !/idx === currentIndex\s*\n\s*\? "w-6 bg-current"/.test(src) && !/\? "w-4 bg-current"/.test(src),
    )
    check(
      `${name}: they are painted without waiting for a frame`,
      /THE DOTS ARE PAINTED HERE, NOT INSIDE THE FRAME CALLBACK/.test(src),
      "measured headless, the frame callback never ran: the row moved and the dots did not",
    )
    check(
      `${name}: the step is held, not re-read on every scroll event`,
      /const stepRef = useRef\(0\)/.test(src),
      "reading offsetLeft straight after writing a style forces a fresh layout, and a touch scroll fires these by the hundred",
    )
    check(
      `${name}: the scroll listener is native`,
      /el\.addEventListener\("scroll", handleScroll, \{ passive: true \}\)/.test(src),
      "scroll does not bubble, React delegates it specially, and it did not fire",
    )
  }

  console.log("\nPressing away closes the subscribe panel")

  /*
    Changed on purpose (r40): the panel is a sheet now (components/onepage/subscribe-sheet over
    components/onepage/onepage-dialog). Its scrim, Escape and the drag close it, and it eases out;
    the bell no longer listens for a press elsewhere, which would have counted a press inside the sheet.
  */
  const dialog = read("components/onepage/onepage-dialog.tsx")
  check("it is the shared dialog, opened by the bell", /<OnePageSubscribeSheet\s+open=\{isOpen\}\s+onClose=\{\(\) => setIsOpen\(false\)\}/.test(live))
  check("a press on the scrim closes it", /onClick=\{onClose\}\s+className="absolute inset-0 bg-black\/45"/.test(dialog))
  check("Escape closes it too", /if \(e\.key === "Escape"\) closeRef\.current\(\)/.test(dialog))
  check("and it still eases out rather than vanishing", /window\.setTimeout\(\(\) => setMounted\(false\), OUT_MS\)/.test(dialog))

  console.log("\nA slide is the right width on its first frame")

  check(
    "the width is arithmetic in CSS",
    /const slideWidth = `calc\(\(100% - \$\{gap \* \(Math\.ceil\(view\) - 1\)\}px\) \/ \$\{view\}\)`/.test(live),
  )
  check("and nothing falls back to 100%", !/itemWidth > 0 \? `\$\{itemWidth\}px` : '100%'/.test(live))
  check(
    "nothing measures a width in JavaScript any more",
    !/const ro = new ResizeObserver\(update\)/.test(live) && !/const restOffset = useCallback\(/.test(live),
    "the scroller needs no measurement: offsetLeft is the browser's own answer",
  )
  /* CHANGED ON PURPOSE: the preview had a smaller gap of its own, which was one of its differences from the live page. It has none now: it is the live page. */
  check("the editor preview has no gap of its own any more: it draws the live page's", framed && !/const gap = view > 1 \? 6 : 4/.test(read("components/onepage/phone-preview.tsx")))

  console.log("\nSlides within reach of one swipe are fetched before the swipe")

  check(
    "the carousel's own slides load eagerly",
    /loading=\{isImageCarousel && index <= eagerSlides \? "eager" : "lazy"\}/.test(live),
  )
  check(
    "and it asks about the image block's own carousel, not a group's",
    /const isImageCarousel = data\.display_style === 'carousel' && !isInsideGroup && images\.length > 1/.test(live),
    "isInsideCarousel means something else here: that this block sits inside a group carousel",
  )

  console.log("\nThe group carousel is left to the native scroller too")

  check(
    "no React touch prop is left on either slider",
    !/onTouchMove=\{handleTouchMove\}/.test(live) && !/onTouchMove=\{handleTouchMove\}/.test(preview),
  )
  check(
    "and the note says why",
    /THERE ARE NO TOUCH HANDLERS HERE ON PURPOSE/.test(live)
      && !/const handleTouchMove = \(e: React\.TouchEvent\)/.test(live)
      && !/const handleTouchMove = \(e: React\.TouchEvent\)/.test(preview),
    "writing scrollLeft by hand on a container the phone is already scrolling moves the row twice",
  )

  console.log("\nAnd the probes measure the real page, at the right layer")

  const probe = read("scripts/check-onepage-stability.mjs")
  const drag = read("scripts/check-onepage-drag.mjs")
  check("the in-page probe mounts the real component", /import \{ PublicOnePage \} from "@\/components\/onepage\/public-onepage"/.test(read("scripts/render-onepage-stability.tsx")))
  check(
    "it starts watching before React mounts",
    /onepage-stability-observe\.js/.test(probe) && /window\.__probe = \{/.test(read("scripts/onepage-stability-observe.js")),
    "an observer started afterwards reports that no slide was ever born at any width",
  )
  check(
    "it reads every copy of the avatar",
    /for \(const a of r\.avatarList\)/.test(probe),
    "the phone layout, the desktop layout and the share sheet are all in the document at once",
  )
  check(
    "a real finger is measured through the browser's input pipeline",
    /Input\.dispatchTouchEvent/.test(drag),
    "a dispatched TouchEvent proves the handler runs and nothing else",
  )
  check(
    "the drag probe aims at the point the hit test approved",
    /THE POINT THE HIT TEST APPROVED, NOT ONE NEAR IT/.test(drag),
  )
  check(
    "it scrolls the slider into view first, as a visitor does",
    /SCROLL IT INTO VIEW FIRST, BECAUSE THAT IS WHAT A VISITOR DOES/.test(drag),
    "left where it loads it sat under the cookie banner, and the drag measured the banner",
  )
  check(
    "it keeps one coordinate system",
    /ONE COORDINATE SYSTEM, OR THE DRAG LANDS SOMEWHERE ELSE/.test(drag),
    "dispatchTouchEvent takes device pixels and elementFromPoint answers in CSS pixels",
  )
  check(
    "the in-page probe checks the picture moves, not just the dot",
    /THE ARROW HAS TO MOVE THE PICTURE, NOT JUST THE DOT/.test(read("scripts/onepage-stability-page.js"))
      && /the dots move and the gallery does not/.test(probe),
    "the build that was reported advanced the dots over a gallery that never moved",
  )
  check(
    "it turns off animated scrolling before measuring where the arrow goes",
    /SMOOTH SCROLLING DOES NOT ADVANCE UNDER A VIRTUAL CLOCK/.test(read("scripts/onepage-stability-page.js")),
  )
  check(
    "it lifts the snapping to read a position the row only passes through",
    /MANDATORY SNAP WILL NOT LET IT REST BETWEEN TWO SLIDES/.test(read("scripts/onepage-stability-page.js")),
  )
  check(
    "and it lets React commit between pressing and reading",
    /reading straight after\n            \.click\(\) reads the panel as it was before the press/.test(read("scripts/onepage-stability-page.js")),
  )
  check(
    "and the in-page probe says plainly what it cannot measure",
    /WHAT IS READ HERE IS THE SHAPE OF THE SLIDER, NOT ITS BEHAVIOUR/.test(read("scripts/onepage-stability-page.js")),
    "an assertion that a synthetic swipe leaves scrollLeft alone could not catch a listener doing scrollLeft += 20",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()

/**
 * ===========================================================================
 *  THE PUBLISHED /links PAGE HOLDS STILL
 * ===========================================================================
 * Reported from a phone on storelib.com/satori-studio/links: the slider
 * blinks and flashes while you swipe it, the creator's avatar "refreshes
 * randomly", and there is a blur over the avatar nobody asked for.
 *
 * Three complaints, and measuring them together on one document — which is
 * what scripts/check-onepage-stability.mjs does — showed that most of it was
 * ONE bug.
 *
 * `PageContent` was a component declared inside PublicOnePage's render. That
 * makes it a new function on every render, and React compares element types
 * by identity: a different type means throw the old tree away and build a new
 * one. There is a state change on almost every scroll, because `buttonsVisible`
 * flips as you move, and on a phone you are always scrolling. Measured:
 *
 *     img churn on a scroll   12 removed, 12 added
 *
 * Twelve pictures destroyed and rebuilt because the page was scrolled. A
 * rebuilt <img> repaints from nothing; the avatar drops back to the grey disc
 * Radix shows while it re-resolves; the deblur keyframe replays from blur(3px);
 * the carousel forgets its measured width. That is the blinking, the avatar
 * refreshing on its own, and the flash while swiping, all at once. Called as a
 * plain function it reconciles by position and nothing remounts:
 *
 *     img churn on a scroll   0 removed, 0 added
 *
 * THE BLUR WAS ITS OWN ANSWER. `.media-deblur` ran blur(3px) down to blur(0)
 * over half a second with fill `both`, so the first frame was always blurred
 * and every mount replayed it. Read off the page, the two avatars that are in
 * the document at once were sitting at blur(3px) and blur(0px) more than a
 * second after load. The hero image had already grown an onLoad that wiped
 * `filter` and `animation` straight back off, which says the effect was not
 * wanted even where it was written. It is gone.
 *
 * AND THE SWIPE COULD NOT STOP THE PAGE SCROLLING. React attaches touchmove
 * passively at the root, so the preventDefault() the carousel called inside
 * its onTouchMove was discarded with a console warning and the page scrolled
 * vertically underneath the drag:
 *
 *     horizontal swipe        NOT cancellable   ->   cancellable
 *     track moved by          (nothing)         ->   -395px, one whole step
 *
 * The listeners are native and { passive: false } now, the drag writes the
 * transform straight to the node instead of re-rendering every slide sixty
 * times a second, and the slide width is a calc() rather than something a
 * ResizeObserver reports later:
 *
 *     widths at insertion     ["100%", ... , "386.667px"]   ->   calc(83.3333% - 6.66667px)
 *     widths rewritten later  [{ t: 135, w: "386.667px" }]  ->   none
 *
 * 100% on the first frame means one full-width picture that then snaps to the
 * 1.2-up view, 135ms in, on every load.
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
  const preview = read("components/onepage/phone-preview.tsx")

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

  for (const [name, src] of [["the published page", live], ["the editor preview", preview]] as const) {
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

  console.log("\nThe swipe owns the gesture")

  check(
    "touchmove is a native listener",
    /el\.addEventListener\('touchmove', onMove, \{ passive: false \}\)/.test(live),
    "React's own touchmove is passive, so preventDefault inside onTouchMove does nothing",
  )
  check(
    "and no React touch prop is left on either slider",
    !/onTouchMove=\{handleTouchMove\}/.test(live) && !/onTouchMove=\{handleTouchMove\}/.test(preview),
    "the group carousel had one too, writing scrollLeft by hand on a container the phone was already scrolling",
  )
  check(
    "the group carousel is left to the native scroller",
    /THERE ARE NO TOUCH HANDLERS HERE ON PURPOSE/.test(live)
      && !/const handleTouchMove = \(e: React\.TouchEvent\)/.test(live)
      && !/const handleTouchMove = \(e: React\.TouchEvent\)/.test(preview),
    "overflow-x auto with scroll-snap already does this, with momentum, off the main thread",
  )
  check(
    "the handlers are attached once, not rebound on every slide change",
    /\}, \[writeTransform\]\)/.test(live) && /const latest = useRef\(\{ currentIndex, maxIndex, stepSize, restOffset \}\)/.test(live),
  )
  check("touchcancel ends the drag too", /touchcancel', onEnd/.test(live))

  console.log("\nA drag is not sixty React renders")

  check("the transform is written to the node", /const writeTransform = useCallback\(/.test(live))
  check(
    "there is no per-frame state any more",
    !/const \[dragOffset, setDragOffset\] = useState/.test(live) && !/const \[dragOffset, setDragOffset\] = useState/.test(preview),
  )
  check(
    "and React still owns where it rests",
    /useLayoutEffect\(\(\) => \{\s*\n\s*if \(draggingRef\.current\) return/.test(live),
  )
  check(
    "a swipe that changes nothing still puts the track back",
    /if \(wasDragging \|\| next !== l\.currentIndex\) writeTransform\(l\.restOffset\(next\), SWIPE_EASE\)/.test(live),
    "no index change means no render, and only this call restores it",
  )
  check(
    "a resize does not animate",
    /animated \? \(isAutoplayTransition \? AUTOPLAY_EASE : SWIPE_EASE\) : 'none'/.test(live),
    "the track would glide sideways every time a phone's address bar collapsed",
  )

  console.log("\nA slide is the right width on its first frame")

  check(
    "the width is arithmetic in CSS",
    /const slideWidth = `calc\(\(100% - \$\{gap \* \(Math\.ceil\(view\) - 1\)\}px\) \/ \$\{view\}\)`/.test(live),
  )
  check("and nothing falls back to 100%", !/itemWidth > 0 \? `\$\{itemWidth\}px` : '100%'/.test(live))
  check(
    "the measurement stays, because the translate needs a real number",
    /const ro = new ResizeObserver\(update\)/.test(live) && /const restOffset = useCallback\(/.test(live),
  )

  console.log("\nAnd the editor's preview is the same slider")

  check(
    "its touchmove is native too",
    /el\.addEventListener\('touchmove', onMove, \{ passive: false \}\)/.test(preview),
    "what a creator drags in the editor has to be what a visitor gets",
  )
  check(
    "its slides are sized in CSS too",
    /const slideWidth = `calc\(/.test(preview) && !/itemWidth > 0 \? `\$\{itemWidth\}px` : '100%'/.test(preview),
  )
  check("and it kept its own smaller gap", /const gap = view > 1 \? 6 : 4/.test(preview))

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

  console.log("\nAnd the probe measures the real page")

  const probe = read("scripts/check-onepage-stability.mjs")
  const render = read("scripts/render-onepage-stability.tsx")
  const observe = read("scripts/onepage-stability-observe.js")
  check("it mounts the real component", /import \{ PublicOnePage \} from "@\/components\/onepage\/public-onepage"/.test(render))
  check(
    "it starts watching before React mounts",
    /onepage-stability-observe\.js/.test(probe) && /window\.__probe = \{/.test(observe),
    "an observer started afterwards reports that no slide was ever born at any width",
  )
  check(
    "it reads every copy of the avatar",
    /for \(const a of r\.avatarList\)/.test(probe),
    "the phone layout, the desktop layout and the share sheet are all in the document at once",
  )
  check(
    "it checks the swipe moved something, not just that it was cancellable",
    /which is not a slide change/.test(probe),
  )
  check(
    "and it checks the slides came out the width the arithmetic asked for",
    /px was asked for/.test(probe),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()

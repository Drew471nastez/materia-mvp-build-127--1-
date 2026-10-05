/**
 * ===========================================================================
 *  THE PICTURE FOLLOWS THE FINGER, AND THE BACK ARROW SAYS IT IS GOING
 * ===========================================================================
 * Both of these are about feel, so both are measured in a browser rather than
 * argued about here:
 *
 *   scripts/check-gallery-swipe    touches the real gallery and watches where
 *                                  the strip is while the finger moves
 *   scripts/check-back-control     presses the real back control and watches
 *                                  the two icons either side of the delay
 *
 * Those need a build and a browser, so they do not run on a push. What is
 * here is the shape of each fix, so that putting one back is loud.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

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

const root = process.cwd()
const code = (p: string) => stripComments(readFileSync(join(root, p), "utf8"))

console.log("\nThe gallery swipe\n")

{
  const gallery = code("components/product/product-gallery.tsx")

  /*
    The gallery already changed slide on a swipe, so "does swiping work" was
    the wrong question and answered yes. It stacked its slides and crossfaded,
    which leaves nothing to move: a finger could travel a hundred pixels with
    nothing happening, then the picture jumped at the fiftieth.
  */
  /*
    ═══════════════════════════════════════════════════════════════════════
     THE GESTURE IS EMBLA'S NOW, AND THESE ASK THE SAME THINGS OF THAT
    ═══════════════════════════════════════════════════════════════════════
    This block used to read the gallery's own touch handling, then the shared
    hook's, because the gesture was written here by hand three times. Each
    version fixed the fault the last one was pinned against and had its own:
    a threshold with no motion in it, then a live drag that re-rendered the
    whole gallery on every touchmove, then one that tracked exactly and still
    snapped back with a fixed 300ms transition whatever the hand did.

    None of those are questions a source-reading check answers well. What a
    carousel does with a finger is measured, and scripts/check-gallery-swipe
    measures it in a real browser with real touch input: the strip's position
    against the finger's at each waypoint, the React commits a drag costs, and
    whether the picture either side has been fetched.

    What is left here is what a probe cannot see: that there is ONE engine,
    that it is not hand-rolled, and that the two settings a phone depends on
    are still set.
  */
  const swiperModule = code("components/product/media-swiper.tsx")
  const viewer = code("components/product/product-media-viewer.tsx")
  const css = readFileSync(join(root, "app/globals.css"), "utf8")

  check(
    "the gallery and the viewer share one carousel engine",
    /<MediaSwiper/.test(gallery) && /<MediaSwiper/.test(viewer),
    "two copies of one gesture drift; they did, and the same flick behaved differently in each",
  )
  check(
    "and it is Swiper rather than a fifth hand-rolled attempt",
    /from "swiper\/react"/.test(swiperModule),
    "momentum, pointer events, resize and re-measure are the parts a hand-rolled drag never gets to",
  )
  check(
    "no hand-rolled touch handling is left in either",
    !/onTouchMove/.test(gallery) &&
      !/onTouchMove/.test(viewer) &&
      !existsSync(join(root, "lib/gestures/use-swipe-track.ts")) &&
      !existsSync(join(root, "lib/gestures/use-media-carousel.ts")),
    "every earlier engine goes, or there are several instead of one",
  )
  check(
    "the strip is handed over rather than styled",
    !/transform: `translate3d/.test(gallery) && !/style=\{\{ transform/.test(gallery),
    "Swiper owns that node's transform and a style prop is painted back over it on the next render",
  )

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE LINE THAT DECIDES WHETHER THIS WORKS ON A PHONE AT ALL
    ═══════════════════════════════════════════════════════════════════════
    globals.css sets `transform: none !important` AND `transition-property:
    none !important` on every descendant of a `.group` on a touch-only
    device, to stop hover lifts sticking after a tap. The gallery frame
    carries `group`, and Swiper moves `.swiper-wrapper` by transform and
    animates it with a transition — so without an exemption the strip does
    not follow a finger and a thumbnail press jumps instead of sliding.

    Perfect in the source, perfect on every desktop it is tested on, broken
    for everybody on a phone. That has now shipped once under one engine and
    been caught before shipping under two more.
  */
  check(
    "Swiper's strip is exempt from the touch-device transform reset",
    /:not\(\.swiper-wrapper\)/.test(css),
    "without it `transform: none !important` wins on every phone and nothing moves",
  )
  check(
    "a jump of more than one slide does not scroll through the ones between",
    /Math\.abs\(next - currentIndex\) > 1 \? 0 :/.test(swiperModule),
    "a thumbnail four along would otherwise drag every picture in between across the box",
  )
  check(
    "a mouse drags it the same way a finger does",
    /simulateTouch=\{enabled\}/.test(swiperModule) && /grabCursor=\{enabled\}/.test(swiperModule),
    "the desktop path used to be a separate 50px threshold with no motion in it",
  )
  check(
    "the page still scrolls under a finger that starts on a picture",
    /touchAction: "pan-y pinch-zoom"/.test(gallery),
    "without it the browser takes the horizontal gesture",
  )
  /*
    The neighbour is the picture about to be dragged to. Left lazy it is an
    empty box arriving mid-swipe, which is what "it has a gap" was.
  */
  check(
    "the picture either side is fetched before it is dragged to",
    /Math\.abs\(index - currentIndex\) <= 1 \? "eager" : "lazy"/.test(gallery),
    "a neighbour nobody has asked for is a gap between one picture and the next",
  )
  check(
    "and the first slide is never asked to be priority and lazy at once",
    /index === 0 \|\| Math\.abs\(index - currentIndex\)/.test(gallery),
    "Next throws on an image with both, which it became as soon as the gallery moved two slides away",
  )
}

console.log("\nThe back arrow\n")

{
  const bar = code("components/store-builder/product-creator-bar.tsx")

  check(
    "the fallback is a route change, not a new document",
    /startBackTransition\(\(\) => router\.push\(href\)\)/.test(bar) && !/window\.location\.href = creatorHref/.test(bar),
    "assigning location throws the page away and loads the shell again, which is the flash",
  )
  check(
    "the wait is reported by React rather than guessed",
    /startBackTransition\(/.test(bar) && /useTransition\(\)/.test(bar),
    "without a pending signal the control must flash a spinner at everybody or show one to nobody",
  )
  /*
    CHECKED BY ORDER, NOT BY PROXIMITY. This used to pin the two as adjacent
    lines, which broke the moment anything was inserted between them.

    What was inserted, briefly, was a cross-fade: a sheet of the page's own
    colour rose over it for 190ms and the navigation happened underneath. It
    filmed clean and it looked cheap — on a white product page a dissolve
    through a flat colour is a white flash — so it is gone, along with the
    check that pinned it. A page transition has to MOVE to read as one, and
    that is blocked on the buy bar being `position: fixed` inside the page
    root; the note in product-creator-bar says what would have to change.

    The property worth holding either way is that the bar marks itself as
    leaving BEFORE the navigation, because a popstate has no completion event
    to set it from afterwards.
  */
  check(
    "going back holds its own state, because a popstate has no completion event",
    /setLeaving\(true\)/.test(bar) &&
      bar.indexOf("setLeaving(true)") < bar.indexOf("goBackOr(target"),
  )
  check(
    "and nothing washes the page out on the way",
    !/beginPageLeave/.test(bar) && !/page-leave-veil/.test(bar),
    "a dissolve through a flat colour is a white flash, which is worse than the cut it replaced",
  )
  check(
    "and gives up rather than spinning for ever",
    /BACK_GIVE_UP_MS/.test(bar),
    "a back that does nothing would otherwise leave a spinner on the screen permanently",
  )

  /*
    THE DELAY IS THE WHOLE CRAFT. Most backs land in under a tenth of a
    second; a spinner shown at once is a flicker nobody can read, which is
    worse than showing none.
  */
  const delay = Number(bar.match(/const SPINNER_DELAY_MS = (\d+)/)?.[1])
  /*
    THE FLOOR MOVED FROM 110 TO 300. A history back lands in 78ms on
    production, but a slower phone can pass 110, and then the arrow cross-fades
    into a spinner for the last frames before the page leaves — a twitch in
    the header on the one navigation that needs no explaining. The spinner is
    for the cold push, which measures around two seconds; 300 is still well
    inside that. The ceiling is what keeps it honest for the slow path.
  */
  check(
    "the spinner waits before it appears, and past any ordinary back",
    Number.isFinite(delay) && delay >= 250 && delay <= 400,
    `SPINNER_DELAY_MS is ${delay}. Under 250 twitches on a slow phone's back; over 400 and a cold push sits unexplained.`,
  )
  /*
    THE TARGET IS BIGGER THAN THE DISC. "I press back and nothing happens" was
    a 36px button under the 44pt minimum, with a tap hook that only accepts a
    release within 10px of the box. The box is 56 x 52 now and the disc is a
    child; the negative margins hand the size back to the row.
  */
  check(
    "the back target is a 56 x 52 box, not the 36px disc",
    /className="(group\/back )?relative -my-2 -ml-4 -mr-2 inline-flex h-\[52px\] w-\[56px\] shrink-0 items-center justify-center select-none outline-none"/.test(bar),
  )
  /*
    CHANGED ON PURPOSE (round 11, "no bump on press"): the back no longer
    sinks to 0.95 or swells its disc in with an overshoot. The disc is
    centred in the box as before and is simply there at 16% on the press,
    fading out on the lift; nothing changes size.
  */
  check(
    "and the disc is centred inside it, a tint that never changes size",
    /<span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full" data-back-disc-host="">/.test(bar) &&
      /data-back-disc=""/.test(bar) &&
      /pressed\s*\?\s*"opacity-\[0\.16\] duration-0"/.test(bar),
  )
  /* The bar is #1a1a1a. A light grey avatar ground on it is a bright disc that
     paints before the photo and vanishes under it: a flash in the header on
     every arrival. */
  /*
    CHANGED ON PURPOSE: the fallback now also carries `delayMs`, so it paints
    at once when there is no picture to wait for rather than leaving a bare
    disc for 600ms. The ground it sits on, which is what this check is about,
    is untouched, so the pattern allows an attribute before the className.
  */
  check(
    "the bar's avatar has a dark ground, not the shared light one",
    /<Avatar className="h-8 w-8 shrink-0 bg-white\/10">/.test(bar) && /<AvatarFallback [^>]*className="bg-white\/10 text-\[10px\]">/.test(bar),
  )
  check(
    "the two icons share a centre",
    /relative block h-\[19px\] w-\[19px\]/.test(bar) && (bar.match(/absolute inset-0/g) ?? []).length >= 2,
    "laid out in flow, the arrow shifts by a pixel as the spinner mounts",
  )
  check(
    "and the control says it is busy",
    /aria-busy=\{showSpinner \|\| undefined\}/.test(bar),
    "a spinner that only exists visually tells a screen reader nothing",
  )
}

{
  const css = readFileSync(join(root, "app/globals.css"), "utf8")
  check("the spinner turns", /@keyframes bar-control-spin/.test(css))
  check(
    "it takes the bar's own colour",
    /\.bar-control-spinner[\s\S]*?border-top-color: currentColor/.test(css),
    "a fixed colour is wrong on every scheme a creator can pick",
  )
  check(
    "and it stops turning when motion is turned down",
    /prefers-reduced-motion[\s\S]*?\.bar-control-spinner \{\s*animation: none/.test(css),
    "a complete ring still reads as waiting; a static gap reads as broken",
  )
}

console.log("\nThe gallery on a phone\n")

{
  const gallery = code("components/product/product-gallery.tsx")
  const css = readFileSync(join(root, "app/globals.css"), "utf8")

  /*
    ═════════════════════════════════════════════════════════════════════════
     THE RULE THAT DELETED THE CAROUSEL ON EVERY PHONE
    ═════════════════════════════════════════════════════════════════════════
    globals.css has, for touch-only devices:

        @media (hover: none) {
          .group *:not([data-keep-transform]) { transform: none !important }
        }

    It is there to stop a hover nudge firing on a tap. The gallery frame
    carries `group`, so on a phone it was also deleting the translate that IS
    the carousel: pressing a thumbnail changed the index and nothing moved,
    swiping dragged state that painted nowhere, and the picture looked stuck
    on the first one. Measured on a real product page with touch emulated:
    inline transform translate3d(calc(-100% + 0px), 0, 0), computed `none`.

    scripts/check-gallery-swipe runs as a touch-only device now and fails on a
    computed transform of `none`; this is the cheap version of the same check.

    THE ESCAPE IS BY CLASS NOW, NOT BY ATTRIBUTE. Swiper renders its own
    `.swiper-wrapper` and there is no prop that would put an attribute on it,
    so the rule names the class instead. Same exemption, same reason, and it
    also has to cover `transition-property`, because a programmatic slide is
    animated rather than written frame by frame.
  */
  check(
    "the rule that deletes transforms on touch devices spares Swiper's strip",
    /:not\(\.swiper-wrapper\)/.test(css),
    "without it the strip does not follow a finger and a thumbnail press jumps instead of sliding",
  )
  check(
    "and the escape hatch for everything else is still there",
    /\.group \*:not\(\[data-keep-transform\]\)/.test(css),
    "the attribute version covers the preview cards, which are not Swiper",
  )
}

console.log("\nThe full-screen picture viewer\n")

{
  const viewer = code("components/product/product-media-viewer.tsx")
  const gallery = code("components/product/product-gallery.tsx")
  const css = readFileSync(join(root, "app/globals.css"), "utf8")

  /*
    YouTube used to be filtered out before the viewer saw it, which broke the
    obvious thing — a video that would not open — and a quiet one: removing an
    item shifts every index after it, so opening picture four opened picture
    five, and closing wrote the filtered index back into the unfiltered list.
  */
  check(
    "the viewer is handed the gallery's list whole",
    /media=\{mediaItems\.map\(\(m\) => \(\{ type: m\.type, url: m\.url \}\)\)\}/.test(gallery) &&
      !/filter\(\(m\) => m\.type !== "youtube"\)/.test(gallery),
    "filtering shifts every index after the removed item",
  )
  check("so the two indices are the same number", /index=\{currentIndex\}/.test(gallery))
  check("and a video can open", /item\.type === "youtube"/.test(viewer) && /<iframe/.test(viewer))
  check(
    "with only the one being looked at mounted",
    /i === index \? \(\s*<iframe/.test(viewer),
    "three iframes behind a photograph is three documents loading, which is the swipe stuttering",
  )

  /* The open and close, which were the dialog's 200ms zoom from 95%. */
  check("it opens on its own curve, not the dialog's default", /disableDefaultAnimations/.test(viewer) && /media-viewer-panel/.test(viewer))
  check("the ground fades with it", /media-viewer-overlay/.test(viewer))
  check("opening is longer than closing", /media-viewer-in 300ms/.test(css) && /media-viewer-out 220ms/.test(css))
  check(
    "and it scales from 96.5%, not 95%",
    /@keyframes media-viewer-in[\s\S]{0,120}scale\(0\.965\)/.test(css),
    "at full-screen size a 5% jump is the whole viewport lurching",
  )
  check(
    "reduced motion states the resting state rather than only removing the animation",
    /media-viewer-panel\[data-state="open"\] \{\s*animation: none;\s*opacity: 1/.test(css),
    "fill-mode both pins an element at its from state, so `animation: none` alone opens to an empty screen",
  )
}

console.log("\nThe sticky add to cart, and the wait before a product page\n")

{
  const sticky = code("components/store-builder/sticky-add-to-cart.tsx")
  check(
    "the bar arrives over 420ms rather than 300",
    (sticky.match(/duration-\[420ms\] ease-sheet/g) ?? []).length === 2,
    "both bars, the editor's and the live one",
  )
  /*
    `translate`, not `transform`. Tailwind v4 emits the standalone property
    for `translate-y-*`, so naming `transform` here left the slide out of the
    transition entirely and the bar appeared in place with a fade. That is a
    whole class of mistake rather than one line, so tests/motion-properties
    sweeps the repository for it; this pins the bar it was found on.
  */
  check(
    "and animates only what the compositor can move",
    !/transition-all duration-300/.test(sticky) && /transition-\[opacity,translate\]/.test(sticky),
    "transition-all also animates the shadow, and a shadow cannot be composited",
  )

  /*
    The skeleton was a replica of the page: 42 pulsing shapes, on screen for
    about a third of a second. Everything in it that a person cannot finish
    looking at is noise, and every detail it gets wrong is a jump when the
    real content lands.
  */
  /*
    The skeleton is gone entirely now, and that is the point: a loading
    boundary is not a delay you can tune, so trimming it only made the grey
    page smaller. tests/marketing-weight holds the decision and its cost;
    what matters here is that the press is still answered.
  */
  check(
    "the product route has no loading boundary to swap the grid out for",
    !existsSync(join(root, "app/(marketing)/p/[slug]/loading.tsx")) &&
      !existsSync(join(root, "app/(marketing)/[sellername]/[productSlug]/loading.tsx")),
    "a boundary replaces the page you are on the instant a navigation starts",
  )
  /*
    AND THE BAR ON THE CARD IS GONE TOO, WHICH THIS LINE USED TO REQUIRE.

    It pinned a 3px indeterminate bar drawn on the pressed card while the
    navigation was in flight. The owner asked for it out: a loading indicator
    on a card is a loading indicator on the thing you are LEAVING, so it pulls
    the eye back to something that is about to be replaced.

    The question the line was asking still stands, so it is asked of what
    answers the press now. `active:brightness-95` lands in the same frame as
    the touch, before any navigation starts, and then stops.
  */
  check(
    "and the card that was pressed answers instead",
    /active:brightness-95/.test(code("components/explore/product-card.tsx")),
    "without a boundary the only thing left to say a press landed is the card itself",
  )
  check(
    "and nothing on the card keeps animating after it",
    !existsSync(join(root, "components/nav-pending.tsx")) &&
      !/NavPending/.test(code("components/explore/product-card.tsx")),
    "an indicator on the card being left is pointed at the wrong thing",
  )
}

console.log("\nPressing a product, and coming back\n")

{
  const card = code("components/explore/product-card.tsx")
  const smartLink = code("components/smart-link.tsx")

  /*
    ═════════════════════════════════════════════════════════════════════════
     A CARD IS A LINK INSIDE THE SAME APP
    ═════════════════════════════════════════════════════════════════════════
    `clientNav` defaulted to false, and in SmartLink false does not mean "no
    opinion" — it means force a full document load. So every product card
    outside the explore page threw the page away and asked the server for
    another one. Measured on the live site, pressing a card on a creator page
    and then pressing back:

        press -> a full document request, and `window` replaced
        back  -> a full document request, and three YouTube iframes again

    scripts/check-product-journey walks that round trip and fails when coming
    back costs a document request.
  */
  check(
    "a product card navigates on the client by default",
    /clientNav = true,/.test(card),
    "false is SmartLink's way of forcing a full document load, which makes back cost a round trip",
  )
  check(
    "and false still means what it says, for links that need it",
    /useClientNav === false \|\|/.test(smartLink),
    "the escape hatch has to keep working or the default above is a trap",
  )
  check(
    "the app surfaces are still hard navigations",
    /needsDocumentLoad\(internalPath\)/.test(smartLink) && /DOCUMENT_LOAD_PREFIXES = \["\/app"/.test(code("lib/native-links.ts")),
    "a different layout and a different auth context; a soft navigation carries state a reload is relied on to clear",
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}

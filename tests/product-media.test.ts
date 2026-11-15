/**
 * ===========================================================================
 *  THE PICTURES ON A PRODUCT PAGE, AND WHAT IT COSTS TO SHOW THEM
 * ===========================================================================
 * Four claims, three of them about bytes.
 *
 * THE FRONT PAGE'S COLLAGE WAS NOT BEING RESIZED AT ALL. Its URLs carried
 * `?width=280&height=350&resize=cover&quality=55` on Supabase's OBJECT
 * endpoint, which serves the stored file and ignores every one of those
 * parameters — the resizer is a different path entirely. So five full-size
 * WebPs were fetched on every visit, into cards about 160px wide, and the
 * query string made it look handled. That is the sort of thing a reader
 * cannot catch and a check can.
 *
 * `/render/image/` is NOT the fix and must never become it: that endpoint is
 * metered, this project's allowance is spent, and tests/no-image-transforms
 * fails the build over it. Next's optimizer is the one to use.
 *
 * The rest is structure — what opens, what it opens into, and where the
 * controls sit — because those are statements about what exists.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import { optimizedImageUrl } from "../lib/images/optimized-url"

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
/** Comments stripped for every check, presence ones included. */
const code = (p: string) => stripComments(readFileSync(join(root, p), "utf8"))

/* Changed on purpose (round AA1): the hero was remade, and its pictures are listed in lib/marketing/hero-media.ts and drawn through next/image. */
const hero = ["components/marketing/hero.tsx", "components/marketing/hero-video.tsx", "lib/marketing/hero-video.ts"].map(code).join("\n")
const gallery = code("components/product/product-gallery.tsx")
const viewer = code("components/product/product-media-viewer.tsx")

console.log("\nThe pictures on the front page's hero\n")

/*
  Changed on purpose (round AB1): the backdrop's tiles are files made at the
  size they are drawn (scripts/hero-shots.mjs, 360 x 450 WebP, a few KB each)
  and served as they are; the optimizer would only add a round trip. The
  slides still go through next/image. Neither is ever fetched at full size.
*/
check(
  "the cinematic hero uses a local poster with reserved geometry and native video decoding",
  /width=\{1600\}/.test(code("components/marketing/hero-video.tsx")) &&
    /height=\{900\}/.test(code("components/marketing/hero-video.tsx")) &&
    /preload="none"/.test(code("components/marketing/hero-video.tsx")) &&
    /object-fit: cover/.test(code("components/marketing/hero.tsx")),
)
check(
  "the parameters that did nothing are gone",
  !/resize=cover/.test(hero) && !/[?&]width=\d+&height=\d+/.test(hero),
  "the object endpoint ignores those, so they only made it look resized",
)
check(
  "and it did not switch to the metered resizer",
  !/render\/image/.test(hero),
  "that allowance is spent and the build fails over it",
)

/**
 * The descriptors have to be the widths the optimizer SERVES. next/image
 * writes the srcset from the widths it is configured to serve, so the hero
 * must not hand-build one beside it.
 */
// Changed on purpose (landing round 9): the poster is the film's first frame, and a phone gets the phone cut's frame: one <source media> naming one file, not a hand-built list of widths.
check("no hand-built srcset in the hero", !/srcSet=/.test(hero.replace("<source media={HERO_VIDEO.phoneMedia} srcSet={HERO_VIDEO.phonePoster}", "")) && (hero.match(/srcSet=/g) ?? []).length === 1)
{
  /* The helper the rest of the site uses still snaps to a served width and quality. */
  // Changed on purpose (round AW): Storelib's own storage project; the optimizer no longer fetches from any other *.supabase.co (next.config.mjs OWN_STORAGE_HOSTS).
  const small = optimizedImageUrl("https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/a.webp", 160, 75)
  const widthOf = (u: string) => Number(u.match(/[?&]w=(\d+)/)?.[1])
  check("and the optimizer's helper asks for a quality the config serves", widthOf(small) > 0 && /q=75/.test(small))
}

check(
  "the section nobody wanted is gone",
  !/makes you money/.test(code("components/marketing/split-features-section.tsx")),
)

console.log("\nThe product's own pictures\n")

/* Changed on purpose (the owner: "cleaner and calmer", no fade for a picture already loaded or cached, at most a short one for a new one). */
check(
  "a new slide waits on its grey box until its picture has loaded; one in the HTML, drawn before or complete is shown at once",
  /loaded\[index\] \|\| fromServer \|\| drawnSlides\.has\(media\.url\) \? "opacity-100" : "opacity-0"/.test(gallery),
  "painted at full opacity it snaps in the instant it decodes",
)
check(
  "and only a picture that arrived after its box was painted fades, over 150ms",
  /loaded\[index\] === "in" && "transition-opacity duration-150/.test(gallery) && !/duration-\[400ms\]/.test(gallery),
)
/*
  AND THE NEIGHBOURS ARE FETCHED WITH IT NOW, which is the second half of
  this. A slide is held transparent until its own picture decodes, so
  dragging toward one that was still lazy showed the empty box behind it for
  as long as the fetch took: a gap between one picture and the next, in the
  middle of the gesture. The rest stay lazy, which is what this line was
  protecting and still protects.

  `index === 0` is in the test twice over on purpose: that slide carries
  `priority`, and Next throws outright on an image that is both priority and
  lazy — which it became the moment the gallery moved two slides away.
*/
check(
  "the first one is fetched from the document head",
  /priority=\{index === 0\}/.test(gallery) &&
    /loading=\{index === 0 \|\| Math\.abs\(index - currentIndex\) <= 1 \? "eager" : "lazy"\}/.test(gallery),
  "eight pictures should not all be fetched before anyone asks, and the two either side should be",
)

console.log("\nThe thumbnail strip\n")

check(
  "the selected one is a hairline, not an accent with a halo",
  !/border-primary ring-2 ring-primary\/20/.test(gallery),
  "a violet border and a glow under a photograph reads as a focused form field",
)
check(
  "and there is no coloured glow left behind it",
  !/boxShadow: `0 0 0 2px \$\{selectionColor\}33`/.test(gallery),
)
check(
  "the unselected ones step back instead",
  /border-transparent opacity-55/.test(gallery),
)

console.log("\nOpening a picture, on a phone\n")

check(
  "the viewer is only mounted on a phone",
  /\{isPhone && \(\s*<ProductMediaViewer/.test(gallery),
  "a desktop visitor should not download a lightbox nothing can open",
)
/*
  THE ENGINE ANSWERS THIS rather than a pixel count of our own. The gallery
  used to measure how far the finger had travelled and call anything under
  ten pixels a tap. Swiper already knows: `allowClick` is false for the click
  that ends a drag, and it is a documented part of the instance rather than
  something reached out of its internals.
*/
check(
  "a swipe does not count as a tap",
  /if \(!carousel\.clickAllowed\(\)\) return/.test(gallery) &&
    /swiper\.allowClick !== false/.test(code("components/product/media-swiper.tsx")),
  "onClick fires after a swipe too, so the viewer would open on every slide change",
)
/*
  `inset-0` rather than `h-dvh w-screen` now. Same claim — the panel is the
  viewport and carries no transform of its own — and one fewer bug: 100vw
  includes the scrollbar where a fixed element's right edge does not, which is
  how the avatar lightbox put its close button in the gutter.
*/
check(
  "the panel is the viewport and is not transformed",
  /translate-x-0 translate-y-0/.test(viewer) && /inset-0/.test(viewer) && !/w-screen/.test(viewer),
  "a transformed ancestor anchors every fixed child to itself — that cost the avatar lightbox a round",
)
check(
  "so the close control is absolute against the screen",
  /className="absolute z-20 inline-flex h-11 w-11/.test(viewer),
)
/*
  ONE ENGINE, AND THESE ASK WHAT A PROBE CANNOT SEE.

  These used to read the viewer's own axis lock and its own release test,
  because the viewer had a complete second copy of the gesture and the gallery
  had a third. They drifted, and the same flick changed the picture in one
  place and sprang back in the other. Then a shared hook over Embla replaced
  both, and now Swiper replaces that.

  What a swipe actually does with a finger is measured in a real browser by
  scripts/check-gallery-swipe — tracking, cost and the gap — rather than read
  out of a file. What is pinned here is that there is ONE engine, that it is a
  library, and the two things about a full-screen dialog that a carousel
  cannot know.
*/
const swiperModule = code("components/product/media-swiper.tsx")
check(
  "the viewer shares the gallery's carousel rather than rolling its own",
  /<MediaSwiper/.test(viewer) && !/axis\.current/.test(viewer) && !/onTouchMove/.test(viewer),
  "two copies of one gesture drift, and the drift is a flick that works in one place and not the other",
)
check(
  "and that carousel is Swiper, not a fifth attempt at one",
  /from "swiper\/react"/.test(swiperModule),
  "momentum, pointer input, resize and re-measure are what four hand-rolled versions each missed",
)
check(
  "full screen it does not wrap silently from the last picture to the first",
  !/loop/.test(viewer),
  "at the end of a set of pictures, the end should feel like the end",
)
/*
  A DIALOG MEASURES NOTHING WHILE IT IS CLOSED. Swiper sizes its slides on
  init, and a closed dialog has no layout — every slide is zero wide, so the
  strip lands between pictures the moment it opens.
*/
check(
  "it re-measures when the dialog opens",
  /swiper\.update\(\)/.test(viewer) && /swiper\.slideTo\(index, 0\)/.test(viewer),
  "slides sized against a closed dialog are zero wide, and the strip settles between pictures",
)
check(
  "the picture is shown whole, not cropped",
  /className="object-contain"/.test(viewer),
  "the gallery crops to keep a layout; opening it is how you see what was cropped",
)
check(
  "and only the neighbours are fetched",
  /Math\.abs\(i - index\) <= 1/.test(viewer),
)

console.log("\nControls a thumb can actually hit\n")

const header = code("components/platform/platform-header-client.tsx")
/*
  WHAT MATTERS IS THE SIZE OF THE TARGET, NOT THE CLASS THAT MADE IT.

  This used to look for `before:-inset-2` twice. That is one way to write
  slack, and it stopped being the right one for the menu button: the logo link
  sits immediately to its right, so an even ring around it put the two targets
  on top of each other and the logo won the hit test. Its slack is asymmetric
  now, wide on the side with nothing next to it.

  So this measures the button plus its pseudo element on each side and checks
  the result against 44px, which is the number the ring was standing in for.
*/
const SIDES = ["top", "right", "bottom", "left"] as const
/** Tailwind spacing to pixels: the scale is 4px a step. */
const px = (step: string) => Number(step.replace("-", ".")) * 4

function hitArea(className: string) {
  const pad: Record<string, number> = { top: 0, right: 0, bottom: 0, left: 0 }
  const ring = className.match(/before:-inset-(\d+(?:[.-]\d+)?)/)
  if (ring) for (const side of SIDES) pad[side] = px(ring[1])
  for (const side of SIDES) {
    const one = className.match(new RegExp(`before:-${side}-(\\d+(?:[.-]\\d+)?)`))
    if (one) pad[side] = px(one[1])
  }
  const w = className.match(/(?:^|\s)w-(\d+(?:[.-]\d+)?)\b/)
  const h = className.match(/(?:^|\s)h-(\d+(?:[.-]\d+)?)\b/)
  /* A size written in pixels, `h-[42px]`, is the size too. */
  const wPx = className.match(/(?:^|\s)w-\[(\d+)px\]/)
  const hPx = className.match(/(?:^|\s)h-\[(\d+)px\]/)
  return {
    width: (w ? px(w[1]) : wPx ? Number(wPx[1]) : 0) + pad.left + pad.right,
    height: (h ? px(h[1]) : hPx ? Number(hPx[1]) : 0) + pad.top + pad.bottom,
  }
}

/* Changed on purpose: the header's classes moved into cn() beside the theme's (158acdef6), and the menu left of the logo
   is the PlaceNavigator (2d576f55a), whose button sets its own size in components/nav/place-navigator.tsx while the
   header gives it the slack. So a control's size is read from its own class, or from that button for the navigator. */
const navigatorButton = (code("components/nav/place-navigator.tsx").match(/data-place-navigator-trigger=""\s*className=\{cn\(\s*"([^"]*)"/) ?? [])[1] ?? ""
const slackedControls = [...header.matchAll(/className=(?:"|\{cn\(")([^"]*before:absolute[^"]*)"/g)].map((m) => {
  const tag = header.slice(header.lastIndexOf("<", m.index), m.index)
  return hitArea(tag.startsWith("<PlaceNavigator") ? `${navigatorButton} ${m[1]}` : m[1])
})
check(
  "the menu button has slack around it",
  slackedControls.length >= 2 && slackedControls.every((a) => a.width >= 44 && a.height >= 44),
  `40px in the corner of a screen is under what a thumb reliably hits: ${JSON.stringify(slackedControls)}`,
)
check(
  "and it does not wait to see if it was a double tap",
  (header.match(/touch-manipulation/g) || []).length >= 2,
)

const css = readFileSync(join(root, "app/globals.css"), "utf8")
check(
  "the bar control's hover needs a real pointer",
  /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.bar-control:hover/.test(css),
  "a touch device that reports hover applies :hover on tap and keeps it — the grey that sticks",
)

console.log("\nThe creator page does not start from three queries of its own\n")

const layout = code("app/(storelib)/(marketing)/u/[username]/layout.tsx")
/* Changed on purpose (rel-public): the helper holds the layout's two facts for every visitor (heldShopLayout), since the layout also wraps the OnePage at /<name>/links. */
check(
  "the layout asks one helper for the one thing it needs",
  /heldShopLayout\(username\)/.test(layout),
  "it ran profiles, creators and store_builder_configs in series before anything could render",
)
check(
  "and no longer queries anything itself",
  !/from\("profiles"\)/.test(layout) && !/from\("creators"\)/.test(layout),
)
check(
  "the page shares those same lookups",
  /loadProfileByUsername\(username\)/.test(code("app/(storelib)/(marketing)/u/[username]/page.tsx")) &&
    /loadCreatorForUser\(profile\.id\)/.test(code("app/(storelib)/(marketing)/u/[username]/page.tsx")),
  "deduped per request: whichever asks first pays",
)
check(
  "they are deduped rather than merely extracted",
  /cache\(async \(username: string\)/.test(code("lib/commerce/creator-page-data.ts")),
  "a shared function that is not cached is the same two queries with one name",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}

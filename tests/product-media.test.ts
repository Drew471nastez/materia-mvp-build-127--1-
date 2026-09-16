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

const hero = code("components/marketing/hero.tsx")
const gallery = code("components/product/product-gallery.tsx")
const viewer = code("components/product/product-media-viewer.tsx")

console.log("\nThe collage behind the front page's headline\n")

check(
  "its images go through the optimizer",
  /optimizedImageUrl\(src, 160, 75\)/.test(hero) && /optimizedImageUrl\(src, 320, 75\)/.test(hero),
  "they were being fetched at full size",
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
 * The descriptors have to be the widths the optimizer was ASKED for, not the
 * ones the cards happen to be: `optimizedImageUrl` snaps to a width Next will
 * serve, so a srcset that claims otherwise makes the browser choose wrongly.
 */
{
  const small = optimizedImageUrl("https://x.supabase.co/a.webp", 160, 75)
  const large = optimizedImageUrl("https://x.supabase.co/a.webp", 320, 75)
  const widthOf = (u: string) => Number(u.match(/[?&]w=(\d+)/)?.[1])
  /* A plain string, not a regex: the thing being compared is itself full of
     `$`, `{` and `[`, and escaping all of them for a pattern is how a check
     ends up testing its own escaping rather than the file. */
  const wanted = "${IMAGES_SM[imageIdx]} " + widthOf(small) + "w, ${IMAGES_LG[imageIdx]} " + widthOf(large) + "w"
  check(
    "the srcset descriptors match the widths actually requested",
    hero.includes(wanted),
    `wanted \`${wanted}\``,
  )
  check("and it asks for a quality the config serves", widthOf(small) > 0 && /q=75/.test(small))
}

check(
  "the section nobody wanted is gone",
  !/makes you money/.test(code("components/marketing/split-features-section.tsx")),
)

console.log("\nThe product's own pictures\n")

check(
  "a slide is transparent until its picture has decoded",
  /loaded\[index\] \? "opacity-100" : "opacity-0"/.test(gallery),
  "painted at full opacity it snaps in the instant it decodes",
)
check(
  "and it fades rather than appearing",
  /transition-opacity duration-\[400ms\]/.test(gallery),
)
check(
  "the first one is fetched from the document head",
  /priority=\{index === 0\}/.test(gallery) && /loading=\{index === 0 \? "eager" : "lazy"\}/.test(gallery),
  "eight pictures should not all be fetched before anyone asks",
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
  Asked of Embla's public events now. A click fires at the end of a drag as
  well as after a tap, and `clickAllowed()` — Embla's own answer — is not on
  its public type in 8.5.1; it sits behind `internalEngine()`, which is how a
  dependency bump breaks a product page in silence. `scroll` fires whenever
  the strip moves, so a gesture that moved has fired it and a tap has not.
*/
check(
  "a swipe does not count as a tap",
  /if \(dragMoved\.current\) return/.test(gallery),
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
  ONE ENGINE, AND IT IS EMBLA'S IN BOTH PLACES.

  The viewer had a complete second copy of the gesture; then a shared hook was
  lifted out of it so the two could not drift; and the two drifted anyway,
  because the hook had no momentum and neither did the copy. Every release ran
  a fixed 300ms curve whatever the finger did, which is the whole of "it feels
  laggish" — a hard flick and a slow drag arrived at exactly the same speed.

  Both are Embla now. The axis lock and the flick threshold are its problem,
  so what is checked is that this file did not keep a copy of either, and the
  two things a carousel library cannot know about a full-screen dialog.
*/
check(
  "the viewer uses the same engine as the gallery, and keeps no copy",
  /useEmblaCarousel\(/.test(viewer) && !/axis\.current/.test(viewer) && !/useSwipeTrack/.test(viewer),
  "two implementations of one gesture drift, and this pair already did",
)

/*
  A DIALOG MEASURES NOTHING WHILE IT IS CLOSED. Embla sizes its slides once,
  on init, and a closed dialog has no layout — so every slide is zero wide and
  the strip settles on the wrong one the moment it opens. Re-measured on open,
  and jumped straight to the picture that was tapped rather than animating
  through the ones in between.
*/
check(
  "it re-measures when the dialog opens",
  /emblaApi\.reInit\(\)/.test(viewer) && /scrollTo\(index, true\)/.test(viewer),
  "slides sized against a closed dialog are zero wide, and the strip lands between pictures",
)

check(
  "and the full-screen strip opts out of the touch-device transform rule too",
  /data-keep-transform/.test(viewer),
  "`transform: none !important` on a touch device would freeze this one the same way",
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
check(
  "the menu button has slack around it",
  (header.match(/before:-inset-2/g) || []).length >= 2,
  "40px in the corner of a screen is under what a thumb reliably hits",
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

const layout = code("app/(marketing)/u/[username]/layout.tsx")
check(
  "the layout asks one helper for the one thing it needs",
  /loadShopThemePreset\(username\)/.test(layout),
  "it ran profiles, creators and store_builder_configs in series before anything could render",
)
check(
  "and no longer queries anything itself",
  !/from\("profiles"\)/.test(layout) && !/from\("creators"\)/.test(layout),
)
check(
  "the page shares those same lookups",
  /loadProfileByUsername\(username\)/.test(code("app/(marketing)/u/[username]/page.tsx")) &&
    /loadCreatorForUser\(profile\.id\)/.test(code("app/(marketing)/u/[username]/page.tsx")),
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

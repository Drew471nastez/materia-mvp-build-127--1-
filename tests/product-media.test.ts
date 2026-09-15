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
check(
  "a swipe does not count as a tap",
  /if \(moved > 10\) return/.test(gallery),
  "onClick fires after a swipe too, so the viewer would open on every slide change",
)
check(
  "the panel is the viewport and is not transformed",
  /translate-x-0 translate-y-0/.test(viewer) && /h-dvh w-screen/.test(viewer),
  "a transformed ancestor anchors every fixed child to itself — that cost the avatar lightbox a round",
)
check(
  "so the close control is absolute against the screen",
  /className="absolute z-20 inline-flex h-11 w-11/.test(viewer),
)
check(
  "the swipe locks to one axis before it moves anything",
  /axis\.current = Math\.abs\(dx\) > Math\.abs\(dy\) \? "x" : "y"/.test(viewer),
  "without it a vertical swipe drags the track sideways and springs back",
)
check(
  "a short flick counts as well as a long drag",
  /velocity > FLICK_VELOCITY/.test(viewer),
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

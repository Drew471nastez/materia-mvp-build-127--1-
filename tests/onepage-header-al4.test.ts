/**
 * ROUND AL, TRACK AL4: the OnePage header, cover, wallpaper and the Design
 * tab's way back. scripts/check-onepage-header-al4.mjs measures them in
 * headless Chromium; this pins the rules behind the numbers.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { driftGradient } from "@/components/onepage/wallpaper-layers"
import { OWN_COVER_ASPECT, coverAspect } from "@/lib/onepage/theme-layout"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const page = read("components/onepage/public-onepage.tsx")
const design = read("components/onepage/tabs/design-tab.tsx")
const layers = read("components/onepage/wallpaper-layers.tsx")
const coverEditor = read("components/onepage/header-cover-editor.tsx")

section("The cover runs edge to edge")
check("the creator's own cover is 5:2, the shape the crop editor reads too", OWN_COVER_ASPECT === 2.5 && coverAspect({ cover_image_url: "https://storelib.com/x.jpg", cover_profile_layout: true }, false) === 2.5 && coverAspect({ cover_image_url: "https://storelib.com/x.jpg", cover_profile_layout: true }, true) === 2.5)
check("no rounding of its own and no inset margin", !/borderRadius: ownCover && !heroCover \? 16/.test(page) && !/ownCover && !heroCover \? "w-full"/.test(page))
check("no longer pulled 32px above the top of a phone's page", !/"-mx-5 -mt-8 w-\[calc\(100%\+40px\)\]"/.test(page))
check("fetched first", /loading="eager" fetchPriority="high" decoding="async"/.test(page))
check("Your files beside the cover upload", /LibraryButton onClick=\{\(\) => setLibrary\(true\)\}/.test(coverEditor) && /<FilesLibraryChooser/.test(coverEditor))
check("the cover sits under the profile image layout in Header", design.indexOf('title={tt("Profile image layout")}') > 0 && design.indexOf("<HeaderCoverEditor />") > design.indexOf('title={tt("Profile image layout")}'))

section("The pattern keeps out from behind the header")
check("the phone page and the computer's card both clear the header", (page.match(/<WallpaperPattern theme=\{safeTheme\}[^>]*clearHeader \/>/g) ?? []).length === 2)
check("each measures once, with one hook", /useHeaderClearance\(cardRef,/.test(page) && /useHeaderClearance\(phonePageRef,/.test(page))
check("the social row is marked for it", /data-op-social-row=""/.test(page))
check("measured by layout, not as drawn during the arrival rise", /function layoutTop\(/.test(layers) && /offsetTop/.test(layers))

section("The gradient drifts on the compositor")
const d = driftGradient("linear-gradient(180deg, #f7c59f 0%, #c4553b 100%)")
check("stops move into the middle two thirds, so the page at rest is unchanged", d?.image === "linear-gradient(180deg, #f7c59f 16.667%, #c4553b 83.333%)", JSON.stringify(d))
check("its angle is kept for the direction of travel", d?.angle === 180)
check("a gradient it cannot read is left alone", driftGradient("radial-gradient(#fff, #000)") === null && driftGradient("linear-gradient(90deg, #fff, #000)") === null && driftGradient(null) === null)
check("the page no longer repaints a background-position animation", !/gradientShiftLive/.test(page))
check("a transform animation on one layer", /@keyframes onepageDrift\{from\{transform:translate3d/.test(layers) && /data-keep-transform=""/.test(layers))
check("not drawn with reduced motion, paused while the tab is hidden", /prefers-reduced-motion:reduce\)\{\[data-wallpaper-drift\]\{display:none\}/.test(layers) && /document\.hidden \? "paused"/.test(layers))

section("The avatar opens, as on the creator pages")
check("the creator pages' viewer, around the page's photo", /<AvatarLightbox src=\{hasVideo \? null : onePageImageSrc\(profile\.avatar_url, 640\)\}/.test(page))

section("Design: the way back stays in reach")
check("a sticky slot at the top of an open panel", /<StickyPanelBack panelRef=\{panelRef\}/.test(design) && /className="sticky top-0 z-20 h-0"/.test(design))
check("shown by an IntersectionObserver on the panel's header, not a scroll listener", /new IntersectionObserver\(/.test(design) && /io\.observe\(header\)/.test(design))
check("a Classic theme keeps a creator's Hero", /currentHeaderLayout !== "hero"/.test(design) && !/Update to Classic"\)\}\s*<\/button>[\s\S]{0,400}function WallpaperSection/.test(design))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

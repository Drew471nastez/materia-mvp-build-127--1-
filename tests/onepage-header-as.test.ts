/**
 * Round AS: the OnePage shell, header, cover and layout, on the live page and
 * in the editor's preview (one component, components/onepage/public-onepage).
 *
 *   - the profile bar forms over the name as the name scrolls under it, on
 *     every header layout, driven by the page's own scroll (no timer, so the
 *     way back up is the way down in reverse); the verified badge rides in it;
 *     on a computer it floats inside the card instead of a strip cut at its
 *     sides
 *   - Share and Subscribe change only after real travel one way, from one
 *     shared listener (the page is never rendered by a scroll), and fade on
 *     the button while the box only moves, so the frosted fill never drops
 *   - the fade layout: a large picture melting into the page on an eased
 *     mask, the name over the melted part with a halo of the page's colour,
 *     from the very top of a phone's page
 *   - the creator's own cover fades at its foot, on by default, with a switch
 *   - the computer's card is 550px, a tenth wider
 *   - every sideways row runs to the column's edge (one rail)
 *
 * scripts/check-onepage-header-as.mjs measures them frame by frame in Chromium.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BAR_DESKTOP_INSET_PX, BAR_MORPH_PX, BAR_PHONE_PX, BAR_DESKTOP_PX, CORNER_START, CORNER_TOP_PX, CORNER_TRAVEL_PX, barMorph, cornerNext, type CornerState } from "@/lib/onepage/feel"
import { coverFades } from "@/lib/onepage/theme-layout"
import { COVER_FADE_MASK, HERO_FADE_MASK } from "@/lib/onepage/poster-video"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const page = read("components/onepage/public-onepage.tsx")
const bar = read("components/onepage/hero-scroll.tsx")
const css = read("app/globals.css")

/* ── The bar ── */
check("nothing while the name is a full morph below the bar", barMorph(60 + BAR_MORPH_PX, 60) === 0 && barMorph(600, 60) === 0)
check("half way at half the distance, whole once the name is under it", barMorph(60 + BAR_MORPH_PX / 2, 60) === 0.5 && barMorph(60, 60) === 1 && barMorph(-400, 60) === 1)
{
  let prev = -1
  let ok = true
  for (let y = 300; y >= -50; y -= 3) {
    const p = barMorph(y, 60)
    if (p < prev) ok = false
    prev = p
  }
  check("it only grows as the name rises, so the way back is the way down reversed", ok)
}
check("a name not yet laid out draws no bar", barMorph(Number.NaN, 60) === 0)
check("the bar's sizes: 60px on a phone, 56px floating 12px inside the computer's card", BAR_PHONE_PX === 60 && BAR_DESKTOP_PX === 56 && BAR_DESKTOP_INSET_PX === 12)
check("the bar is driven by the scroll through barMorph, on a passive listener, opacity and transform only", /barMorph\(anchor\.getBoundingClientRect\(\)\.bottom, barBottom\)/.test(bar) && /addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(bar) && /bar\.style\.opacity = String\(p\)/.test(bar) && /inner\.style\.transform = `translate3d/.test(bar))
check("it forms over the name, else the picture, else the header", /\[data-op-bar-anchor\]"\) \?\? visibleOf\("\[data-page-avatar\]"\)/.test(bar) && (page.match(/data-op-bar-anchor=""/g) || []).length === 4)
check("on every header layout, not only the Hero", /<HeroTopBar\s+enabled=\{safeBlocks\.some\(\(b: OnePageBlock\) => b\.type === "header" && isBlockVisible\(b\)\)\}/.test(page) && /heroEffect=\{heroScrollEffect\(/.test(page))
check("the verified badge rides in it, without a tip that would hang off the top", /badge=\{safeSettings\.verified_badge_enabled \? <VerifiedBadge size=\{16\} badgeType=\{safeSettings\.verified_badge_type\} tip=\{false\} \/> : null\}/.test(page) && /data-op-topbar-badge=""/.test(bar))
check("on a computer it floats inside the 550px card, its corner concentric with the card's 40px", /md:inset-x-\[max\(28px,calc\(50%_-_263px\)\)\] md:top-3 md:rounded-\[28px\]/.test(bar) && 275 - BAR_DESKTOP_INSET_PX === 263 && 40 - BAR_DESKTOP_INSET_PX === 28)
check("its heights live in one stylesheet rule the row reads", /\.op-topbar \{\s*--op-bar-h: 60px;/.test(css) && /\.op-topbar \{\s*--op-bar-h: 56px;/.test(css) && /height: `var\(--op-bar-h, \$\{BAR_PHONE_PX\}px\)`/.test(bar))
check("the Hero's name stays until the bar forms over it, in the stylesheet and the fallback alike", /@keyframes op-hero-title \{\s*0%, 62% \{ opacity: 1; \}\s*92%, 100% \{ opacity: 0; \}/.test(css) && /-r\.top \/ r\.height - 0\.62\) \/ 0\.3/.test(bar))

/* ── The corner buttons ── */
const walk = (ys: number[], from: CornerState = CORNER_START) => ys.reduce((s, y) => cornerNext(s, y), from)
check("near the top they always show", walk([0, 200, 400, CORNER_TOP_PX]).shown && walk([-60]).shown)
check("travel down hides them", !walk([100, 100 + CORNER_TRAVEL_PX + 1]).shown)
const down = walk([100, 200, 300, 400])
check("a wobble of a finger never flips them", !walk([392, 400, 390, 400, 388, 398], down).shown)
check("travel up brings them back", walk([400 - CORNER_TRAVEL_PX - 1], down).shown)
check("the same position again changes nothing", cornerNext(down, 400) === down)
check("the page renders no state of its own on a scroll", !/buttonsVisible/.test(page) && !/lastScrollY/.test(page) && (page.match(/useCornerButtonsShown\(\)/g) || []).length === 2)
check("one shared listener, held between the top and the page's end", /window\.addEventListener\("scroll", onCornerScroll, \{ passive: true \}\)/.test(bar) && /Math\.min\(Math\.max\(0, window\.scrollY\), end\)/.test(bar))
check("the box only moves and the button fades, so the frosted fill never drops", /const CORNER_BOX_CLASS = "[^"]*will-change-transform transition-transform/.test(page) && /const CORNER_BUTTON_CLASS = "[^"]*will-change-\[opacity\] transition-opacity/.test(page) && !/transition-\[opacity,translate\] duration-500/.test(page))
check("on a phone they sit on the bar's row, under the status bar", /top-\[calc\(env\(safe-area-inset-top\)\+10px\)\]/.test(page))

/* ── The fade layout and the cover ── */
const stops = (m: string) => (m.match(/rgba\(/g) || []).length
check("the fade layout melts on an eased mask", /^linear-gradient\(to bottom, #000 0%/.test(HERO_FADE_MASK) && /transparent 100%\)$/.test(HERO_FADE_MASK) && stops(HERO_FADE_MASK) >= 6)
check("the own cover melts on a shorter one", /^linear-gradient\(to bottom, #000 0%, #000 52%/.test(COVER_FADE_MASK) && /transparent 100%\)$/.test(COVER_FADE_MASK) && stops(COVER_FADE_MASK) >= 4)
check("the fade layout's picture is large: 4/5 on a phone, square on a computer", /const aspectRatio = isDesktop \? "1\/1" : "4\/5"/.test(page))
check("from the very top of a phone's page", /const heroMargin = isDesktop \? "-mx-7 -mt-0" : "-mx-5"/.test(page))
check("its name has a halo of the page's colour, not a black shadow", /const halo = `color-mix\(in srgb, \$\{pageCanvasColour\(theme as any\)\} 72%, transparent\)`/.test(page) && !/textShadow: "0 2px 8px rgba\(0,0,0,0\.4\)"/.test(page))
const own = { cover_image_url: "https://storelib.com/c.jpg", cover_profile_layout: true }
check("the creator's own cover fades by default", coverFades(own) && coverFades({ ...own, header_layout: "classic" }))
check("and keeps its band when switched off", !coverFades({ ...own, cover_fade: false }))
check("a Hero made from it always fades", coverFades({ ...own, header_layout: "hero", cover_fade: false }))
check("a theme's own cover and no cover stay as they were", !coverFades({ cover_image_url: "https://storelib.com/c.jpg" }) && !coverFades({ cover_profile_layout: true }) && !coverFades(null))
check("the band reads it, and leaves no tint behind a fade", /const coverMask = heroCover \? HERO_FADE_MASK : coverFade \? COVER_FADE_MASK : undefined/.test(page) && /backgroundColor: coverMask \? undefined :/.test(page))
check("the switch sits under the cover in Design", /label=\{tt\("Fade into the page"\)\}/.test(read("components/onepage/header-cover-editor.tsx")) && /cover_fade: on/.test(read("components/onepage/header-cover-editor.tsx")))

/* ── The card and the rows ── */
check("the computer's card is 550px", /max-w-\[550px\] mx-4 rounded-\[40px\]/.test(page) && !/max-w-\[500px\] mx-4 rounded-\[40px\]/.test(page))
check("one rail for every sideways row, out to the column's edge", /\.op-rail \{\s*width: auto;\s*margin-inline: calc\(-1 \* var\(--op-gutter, 4px\)\);\s*padding-inline: var\(--op-gutter, 4px\);\s*scroll-padding-inline: var\(--op-gutter, 4px\);/.test(css))
check("the column names its side padding once", /\["--op-gutter" as string\]: isDesktop \? "28px" : "20px",\s*paddingLeft: "var\(--op-gutter\)"/.test(page))
check("a half block or a pair keeps its rail inside", /:is\(\[data-block-size="half"\], \[data-block-size="tall"\], \[data-link-tile\], \[data-product-pair\] > \*, \[data-group-grid\] > \*\) \{ --op-gutter: 4px; \}/.test(css))
for (const file of ["components/onepage/app-block.tsx", "components/onepage/data-blocks.tsx", "components/onepage/storelib-blocks.tsx", "components/onepage/creator-blocks.tsx"]) {
  const src = read(file)
  const scrollers = src.match(/"[^"]*snap-x[^"]*overflow-x-auto[^"]*"/g) || []
  check(`${file}: every sideways row is on the rail (${scrollers.length})`, scrollers.length > 0 && scrollers.every((c) => /\bop-rail\b/.test(c)) && !/-mx-1 flex snap-x/.test(src))
}
check("the group's carousel and the picture slider are on it too", /data-group-carousel=""\s*className="op-rail /.test(page) && /data-onepage-slides=""\s*className=\{cn\("op-rail /.test(page))
check("a group's soft edges fade over the page's own gutter", /const SOFT_EDGES = "linear-gradient\(to right, transparent 0, #000 var\(--op-gutter, 28px\)/.test(page))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}

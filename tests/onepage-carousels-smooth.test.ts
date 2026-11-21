/**
 * ROUND 19: every row on a OnePage that slides sideways (a group's carousel of links, blocks or products, a shelf,
 * posts, an app block's carousel, reviews, the slideshow) glides without a jolt under a finger, a mouse and a
 * trackpad, fades out softly only on the side that has more, shows its arrows on every theme, pages with dots that
 * never move, and shows product pictures in their own shape. scripts/check-onepage-carousels.mjs measures them in
 * headless Chromium (390x844 touch and 1280x900, dark, light, image and gradient pages, CPU 4x).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { RAIL_END_SLACK_PX, WHEEL_INTENT_PX, dotLook, isSidewaysWheel, nearestStop, railEdges, railProgress, railStops, wheelRestingPoint } from "@/lib/onepage/rail"
import { withOriginalCover } from "@/lib/products/cover"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

section("Soft edges: only where there is more")
{
  check("a row that fits has no fade", JSON.stringify(railEdges(0, 300, 300)) === JSON.stringify({ start: false, end: false }))
  check("at the start: the end only", JSON.stringify(railEdges(0, 1000, 390)) === JSON.stringify({ start: false, end: true }))
  check("in the middle: both", JSON.stringify(railEdges(300, 1000, 390)) === JSON.stringify({ start: true, end: true }))
  check("at the end: the start only", JSON.stringify(railEdges(610, 1000, 390)) === JSON.stringify({ start: true, end: false }))
  check("a fraction of a pixel from an end is at it", !railEdges(RAIL_END_SLACK_PX - 0.5, 1000, 390).start && !railEdges(610 - RAIL_END_SLACK_PX + 0.5, 1000, 390).end)
  check("a row laid right to left (negative scroll) reads the same", railEdges(-300, 1000, 390).start && railEdges(-300, 1000, 390).end)
  const css = read("app/globals.css")
  check("the fade is a mask (no colour of its own), on both prefixes", /\.op-rail:is\(\[data-more-start\], \[data-more-end\]\) \{\s*-webkit-mask-image: linear-gradient\(to right, transparent 0, #000 var\(--op-fade-start\)/.test(css) && /\n\s*mask-image: linear-gradient\(to right, transparent 0, #000 var\(--op-fade-start\)/.test(css))
  check("each side only with more that way", /\.op-rail\[data-more-start\] \{ --op-fade-start:/.test(css) && /\.op-rail\[data-more-end\] \{ --op-fade-end:/.test(css))
  check("the fade grows in (registered lengths), still under reduced motion", /@property --op-fade-start \{ syntax: "<length>"/.test(css) && /prefers-reduced-motion: reduce\) \{\s*\.op-rail \{ transition: none; scroll-behavior: auto !important; \}/.test(css))
  check("Soft edges on a group asks for the longer fade", /\[data-rail-fade="wide"\]\[data-more-end\]/.test(css) && /data-rail-fade=\{data\.carousel_fade_edges \? "wide" : undefined\}/.test(code("components/onepage/public-onepage.tsx")))
  check("the group's own old mask is gone (one fade for every row)", !/SOFT_EDGES/.test(read("components/onepage/public-onepage.tsx")))
}

section("A trackpad: one glide onward, never a fight with the snap")
{
  const points = [0, 400, 800, 1200]
  check("a sideways wheel is the row's, an upward one the page's", isSidewaysWheel(12, 3) && !isSidewaysWheel(2, 30) && !isSidewaysWheel(0, 0))
  check("a nudge goes back to where it began", wheelRestingPoint(points, 400, 400 + WHEEL_INTENT_PX - 1, 1200) === 400)
  check("a short push goes on to the next slide, not back", wheelRestingPoint(points, 0, 150, 1200) === 400)
  check("a push back goes to the slide before", wheelRestingPoint(points, 800, 650, 1200) === 400)
  check("momentum over two slides rests on the next stop ahead", wheelRestingPoint(points, 0, 870, 1200) === 1200)
  check("already on a slide: stays", wheelRestingPoint(points, 0, 800.5, 1200) === 800)
  check("the last slide of a 1.5-up row rests at the row's end", wheelRestingPoint([0, 300, 600, 900], 0, 520, 700) === 600 && wheelRestingPoint([0, 300, 600, 900], 300, 650, 700) === 700)
  check("a row without slides stays where the wheel left it", wheelRestingPoint([], 0, 333, 1000) === 333)
  const rail = code("components/onepage/rail.ts")
  check("the wheel listener is passive (the page's scroll is never held)", /addEventListener\("wheel", onWheel, \{ capture: true, passive: true \}\)/.test(rail))
  check("snap off while the wheel turns, back once landed", /scrollSnapType = "none"/.test(rail) && /whenLanded\(row, target, done\)/.test(rail) && /WHEEL_IDLE_MS/.test(rail))
  check("one listener for every row, mounted once on the page", /useRails\(\)/.test(code("components/onepage/public-onepage.tsx")))
}

section("The snap comes back on landing, not on a clock")
{
  const drag = code("components/onepage/drag-scroll.ts")
  check("no fixed 700ms ceiling any more", !/setTimeout\((done|land), 700\)/.test(drag))
  check("both drags wait for the row to reach its target", (drag.match(/whenLanded\(row, target,/g) ?? []).length === 2)
  check("a glide under reduced motion is a jump", /prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"/.test(drag) && (drag.match(/behavior: glideBehavior\(\)/g) ?? []).length === 2)
}

section("Dots and arrows: from the scroll, without React, never moving")
{
  const stops = railStops([0, 412.4, 824.8, 1237.2, 1300], 1000)
  check("the stops a row can rest at, each once", JSON.stringify(stops) === JSON.stringify([0, 412, 825, 1000]))
  check("the nearest stop", nearestStop(stops, 600) === 1 && nearestStop(stops, 700) === 2)
  check("progress between stops", Math.abs(railProgress([0, 400, 800], 600) - 1.5) < 1e-9 && railProgress([0, 400, 800], -5) === 0 && railProgress([0, 400, 800], 900) === 2)
  for (const p of [0, 0.3, 1.5, 2.9]) {
    const total = [0, 1, 2, 3].reduce((sum, i) => sum + dotLook(i, p).width, 0)
    check(`the dots add up to the same width at ${p}`, Math.abs(total - (18 + 3 * 6)) < 0.05, String(total))
  }
  const page = code("components/onepage/public-onepage.tsx")
  const group = page.slice(page.indexOf("function GroupBlockRenderer"), page.indexOf("function CollectionIntro"))
  check("no index or scroll state in the group carousel", !/useState\(/.test(group) && /useRailPager\(scrollContainerRef, enabledChildren\.length\)/.test(group))
  check("arrows: a dark icon on a light circle, never the theme's colour", /bg-white\/95 text-\[#111111\]/.test(group) && !/style=\{\{ color: theme\.button_color \}\}/.test(group))
  check("arrows hidden at the row's ends by attribute, not unmounted", /data-\[hidden\]:pointer-events-none/.test(group) && /toggleAttribute\("data-hidden", !edges\.start\)/.test(code("components/onepage/rail.ts")))
  check("arrows and dots are named for a screen reader", /aria-label=\{side === "prev" \? tt\("Previous"\) : tt\("Next"\)\}/.test(group) && /tt\("Go to slide \{n\}", \{ n: index \+ 1 \}\)/.test(group))
  check("slides one height", /className="flex items-stretch"/.test(group) && /\[&>:first-child\]:flex-1/.test(group))
  for (const l of ["es", "fr", "de", "pt-BR", "it", "pl"]) check(`"Go to slide {n}" in ${l}`, /"Go to slide \{n\}": "[^"]*\{n\}[^"]*"/.test(read(`lib/i18n/catalog/${l}.ts`)))
}

section("Product pictures in their own shape inside a row")
{
  const pad = "https://x.supabase.co/p/1767225600000_cover_processed.jpg"
  const orig = "https://x.supabase.co/p/1767225600000_original_cover.jpg"
  check("a block whose own picture is the card copy shows the original", withOriginalCover([pad, orig, pad], { thumbnail_url: pad, cover_original_url: orig })[0] === orig)
  const block = code("components/onepage/product-block.tsx")
  check("the product block goes through withOriginalCover, the card copy last", /withOriginalCover\(\[data\.custom_thumbnail, data\.product_cover, data\.product_thumbnail\]/.test(block) && /\.concat\(data\.product_thumbnail \|\| \[\]\)/.test(block))
  check("a shelf's products read with their originals", /rowsWithOriginalCovers\(db,/.test(code("lib/onepage/storelib-blocks-server.ts")))
  check("a page's product blocks (and those in a group) read the original", /product_cover: product\.cover_original_url \?\? null/.test(code("lib/onepage/live-products.ts")) && /COLUMNS_WITH_COVER/.test(code("lib/onepage/live-products.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

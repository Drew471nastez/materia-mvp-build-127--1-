/**
 * Round AL3: the OnePage block editor made consistent, and how it behaves.
 *
 *   1. dragging a block near the top or bottom of the editor scrolls the
 *      pane that really scrolls, eased in and per second (lib/onepage/edge-scroll)
 *   2. an open block follows its own height (components/onepage/reveal `follow`)
 *   3. Layout holds how a block is drawn: arrangement and layouts as
 *      pictures, cards in view (1, 1.2, 1.5, 2), how many, animation, style;
 *      Settings holds what it says and does; no control twice
 *   4. the fields in an open block are Storelib's (components/onepage/block-fields.css)
 *   5. every block the page draws is counted, and every block's row has stats
 */
import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EDGE_ZONE_PX, MAX_SPEED, RAMP_MS, edgeSpeed, edgeStep, edgeZone } from "../lib/onepage/edge-scroll"
import { ArrangePicker, CardsInViewControl, HowManyControl, CARDS_IN_VIEW } from "../components/onepage/layout-pickers"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

console.log("\n1. The pane scrolls while a card is held near its edge")
{
  check("no speed in the middle of the pane", edgeSpeed(400, 0, 800, 1000) === 0)
  check("up near the top, down near the bottom", edgeSpeed(10, 0, 800, 1000) < 0 && edgeSpeed(790, 0, 800, 1000) > 0)
  const rim = Math.abs(edgeSpeed(EDGE_ZONE_PX - 4, 0, 800, 1000))
  const deep = Math.abs(edgeSpeed(4, 0, 800, 1000))
  check("slow at the rim of the zone, fast deep in it", rim < 40 && deep > 900 && deep <= MAX_SPEED, { rim, deep })
  check("past the edge it keeps the top speed, no more", Math.abs(edgeSpeed(-200, 0, 800, 1000)) === MAX_SPEED)
  check("eased in: nothing the frame it arrives, all of it after the ramp", edgeSpeed(0, 0, 800, 0) === 0 && Math.abs(edgeSpeed(0, 0, 800, RAMP_MS)) === MAX_SPEED && Math.abs(edgeSpeed(0, 0, 800, RAMP_MS / 2)) < MAX_SPEED)
  check("a short pane has a smaller zone", edgeZone(200) === 40 && edgeZone(1000) === EDGE_ZONE_PX)
  check("per second, so 120Hz is as fast as 60Hz", Math.abs(edgeStep(1000, 8) * 2 - edgeStep(1000, 16)) < 1e-9)
  check("a stalled frame never throws the list", edgeStep(1000, 500) === 34)

  const reorder = read("components/onepage/link-reorder.ts")
  check("the marked box counts only when it scrolls", /while \(marked && !scrolls\(marked\)\) marked = marked\.parentElement\?\.closest/.test(reorder))
  check("the speed comes from edge-scroll, with the carry of a part pixel", /edgeSpeed\(d\.lastY, top, bottom/.test(reorder) && /d\.carry \+= edgeStep\(speed, dt\)/.test(reorder))
  check("a page that scrolls itself scrolls too", /else window\.scrollTo\(0, Math\.max\(0, Math\.min\(max, at \+ whole\)\)\)/.test(reorder))
  const tab = read("components/onepage/tabs/links-tab.tsx")
  check("the Links column no longer claims to be the scroll box", !/data-scroll-container="links-tab" style/.test(tab) && /data-links-tab=""/.test(tab))
}

console.log("\n2. An open block follows its own height")
{
  const reveal = read("components/onepage/reveal.tsx")
  const tab = read("components/onepage/tabs/links-tab.tsx")
  check("the block's settings follow", /unmountWhenShut follow className="rounded-b-2xl"/.test(tab))
  check("an open still running is aimed again, a settled one glides", /const run = opening\.current/.test(reveal) && /Math\.abs\(from - next\) < FOLLOW_MIN_PX/.test(reveal) && /new ResizeObserver/.test(reveal))
}

console.log("\n3. Layout draws, Settings says")
{
  const html = renderToStaticMarkup(
    React.createElement(ArrangePicker, {
      value: "carousel",
      options: [
        { id: "list", kind: "list", label: "List" },
        { id: "grid", kind: "grid", label: "Grid" },
        { id: "carousel", kind: "carousel", label: "Carousel" },
      ],
      theme: { button_color: "#ff0066", button_text_color: "#ffffff", background_color: "#101010", button_border_radius: 20 },
      images: ["https://example.com/a.jpg"],
      onChange: () => {},
    }),
  )
  check("the arrangements are pictures in the page's colours, with real pictures", (html.match(/data-arrange-choice=/g) ?? []).length === 3 && /background:#ff0066/.test(html) && /background:#101010/.test(html) && /https:\/\/example\.com\/a\.jpg/.test(html))
  check("the picked one is pressed", /aria-pressed="true" data-arrange-choice="carousel"/.test(html))
  check("cards in view: 1, 1.2, 1.5 and 2", CARDS_IN_VIEW.join() === "1,1.2,1.5,2")
  const view = renderToStaticMarkup(React.createElement(CardsInViewControl, { value: "1.5", onChange: () => {} }))
  check("  drawn as the editor's segmented choice", (view.match(/data-segment=/g) ?? []).length === 4 && /aria-checked="true" data-segment="1\.5"/.test(view))
  const many = renderToStaticMarkup(React.createElement(HowManyControl, { value: 6, options: [3, 6, 9, 12], onChange: () => {} }))
  check("  how many, in Layout", /aria-checked="true" data-segment="6"/.test(many))

  const shelf = read("components/onepage/storelib-blocks.tsx")
  const settingsHalf = shelf.slice(shelf.indexOf("const settingsHalf"), shelf.indexOf("const layoutHalf"))
  const layoutHalf = shelf.slice(shelf.indexOf("const layoutHalf"), shelf.indexOf("if (part === \"settings\") return settingsHalf"))
  check("a shelf: how many and the arrangement are in Layout only", !/How many/.test(settingsHalf) && /<HowManyControl/.test(layoutHalf) && /<ArrangePicker/.test(layoutHalf) && /<CardsInViewControl/.test(layoutHalf))
  check("  the page draws its cards in view", /function shelfSlideWidth/.test(shelf) && /case "2": return `calc\(50% - \$\{gap \/ 2\}px\)`/.test(shelf))
  check("  its card pictures in the page's colours", /<ProductLayoutThumb id=\{id\} theme=\{theme as never\} image=\{image\} \/>/.test(shelf))

  const tab = read("components/onepage/tabs/links-tab.tsx")
  check("a group: its layout as pictures and two cards in view", /<ArrangePicker\s+label=\{tt\("Layout"\)\}/.test(tab) && /<CardsInViewControl<CarouselViewType>/.test(tab) && /export type CarouselViewType = "1" \| "1\.2" \| "1\.5" \| "2"/.test(read("lib/onepage/types.ts")) && /case "2": return 50/.test(read("components/onepage/public-onepage.tsx")))
  check("a document, a menu, a booking: Classic and Featured drawn as the page draws them", (tab.match(/<ClassicFeaturedPicker value=\{data\.layout_type\}/g) ?? []).length === 3 && !/Choose how this block displays on your page/.test(tab))
  const layoutContent = tab.slice(tab.indexOf("const renderLayoutContent = () => {"), tab.indexOf("const renderSettingsContent = () => {"))
  check("a product: its picture and button words moved to Settings", !/Custom Thumbnail|Button Text/.test(layoutContent) && /\{data\.product_id && renderProductContent\(\)\}/.test(tab))
  check("the animation is in Layout, not a button in the row", /<BlockAnimationPicker/.test(tab) && !/setShowAnimationMenu|showAnimationSheet|animationMenuRef/.test(tab))
  const settings = read("components/onepage/block-settings.tsx")
  check("  only on the blocks where it helps", /ANIMATED_BLOCKS = new Set\(\["link_button", "product", "email_capture", "pdf_document", "food_menu", "calendly"\]\)/.test(settings))
  check("Profile card is a layout only, not a second choice in Settings", !/tt\("Profile card"\)/.test(settings))
  check("one Alignment for a heading and a text, which writes their own field", /ownAlign \? \{ alignment: align \} : undefined/.test(settings) && !/data\.alignment === align/.test(tab) && !/tt\("Alignment"\)/.test(read("components/onepage/extra-blocks.tsx")))
  check("a link's layout pictures carry its own title", /title=\{data\.label\}/.test(settings))
}

console.log("\n4. Storelib's fields in an open block")
{
  const css = read("components/onepage/block-fields.css")
  const settings = read("components/onepage/block-settings.tsx")
  check("loaded with the block settings", /import "\.\/block-fields\.css"/.test(settings))
  check("a label never glued to its field", /\[data-slot="label"\]:has\(\+ [^)]*\)\) \{\s*margin-bottom: 8px;/.test(css))
  check("a select's own chevron, 12px in, with room", /select:not\(\[multiple\]\) \{[\s\S]*appearance: none;[\s\S]*padding-right: 36px;[\s\S]*background-position: right 12px center;/.test(css))
  check("a 44px box, 16px type on a phone", /\[data-slot="input"\] \{\s*height: 44px;/.test(css) && /font-size: 16px;/.test(css))
  check("the description's words sit apart from its box", /<span className="mb-2 flex min-h-8 items-center justify-between gap-2 leading-\[18px\]">/.test(settings))
}

console.log("\n5. Every block counted, every block's numbers")
{
  const page = read("components/onepage/public-onepage.tsx")
  const activity = read("components/onepage/block-activity.ts")
  check("each block on the page says which it is", (page.match(/data-op-block=\{block\.id\}/g) ?? []).length === 3)
  check("one listener counts presses, submits, plays and embeds", /document\.addEventListener\("click", onClick\)/.test(activity) && /"submit", onSubmit, true/.test(activity) && /"play", onPlay, true/.test(activity) && /window\.addEventListener\("blur", onBlur\)/.test(activity))
  check("  never twice with a block that counted itself, never in the preview", /noteTracked\(\)\n    try \{/.test(page) && /if \(inEditorPreview \|\| !onepage\.id\) return/.test(page))
  const tab = read("components/onepage/tabs/links-tab.tsx")
  check("every row but the header and a divider has stats", /const NO_STATS_TYPES = new Set\(\["header", "divider"\]\)/.test(tab) && /const hasStats = ROW_COUNT_TYPES\.has\(block\.type\)/.test(tab))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

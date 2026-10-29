/**
 * ===========================================================================
 *  ROUND 44: ADD A SECTION ON A SLOW PHONE, AND THE HEADER CARD
 * ===========================================================================
 * The owner: the Add section modal "stutters and lags when clicking
 * categories and scrolling through the sections to add, especially on low
 * spec devices", and "sometimes the preview cards (seen in the Header
 * category) are completely broken: shifted layouts, wrong size, overlapping,
 * garbled previews". What was found and what now holds:
 *
 *   EVERY CARD AFTER A REVIEWS CARD WAS THE WRONG SIZE. The reviews widget
 *   prints its own stylesheet in its <style scoped> where a rule would
 *   stand, and the scoper read it as the start of the next selector: the
 *   section's `.s { padding }` came out unscoped and every `.s` in the
 *   document took it, cards drawn after a reviews card cut and shifted in
 *   their frames (and every section of a live page with a reviews widget).
 *   THE HEADER CARD SHOWED ITS CLOSED SEARCH PANEL. The cards' reveal rule
 *   took every inline `opacity: 0` for an entrance still to come, and the
 *   header draws its search panel closed that way, over its own row. A
 *   closed panel says so (aria-hidden, inert, no pointer events) and keeps
 *   its look.
 *   NOTHING STICKY OR MOVING IN A CARD: sticky is relative, a section's own
 *   animations end on their first frame, no will-change layers.
 *   THE HEADER GROUP'S LIBRARY: the header is drawn ahead with the rest, the
 *   heights are remembered in the browser, and the cards a group does not
 *   offer are kept, hidden, rather than built again.
 *   A SLOW DEVICE: an open library draws between presses and scrolls, as
 *   much as each idle moment has room for on this device, what is shown
 *   first, and a small device draws the first screen ahead.
 *   OPENING AND CLOSING: the library is no longer restyled whole by the
 *   pause rule each time.
 *
 * The browser half, with the numbers: scripts/check-add-section-perf.mjs.
 *
 * Run with:  npx tsx tests/add-section-r44.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HeaderSection } from "@/components/website-builder/sections/renderers/HeaderSection"
import { withoutSticky } from "@/lib/website-builder/preview-markup"
import { scopeCss } from "@/lib/storelib-theme/storelib/css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const lib = read("components/website-builder/editor/section-library.tsx")
const css = read("app/globals.css")
const between = (s: string, a: string, b: string) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a) + a.length))

console.log("\nThe Header card: what is drawn closed stays closed")
{
  /* The header as its card draws it: the theme's preset, search on. */
  const html = renderToStaticMarkup(
    createElement(HeaderSection, {
      section: { id: "preview-header-0", type: "header", settings: { show_search_icon: true }, blocks: [] } as unknown as SectionInstance,
      theme: { brand_name: "My store" } as ThemeSettingsValues,
      deviceMode: "desktop",
    } as never),
  )
  /* Every element the header hides with an inline opacity of 0. */
  const hidden = [...html.matchAll(/<[a-z]+\b[^>]*\bstyle="([^"]*)"[^>]*>/g)].filter((m) => /opacity:\s*0(?![.\d])/.test(m[1]))
  check("the header draws something closed with an inline opacity of 0 (its search panel)", hidden.length > 0, hidden.length)
  /* What the reveal rule spares, read as the browser reads it. */
  const spared = (tag: string) => /aria-hidden="true"/.test(tag) || /\binert\b/.test(tag) || /pointer-events:\s*none/.test(tag)
  check("each one says it is closed: aria-hidden, inert or no pointer events", hidden.every((m) => spared(m[0])), hidden.filter((m) => !spared(m[0])).map((m) => m[0].slice(0, 120)))
  const reveal = between(lib, "const REVEALED = ", "let revealStyled")
  check("and the reveal marks spare exactly those, found once in a copy of the drawn preview", /el\.getAttribute\("aria-hidden"\) === "true" \|\| el\.hasAttribute\("inert"\) \|\| \/pointer-events\\s\*:\\s\*none\/i\.test\(style\)/.test(reveal) && /const copy = root\.cloneNode\(true\)/.test(reveal) && /if \(!closedOnPurpose\(el\)\) el\.classList\.add\("wb-pv-reveal"\)/.test(reveal) && /onCapture\(ref\.current \? stillMarkup\(ref\.current\) : ""\)/.test(lib))
  check("  and the cards' rules are class selectors under the preview's own class, no attribute substrings in the document", /\.wb-pv \.wb-pv-reveal\{opacity:1!important/.test(reveal) && !/\[style\*=|\[class\*=/.test(reveal.slice(reveal.indexOf("const REVEAL_SHOWN"))) && /className="wb-pv absolute left-0 top-0/.test(lib))
}

console.log("\nA reviews section's styles stay in the reviews section")
{
  /* reviews_widget.storelib: the widget's own stylesheet printed where a rule would be, then the section's rules. */
  const style = read("themes/default/sections/reviews_widget.storelib").match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? ""
  check("the reviews widget prints its stylesheet as a statement of its own, before its rules", /^\s*\{\{ settings \| review_widget_css \}\}\s*\n\.s \{/.test(style))
  const out = scopeCss(style, { type: "reviews_widget" })
  const css = out.ok ? out.value : ""
  check("its `.s` rule is scoped to the section, not left on every section of the page", out.ok && /\[data-section-id="__SECTION_ID__"\] \.s \{ background: var\(--s-bg\)/.test(css) && !/\}\}\s*\n?\s*\.s \{/.test(css), css.slice(0, 200))
  check("  and the expression is printed where it stood, whole", out.ok && /^\s*\{\{ settings \| review_widget_css \}\}\s*\n\[data-section-id/.test(css))
  const media = scopeCss("@media (min-width: 700px) { {{ a }} .x { color: {{ settings.c }}; } }\n.y { content: \"{{ b }}\"; }", { type: "t" })
  check("inside @media too; an expression in a value or a string is still a value", media.ok && /\{ \{\{ a \}\} \[data-section-id="__SECTION_ID__"\] \.x \{ color: \{\{ settings\.c \}\}; \} \}/.test(media.value) && /\[data-section-id="__SECTION_ID__"\] \.y \{ content: "\{\{ b \}\}"; \}/.test(media.value), media.ok ? media.value : media)
}

console.log("\nA card is a still picture")
{
  check("a sticky header or column is relative in a card, its offsets off", withoutSticky(".fc2__side { max-width: 26rem; position: sticky; top: 24px; }") === ".fc2__side { max-width: 26rem; position:relative;inset:auto!important; top: 24px; }" && withoutSticky('<div style="position:-webkit-sticky;top:0">') === '<div style="position:relative;inset:auto!important;top:0">')
  check("  and anything else is left as it is", withoutSticky("position: absolute; position:fixed") === "position: absolute; position:fixed")
  check("  in a preview's own styles and its markup", /addStyles\(split\.css\.map\(withoutSticky\)\)/.test(lib) && /return lazyImages\(withoutSticky\(split\.html\)\)/.test(lib))
  check("  and the app's own .sticky class", /\.wb-pv \.sticky\{position:relative!important;inset:auto!important\}/.test(lib))
  check("a section's own animations end on their first frame, and nothing asks for a layer", /\.wb-pv \*\{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;will-change:auto!important\}/.test(lib))
  check("so the library is out of the pause rule that restyled all of it on every open and close", !/\.wb-library-layer\[data-state="closed"\] \*/.test(css) && !/\[data-section-library="phone"\]:not\(\[data-library-open\]\) \*/.test(css) && /\[data-block-picker-layer\]\[data-state="closed"\] \*/.test(css))
  check("  its shimmer still stops while it is closed", /\.wb-library-layer\[data-state="closed"\] \.wb-preview-shimmer::after/.test(css))
  check("the shimmer is the box's own, not a child that content-visibility left without a place", /data-preview-shimmer=\{!html && !\(live && empty\) \? "" : undefined\}/.test(lib) && !/<span aria-hidden data-preview-shimmer/.test(lib))
}

console.log("\nThe Header group's library")
{
  const spare = between(lib, "const spareJobs = useMemo", "/**\n   * The cards are built")
  check("the header and the footer are drawn ahead with the rest, after them", /for \(const type of \["header", "footer"\]\)/.test(spare) && /if \(!schema \|\| addable\.includes\(type\) \|\| own\.has\(type\)\) continue/.test(spare) && /* Changed on purpose (round 44 merge): on a reopen only the spare previews not yet drawn are asked for, as main does for the rest. */ /requestPreviews\((again \? spareJobs\.filter\(\(j\) => !MARKUP\.has\(j\.key\)\) : )?spareJobs\)/.test(lib))
  check("  under the same key their cards read", /key: previewKey\(type, i, renderWidth, lookTag\)/.test(spare) && /keyFor: \(w\) => previewKey\(type, i, w, `\$\{own\.has\(type\) \? sourcesTag : ""\}\$\{lookTag\}`\)/.test(lib))
  check("a small device draws the first screen and the header and footer ahead", /const SPARE_DEVICE_AHEAD = 4/.test(lib) && /requestPreviews\(\[\.\.\.jobs\.slice\(0, SPARE_DEVICE_AHEAD\), \.\.\.spareJobs\]\)/.test(lib))
  check("the heights are remembered in this browser, read before any card asks", /const HEIGHTS_STORE = "wb-preview-h:r44"/.test(lib) && /readRememberedHeights\(\)\n\s*const \[phone, setPhone\]/.test(lib) && /notify\(\)\n\s*rememberHeights\(\)/.test(lib))
  check("  never more than a few hundred, and never an empty one", /\.filter\(\(\[key, h\]\) => h > 0 && !EMPTY\.has\(key\)\)\.slice\(-400\)/.test(lib))
  check("a card a group does not offer is kept, hidden, not built again", /const keptCards = useRef\(new Map<string, LibraryEntry>\(\)\)/.test(lib) && /\{cards\.map\(\(e\) => \{/.test(lib) && /hidden=\{!shown\.has\(e\)\}/.test(lib))
  check("  and forgotten once its section is not the theme's any more", /if \(!now\.has\(k\) && schemas\[e\.type\] !== e\.schema\) kept\.delete\(k\)/.test(lib))
}

console.log("\nA slow device: drawing between presses, as much as there is room for")
{
  check("open, a press, a key, a wheel, a touch or a scroll holds the drawing a third of a second", /const OPEN_QUIET_MS = 320/.test(lib) && /for \(const type of \["pointerdown", "keydown", "wheel", "touchstart", "touchmove"\]\) window\.addEventListener\(type, pressed, o\)/.test(lib) && /document\.addEventListener\("scroll", pressed, o\)/.test(lib))
  check("  a pointer resting over the list is not a press", /window\.addEventListener\("pointermove", seen, o\)/.test(lib))
  check("  urgent work waits for it, and so does putting markup in", /if \(urgent\) return pressQuietFor\(\)/.test(lib) && /const wait = open \? pressQuietFor\(\) : busyFor\(\)/.test(lib))
  check("what a draw and a measurement cost on this device is learnt", /drawCost = learnCost\(drawCost, performance\.now\(\) - began\)/.test(lib) && /measureCost = learnCost\(measureCost, \(performance\.now\(\) - began\) \/ batch\.length\)/.test(lib))
  check("  and a slice starts another only with room for it", /\} while \(queue\.length && deadline\.timeRemaining\(\) > Math\.max\(12, drawCost \* 1\.25\)\)/.test(lib) && /unmeasured\.splice\(0, roomFor\(deadline, measureCost, MEASURE_BATCH\)\)/.test(lib) && /return Math\.max\(1, Math\.min\(most, Math\.floor\(deadline\.timeRemaining\(\) \/ Math\.max\(1, each\)\)\)\)/.test(lib))
  check("a category pressed draws its own cards first", /export function promotePreviews\(keys: readonly string\[\]\)/.test(lib) && /promotePreviews\(entries\.filter\(\(e\) => shown\.has\(e\)\)\.map\(\(e\) => e\.keyFor\(renderWidth\)\)\)/.test(lib))
  check("  and cards scrolled near are next, top first", /new IntersectionObserver\(/.test(lib) && /\{ rootMargin: "100% 0px" \}/.test(lib) && /return observeNear\(el, markupKey\)/.test(lib))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}

/**
 * ===========================================================================
 *  THE BUILDER'S SIDEBAR, AS RULES
 * ===========================================================================
 * The parts of the sidebar's controls that are decisions rather than
 * drawing, tested as the decisions they are:
 *
 *   a slider's value      where a drag or a typed number lands (snapToStep)
 *   a colour typed        "#abc", "abc" and "#AABBCC" are one colour (normalizeHex)
 *   a choice              short choices are a segmented row, long ones a list,
 *                         and a position has a small drawing of itself
 *   a picture's words     which text setting is a picture's alt text
 *   where a section goes  the library's "Between A and B", clamped the way
 *                         the editor clamps an insert
 *   bringing it on screen when the canvas scrolls to a new section, and when not
 *   a preview's markup    its pictures wait, its styles leave it, its key
 *                         holds its width
 *   header layouts        every wireframe is a layout the header can draw
 *
 * The geometry and motion are measured in a browser instead:
 * scripts/check-slider-drag.mjs, check-add-section.mjs, check-media-field.mjs,
 * check-sidebar-tabs.mjs, check-connections.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { snapToStep } from "@/components/website-builder/editor/slider-number-control"
import { normalizeHex } from "@/components/website-builder/editor/color-chip"
import { fitsSegmented, positionIcon } from "@/components/website-builder/editor/setting-controls"
import {
  DEFAULT_DESKTOP_HEADER_LAYOUT,
  DEFAULT_MOBILE_HEADER_LAYOUT,
  DESKTOP_HEADER_LAYOUTS,
  MOBILE_HEADER_LAYOUTS,
} from "@/components/website-builder/editor/header-layout-picker"
import { altFieldFor, pairedAltIds } from "@/lib/website-builder/alt-pairing"
import { whereItGoes } from "@/lib/website-builder/insert-words"
import { arrivalScrollTarget } from "@/lib/website-builder/section-arrival"
import { lazyImages, previewKey, splitStyles } from "@/lib/website-builder/preview-markup"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const said = detail === undefined ? "" : ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})`
    failures.push(label + said)
    console.log(`  FAIL  ${label}${said}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\nA slider lands on a step, inside its range")
  check("a value between steps goes to the nearest", snapToStep(13, 0, 100, 5) === 15 && snapToStep(12, 0, 100, 5) === 10)
  check("past either end it stops at the end", snapToStep(140, 0, 100, 4) === 100 && snapToStep(-9, 0, 100, 4) === 0)
  check("steps count from the minimum, not from zero", snapToStep(11, 1, 21, 5) === 11 && snapToStep(13, 1, 21, 5) === 11 && snapToStep(14, 1, 21, 5) === 16)
  check("a fractional step comes out clean, not as 0.30000000000000004", snapToStep(0.31, 0, 1, 0.1) === 0.3 && String(snapToStep(0.7, 0, 1, 0.05)) === "0.7")
  check("nothing typed that is not a number moves it past the minimum", snapToStep(Number.NaN, 4, 20, 2) === 4)
  check("a step of nothing is no snapping, only the range", snapToStep(7.3, 0, 10, 0) === 7.3)

  console.log("\nA colour typed three ways is one colour")
  check("three digits grow to six", normalizeHex("#abc") === "#aabbcc" && normalizeHex("abc") === "#aabbcc")
  check("six digits keep theirs, in small letters", normalizeHex("#1A1A2E") === "#1a1a2e" && normalizeHex(" 1a1a2e ") === "#1a1a2e")
  check("anything else is not a colour yet, so the field keeps what it had", normalizeHex("#12") === null && normalizeHex("red") === null && normalizeHex("#1a1a2eff") === null)

  console.log("\nA short choice is a row of buttons, a long one a list")
  const opts = (...labels: string[]) => labels.map((label) => ({ label, value: label.toLowerCase() }))
  check("two or three short words are a segmented row", fitsSegmented(opts("Left", "Right")) && fitsSegmented(opts("Left", "Center", "Right")))
  check("four is a row only when every word is short", fitsSegmented(opts("S", "M", "L", "XL")) && !fitsSegmented(opts("Small", "Medium", "Large", "Extra large")))
  check("one, or five and more, is a list", !fitsSegmented(opts("Only")) && !fitsSegmented(opts("A", "B", "C", "D", "E")))
  check("a long label makes it a list, so no button is cut off", !fitsSegmented(opts("Open it in the header", "Search page")))
  check("a picture's side has a drawing of itself", positionIcon("image_position", "left") !== null && positionIcon("image_position", "right") !== null && positionIcon("media_position", "top") !== null)
  check("text alignment has the alignment drawings", positionIcon("alignment", "center") !== null && positionIcon("text_align", "left") !== null)
  check("and a value it does not know has none rather than a wrong one", positionIcon("alignment", "justify") === null && positionIcon("layout", "grid") === null)

  console.log("\nA picture's description is found beside it")
  const fields = [
    { id: "image", type: "image_picker" },
    { id: "image_alt", type: "text" },
    { id: "heading", type: "text" },
    { id: "hero_image", type: "image_picker" },
    { id: "hero_image_description", type: "text" },
    { id: "logo", type: "image_picker" },
  ]
  check("`image_alt` describes `image`", altFieldFor(fields[0], fields) === "image_alt")
  check("`<id>_description` describes `<id>`", altFieldFor(fields[3], fields) === "hero_image_description")
  check("a picture with nothing beside it has none", altFieldFor(fields[5], fields) === null)
  check("a gallery block's `alt` describes its `image`", altFieldFor({ id: "image", type: "image_picker" }, [{ id: "image", type: "image_picker" }, { id: "alt", type: "text" }]) === "alt")
  check("only a text setting counts, not a rich text or a toggle", altFieldFor(fields[0], [{ id: "image_alt", type: "richtext" }]) === null)
  check("and the paired ones are not drawn a second time on their own", [...pairedAltIds(fields)].sort().join(",") === "hero_image_description,image_alt")

  console.log("\nThe library says where the section will go")
  const page = [
    { type: "header", name: "Header" },
    { type: "hero_centered", name: "Centered Hero" },
    { type: "features_grid", name: "Feature Grid" },
    { type: "footer", name: "Footer" },
  ]
  const name = (s: { name: string }) => s.name
  check("in a gap between two sections", whereItGoes(page, 2, name) === "Between Centered Hero and Feature Grid")
  check("above the first one", whereItGoes(page, 1, name) === "At the top, above Centered Hero")
  check("never above the header, as the editor never puts it there", whereItGoes(page, 0, name) === "At the top, above Centered Hero")
  check("and never below the footer", whereItGoes(page, 9, name) === "At the end, after Feature Grid")
  check("no gap chosen is the end of the page", whereItGoes(page, null, name) === "At the end, after Feature Grid")
  check("a page with only its header and footer is empty", whereItGoes([page[0], page[3]], 1, name) === "On the empty page" && whereItGoes([], null, name) === "On the empty page")

  console.log("\nA new section is brought on screen, and only when it is not")
  check("its top already in view with room under it: no scroll", arrivalScrollTarget(300, 0, 800) === null)
  check("below the fold: scrolled to, a little under the top", arrivalScrollTarget(1500, 0, 800) === 1500 - 96)
  check("above the view: scrolled up to it", arrivalScrollTarget(100, 900, 800) === 100 - 96)
  check("its top in the last strip of the view counts as not in view", arrivalScrollTarget(740, 0, 800) !== null)
  check("a phone's sheet covering the foot of the canvas is not view", arrivalScrollTarget(600, 0, 800, 300) !== null && arrivalScrollTarget(600, 0, 800) === null)
  check("and it never scrolls above the top", arrivalScrollTarget(20, 400, 800) === 0)

  console.log("\nA preview's markup")
  check("every picture in it waits until it is near the screen", lazyImages('<div><img src="a.jpg"><IMG alt="" src="b.jpg"></div>') === '<div><img loading="lazy" decoding="async" src="a.jpg"><img loading="lazy" decoding="async" alt="" src="b.jpg"></div>')
  {
    const split = splitStyles('<style data-x>.a{color:red}</style><section class="a">Hi</section><style></style><style>.b{margin:0}</style>')
    check("its styles are taken out, the empty ones dropped", split.html === '<section class="a">Hi</section>' && split.css.join("|") === ".a{color:red}|.b{margin:0}", split)
  }
  check("and it is kept under its width and its sources", previewKey("hero", 0, 390, "") !== previewKey("hero", 0, 800, "") && previewKey("mine", 1, 800, "v2") === "mine:1:800:v2")

  console.log("\nEvery header wireframe is a layout the header draws")
  const schema = read("themes/default/sections/header.json")
  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  const offered = (json: string, id: string) => new RegExp(`"value": "${id}"`).test(json)
  for (const l of [...DESKTOP_HEADER_LAYOUTS, ...MOBILE_HEADER_LAYOUTS]) {
    check(`${l.id} is in the header's settings and in its renderer`, offered(schema, l.id) && header.includes(l.id), l)
  }
  check("the defaults are the header's own defaults",
    DEFAULT_DESKTOP_HEADER_LAYOUT === "logo_left_nav_right" && DEFAULT_MOBILE_HEADER_LAYOUT === "logo_center_hamburger_left" &&
      /str\(s\.header_layout, "logo_left_nav_right"\)/.test(header) && /str\(s\.mobile_header_layout, "logo_center_hamburger_left"\)/.test(header))
  check("and every layout the header's settings offer has a wireframe",
    (schema.match(/"value": "(logo_|nav_|hamburger_)[a-z_]+"/g) ?? []).length === DESKTOP_HEADER_LAYOUTS.length + MOBILE_HEADER_LAYOUTS.length)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()

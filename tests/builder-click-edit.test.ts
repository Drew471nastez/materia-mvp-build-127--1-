/**
 * Click to edit, like Shopify: a click on a heading in the builder's canvas
 * opens the section at its Heading field. Three things hold that up, and this
 * drives each one for real:
 *
 *   1. The engine marks what each setting drew, in the builder only
 *      (lib/storelib-theme/storelib/marks.ts, through render.ts).
 *   2. A published page carries no mark at all.
 *   3. A click turns into the right field (lib/website-builder/click-to-edit.ts),
 *      by the mark, or by words and pictures for the hand-written sections.
 *
 *   npx tsx tests/builder-click-edit.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { applySettingMarks, markFor, stripMarks } from "@/lib/storelib-theme/storelib/marks"
import { chainFrom, clickTarget, plainOf, type ElementLike, type HitStep } from "@/lib/website-builder/click-to-edit"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

function asAdded(type: string, id = `${type}-1`): SectionInstance {
  const schema = STORELIB_SCHEMAS[type]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  const preset = schema.presets?.[0]
  Object.assign(settings, preset?.settings ?? {})
  const blocks = (preset?.blocks ?? []).map((b, i) => ({ id: `${id}-b${i}`, type: b.type, settings: { ...(b.settings ?? {}) } }))
  return { id, type, name: schema.name, settings, blocks }
}

const draw = (section: SectionInstance, inEditor: boolean) => {
  const r = renderStorelibSection(section, {} as never, inEditor ? { template: "index", in_editor: true } : { template: "index" }, {})
  if (r.ok !== true) throw new Error(`${section.type} did not render`)
  return r.html
}

console.log("\nThe engine marks what a setting drew, in the builder\n")
{
  const hero = asAdded("hero")
  const html = draw(hero, true)
  check("the heading names its setting", /<h1[^>]*data-sl-setting="heading"/.test(html), html.slice(0, 300))
  check("the line above it too", /data-sl-setting="eyebrow"/.test(html))
  check("and the line under it", /data-sl-setting="subheading"/.test(html))
  check("a button is named by its words, not its address", /<a[^>]*data-sl-setting="button_text"/.test(html))
  check("no mark character is left in the markup", !/[]/.test(html))

  const faq = asAdded("faq_accordion")
  const fhtml = draw(faq, true)
  check("a block's setting names the block too", new RegExp(`data-sl-setting="question" data-sl-block="${faq.blocks![0].id}"`).test(fhtml), fhtml.slice(0, 400))
  check("every block's own", faq.blocks!.every((b) => fhtml.includes(`data-sl-block="${b.id}"`)))

  const blocks = asAdded("blocks_section")
  const bhtml = draw(blocks, true)
  check("a theme block (blocks/*.storelib) is marked as a block", /data-sl-setting="text" data-sl-block="blocks_section-1-b0"/.test(bhtml), bhtml.slice(0, 400))

  /* Every section in the theme, drawn in the builder: marks used up, and the
     markup otherwise the same as without them (the attributes are all a mark adds). */
  const stray: string[] = []
  const changed: string[] = []
  let marked = 0
  for (const type of Object.keys(STORELIB_SCHEMAS)) {
    let html = ""
    try {
      html = draw(asAdded(type), true)
    } catch {
      continue
    }
    if (/[]/.test(html)) stray.push(type)
    if (/data-sl-setting=/.test(html)) marked++
    const unmarked = html.replace(/ data-sl-setting="[^"]*"( data-sl-block="[^"]*")?/g, "")
    if (/data-sl-/.test(unmarked)) changed.push(type)
  }
  check("no section in the theme is left with a mark character", stray.length === 0, stray)
  check("and most of them name their settings", marked >= Math.floor(Object.keys(STORELIB_SCHEMAS).length * 0.7), { marked, of: Object.keys(STORELIB_SCHEMAS).length })
  check("the only thing a mark adds is its two attributes", changed.length === 0, changed)
}

console.log("\nA published page has none\n")
{
  let leaked: string[] = []
  for (const type of ["hero", "faq_accordion", "features_cards", "blocks_section", "cta_banner", "multirow"]) {
    if (!STORELIB_SCHEMAS[type]) continue
    const html = draw(asAdded(type), false)
    if (/data-sl-(setting|block)|[]/.test(html)) leaked.push(type)
  }
  check("no data-sl-setting, no data-sl-block, no mark characters", leaked.length === 0, leaked)
  leaked = []
  for (const type of Object.keys(STORELIB_SCHEMAS)) {
    try {
      const html = draw(asAdded(type), false)
      if (/data-sl-setting|[]/.test(html)) leaked.push(type)
    } catch {
      /* a section that needs a page of its own to draw is not this test's subject */
    }
  }
  check("across every section in the theme", leaked.length === 0, leaked)
  check("the published render path never turns the builder's flag on", !/in_editor/.test(read("lib/website-builder/storefront-render.ts")))
  check("marks are applied only when the builder draws", /inEditor \? applySettingMarks\(drawn\) : drawn/.test(read("lib/storelib-theme/render.ts")))
}

console.log("\nMarks in odd places are taken out and name nothing\n")
{
  const m = markFor("bg", null)
  check("in a style attribute: gone, element unmarked", applySettingMarks(`<div style="color:${m}red">x</div>`) === `<div style="color:red">x</div>`)
  check("in an image's src: the image is named", applySettingMarks(`<img src="${markFor("image", null)}/a.png" alt="">`) === `<img src="/a.png" alt="" data-sl-setting="image">`)
  check("inside <style>: gone", applySettingMarks(`<style>.a{color:${m}red}</style><p>${markFor("t", null)}Hi</p>`) === `<style>.a{color:red}</style><p data-sl-setting="t">Hi</p>`)
  check("words win over an address on the same element", applySettingMarks(`<a href="${markFor("link", null)}/x">${markFor("label", null)}Go</a>`) === `<a href="/x" data-sl-setting="label">Go</a>`)
  check("text with no element round it names nothing", applySettingMarks(`${m}loose`) === "loose")
  check("a value that carries a mark of its own cannot forge one", stripMarks(`as|xb`) === "ab")
  check("markup without marks comes back as it went in", applySettingMarks(`<p class="a">b</p>`) === `<p class="a">b</p>`)
}

console.log("\nA click becomes a field\n")
{
  const section = {
    settings: { heading: "Make it yours", text: "<p>Hello <strong>there</strong></p>", image: "https://cdn.x/a.png", button_label: "Shop" },
    blocks: [{ id: "q1", settings: { question: "Shipping?" }, blocks: [{ id: "q1a", settings: { note: "Free" } }] }],
  }
  const step = (s: Partial<HitStep>): HitStep => ({ setting: null, markBlock: null, blockId: null, text: null, src: null, ...s })
  check("the nearest mark wins", JSON.stringify(clickTarget([step({ text: "x" }), step({ setting: "heading" }), step({ setting: "text" })], section)) === JSON.stringify({ setting: "heading", block: null }))
  check("a block's mark gives the block's path", JSON.stringify(clickTarget([step({ setting: "note", markBlock: "q1a" })], section)) === JSON.stringify({ setting: "note", block: "q1/q1a" }))
  check("an unmarked heading is found by its words", clickTarget([step({ text: "  Make it\n yours " })], section)?.setting === "heading")
  check("rich text is read as a reader sees it", plainOf(section.settings.text) === "Hello there" && clickTarget([step({ text: "Hello there" })], section)?.setting === "text")
  check("an unmarked picture is found by its address", clickTarget([step({ src: "https://cdn.x/a.png" })], section)?.setting === "image")
  check("words inside a block are the block's first", JSON.stringify(clickTarget([step({ text: "Shipping?", blockId: "q1" })], section)) === JSON.stringify({ setting: "question", block: "q1" }))
  check("a click on nothing in particular opens no field", clickTarget([step({ text: "Something else entirely" }), step({})], section) === null)

  /* The DOM half, with plain objects standing in for elements. */
  const el = (attrs: Record<string, string>, text: string | null, parent: ElementLike | null, tag = "div", kids = 0): ElementLike => ({
    getAttribute: (n) => attrs[n] ?? null,
    parentElement: parent,
    tagName: tag.toUpperCase(),
    textContent: text,
    childElementCount: kids,
  })
  const box = el({ "data-section-box": "" }, null, null)
  const wrap = el({}, "Make it yours Shop", box, "section", 2)
  const h = el({ "data-sl-setting": "heading" }, "Make it yours", wrap, "h1")
  const chain = chainFrom(h, (e) => e === box)
  check("the chain runs from the element to its section, nearest first", chain.length === 2 && chain[0].setting === "heading")
  check("a wrapper's words are not read, only a leaf's", chain[1].text === null)
  check("and the chain becomes the field", clickTarget(chain, section)?.setting === "heading")
}

console.log("\nThe editor wires it up\n")
{
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("the canvas click asks which field", /clickTarget\(\s*chainFrom\(/.test(page))
  check("the sidebar's section fields say which setting they are", /data-setting-field=\{field\.id\}/.test(page) && /data-block-field=\{field\.id\}/.test(page))
  check("the panel says which section it is", /data-wb-section-panel=\{section\.id\}/.test(page))
  check("the field is scrolled to inside its own scroller, and rung", /scroller\.scrollBy\(\{ top: r\.top - box\.top/.test(page) && /setAttribute\("data-sl-flash", stamp\)/.test(page))
  check("on a phone the tap brings the sheet up, and does not raise the keyboard", /if \(isMobileViewRef\.current\) \{\s*setAiOpen\(false\)\s*setMobileSidebarOpen\(true\)/.test(page) && /if \(!isMobileViewRef\.current\) \{\s*const input/.test(page))
  const css = read("app/globals.css")
  check("the ring is violet and fades", /\[data-sl-flash\] \{[\s\S]{0,200}outline: 2px solid rgba\(139, 92, 246/.test(css) && /@keyframes sl-field-flash/.test(css))
  check("hover draws an outline and the section's name", /<CanvasHover enabled=/.test(page) && /wb-hover-chip/.test(read("components/website-builder/canvas-hover.tsx")))
  const shared = read("components/website-builder/sections/_shared.tsx")
  check("the canvas selection is blue, as it was: ring, hover ring and badge", /inset 0 0 0 2px #3b82f6/.test(shared) && /inset 0 0 0 2px rgba\(59, 130, 246, 0\.5\)/.test(shared) && /background: "#3b82f6"/.test(shared) && !/8b5cf6|139, 92, 246/.test(shared))
  check("and the hover outline and chip wear the same blue", /\.wb-hover-outline \{[\s\S]{0,200}rgba\(59, 130, 246/.test(css) && /\.wb-hover-chip \{[\s\S]{0,300}background: #3b82f6/.test(css))
}

console.log("\nFull screen, the third way of looking\n")
{
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("a switch beside desktop / phone, on a computer only", /\{!isMobileView && \(\s*<Tooltip>[\s\S]{0,400}data-wb-full-screen-switch/.test(page) || /data-wb-full-screen-switch=""/.test(page) && /\{!isMobileView && \(\s*\n\s*<Tooltip>/.test(page))
  check("remembered for the session", /const FULL_SCREEN_KEY = "wb:full-screen"/.test(page) && /window\.sessionStorage\.setItem\(FULL_SCREEN_KEY, "1"\)/.test(page))
  check("the sidebar folds by its width and opacity, not by unmounting", /maxWidth: fullView \? 0 : sidebarWidth/.test(page) && /opacity: fullView \? 0 : 1/.test(page) && /transition: `max-width \$\{FULL_SCREEN_MS\}ms/.test(page))
  check("Escape leaves it", /if \(e\.key !== "Escape" \|\| e\.defaultPrevented\) return[\s\S]{0,300}setFullScreen\(false\)/.test(page))
  check("no rings, toolbar, hover or Ask pill over the site", /inspectorEnabled=\{canvasInspecting && !fullView\}/.test(page) && /canvasInspecting && !fullView && !isMobileView/.test(page) && /suspended=\{[^}]*\|\| fullView\}/.test(page))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

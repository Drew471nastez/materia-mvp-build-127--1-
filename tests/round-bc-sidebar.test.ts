/**
 * ===========================================================================
 *  ROUND BC: THE SIDEBAR'S LIST, ITS DRAG, THE PAGE'S OWN SECTIONS, PUBLISH
 * ===========================================================================
 * Back from a section's (or a block's) settings, the list is where it was
 * left and the row is on screen with a soft highlight that fades. A section
 * dragged in the sidebar moves on the canvas while it is dragged, Storelib's
 * canvas and an imported theme's alike. The page's own sections (its main,
 * the header, the footer) are hidden, never deleted. The Publish panel
 * closes on a press anywhere else, in an imported theme's page too, and on
 * Escape.
 *
 * In a browser: node scripts/check-sidebar-return.mjs (and COMPAT=<file>).
 *
 * Run with:  npx tsx tests/round-bc-sidebar.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PINNED_NOTE, TEMPLATE_MAINS, isPinnedSection, missingPageSections } from "../lib/website-builder/pinned-sections"
import { orderShifts } from "../lib/website-builder/live-order"
import { scrollToShow } from "../lib/website-builder/list-return"
import { CANVAS_BRIDGE } from "../lib/storelib-theme/compat/canvas-bridge"

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
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const PAGE = "app/(storelib)/website-builder/editor/[installId]/page.tsx"

console.log("\nThe page's own sections are hidden, never deleted\n")
{
  const withPresets = { presets: [{}] }
  const noPresets = { presets: [] as unknown[] }
  const shopify = (t: string) => (t.startsWith("main-") || t === "theme-header" || t === "theme-footer" ? noPresets : withPresets)
  const kind = (t: string) => (t === "theme-header" ? "header" : t === "theme-footer" ? "footer" : null)
  const product = [
    { id: "announcement-bar", type: "announcement-bar", group: "header" },
    { id: "header", type: "theme-header", group: "header" },
    { id: "main", type: "main-product" },
    { id: "related-products", type: "related-products" },
    { id: "footer", type: "theme-footer", group: "footer" },
  ]
  const ctx = { page: "product", compat: true, kindOfType: kind, schemaOf: shopify }
  const pinned = (id: string, list = product) => isPinnedSection(list.find((s) => s.id === id)!, list, ctx)
  check("an imported theme's main product section is the page's own", pinned("main"))
  check("  as is its header and its footer", pinned("header") && pinned("footer"))
  check("  but not a section Add section offers (related products, the announcement bar)", !pinned("related-products") && !pinned("announcement-bar"))
  check("  a main-* section under any id, and any section whose file has no presets", isPinnedSection({ id: "x1", type: "main-cart-items" }, [{ id: "x1", type: "main-cart-items" }], { ...ctx, page: "cart" }) && isPinnedSection({ id: "x2", type: "only-template" }, [{ id: "x2", type: "only-template" }], { ...ctx, schemaOf: () => noPresets }))
  check("  a type nothing knows is never pinned by the presets rule", !isPinnedSection({ id: "x3", type: "storelib-faq" }, [{ id: "x3", type: "storelib-faq" }], { ...ctx, schemaOf: () => undefined }))
  const twoHeaders = [...product, { id: "header-2", type: "theme-header", group: "header" }]
  check("a second header (one a replace hid) can be deleted: the rule keeps the last of each", !pinned("header", twoHeaders) && !pinned("header-2", twoHeaders))
  const twoMains = [...product, { id: "main-copy", type: "main-product" }]
  check("  and a duplicate of the main section", !pinned("main", twoMains))
  const native = (page: string, type: string) => isPinnedSection({ id: "s", type }, [{ id: "s", type }], { page, compat: false, schemaOf: () => withPresets })
  check("Storelib: the product on a product page, the grid on the shop and on a collection", native("product", "product") && native("products", "product_grid") && native("collection", "product_grid"))
  check("  search, the 404, the account pages (main_*)", native("search", "search") && native("404", "not_found") && native("account", "main_account") && native("login", "main_login") && native("wishlist", "main_wishlist"))
  check("  but a product grid on the home page can go", !native("home", "product_grid"))
  check("  Storelib's header and footer", isPinnedSection({ id: "h", type: "header" }, [{ id: "h", type: "header" }], { page: "home", compat: false }) && isPinnedSection({ id: "f", type: "footer" }, [{ id: "f", type: "footer" }], { page: "home", compat: false }))
  check("the words say what to do instead", PINNED_NOTE === "This section is part of the page. You can hide it.")

  const types = ["main-product", "main-collection-banner", "main-collection-product-grid", "main-list-collections", "main-cart-items", "main-cart-footer", "main-404", "main-page", "main-search", "rich-text"]
  check("a deleted main section is offered again on its page: the product page", JSON.stringify(missingPageSections("product", [], { compat: true, types })) === JSON.stringify(["main-product"]))
  check("  the cart (what is missing of it)", JSON.stringify(missingPageSections("cart", [{ id: "a", type: "main-cart-items" }], { compat: true, types })) === JSON.stringify(["main-cart-footer"]))
  check("  a collection, and the collections list, each its own", JSON.stringify(missingPageSections("collection", [], { compat: true, types })) === JSON.stringify(["main-collection-banner", "main-collection-product-grid"]) && JSON.stringify(missingPageSections("collections", [], { compat: true, types })) === JSON.stringify(["main-list-collections"]))
  check("  the contact page's main is the page's (main-page), and the home page has none", JSON.stringify(missingPageSections("contact", [], { compat: true, types })) === JSON.stringify(["main-page"]) && missingPageSections("home", [], { compat: true, types }).length === 0)
  check("  Storelib's search page gets its search section back", JSON.stringify(missingPageSections("search", [], { compat: false, types: ["search", "hero"] })) === JSON.stringify(["search"]) && TEMPLATE_MAINS.search.includes("search"))

  const page = code(PAGE)
  check("the editor's delete asks first, and says why instead of deleting", /const removeSection = \(sectionId: string\) => \{[\s\S]{0,400}if \(gone && pinnedSection\(gone\)\) \{\s*showNotification\(tt\(PINNED_NOTE\)\)\s*return/.test(page))
  check("  pushUndo after that check, so a refused delete is no undo step", /pinnedSection\(gone\)\) \{[\s\S]{0,120}return\s*\}\s*pushUndo\(\)/.test(page))
  check("  the section's menu greys Delete with the reason", /disabled: pinned, hint: pinned \? tt\(PINNED_NOTE\) : undefined, onClick: \(\) => removeSection\(section\.id\)/.test(page))
  check("  the canvas toolbar's Delete says it in its tooltip", /removeNote=\{pinnedSection\(current\) \? tt\(PINNED_NOTE\) : undefined\}/.test(page) && /<Item label=\{removeNote \?\? "Delete"\}/.test(page))
  check("  the sidebar list is told which they are", /pinned=\{pinnedSection\}/.test(page))
  check("  and Add section lists a missing one for its page", /missingPageSections\(currentPage, sections/.test(page) && /missingOwn\.filter\(\(t\) => !t\.includes\(":"\)\)/.test(page))
  const list = code("components/website-builder/editor/sections-list.tsx")
  check("the sidebar row has no bin for one, and its menu greys Delete with the reason", /onRemove=\{pinned \? undefined : \(\) => h\.remove\(id\)\}/.test(list) && /disabled: pinned, hint: pinned \? tt\(PINNED_NOTE\) : undefined/.test(list))
}

console.log("\nBack to the list, on the row you came from\n")
{
  check("a row on screen: the list does not move", scrollToShow({ top: 120, bottom: 152 }, { top: 100, bottom: 600 }) === 0)
  check("a row below: brought to the middle of what shows", scrollToShow({ top: 900, bottom: 932 }, { top: 100, bottom: 600 }) === 900 - 100 - (500 - 32) / 2)
  check("a row above: the same", scrollToShow({ top: -300, bottom: -268 }, { top: 100, bottom: 600 }) === -300 - 100 - (500 - 32) / 2)
  check("a row taller than the room: its top", scrollToShow({ top: 900, bottom: 1600 }, { top: 100, bottom: 600 }) === 800)
  const page = code(PAGE)
  check("the editor keeps the section (and block) last open, and the list goes back to it as it is drawn", /lastOpened\.current = \{ section: selectedSectionId, block: selectedBlockId \?\?/.test(page) && /returnToRow\(el, back\)/.test(page))
  check("  after putting the scroll back where it was left (round 36)", /el\.scrollTop = was\.top\s*const back = lastOpened\.current/.test(page))
  const css = code("app/globals.css")
  check("the highlight holds, then fades, background only", /\[data-row-flash\] \{\s*animation: wb-row-flash 1700ms/.test(css) && /@keyframes wb-row-flash/.test(css))
}

console.log("\nA dragged section moves on the canvas as it goes\n")
{
  const laid = [
    { id: "a", top: 0, height: 100 },
    { id: "b", top: 120, height: 200 },
    { id: "c", top: 340, height: 50 },
    { id: "d", top: 410, height: 100 },
  ]
  const s = orderShifts(laid, ["b", "c", "a", "d"])
  check("each takes its room in the new order: b to the top", s.b === -120)
  check("  c under it", s.c === -120)
  check("  a under c, with the space it had after it", s.a === 290)
  check("  d stays", s.d === 0)
  check("the same order moves nothing", Object.values(orderShifts(laid, ["a", "b", "c", "d"])).every((v) => v === 0))
  const list = code("components/website-builder/editor/sections-list.tsx")
  check("the list shows the canvas each new slot, and says how the drag ended", /previewOrder\(\{ ids, lifted \}\)/.test(list) && /previewOrder\(\{ ids: null, end: dropped\.current \? "commit" : "cancel" \}\)/.test(list))
  check("  in a layout effect, so a drop lands in the commit that saves it", /React\.useLayoutEffect\(\(\) => \{\s*if \(dragFrom < 0\)/.test(list))
  const canvas = code("components/website-builder/compat/compat-canvas.tsx")
  check("an imported theme's canvas passes it to its frame", /type: "preview-order", ids: d\.ids/.test(canvas))
  check("  and the frame slides its sections, then lets go once the patch has them in order", /m\.type === "preview-order"/.test(CANVAS_BRIDGE) && /ordered\.mo = new MutationObserver/.test(CANVAS_BRIDGE))
  let parses = true
  try { new Function(CANVAS_BRIDGE) } catch { parses = false }
  check("  the frame's script still parses", parses)
}

console.log("\nThe Publish panel closes on a press away and on Escape\n")
{
  const panel = code("components/website-builder/publish-panel.tsx")
  check("a press anywhere else is heard in the capture phase", /document\.addEventListener\("pointerdown", onDown, true\)/.test(panel) && /document\.removeEventListener\("pointerdown", onDown, true\)/.test(panel))
  check("  and a press or Escape inside an imported theme's page", /window\.addEventListener\(CANVAS_PRESS_EVENT, onCanvas\)/.test(panel) && /post\(\{ type: "press" \}\)/.test(CANVAS_BRIDGE) && /post\(\{ type: "escape" \}\)/.test(CANVAS_BRIDGE))
  check("  Escape closes the phone's sheet too", /if \(!open \|\| !mobile\) return\s*const onKey/.test(panel))
  const canvas = code("components/website-builder/compat/compat-canvas.tsx")
  check("the canvas raises the frame's press for the builder", /m\.type === "press" \|\| m\.type === "escape"/.test(canvas) && /new CustomEvent\(CANVAS_PRESS_EVENT/.test(canvas))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

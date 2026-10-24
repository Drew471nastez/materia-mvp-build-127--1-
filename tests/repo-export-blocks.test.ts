/**
 * ===========================================================================
 *  ADD BLOCK LISTS WHAT THE SCHEMA ALLOWS, IN THE BUILDER AND OVER MCP
 * ===========================================================================
 * The builder's Add block picker (app/website-builder/editor/[installId]/
 * page.tsx BlockTreeFor) lists `addableBlocks(owner, catalog)`, the catalog
 * being the install's own theme blocks (themeBlockCatalog over its files; an
 * imported theme's alone). Checked here against every way a schema says what
 * it holds: its own blocks, "@theme", a private block by name, "@app",
 * static blocks, and blocks inside blocks.
 *
 * An agent over MCP adds blocks through the same rule (lib/agent-access/
 * page-ops.ts), and it used to read Storelib's built-in blocks only: a block
 * the site wrote itself, or any block of an imported theme, was refused with
 * "does not take", while the builder offered it. The catalog now comes with
 * the install's files (lib/website-builder/agent/schemas.ts), so the two agree.
 * update_theme takes the same Theme settings the sidebar draws, Storelib's own
 * on an imported theme included.
 */
import { readFileSync } from "node:fs"
import JSZip from "jszip"

import { addableBlocks, schemasFromSources, themeBlockCatalog } from "@/lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { blockCatalogFor, installContextFor, schemaMapFor } from "@/lib/website-builder/agent/schemas"
import { checkOps } from "@/lib/agent-access/page-ops"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { isCompatSource } from "@/lib/storelib-theme/compat/theme"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import type { SectionSchema } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` :: ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 600)}` : ""}`)
  }
}

const DEFAULT = DEFAULT_THEME_SOURCES as Record<string, string>
const types = (list: { type: string }[]) => list.map((b) => b.type).sort().join(",")
let n = 0
const mint = (p: string) => `${p}-${++n}`

async function main() {
  console.log("\nThe builder's Add block, a Storelib theme")
  /* A block of the site's own, a private one, beside Storelib's. */
  const badge = DEFAULT["blocks/text.storelib"]
  const slide = DEFAULT["blocks/text.storelib"]
  const files = { "blocks/badge.storelib": badge, "blocks/_slide.storelib": slide }
  const sources = { ...DEFAULT, ...files }
  const catalog = themeBlockCatalog(sources, { builtIn: true })
  {
    const publicOnes = Object.keys(catalog).filter((t) => !t.startsWith("_"))
    const blocksSection = SECTION_SCHEMAS.blocks_section ?? schemasFromSources(DEFAULT).blocks_section
    check('"@theme" lists every public theme block, the site\'s own too, and no private one', types(addableBlocks(blocksSection, catalog)) === [...publicOnes].sort().join(",") && publicOnes.includes("badge") && !types(addableBlocks(blocksSection, catalog)).includes("_slide"))
    check("a private block is listed only where it is named", types(addableBlocks({ accepts: ["_slide"] }, catalog)) === "_slide" && types(addableBlocks({ accepts: ["@theme", "_slide"] }, catalog)).includes("_slide"))
    const grid = SECTION_SCHEMAS.image_grid ?? schemasFromSources(DEFAULT).image_grid
    check("a section that accepts one block by name lists that one, not the static block its template places", types(addableBlocks(grid, catalog)) === "image" && (grid.statics ?? []).some((s) => s.type === "heading"))
    const own: SectionSchema = { type: "faq", name: "FAQ", fields: [], blocks: [{ type: "question", name: "Question", fields: [] }] }
    check("a section of its own blocks lists those and no theme block", types(addableBlocks(own, catalog)) === "question")
    check("a section that holds nothing lists nothing", addableBlocks({ type: "x", name: "X", fields: [] } as SectionSchema, catalog).length === 0)
    check("inside a group: the group's accepts, the site's own block too", types(addableBlocks({ accepts: catalog.group.accepts }, catalog)).includes("badge"))
    check("inside a block that holds nothing: nothing", addableBlocks({ accepts: catalog.heading.accepts }, catalog).length === 0)
  }

  console.log("\nThe builder's Add block, an imported theme")
  const zip = new JSZip()
  zip.file("layout/theme.liquid", "<html><body>{{ content_for_layout }}</body></html>")
  zip.file("sections/hero.liquid", '<div>{% content_for "blocks" %}</div>\n{% schema %}\n{"name":"Hero","settings":[],"blocks":[{"type":"@theme"},{"type":"@app"}],"presets":[{"name":"Hero"}]}\n{% endschema %}')
  zip.file("sections/apps.liquid", '<div>{% for block in section.blocks %}{% render block %}{% endfor %}</div>\n{% schema %}\n{"name":"Apps","settings":[],"blocks":[{"type":"@app"}]}\n{% endschema %}')
  zip.file("sections/faq.liquid", '<div>{% for block in section.blocks %}{{ block.settings.q }}{% endfor %}</div>\n{% schema %}\n{"name":"FAQ","settings":[],"blocks":[{"type":"question","name":"Question","settings":[{"type":"text","id":"q","label":"Q"}]},{"type":"@app"}]}\n{% endschema %}')
  zip.file("sections/pricing.liquid", '<div>{% content_for "block", type: "card", id: "fixed" %}{% content_for "blocks" %}</div>\n{% schema %}\n{"name":"Pricing","settings":[],"blocks":[{"type":"_price"}]}\n{% endschema %}')
  zip.file("blocks/card.liquid", '<div>{{ block.settings.title }}{% content_for "blocks" %}</div>\n{% schema %}\n{"name":"Card","settings":[{"type":"text","id":"title","label":"Title"}],"blocks":[{"type":"@theme"}]}\n{% endschema %}')
  zip.file("blocks/_price.liquid", '<span>{{ block.settings.amount }}</span>\n{% schema %}\n{"name":"Price","settings":[{"type":"text","id":"amount","label":"Amount"}]}\n{% endschema %}')
  zip.file("templates/index.json", JSON.stringify({ sections: { s1: { type: "hero", settings: {}, blocks: { c1: { type: "card", settings: { title: "One" } } }, block_order: ["c1"] } }, order: ["s1"] }))
  zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Mini" }]))
  const converted = await convertShopifyTheme(zip)
  if (converted.ok === false) throw new Error(converted.error)
  const t = converted.theme
  const compatCatalog = themeBlockCatalog(t.files, { builtIn: !isCompatSource(t.files["layout/theme.storelib"]) })
  const compatSections = schemasFromSources(t.files)
  {
    /* Changed on purpose (round reviews-1023): "@app" takes Storelib Reviews' two app blocks (Star rating, Reviews), as an installed reviews app's are on Shopify; "@theme" alone never does, and none of Storelib's own theme blocks is offered. */
    /* Changed on purpose (round BC): "@app" also takes Storelib's Stock status, Estimated delivery and Size chart app blocks. */
    const APP = ["shopify://apps/storelib-reviews/blocks/reviews/storelib", "shopify://apps/storelib-reviews/blocks/star-rating/storelib", "shopify://apps/storelib/blocks/estimated-delivery/storelib", "shopify://apps/storelib/blocks/stock-status/storelib", "shopify://apps/storelib-size-charts/blocks/size-chart/storelib"].sort().join(",")
    check("the catalog is the theme's own blocks and Storelib Reviews' app blocks, none of Storelib's theme blocks", types(Object.values(compatCatalog)) === `_price,card,${APP}`)
    check('"@theme" lists the theme\'s public blocks; "@app" adds Storelib Reviews\' two', types(addableBlocks(compatSections.hero, compatCatalog)) === `card,${APP}`)
    check('a section of "@app" alone lists Storelib Reviews\' two', types(addableBlocks(compatSections.apps, compatCatalog)) === APP)
    check('a section of its own blocks and "@app" lists its own, then Storelib Reviews\' two', types(addableBlocks(compatSections.faq, compatCatalog)) === `question,${APP}`)
    check("a private block named by the section is listed there, the static block is not", types(addableBlocks(compatSections.pricing, compatCatalog)) === "_price" && (compatSections.pricing.statics ?? []).some((s) => s.type === "card"))
    check("inside a card (which takes @theme): the public blocks, not the private one, no app block", types(addableBlocks({ accepts: compatCatalog.card.accepts }, compatCatalog)) === "card")
  }

  console.log("\nThe editor builds Add block that way")
  {
    const editor = readFileSync("app/website-builder/editor/[installId]/page.tsx", "utf8")
    check("its catalog is the install's files, an imported theme's alone", /themeBlockCatalog\(storelibSources, \{ builtIn: !isCompatSource\(storelibSources\["layout\/theme\.storelib"\]\) \}\)/.test(editor))
    check("each level lists addableBlocks: the section's own rule at the top, a block's accepts inside it", /const options = addableBlocks\(parent\.length === 0 \? owner : \{ accepts: owner\.accepts \}, catalog\)/.test(editor))
  }

  console.log("\nAn agent over MCP adds the blocks the builder offers")
  {
    const page = (sections: unknown[]) => ({ sections: sections as never, settings: {} })
    const native = schemaMapFor(files)
    check("the install's block catalog comes with its schema map", "badge" in blockCatalogFor(native) && "heading" in blockCatalogFor(native))
    const start = page([{ id: "s", type: "blocks_section", settings: {}, blocks: [{ id: "g", type: "group", settings: {}, blocks: [] }] }])
    const added = checkOps(start, [{ op: "add_block", section_id: "s", block_type: "badge" }, { op: "add_block", section_id: "s", block_type: "badge", parent_block_id: "g" }], native, mint)
    check("a block the site wrote itself is added to a section and inside a group", added.ok === true, added)
    const priv = checkOps(start, [{ op: "add_block", section_id: "s", block_type: "_slide" }], native, mint)
    check("  a private block where it is not named is refused, with what is taken", priv.ok === false && /does not take a "_slide" block/.test(priv.error) && /badge/.test(priv.error))

    const compat = schemaMapFor(t.files)
    const compatPage = page([{ id: "s1", type: "hero", settings: {}, blocks: [{ id: "c1", type: "card", settings: {} }] }])
    const card = checkOps(compatPage, [{ op: "add_block", section_id: "s1", block_type: "card", settings: { title: "Two" } }, { op: "add_block", section_id: "s1", block_type: "card", parent_block_id: "c1" }], compat, mint)
    check("an imported theme's block is added, at the top and inside a block", card.ok === true, card)
    const builtIn = checkOps(compatPage, [{ op: "add_block", section_id: "s1", block_type: "heading" }], compat, mint)
    /* Changed on purpose (round reviews-1023): the hero takes "@app", so Storelib Reviews' two app blocks are among what it takes. */
    check("  Storelib's heading block is not offered in an imported theme, as in the builder", builtIn.ok === false && /It takes: card, shopify:\/\/apps\/storelib(-reviews)?\//.test(builtIn.error), builtIn)
    const nestedPrivate = checkOps(compatPage, [{ op: "add_block", section_id: "s1", block_type: "_price", parent_block_id: "c1" }], compat, mint)
    check("  a private block inside a block that does not name it is refused", nestedPrivate.ok === false)

    console.log("\nupdate_theme takes what Theme settings draws")
    const ctx = installContextFor(compat)
    check("an imported theme is known as one", ctx.compat === true)
    const hover = checkOps({ sections: [], settings: { shopify: { accent: "#123456" } } } as never, [{ op: "update_theme", settings: { storelib_button_hover_effect: "lift", storelib_button_hover_bg: "#222222" } }], compat, mint)
    const shopify = hover.ok === true ? (hover.state.settings.shopify as Record<string, unknown>) : {}
    check("Storelib's Hover and focus is written where the builder keeps it, beside the theme's values", hover.ok === true && shopify.storelib_button_hover_effect === "lift" && shopify.storelib_button_hover_bg === "#222222" && shopify.accent === "#123456", hover)
    const wobble = checkOps({ sections: [], settings: {} } as never, [{ op: "update_theme", settings: { storelib_button_hover_effect: "wobble" } }], compat, mint)
    check("  a value its control cannot take is refused", wobble.ok === false)
    const withSchema = schemaMapFor({ ...files, "config/settings_schema.json": JSON.stringify([{ name: "Extras", settings: [{ type: "checkbox", id: "show_stamp", label: "Show stamp", default: true }] }]) })
    const stamp = checkOps({ sections: [], settings: {} } as never, [{ op: "update_theme", settings: { show_stamp: false, page_width: 1300 } }], withSchema, mint)
    check("a setting the theme's own settings_schema.json adds is taken, beside Storelib's", stamp.ok === true && stamp.state.settings.show_stamp === false && stamp.state.settings.page_width === 1300, stamp)
    const none = checkOps({ sections: [], settings: {} } as never, [{ op: "update_theme", settings: { show_stamp: false } }], native, mint)
    check("  and refused on a theme that does not have it", none.ok === false)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

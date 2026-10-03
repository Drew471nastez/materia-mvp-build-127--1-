/**
 * The round's new sections, drawn by the engine the live site uses, for
 * scripts/check-new-controls.mjs to put in a browser and measure: the
 * collections page's Collection list with four collections, a Featured
 * collection, and Page content, under a theme that sets Collection cards
 * and Badges. Prints `{ html, css }` as JSON.
 *
 *   npx tsx scripts/render-new-sections.ts
 */
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { renderSection } from "@/lib/storelib-theme/render"
import type { StorefrontCollection } from "@/lib/storelib-theme/types"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { storefrontData } from "@/lib/website-builder/storefront-data"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"

const swatch = (hex: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10"><rect width="8" height="10" fill="${hex}"/></svg>`)}`
const product = (id: string, title: string, price: string, was = "", tag = "") => ({ id, type: "product", settings: { title, price, compare_price: was, image: swatch("#cbbba0"), url: `/products/${id}`, tag } })
const col = (id: string, title: string, n: number, hex: string): StorefrontCollection => ({
  id, title, handle: id, description: `${title}, made in small batches.`, image: swatch(hex), url: `/collections/${id}`, products_count: n,
  products: [product(`${id}-1`, "Linen apron", "$48.00", "$60.00"), product(`${id}-2`, "Oak board", "$30.00", "", "Sold out"), product(`${id}-3`, "Clay cup", "$22.00"), product(`${id}-4`, "Wool throw", "$120.00")],
})
const collections = Object.fromEntries([col("kitchen", "Kitchen", 12, "#d6c7b0"), col("table", "Table", 1, "#b9c4b0"), col("living", "Living room", 7, "#c4b0b9"), col("gifts", "Gifts under forty", 4, "#b0bcc4")].map((c) => [c.id, c]))
const data = storefrontData({ dynamic: {}, collections })

const theme = { collection_card_radius: 12, collection_card_align: "center", badge_position: "top_right", badge_sale_bg: "#dc2626", badge_sale_color: "#ffffff" } as unknown as ThemeSettingsValues

const parts: { id: string; type: string; settings: Record<string, unknown> }[] = [
  { id: "list", type: "collections_grid", settings: { source: "all", heading: "Collections" } },
  { id: "feat", type: "collection_featured", settings: { collection: "kitchen", product_count: 4 } },
  { id: "page", type: "page_content", settings: { heading: "Size guide", content: "<p>Measure twice, order once.</p><h2>Aprons</h2><ul><li>One size</li></ul>" } },
]
let html = ""
let css = ""
for (const p of parts) {
  const r = compileSection(DEFAULT_THEME_SOURCES[`sections/${p.type}.storelib`], { file: `sections/${p.type}.storelib` })
  if (r.ok !== true) throw new Error(`${p.type}: ${JSON.stringify(r.errors)}`)
  const out = renderSection({ compiled: r.value, id: p.id, instance: { type: p.type, settings: p.settings }, theme: theme as Record<string, unknown>, page: { template: "page.collections" }, data })
  /* SectionRenderer wraps every section in `data-section` (sections/_shared.tsx), which the theme's rules go through. */
  html += `<div data-section-box id="box-${p.id}" style="container-type:inline-size"><div data-section="">${out.html}</div></div>`
  css += out.css + "\n"
}
const vars = Object.entries(themeVars(theme)).map(([k, v]) => `${k}:${v}`).join(";")
process.stdout.write(JSON.stringify({ html: `<div ${THEME_ROOT_ATTRIBUTE} id="site" style="${vars};container-type:inline-size"><style>${themeStylesheet(theme)}</style><style>${css}</style>${html}</div>` }))

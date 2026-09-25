/**
 * The product page example (content/developers/examples/product_page.storelib)
 * rendered by the real engine with `page.product` from the real product data
 * API, four ways: with options, with none and a sale price, sold out, and
 * with a single picture.
 * Inside the same theme root a published page has (themeVars on the root and
 * the theme's own stylesheet, whose container queries give the type its
 * phone sizes), so what is measured is what a visitor gets.
 *
 * Pictures come from $PICTURE_BASE, a local server the check starts: the
 * data API only passes http(s) addresses and paths, which is right for a
 * page and means a data: URI would be dropped here as it would be there.
 *
 * Written to $OUT_DIR/product-page.html for scripts/check-agent-commerce.mjs.
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { toProductPage, type VariantRow } from "@/lib/website-builder/shop-products"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { DEVELOPER_EXAMPLES } from "@/lib/developers/content.generated"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const BASE = process.env.PICTURE_BASE!
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

/* A picture at the size a product photo is: a flat colour, written beside the page. */
const colours = ["#c9b8a6", "#8e9aa6", "#d8cfc4"]
colours.forEach((fill, i) =>
  writeFileSync(join(OUT, `pic-${i}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200" fill="${fill}"/></svg>`),
)
const picture = (i: number) => `${BASE}/pic-${i}.svg`

const base = {
  id: "p2",
  title: "Portrait Pack: twelve looks for skin in daylight",
  slug: "portrait-pack",
  price_cents: 3900,
  compare_at_cents: 4900,
  thumbnail_url: picture(0),
  gallery_urls: [picture(1), picture(2)],
  status: "published",
  type: "digital",
  description: "<p>Twelve Lightroom presets made on real portrait shoots.</p><p>Works on raw and jpeg files.</p>",
}
const variants: VariantRow[] = [
  { id: "v1", product_id: "p2", name: "Personal licence", price_cents: 3900, position: 0 },
  { id: "v2", product_id: "p2", name: "Commercial licence", price_cents: 7900, position: 1 },
]

const cases: Array<[string, ReturnType<typeof toProductPage>]> = [
  ["options", toProductPage(base, variants)],
  ["single", toProductPage({ ...base, id: "p3" }, [])],
  ["sold-out", toProductPage({ ...base, id: "p4", inventory_count: 0 } as never, [])],
  ["one-picture", toProductPage({ ...base, id: "p5", gallery_urls: [] }, [])],
]

const vars = Object.entries(themeVars(theme) as Record<string, unknown>)
  .map(([k, v]) => `${k}:${String(v)}`)
  .join(";")
let css = themeStylesheet(theme)
let body = ""
for (const [name, product] of cases) {
  const out = renderStorelibSection(
    { id: `pp-${name}`, type: "product_page", name: "Product page", settings: {}, blocks: [] },
    theme,
    { template: "product", product },
    { "sections/product_page.storelib": DEVELOPER_EXAMPLES.product_page },
  )
  if (!out.ok) throw new Error(`${name}: ${out.errors.map((e) => e.message).join("; ")}`)
  css += out.css
  body += `<div class="case" data-case="${name}" data-section="">${out.html}</div>\n`
}

/* The page root as components/website-builder/theme/ThemePage.tsx draws it: the theme's
   variables, and the inline-size container the type's phone sizes are queried against. */
writeFileSync(
  join(OUT, "product-page.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0}${css}</style></head><body><div ${THEME_ROOT_ATTRIBUTE}="" style="${vars};container-type:inline-size">${body}</div></body></html>`,
)

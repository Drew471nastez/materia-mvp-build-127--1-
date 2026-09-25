/**
 * The framework's new pieces, drawn for a browser to look at and measure:
 * the new sections at their presets (and with the shop's products where they
 * read them), and the new editor controls as the sidebar and the phone sheet
 * draw them. Bundled and run by scripts/check-framework.mjs.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type CSSProperties } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { EditorFieldProvider, controlCarriesOwnLabel, renderRegisteredControl } from "@/components/website-builder/editor/controls"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { themeVars } from "@/lib/website-builder/theme-css"
import { storefrontData } from "@/lib/website-builder/storefront-data"
import type { SchemaField, SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

/* Pictures as data URLs, so the probe asks no network. */
const swatch = (a: string, b: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="420" cy="180" r="70" fill="#ffffff" opacity=".55"/></svg>`)}`
const card = (id: string, title: string, price: string, a: string, b: string) =>
  ({ id, type: "product", settings: { title, price, compare_price: "", image: swatch(a, b), url: `/products/${id}`, tag: "" } })
const CATALOG = [
  card("tote", "Canvas tote", "$48.00", "#c7b8a3", "#8b6f4e"),
  card("apron", "Linen apron", "$64.00", "#a9b8a3", "#4e6b52"),
  card("wallet", "Card wallet", "$29.00", "#b8a3b3", "#6b4e66"),
  card("mug", "Stoneware mug", "$32.00", "#a3b3b8", "#4e626b"),
  card("print", "Harbour print", "$45.00", "#b8b3a3", "#6b664e"),
]

function asAdded(type: string, presetIndex = 0, over: Record<string, unknown> = {}): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  const preset = schema.presets?.[presetIndex] ?? schema.presets?.[0]
  Object.assign(settings, preset?.settings ?? {}, over)
  const blocks = (preset?.blocks ?? []).map((b, i) => {
    const def = (schema.blocks ?? []).find((d) => d.type === b.type)
    const bs: Record<string, unknown> = {}
    for (const f of def?.fields ?? []) if (f.default !== undefined) bs[f.id] = f.default
    Object.assign(bs, b.settings ?? {})
    return { id: `${type}-b${i}`, type: b.type, settings: bs }
  })
  return { id: `${type}-${presetIndex}`, type, name: schema.name, settings, blocks }
}

/* A picture setting refuses a data: SVG (an SVG can carry script), so the rows' pictures are files, by absolute path. */
const pictureFile = (i: number, a: string, b: string) => {
  const file = join(OUT, `row-${i}.svg`)
  writeFileSync(file, decodeURIComponent(swatch(a, b).slice("data:image/svg+xml,".length)))
  return file
}
const pictured = asAdded("multirow")
pictured.blocks = pictured.blocks!.map((b, i) => ({ ...b, settings: { ...b.settings, image: pictureFile(i,["#d9c9b0", "#b0c4d9", "#c9d9b0"][i], ["#7a5c3a", "#3a5c7a", "#5c7a3a"][i]), image_focus: "60% 40%" } }))

const SECTIONS: [string, SectionInstance][] = [
  ["Plans", asAdded("pricing_table")],
  ["Plans, monthly or yearly", asAdded("pricing_table", 1, { color_scheme: "light" })],
  ["Course Outline", asAdded("course_curriculum")],
  ["Rows", pictured],
  ["Page not found", asAdded("not_found")],
  ["Page not found, dark", asAdded("not_found", 0, { color_scheme: "black" })],
  ["Product Grid, chosen products", asAdded("product_grid", 0, { source: "chosen", chosen: ["print", "tote", "mug"], heading: "Chosen from the shop" })],
  ["Countdown with a date", asAdded("promo_countdown", 0, { ends_text: "", ends_at: "2026-11-29T23:00" })],
]

const vars = themeVars(theme) as CSSProperties
const data = storefrontData({ dynamic: {}, catalog: CATALOG as never, menus: {} })
let sections = ""
for (const [name, section] of SECTIONS) {
  const html = renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources: {},
      products: CATALOG as never,
      data,
      children: createElement(StorelibSection, { section, theme }),
    } as never),
  )
  sections += `<section class="probe" data-name="${name}"><header class="probe__bar"><b>${name}</b><code>${section.type}</code></header><div class="probe__body">${html}</div></section>\n`
}

/* The controls, as FieldEditor draws them. */
const env = {
  products: CATALOG.map((c) => ({ id: c.id, title: c.settings.title, price: c.settings.price, image: c.settings.image, url: c.settings.url })),
  menus: {
    "main-menu": { title: "Main menu", links: [{ title: "Shop", url: "/products" }, { title: "About", url: "/about" }] },
    footer: { title: "Footer", links: [{ title: "Refunds", url: "/refund-policy" }] },
  },
  template: "index",
}
const field = (type: string, label: string, extra: Partial<SchemaField> = {}) => ({ id: type, type, label, ...extra }) as SchemaField
const CONTROLS: [SchemaField, unknown][] = [
  [field("inline_richtext", "Heading"), "Made <strong>by hand</strong> in Leeds"],
  [field("html", "Custom HTML"), "<p>Opening hours: <em>Tue to Sat</em></p>"],
  [field("color_background", "Background", { default: "#f5f1ea" }), "linear-gradient(135deg, #f5f1ea 0%, #e7dccb 100%)"],
  [field("datetime", "Sale ends"), "2026-11-29T23:00"],
  [field("focal_point", "Keep in view", { image: "image" }), "30% 60%"],
  [field("video_url", "Video"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  [field("product_list", "Products to show", { limit: 6 }), ["tote", "mug"]],
  [field("link_list", "Menu"), "main-menu"],
]
let controls = ""
for (const [f, v] of CONTROLS) {
  const inner = renderRegisteredControl(f.type, f, v, () => {})
  const html = renderToStaticMarkup(createElement(EditorFieldProvider, { value: env as never, children: inner }))
  controls += `<div class="ctl" data-type="${f.type}">${controlCarriesOwnLabel(f.type) ? "" : `<label class="text-xs font-medium text-muted-foreground mb-1.5 block">${f.label}</label>`}${html}</div>\n`
}

const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")
writeFileSync(join(OUT, "sections.html"), `<div id="root" style="${style}">${sections}</div>`)
writeFileSync(join(OUT, "controls.html"), controls)

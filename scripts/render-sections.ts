/**
 * Emits one HTML file per device width containing every section, rendered with
 * exactly what it ships with, inside a container of that width.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const root = process.cwd()
const SECTIONS = join(root, "themes/default/sections")
const OUT = process.env.OUT_DIR!

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) =>
    (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues

function asShipped(type: string, schema: any): SectionInstance {
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  Object.assign(settings, schema.presets?.[0]?.settings ?? {})

  /**
   * STRESS CONTENT. Shipped defaults are short and tidy; real content is not.
   * The classic mobile overflow is one unbreakable string — a long product
   * name, a pasted URL, a German compound noun — in a box that was only ever
   * measured against "Shop Now".
   */
  if (process.env.STRESS) {
    for (const f of schema.fields ?? []) {
      if (f.type === "text" && typeof settings[f.id] === "string" && settings[f.id]) {
        settings[f.id] = "Unbreakableproductnamethatnobodyexpected"
      }
      if (f.type === "link" && typeof settings[f.id] === "string" && settings[f.id]) {
        settings[f.id] = "https://example.com/a/very/long/path/that/keeps/going/and/going"
      }
    }
  }
  const blocks = (schema.presets?.[0]?.blocks ?? (schema.blocks ?? []).map((b: any) => ({ type: b.type, settings: {} }))).map(
    (block: any, i: number) => {
      const bs = (schema.blocks ?? []).find((b: any) => b.type === block.type)
      const s: Record<string, unknown> = {}
      for (const f of bs?.fields ?? []) if (f.default !== undefined) s[f.id] = f.default
      Object.assign(s, block.settings ?? {})
      return { id: `${type}-b${i}`, type: block.type, settings: s }
    },
  )
  return { id: type, type, name: type, settings, blocks }
}

const types = readdirSync(SECTIONS).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))

for (const width of [390, 834, 1280]) {
  const parts = types.map((type) => {
    const schema = JSON.parse(readFileSync(join(SECTIONS, `${type}.json`), "utf8"))
    const html = renderToStaticMarkup(
      createElement(ThemePage, { theme, sections: [asShipped(type, schema)] }),
    )
    return `<div class="probe" data-type="${type}" style="width:${width}px">${html}</div>`
  })
  writeFileSync(
    join(OUT, `sections-${width}.html`),
    `<!doctype html><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="app.css">
<style>body{margin:0}.probe{overflow:visible;margin:0 0 40px}</style>
${parts.join("\n")}
<pre id="out">pending</pre>`,
  )
}
console.log("emitted")

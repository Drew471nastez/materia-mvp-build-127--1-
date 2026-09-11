/**
 * Renders every section the library offers, at its first preset, one after
 * another — so the whole library can be looked at and measured in a browser
 * rather than taken on trust. Bundled by scripts/check-library.mjs.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type CSSProperties } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS, SECTION_CATEGORIES } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { themeVars } from "@/lib/website-builder/theme-css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
/** One category at a time, for the screenshots; everything, for the measuring. */
const ONLY = process.env.PROBE_CATEGORY || ""
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

/** What Add Section puts on the page: the preset, over the schema defaults. */
function asAdded(type: string, presetIndex = 0): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  const preset = schema.presets?.[presetIndex] ?? schema.presets?.[0]
  Object.assign(settings, preset?.settings ?? {})
  const blocks = (preset?.blocks ?? []).map((b, i) => {
    const def = (schema.blocks ?? []).find((d) => d.type === b.type)
    const bs: Record<string, unknown> = {}
    for (const f of def?.fields ?? []) if (f.default !== undefined) bs[f.id] = f.default
    Object.assign(bs, b.settings ?? {})
    return { id: `${type}-b${i}`, type: b.type, settings: bs }
  })
  return { id: `${type}-1`, type, name: schema.name, settings, blocks }
}

const vars = themeVars(theme) as CSSProperties
let body = ""
for (const type of ADDABLE_SECTIONS) {
  const schema = SECTION_SCHEMAS[type]
  if (ONLY && schema.category !== ONLY) continue
  const html = renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources: {},
      children: createElement(StorelibSection, { section: asAdded(type), theme }),
    }),
  )
  body += `<section class="probe" data-type="${type}" data-cat="${schema.category ?? ""}">
  <header class="probe__bar"><b>${schema.name}</b><span>${SECTION_CATEGORIES[schema.category ?? ""] ?? schema.category}</span><code>${type}</code></header>
  <div class="probe__body @container">${html}</div>
</section>\n`
}
const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")
writeFileSync(join(OUT, "page.html"), `<div id="root" style="${style}">${body}</div>`)

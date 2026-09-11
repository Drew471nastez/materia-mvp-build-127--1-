/**
 * Renders the Hero twice for each fixture — the retired React renderer and
 * the .storelib file through the engine — into one page, so a browser can
 * measure whether they are the same section. Bundled and driven by
 * scripts/check-storelib-hero.mjs.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type CSSProperties } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { HeroSection } from "@/components/website-builder/sections/renderers/HeroSection"
import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { themeVars } from "@/lib/website-builder/theme-css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const BREAK = process.env.PROBE_BREAK === "1"

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

const schema = STORELIB_SCHEMAS.hero as {
  fields: { id: string; default?: unknown }[]
  presets: { name: string; settings: Record<string, unknown> }[]
}
const defaults = Object.fromEntries(schema.fields.filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))

const fixtures: { name: string; settings: Record<string, unknown> }[] = [
  { name: "shipped defaults", settings: { ...defaults, heading: "A heading", subheading: "Two lines of supporting text under it.", button_text: "Shop", button2_text: "More" } },
  ...schema.presets.map((p) => ({ name: p.name, settings: { ...defaults, ...p.settings } })),
  { name: "dark scheme, nothing overridden", settings: { ...defaults, color_scheme: "dark", heading: "Scheme only", subheading: "No colours set on the section.", button_text: "Go", eyebrow: "Eyebrow", badge_text: "Badge", scroll_indicator: true } },
]

const vars = themeVars(theme) as CSSProperties
const section = (settings: Record<string, unknown>, id: string): SectionInstance => ({ id, type: "hero", name: "Hero", settings, blocks: [] })

let body = ""
fixtures.forEach((f, i) => {
  const oldSettings = f.settings
  const newSettings = BREAK ? { ...f.settings, font_size_heading: Number(f.settings.font_size_heading ?? 56) + 10 } : f.settings
  for (const width of [1100, 380]) {
    const old = renderToStaticMarkup(createElement(HeroSection, { section: section(oldSettings, `old_${i}`), theme }))
    const neu = renderToStaticMarkup(createElement(StorelibSection, { section: section(newSettings, `new_${i}`), theme }))
    body += `<div class="fixture" data-name="${f.name}" data-width="${width}">
  <div class="pane" data-side="old" style="width:${width}px"><div class="@container">${old}</div></div>
  <div class="pane" data-side="new" style="width:${width}px"><div class="@container">${neu}</div></div>
</div>\n`
  }
})
const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")
writeFileSync(join(OUT, "page.html"), `<div id="root" style="${style}">${body}</div>`)

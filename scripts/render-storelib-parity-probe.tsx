/**
 * Renders one section twice — the React renderer it is migrating from and
 * the .storelib file it is migrating to — into one page, so a browser can
 * measure whether they are the same section. Bundled and driven by
 * scripts/check-storelib-parity.mjs, which passes the type in PROBE_TYPE.
 *
 * Every registered renderer is imported here rather than resolved at run
 * time, because esbuild bundles what it can see and a dynamic path is not
 * something it can see.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type ComponentType, type CSSProperties } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { themeVars } from "@/lib/website-builder/theme-css"
import type { SectionProps } from "@/components/website-builder/sections/_shared"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

// The renderers a section can migrate from. One line each, added when a
// section is converted and removed when its renderer goes.
import { HeroSection } from "@/components/website-builder/sections/renderers/HeroSection"
import { TestimonialsSection } from "@/components/website-builder/sections/renderers/TestimonialsSection"

const BEFORE: Record<string, ComponentType<SectionProps>> = {
  hero: HeroSection,
  testimonials: TestimonialsSection,
}

const OUT = process.env.OUT_DIR!
const TYPE = process.env.PROBE_TYPE!
const BREAK = process.env.PROBE_BREAK === "1"

const Before = BEFORE[TYPE]
if (!Before) {
  throw new Error(`No renderer registered in the probe for "${TYPE}". Add it to BEFORE in scripts/render-storelib-parity-probe.tsx.`)
}

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

const schema = STORELIB_SCHEMAS[TYPE] as {
  name: string
  fields: { id: string; default?: unknown }[]
  blocks?: { type: string; fields?: { id: string; default?: unknown }[] }[]
  presets?: { name: string; settings?: Record<string, unknown>; blocks?: { id: string; type: string; settings?: Record<string, unknown> }[] }[]
}
if (!schema) throw new Error(`There is no themes/default/sections/${TYPE}.storelib`)

const defaults = Object.fromEntries(schema.fields.filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))

/** A block of each declared type, at its defaults, when a preset brings none. */
function blocksFor(preset?: { blocks?: { id: string; type: string; settings?: Record<string, unknown> }[] }) {
  const declared = schema.blocks ?? []
  if (!declared.length) return []
  const list = preset?.blocks ?? declared.map((b, i) => ({ id: `${TYPE}-b${i}`, type: b.type, settings: {} }))
  return list.map((b, i) => {
    const def = declared.find((d) => d.type === b.type)
    const settings: Record<string, unknown> = {}
    for (const f of def?.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
    return { id: b.id || `${TYPE}-b${i}`, type: b.type, settings: { ...settings, ...(b.settings ?? {}) } }
  })
}

interface Fixture { name: string; settings: Record<string, unknown>; blocks: { id: string; type: string; settings: Record<string, unknown> }[] }

const fixtures: Fixture[] = [
  { name: "shipped defaults", settings: { ...defaults }, blocks: blocksFor() },
  ...(schema.presets ?? []).map((p) => ({ name: p.name, settings: { ...defaults, ...(p.settings ?? {}) }, blocks: blocksFor(p) })),
  { name: "dark scheme, nothing overridden", settings: { ...defaults, color_scheme: "dark" }, blocks: blocksFor() },
]

/** The one number the break test moves, chosen from what the section has. */
const BREAKABLE = ["font_size_heading", "padding_top", "font_size", "heading_size"] as const
function broken(settings: Record<string, unknown>): Record<string, unknown> {
  for (const id of BREAKABLE) {
    if (settings[id] !== undefined) return { ...settings, [id]: Number(settings[id]) + 10 }
  }
  return { ...settings, padding_top: Number(settings.padding_top ?? 40) + 10 }
}

const vars = themeVars(theme) as CSSProperties
const instance = (f: Fixture, settings: Record<string, unknown>, id: string): SectionInstance => ({
  id, type: TYPE, name: schema.name, settings, blocks: f.blocks.map((b) => ({ ...b, id: `${id}-${b.id}` })),
})

let body = ""
fixtures.forEach((f, i) => {
  const after = BREAK ? broken(f.settings) : f.settings
  for (const width of [1100, 380]) {
    const before = renderToStaticMarkup(createElement(Before, { section: instance(f, f.settings, `old_${i}`), theme }))
    const now = renderToStaticMarkup(
      createElement(StorelibLiveProvider, {
        sources: {},
        children: createElement(StorelibSection, { section: instance(f, after, `new_${i}`), theme }),
      }),
    )
    body += `<div class="fixture" data-name="${f.name}" data-width="${width}">
  <div class="pane" data-side="old" style="width:${width}px"><div class="@container">${before}</div></div>
  <div class="pane" data-side="new" style="width:${width}px"><div class="@container">${now}</div></div>
</div>\n`
  }
})

const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")
writeFileSync(join(OUT, "page.html"), `<div id="root" style="${style}">${body}</div>`)

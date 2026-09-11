/** Every grid-ish section, rendered with its shipped defaults, so the
    column count a phone actually gets can be measured rather than assumed. */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type CSSProperties } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { themeVars } from "@/lib/website-builder/theme-css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const theme = Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))) as unknown as ThemeSettingsValues
const PLACEHOLDER = "https://example.invalid/picture.jpg"
const IMAGEY = new Set(["image_picker", "image_gallery"])

/**
 * EXACTLY WHAT `addSection` STORES, and nothing more: the preset's settings
 * and the preset's blocks. Not the schema's field defaults.
 *
 * The difference is the whole point of this probe. Copying the defaults in
 * means every setting arrives already resolved, so the path a real page
 * takes — a setting that was never saved, filled in at render time from the
 * schema — is never exercised. A broken per-breakpoint default sailed
 * through this probe that way once: the grid failed to parse, collapsed to
 * one column, and read as a section that behaves beautifully on a phone.
 *
 * Image settings still get a picture, because a section that renders no
 * <img> lays out at the wrong height and this is a layout measurement.
 */
function asAdded(type: string): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const preset = schema.presets?.[0]
  const settings: Record<string, unknown> = { ...(preset?.settings ?? {}) }
  for (const f of schema.fields ?? []) if (IMAGEY.has(f.type) && settings[f.id] === undefined) settings[f.id] = PLACEHOLDER
  const blocks = (preset?.blocks ?? []).map((b, i) => {
    const def = (schema.blocks ?? []).find((d) => d.type === b.type)
    const bs: Record<string, unknown> = { ...(b.settings ?? {}) }
    for (const f of def?.fields ?? []) if (IMAGEY.has(f.type) && bs[f.id] === undefined) bs[f.id] = PLACEHOLDER
    return { id: `${type}-b${i}`, type: b.type, settings: bs }
  })
  return { id: `${type}-1`, type, name: schema.name, settings, blocks }
}

const vars = themeVars(theme) as CSSProperties
const style = Object.entries(vars).map(([k, v]) => `${k}:${String(v)}`).join(";")
let body = ""
for (const type of ADDABLE_SECTIONS) {
  const html = renderToStaticMarkup(createElement(StorelibLiveProvider, { sources: {}, children: createElement(StorelibSection, { section: asAdded(type), theme, isEditing: false, isSelected: false } as never) } as never))
  body += `<div class="probe" data-type="${type}" style="${style}">${html}</div>\n`
}
writeFileSync(join(OUT, "page.html"), body)

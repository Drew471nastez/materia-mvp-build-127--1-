/**
 * Every section that has an image, rendered twice: once with its images
 * unable to load, once with them loaded at a known size. A section that
 * reserves space for its pictures is the same height both times. One that
 * does not jumps when the image arrives, which is what a visitor on a slow
 * connection sees and what Cumulative Layout Shift measures.
 */
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
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

/**
 * A picture in every image setting. Without one the sections that guard their
 * images behind `{% if settings.image %}` render no <img> at all, and the
 * probe finds nothing to measure — which is what it did the first time.
 */
const PLACEHOLDER = "https://example.invalid/picture.jpg"
const IMAGEY = new Set(["image_picker", "image_gallery"])

function asAdded(type: string): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  for (const f of schema.fields ?? []) if (IMAGEY.has(f.type)) settings[f.id] = PLACEHOLDER
  const preset = schema.presets?.[0]
  Object.assign(settings, preset?.settings ?? {})
  const blocks = (preset?.blocks ?? []).map((b, i) => {
    const def = (schema.blocks ?? []).find((d) => d.type === b.type)
    const bs: Record<string, unknown> = {}
    for (const f of def?.fields ?? []) if (f.default !== undefined) bs[f.id] = f.default
    for (const f of def?.fields ?? []) if (IMAGEY.has(f.type)) bs[f.id] = PLACEHOLDER
    Object.assign(bs, b.settings ?? {})
    return { id: `${type}-b${i}`, type: b.type, settings: bs }
  })
  return { id: `${type}-1`, type, name: schema.name, settings, blocks }
}

const vars = themeVars(theme) as CSSProperties
const style = Object.entries(vars).map(([k, v]) => `${k}:${String(v)}`).join(";")

let body = ""
for (const type of ADDABLE_SECTIONS) {
  const html = renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources: {},
      children: createElement(StorelibSection, { section: asAdded(type), theme, isEditing: false, isSelected: false } as never),
    } as never),
  )
  if (!/<img/i.test(html)) continue
  body += `<div class="probe" data-type="${type}" style="${style}">${html}</div>\n`
}
writeFileSync(join(OUT, "page.html"), body)

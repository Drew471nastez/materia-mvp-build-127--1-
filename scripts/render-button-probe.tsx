/**
 * Every section's buttons, rendered with the theme's own stylesheet, so the
 * colours a visitor sees can be read rather than reasoned about. Plus two
 * controls written the way a person writes a section by hand: one that sets
 * a button's background and forgets its label, and one that paints both.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type CSSProperties } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues
const PLACEHOLDER = "https://example.invalid/picture.jpg"
const IMAGEY = new Set(["image_picker", "image_gallery"])

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

const vars = Object.entries(themeVars(theme) as CSSProperties).map(([k, v]) => `${k}:${String(v)}`).join(";")
let body = ""
for (const type of ADDABLE_SECTIONS) {
  const html = renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources: {},
      children: createElement(StorelibSection, { section: asAdded(type), theme, isEditing: false, isSelected: false } as never),
    } as never),
  )
  if (!/<button|<a [^>]*href/i.test(html)) continue
  body += `<div class="probe" data-type="${type}">${html}</div>\n`
}

/**
 * THE CONTROLS. Hand-written the way somebody actually writes a section: a
 * dark surface, a white button, and — in the first — no colour on the label,
 * which is the mistake this baseline exists to catch.
 */
body += `
<div class="probe" data-type="__forgot_the_label__">
  <div data-section style="background:#0b1020;color:#ffffff;padding:20px">
    <a href="#" class="s__btn" style="background:#ffffff;display:inline-block;padding:12px 20px">Book a chair</a>
    <button type="button" style="background:#ffffff;padding:12px 20px">Also me</button>
  </div>
</div>
<div class="probe" data-type="__painted_both__">
  <div data-section style="background:#0b1020;color:#ffffff;padding:20px">
    <a href="#" class="s__btn" style="background:#ff6600;color:#001133;display:inline-block;padding:12px 20px">Mine</a>
  </div>
</div>
<div class="probe" data-type="__a_link_in_a_sentence__">
  <div data-section style="background:#ffffff;color:#111111;padding:20px">
    <p>Read the <a href="#">terms and conditions</a> before booking.</p>
  </div>
</div>
`

writeFileSync(join(OUT, "page.html"), `<div ${THEME_ROOT_ATTRIBUTE} style="${vars}"><style>${themeStylesheet(theme)}</style>${body}</div>`)

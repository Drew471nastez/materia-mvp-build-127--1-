/**
 * Buttons in both renderer families, on the default scheme and with a
 * section's own button colour, so a browser can hover each one and read what
 * it paints. Bundled by scripts/check-button-colors.mjs.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type CSSProperties, type ReactElement } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { HeaderSection } from "@/components/website-builder/sections/renderers/HeaderSection"
import { RichTextSection } from "@/components/website-builder/sections/renderers/RichTextSection"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

function preset(type: string, extra: Record<string, unknown> = {}): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const p = schema.presets?.[0]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  Object.assign(settings, p?.settings ?? {}, extra)
  const blocks = (p?.blocks ?? []).map((b, i) => ({ id: `${type}-b${i}`, type: b.type, settings: { ...(b.settings ?? {}) } }))
  return { id: `${type}-${Math.random().toString(36).slice(2, 7)}`, type, name: schema.name, settings, blocks }
}

const PINK = { color_overrides: { primary_button_background: "#e11d48", primary_button_text: "#ffffff" } }
const cases: [string, ReactElement][] = [
  ["storelib-scheme", createElement(StorelibSection, { section: preset("cta_simple", { color_scheme: "white", button_text: "Shop" }), theme, isEditing: false, isSelected: false } as never)],
  ["storelib-pink", createElement(StorelibSection, { section: preset("cta_simple", { color_scheme: "white", button_text: "Shop", ...PINK }), theme, isEditing: false, isSelected: false } as never)],
  ["header-scheme", createElement(HeaderSection, { section: preset("header", { color_scheme: "white", cta_color: "", cta_text_color: "", show_cta_button: true, cta_text: "Shop" }), theme, isEditing: false, isSelected: false } as never)],
  ["header-pink", createElement(HeaderSection, { section: preset("header", { color_scheme: "white", cta_color: "", cta_text_color: "", show_cta_button: true, cta_text: "Shop", ...PINK }), theme, isEditing: false, isSelected: false } as never)],
  ["richtext-scheme", createElement(RichTextSection, { section: preset("rich_text", { color_scheme: "white", button_text: "Read", button_color: "", button_text_color: "", button_style: "filled" }), theme, isEditing: false, isSelected: false } as never)],
  ["richtext-pink", createElement(RichTextSection, { section: preset("rich_text", { color_scheme: "white", button_text: "Read", button_color: "", button_text_color: "", button_style: "filled", ...PINK }), theme, isEditing: false, isSelected: false } as never)],
]

const vars = Object.entries(themeVars(theme) as CSSProperties).map(([k, v]) => `${k}:${String(v)}`).join(";")
let body = ""
for (const [name, el] of cases) {
  const html = renderToStaticMarkup(createElement(StorelibLiveProvider, { sources: {}, children: el } as never))
  body += `<div class="probe" data-case="${name}">${html}</div>\n`
}
writeFileSync(join(OUT, "page.html"), `<style>${themeStylesheet(theme)}</style><div ${THEME_ROOT_ATTRIBUTE} style="${vars}">${body}</div>`)

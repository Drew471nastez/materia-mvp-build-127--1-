/**
 * Every shipped section, rendered once for each colour scheme and once for
 * each heading and body style, with the theme's own stylesheet — so "the
 * controls work" can be read off the pixels instead of reasoned about from
 * the code that is supposed to produce them.
 *
 * `scripts/check-schemes.mjs` measures the result.
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
import { BUILT_IN_SCHEME_KEYS } from "@/lib/storelib-theme/color-schemes"
import { SECTION_HEADING_STYLES, SECTION_BODY_STYLES } from "@/lib/storelib-theme/typography"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues
const PLACEHOLDER = "https://example.invalid/picture.jpg"
const IMAGEY = new Set(["image_picker", "image_gallery"])

/**
 * A SECTION ID ENDS UP INSIDE A CSS SELECTOR — `[data-section-id="..."]` is
 * how a section's compiled style is scoped to its own instance. An id with a
 * quote or a brace in it does not break loudly; it breaks the whole rule, and
 * every section renders with no style at all. Which is how an earlier version
 * of this probe reported all thirty sections as ignoring every control.
 */
let seq = 0
function safeId(type: string): string {
  return `${type.replace(/[^a-z0-9_-]/gi, "")}-${++seq}`
}

/**
 * A PRESET IS NOT A TEST FIXTURE. Several leave the section's own heading or
 * subheading empty, so the only text that renders is a card title or a card
 * description — text that keeps its own size on purpose. Measuring that and
 * calling the control dead is a false alarm, and it produced eleven of them.
 *
 * So wherever a section HAS a heading or a body field, it is given one, and
 * the measurement is about the control rather than about what the preset
 * happened to fill in.
 */
const HEADING_FIELDS = ["heading", "title"]
const BODY_FIELDS = ["subheading", "subtitle", "body", "text", "description"]

function instance(type: string, extra: Record<string, unknown>): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const preset = schema.presets?.[0]
  const settings: Record<string, unknown> = { ...(preset?.settings ?? {}), ...extra }
  for (const f of schema.fields ?? []) {
    if (settings[f.id]) continue
    if (HEADING_FIELDS.includes(f.id)) settings[f.id] = "A heading for measuring"
    else if (BODY_FIELDS.includes(f.id) && (f.type === "text" || f.type === "textarea" || f.type === "richtext")) {
      settings[f.id] = f.type === "richtext" ? "<p>Some body text for measuring.</p>" : "Some body text for measuring."
    }
  }
  for (const f of schema.fields ?? []) if (IMAGEY.has(f.type) && settings[f.id] === undefined) settings[f.id] = PLACEHOLDER
  const blocks = (preset?.blocks ?? []).map((b, i) => {
    const def = (schema.blocks ?? []).find((d) => d.type === b.type)
    const bs: Record<string, unknown> = { ...(b.settings ?? {}) }
    for (const f of def?.fields ?? []) if (IMAGEY.has(f.type) && bs[f.id] === undefined) bs[f.id] = PLACEHOLDER
    return { id: `${type}-b${i}`, type: b.type, settings: bs }
  })
  return { id: safeId(type), type, name: schema.name, settings, blocks }
}

function draw(type: string, extra: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources: {},
      children: createElement(StorelibSection, { section: instance(type, extra), theme, isEditing: false, isSelected: false } as never),
    } as never),
  )
}

const vars = Object.entries(themeVars(theme) as CSSProperties).map(([k, v]) => `${k}:${String(v)}`).join(";")
let body = ""
for (const type of ADDABLE_SECTIONS) {
  for (const scheme of BUILT_IN_SCHEME_KEYS) {
    body += `<div class="probe" data-type="${type}" data-axis="scheme" data-value="${scheme}">${draw(type, { color_scheme: scheme })}</div>\n`
  }
  for (const h of SECTION_HEADING_STYLES) {
    if (h === "custom") continue
    body += `<div class="probe" data-type="${type}" data-axis="heading" data-value="${h}">${draw(type, { heading_style: h })}</div>\n`
  }
  for (const b of SECTION_BODY_STYLES) {
    if (b === "custom") continue
    body += `<div class="probe" data-type="${type}" data-axis="body" data-value="${b}">${draw(type, { body_style: b })}</div>\n`
  }
  /**
   * A custom heading and a custom body, set to values nothing else uses, so
   * "custom" being ignored shows up as a measurement rather than as silence.
   */
  body += `<div class="probe" data-type="${type}" data-axis="heading" data-value="custom">${draw(type, {
    heading_style: "custom",
    custom_heading: { size: 41, weight: 830, "line-height": 1.07, tracking: -0.031, transform: "uppercase" },
  })}</div>\n`
  body += `<div class="probe" data-type="${type}" data-axis="body" data-value="custom">${draw(type, {
    body_style: "custom",
    custom_body: { size: 19, weight: 530, "line-height": 1.83, tracking: 0.029, transform: "none" },
  })}</div>\n`
}

writeFileSync(
  join(OUT, "page.html"),
  `<div ${THEME_ROOT_ATTRIBUTE} style="${vars}"><style>${themeStylesheet(theme)}</style>${body}</div>`,
)
writeFileSync(join(OUT, "axes.json"), JSON.stringify({
  schemes: BUILT_IN_SCHEME_KEYS,
  headings: SECTION_HEADING_STYLES,
  bodies: SECTION_BODY_STYLES,
  sections: ADDABLE_SECTIONS,
}))

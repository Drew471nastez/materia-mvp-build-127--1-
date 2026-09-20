/**
 * Every section the theme ships, rendered against a deliberately loud button
 * style, so a browser can be asked which elements took it. A button should;
 * a link in a sentence, a nav link, a footer link and the site's wordmark
 * should not. Bundled by scripts/check-link-vs-button.mjs.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type CSSProperties } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS, STRUCTURE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!

/*
  THE POINT OF THE LOUD SETTINGS. With the shipped defaults the button style
  is the body face at weight 600 with no transform, so a link wrongly styled
  as a button looks exactly like a link and nothing can be measured. Every
  one of these is a control a creator really has.
*/
const theme = {
  ...Object.fromEntries(
    THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
  ),
  font_heading: "Playfair Display",
  font_body: "DM Sans",
  font_accent: "Space Grotesk",
  button_style: "outline",
  /* The stored names, not invented ones: `typography_styles` keyed by style,
     and the button's own radius setting. A probe configured with keys
     nothing reads is a probe that measures the defaults. */
  button_border_radius: 22,
  typography_styles: { button: { font: "accent", weight: "700", transform: "uppercase", letter_spacing: 2 } },
} as unknown as ThemeSettingsValues

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
/*
  THE HEADER AND THE FOOTER TOO, which are where the links actually are. The
  addable sections are mostly CTAs, and a CTA is a button, so a sweep over
  those alone examined nothing and reported nothing wrong. A site's plain
  links are its nav and its footer columns, and they are structure sections.
*/
for (const type of [...STRUCTURE_SECTIONS, ...ADDABLE_SECTIONS]) {
  if (!SECTION_SCHEMAS[type]) continue
  const html = renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources: {},
      children: createElement(StorelibSection, { section: asAdded(type), theme, isEditing: false, isSelected: false } as never),
    } as never),
  )
  if (!/<button|<a [^>]*href/i.test(html)) continue
  body += `<div class="probe" data-type="${type}">${html}</div>\n`
}

/*
  The cases the rule is about, written by hand so each one is unambiguous
  about what it is: two real buttons, and four things that are not.
*/
body += `
<div class="probe" data-type="__hand__">
  <div data-section style="background:#ffffff;color:#111111;padding:20px">
    <a href="#" class="s__btn" data-role="button-class">Book a chair</a>
    <button type="button" data-role="button-element">Also a button</button>
    <a href="#" data-button data-role="button-marked">Marked as one</a>
    <p>Read the <a href="#" data-role="link-in-a-sentence">terms and conditions</a> first.</p>
    <nav><a href="/about" data-role="link-in-a-nav">About</a></nav>
    <a href="/" data-role="wordmark"><span>THE CHAIR</span></a>
  </div>
</div>
`

writeFileSync(join(OUT, "page.html"), `<div ${THEME_ROOT_ATTRIBUTE} style="${vars}"><style>${themeStylesheet(theme)}</style>${body}</div>`)

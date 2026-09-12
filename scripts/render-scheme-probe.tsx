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
import { SECTION_COMPONENTS } from "@/components/website-builder/sections/registry"
import { designSupport } from "@/lib/website-builder/design-support"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { BUILT_IN_SCHEME_KEYS, SECTION_OVERRIDE_KEYS } from "@/lib/storelib-theme/color-schemes"
import { SECTION_HEADING_STYLES, SECTION_BODY_STYLES } from "@/lib/storelib-theme/typography"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues
const PLACEHOLDER = "https://example.invalid/picture.jpg"
/**
 * Two colours per override key, all eighteen distinct and none of them a
 * colour any theme or section would choose on its own, so finding one in a
 * rendering names exactly which control put it there.
 */
const OVERRIDE_A = ["#010203", "#040506", "#070809", "#0a0b0c", "#0d0e0f", "#101112", "#131415", "#161718", "#191a1b"]
const OVERRIDE_B = ["#f10203", "#f40506", "#f70809", "#fa0b0c", "#fd0e0f", "#a01112", "#a31415", "#a61718", "#a91a1b"]
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
/**
 * AND A SECOND BUTTON, because a preset never fills one in.
 *
 * Nothing drew a secondary button, so the two Secondary button overrides in
 * the panel were measured across zero sections and passed by never being
 * asked. They were also wired to nothing, which is what that silence was
 * hiding.
 */
const SECOND_BUTTON_FIELDS = ["button2_text", "btn_secondary_text", "secondary_button_text", "button_secondary_text"]
const HEADING_FIELDS = ["heading", "title"]
const BODY_FIELDS = ["subheading", "subtitle", "body", "text", "description"]

function instance(type: string, extra: Record<string, unknown>): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const preset = schema.presets?.[0]
  const settings: Record<string, unknown> = { ...(preset?.settings ?? {}), ...extra }
  for (const f of schema.fields ?? []) {
    if (settings[f.id]) continue
    if (SECOND_BUTTON_FIELDS.includes(f.id)) settings[f.id] = "Second button"
    else if (HEADING_FIELDS.includes(f.id)) settings[f.id] = "A heading for measuring"
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

/**
 * THROUGH THE REGISTRY, NOT STRAIGHT TO StorelibSection.
 *
 * An earlier version of this drew every section as a .storelib one, which
 * quietly skipped the fifty that are React renderers — including the HEADER
 * and the FOOTER, which are on every published site there is. Going through
 * the same lookup the canvas and the storefront use means a section is drawn
 * the way it is actually drawn, whichever family it belongs to.
 */
function draw(type: string, extra: Record<string, unknown>): string {
  const Component = SECTION_COMPONENTS[type]
  if (!Component) return ""
  try {
    return renderToStaticMarkup(
      createElement(StorelibLiveProvider, {
        sources: {},
        children: createElement(Component, { section: instance(type, extra), theme, isEditing: false, isSelected: false } as never),
      } as never),
    )
  } catch {
    // A renderer that throws is the error boundary's problem, measured by
    // scripts/check-error-boundary.mjs. Here it is simply not measurable.
    return ""
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AND THE THEME'S OWN FONTS, which are a control too
 * ═══════════════════════════════════════════════════════════════════════════
 * A section answering `heading_style` says the per-section control works. It
 * says nothing about whether the theme's Heading font reaches the section at
 * all — and that is the one a creator changes first, expecting the whole
 * site to follow. So the page is drawn a second time under a different pair
 * of fonts, and every section is asked whether it noticed.
 */
const ALT_THEME = { ...theme, font_heading: "Playfair Display", font_body: "IBM Plex Mono" } as unknown as ThemeSettingsValues

function drawWith(t: ThemeSettingsValues, type: string, extra: Record<string, unknown>): string {
  const Component = SECTION_COMPONENTS[type]
  if (!Component) return ""
  try {
    return renderToStaticMarkup(
      createElement(StorelibLiveProvider, {
        sources: {},
        children: createElement(Component, { section: instance(type, extra), theme: t, isEditing: false, isSelected: false } as never),
      } as never),
    )
  } catch {
    return ""
  }
}

const vars = Object.entries(themeVars(theme) as CSSProperties).map(([k, v]) => `${k}:${String(v)}`).join(";")
const altVars = Object.entries(themeVars(ALT_THEME) as CSSProperties).map(([k, v]) => `${k}:${String(v)}`).join(";")
/**
 * EVERY TYPE THE REGISTRY CAN DRAW, not just the ones the Add panel offers.
 * `header` and `footer` are not addable — they are always there — and a site
 * that was built before a type was retired still renders it.
 */
const DRAWABLE = Object.keys(SECTION_COMPONENTS).filter((t) => SECTION_SCHEMAS[t])
/**
 * TWO PAGES, NOT ONE. Eighty sections across twenty-six renderings each is
 * two thousand of them, and one page of that never finished laying out — the
 * probe reported nothing at all, which is worse than reporting a failure.
 * Colour and type are separate questions, so they are separate pages.
 */
const colourOf = new Map<string, string>()
const typeOf = new Map<string, string>()
const altOf = new Map<string, string>()
for (const type of DRAWABLE) {
  let colourBody = ""
  let typeBody = ""
  /**
   * AN EXPLICIT COLOUR IS NOT A BROKEN CONTROL.
   *
   * Several presets pin a background of their own — a dark hero, a tinted
   * banner — and a section that has been given a colour is supposed to keep
   * it whatever the scheme says. That is the override working, not the
   * scheme failing, and measuring it as failure produced four false alarms.
   *
   * So on this axis every colour the section offers is cleared, which is
   * what "follow the scheme" means, and then the scheme is the only thing
   * left that can decide how it paints.
   */
  const noColours: Record<string, unknown> = { color_overrides: undefined }
  for (const f of (SECTION_SCHEMAS[type].fields ?? []) as { id: string; type: string }[]) {
    if (f.type === "color" || f.type === "color_background") noColours[f.id] = undefined
  }
  for (const scheme of BUILT_IN_SCHEME_KEYS) {
    colourBody += `<div class="probe" data-type="${type}" data-axis="scheme" data-value="${scheme}">${draw(type, { ...noColours, color_scheme: scheme })}</div>\n`
  }
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE NINE PER-SECTION COLOUR OVERRIDES, ONE AT A TIME
   * ═════════════════════════════════════════════════════════════════════════
   * "The colour schemes don't really control the buttons of the sections, the
   * text of the buttons." A scheme reaching a section says nothing about
   * whether OVERRIDING one of its colours on that section reaches it, and the
   * override is the control a creator reaches for when the scheme is nearly
   * right.
   *
   * Every key is given a colour of its own first, so that finding one in the
   * rendering means that key and no other. Nine of them share values in the
   * real schemes — white backgrounds, white button text — and a shared value
   * cannot tell you which control painted it.
   *
   * Then one key at a time is moved to a second colour. If the section
   * painted the first, it has to paint the second.
   */
  const spread = Object.fromEntries(SECTION_OVERRIDE_KEYS.map((k, i) => [k, OVERRIDE_A[i]]))
  colourBody += `<div class="probe" data-type="${type}" data-axis="override" data-value="__all__">${draw(type, { color_overrides: spread })}</div>\n`
  SECTION_OVERRIDE_KEYS.forEach((key, i) => {
    colourBody += `<div class="probe" data-type="${type}" data-axis="override" data-value="${key}">${draw(type, {
      color_overrides: { ...spread, [key]: OVERRIDE_B[i] },
    })}</div>\n`
  })

  for (const h of SECTION_HEADING_STYLES) {
    if (h === "custom") continue
    typeBody += `<div class="probe" data-type="${type}" data-axis="heading" data-value="${h}">${draw(type, { heading_style: h })}</div>\n`
  }
  for (const b of SECTION_BODY_STYLES) {
    if (b === "custom") continue
    typeBody += `<div class="probe" data-type="${type}" data-axis="body" data-value="${b}">${draw(type, { body_style: b })}</div>\n`
  }
  /**
   * A custom heading and a custom body, set to values nothing else uses, so
   * "custom" being ignored shows up as a measurement rather than as silence.
   */
  typeBody += `<div class="probe" data-type="${type}" data-axis="heading" data-value="custom">${draw(type, {
    heading_style: "custom",
    custom_heading: { size: 41, weight: 830, "line-height": 1.07, tracking: -0.031, transform: "uppercase" },
  })}</div>\n`
  typeBody += `<div class="probe" data-type="${type}" data-axis="body" data-value="custom">${draw(type, {
    body_style: "custom",
    custom_body: { size: 19, weight: 530, "line-height": 1.83, tracking: 0.029, transform: "none" },
  })}</div>\n`

  // The theme-font axis: the same section under the theme it ships with, and
  // under one with a different pair of fonts.
  typeBody += `<div class="probe" data-type="${type}" data-axis="fonts" data-value="default">${draw(type, {})}</div>\n`
  altOf.set(type, `<div class="probe" data-type="${type}" data-axis="fonts" data-value="alt">${drawWith(ALT_THEME, type, {})}</div>\n`)

  colourOf.set(type, colourBody)
  typeOf.set(type, typeBody)
}

/**
 * The second theme lives in its own root, with its own variables and its own
 * stylesheet, exactly as a different site would. Nothing is shared but the
 * sections themselves.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  IN BATCHES, BECAUSE ONE PAGE OF IT NEVER FINISHES PARSING
 * ═══════════════════════════════════════════════════════════════════════════
 * Eighty sections across twenty-six renderings is two thousand of them and
 * about ten megabytes. Chromium dumped that document with every section
 * present and `DOMContentLoaded` never fired, so the measurement never ran
 * and the probe reported nothing at all — which is worse than reporting a
 * failure, because it looks like a broken script rather than a page that is
 * simply too big.
 *
 * Ten sections to a page. The measurement is per section either way, so the
 * batching changes nothing about what is measured.
 */
const PER_PAGE = 10
const wrap = (inner: string) => `<div ${THEME_ROOT_ATTRIBUTE} style="${vars}"><style>${themeStylesheet(theme)}</style>${inner}</div>`
const wrapAlt = (inner: string) => `<div ${THEME_ROOT_ATTRIBUTE} style="${altVars}"><style>${themeStylesheet(ALT_THEME)}</style>${inner}</div>`

const pages: string[] = []
for (let i = 0; i < DRAWABLE.length; i += PER_PAGE) {
  const batch = DRAWABLE.slice(i, i + PER_PAGE)
  const n = i / PER_PAGE
  const pick = (m: Map<string, string>) => batch.map((t) => m.get(t) ?? "").join("")
  pages.push(`colour-${n}.html`)
  writeFileSync(join(OUT, `colour-${n}.html`), wrap(pick(colourOf)))
  pages.push(`type-${n}.html`)
  writeFileSync(join(OUT, `type-${n}.html`), wrap(pick(typeOf)) + wrapAlt(pick(altOf)))
}
writeFileSync(join(OUT, "pages.json"), JSON.stringify(pages))
/**
 * What the EDITOR offers for each section, so the audit can hold the two
 * against each other. A control that is shown and does nothing is the
 * complaint this whole file exists to answer, and it cannot be seen by
 * looking at either side alone.
 */
const offers = Object.fromEntries(DRAWABLE.map((t) => [t, designSupport(SECTION_SCHEMAS[t] as never).typography]))

/**
 * A section that offers a FONT of its own does not follow the theme's, and
 * is not supposed to. `chapter_preview` defaults to Georgia because a book
 * preview is meant to be in a book font, and a creator who picks one there
 * has said what they want more recently than the theme did.
 */
const ownFont = Object.fromEntries(DRAWABLE.map((t) => [
  t,
  ((SECTION_SCHEMAS[t].fields ?? []) as { id: string }[]).some((f) => /^(font|font_family|typeface)$/.test(f.id) || f.id.endsWith("_font_family")),
]))

writeFileSync(join(OUT, "offers.json"), JSON.stringify({
  typography: offers,
  ownFont,
  overrideKeys: SECTION_OVERRIDE_KEYS,
  overrideA: OVERRIDE_A,
  overrideB: OVERRIDE_B,
}))
writeFileSync(join(OUT, "axes.json"), JSON.stringify({
  schemes: BUILT_IN_SCHEME_KEYS,
  headings: SECTION_HEADING_STYLES,
  bodies: SECTION_BODY_STYLES,
  sections: DRAWABLE,
  addable: ADDABLE_SECTIONS,
}))

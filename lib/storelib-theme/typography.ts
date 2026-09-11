/**
 * ===========================================================================
 *  TYPOGRAPHY: NINE TEXT STYLES, THREE FONTS, ONE PLACE
 * ===========================================================================
 * A theme names a heading font, a body font and, if it wants one, an accent
 * font. On top of those it defines nine text styles: H1 to H4, Body large,
 * Body, Body small, Button and Caption. Each style is a font, a weight, a
 * size at three widths, a line height, a letter spacing and a transform.
 *
 * The styles compile to custom properties (`--type-h1-size`, and so on) on
 * the page root, with the tablet and mobile sizes taking over inside a
 * container query, so a section that is 390px wide draws its heading at the
 * mobile size whether that is a phone or the editor's phone preview.
 *
 * A section does not pick fonts. It says which style its heading is
 * (`heading_style: "h2"`) and which its body is (`body_style: "body"`), or
 * "custom", and only then names its own family, size, weight, line height
 * and spacing. `sectionTypography()` turns that into the attributes and
 * variables the section root carries.
 *
 * STORAGE. `theme.font_heading`, `theme.font_body`, `theme.font_accent`, and
 * `theme.typography_styles[style]` holding only what differs from the
 * default. The older flat controls (`heading_weight`, `font_size_base`,
 * `line_height_base`, `heading_transform`, `heading_letter_spacing`) still
 * seed the defaults, so a theme saved before the styles existed reads the
 * same as it always did.
 */

export const TYPE_STYLE_KEYS = ["h1", "h2", "h3", "h4", "body_large", "body", "body_small", "button", "caption"] as const
export type TypeStyleKey = (typeof TYPE_STYLE_KEYS)[number]

export const TYPE_STYLE_LABELS: Record<TypeStyleKey, string> = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  body_large: "Body large",
  body: "Body",
  body_small: "Body small",
  button: "Button",
  caption: "Caption",
}

export const FONT_ROLES = ["heading", "body", "accent"] as const
export type FontRole = (typeof FONT_ROLES)[number]

export const TEXT_TRANSFORMS = ["none", "uppercase", "capitalize", "lowercase"] as const
export type TextTransform = (typeof TEXT_TRANSFORMS)[number]

export interface ResponsiveSize {
  desktop: number
  tablet: number
  mobile: number
}

export interface TypeStyle {
  font: FontRole
  weight: string
  /** Pixels, at each width. */
  size: ResponsiveSize
  /** Unitless. */
  line_height: number
  /** Pixels. */
  letter_spacing: number
  transform: TextTransform
}

export interface ThemeFonts {
  heading: string
  body: string
  /** Falls back to the heading font when the theme names none. */
  accent: string
}

export interface ThemeTypography {
  fonts: ThemeFonts
  styles: Record<TypeStyleKey, TypeStyle>
}

/** The widths at which the tablet and mobile sizes take over. */
export const TYPE_BREAKPOINTS = { tablet: 1023, mobile: 767 } as const

function style(font: FontRole, weight: string, size: [number, number, number], line_height: number, letter_spacing = 0, transform: TextTransform = "none"): TypeStyle {
  return { font, weight, size: { desktop: size[0], tablet: size[1], mobile: size[2] }, line_height, letter_spacing, transform }
}

export const DEFAULT_TYPE_STYLES: Record<TypeStyleKey, TypeStyle> = {
  h1: style("heading", "700", [56, 44, 36], 1.1, -1),
  h2: style("heading", "700", [36, 32, 30], 1.15, -0.5),
  h3: style("heading", "600", [24, 22, 20], 1.25),
  h4: style("heading", "600", [18, 17, 16], 1.35),
  body_large: style("body", "400", [18, 17, 17], 1.6),
  body: style("body", "400", [16, 16, 16], 1.6),
  body_small: style("body", "400", [14, 14, 14], 1.5),
  button: style("body", "600", [14, 14, 14], 1.2),
  caption: style("body", "500", [12, 12, 12], 1.4, 0.3),
}

const HEADING_STYLES: TypeStyleKey[] = ["h1", "h2", "h3", "h4"]

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback
}

function transform(v: unknown, fallback: TextTransform): TextTransform {
  return typeof v === "string" && (TEXT_TRANSFORMS as readonly string[]).includes(v) ? (v as TextTransform) : fallback
}

function fontRole(v: unknown, fallback: FontRole): FontRole {
  return typeof v === "string" && (FONT_ROLES as readonly string[]).includes(v) ? (v as FontRole) : fallback
}

/** A size saved as one number, or as `{desktop, tablet, mobile}` with any of them missing. */
export function responsiveSize(v: unknown, fallback: ResponsiveSize): ResponsiveSize {
  if (isPlain(v)) {
    const desktop = num(v.desktop, fallback.desktop)
    const tablet = num(v.tablet, v.desktop === undefined ? fallback.tablet : desktop)
    const mobile = num(v.mobile, v.desktop === undefined && v.tablet === undefined ? fallback.mobile : tablet)
    return { desktop, tablet, mobile }
  }
  if (v !== undefined && v !== null && v !== "") {
    const one = num(v, fallback.desktop)
    return { desktop: one, tablet: one, mobile: one }
  }
  return { ...fallback }
}

/** A saved style, whatever is missing filled from `base`. */
export function normalizeTypeStyle(raw: unknown, base: TypeStyle): TypeStyle {
  if (!isPlain(raw)) return { ...base, size: { ...base.size } }
  return {
    font: fontRole(raw.font, base.font),
    weight: str(raw.weight, base.weight),
    size: responsiveSize(raw.size, base.size),
    line_height: num(raw.line_height, base.line_height),
    letter_spacing: num(raw.letter_spacing, base.letter_spacing),
    transform: transform(raw.transform, base.transform),
  }
}

/**
 * The defaults for THIS theme: the built-in styles, with the older flat
 * controls folded in where they used to apply. A theme that set
 * `heading_weight: 800` before styles existed still has 800 headings.
 */
export function baseTypeStyles(theme: Record<string, unknown> | undefined | null): Record<TypeStyleKey, TypeStyle> {
  const t = theme ?? {}
  const out = {} as Record<TypeStyleKey, TypeStyle>
  for (const key of TYPE_STYLE_KEYS) out[key] = { ...DEFAULT_TYPE_STYLES[key], size: { ...DEFAULT_TYPE_STYLES[key].size } }
  const headingWeight = str(t.heading_weight, "")
  const headingTransform = typeof t.heading_transform === "string" ? transform(t.heading_transform, "none") : null
  const headingTracking = t.heading_letter_spacing !== undefined ? Math.max(-2, Math.min(8, num(t.heading_letter_spacing, 0))) : null
  for (const key of HEADING_STYLES) {
    if (headingWeight) out[key].weight = headingWeight
    if (headingTransform !== null) out[key].transform = headingTransform
    if (headingTracking !== null) out[key].letter_spacing = headingTracking
  }
  const bodySize = t.font_size_base !== undefined ? num(t.font_size_base, 16) : null
  if (bodySize !== null) out.body.size = { desktop: bodySize, tablet: bodySize, mobile: bodySize }
  const bodyLine = t.line_height_base !== undefined ? num(t.line_height_base, 1.6) : null
  if (bodyLine !== null) { out.body.line_height = bodyLine; out.body_large.line_height = bodyLine }
  const buttonWeight = str(t.button_font_weight, "")
  if (buttonWeight) out.button.weight = buttonWeight
  return out
}

export function themeTypography(theme: Record<string, unknown> | undefined | null): ThemeTypography {
  const t = theme ?? {}
  const heading = str(t.font_heading, "Inter")
  const body = str(t.font_body, "Inter")
  const accent = str(t.font_accent, heading)
  const base = baseTypeStyles(t)
  const own = isPlain(t.typography_styles) ? t.typography_styles : {}
  const styles = {} as Record<TypeStyleKey, TypeStyle>
  for (const key of TYPE_STYLE_KEYS) styles[key] = normalizeTypeStyle(own[key], base[key])
  return { fonts: { heading, body, accent }, styles }
}

/** The stored form of a style: only what differs from its base. */
export function stripTypeStyleDefaults(s: TypeStyle, base: TypeStyle): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (s.font !== base.font) out.font = s.font
  if (s.weight !== base.weight) out.weight = s.weight
  if (s.size.desktop !== base.size.desktop || s.size.tablet !== base.size.tablet || s.size.mobile !== base.size.mobile) {
    out.size = s.size.desktop === s.size.tablet && s.size.tablet === s.size.mobile ? s.size.desktop : { ...s.size }
  }
  if (s.line_height !== base.line_height) out.line_height = s.line_height
  if (s.letter_spacing !== base.letter_spacing) out.letter_spacing = s.letter_spacing
  if (s.transform !== base.transform) out.transform = s.transform
  return out
}

const FONT_FALLBACK = ",ui-sans-serif,system-ui,sans-serif"

/** `--theme-font-heading` and friends, quoted for CSS. */
export function fontVars(fonts: ThemeFonts): Record<string, string> {
  return {
    "--theme-font-heading": fonts.heading,
    "--theme-font-body": fonts.body,
    "--theme-font-accent": fonts.accent,
  }
}

function fontFor(role: FontRole): string {
  return `var(--theme-font-${role})${FONT_FALLBACK}`
}

/** `--type-<style>-*` at desktop width, for the page root. */
export function typographyVars(typo: ThemeTypography): Record<string, string> {
  const out: Record<string, string> = fontVars(typo.fonts)
  for (const key of TYPE_STYLE_KEYS) {
    const s = typo.styles[key]
    const k = key.replace(/_/g, "-")
    out[`--type-${k}-font`] = fontFor(s.font)
    out[`--type-${k}-size`] = `${s.size.desktop}px`
    out[`--type-${k}-weight`] = s.weight
    out[`--type-${k}-line-height`] = String(s.line_height)
    out[`--type-${k}-tracking`] = `${s.letter_spacing}px`
    out[`--type-${k}-transform`] = s.transform
  }
  return out
}

/** Only the sizes that differ at a narrower width. */
export function typographySizeVars(typo: ThemeTypography, width: "tablet" | "mobile"): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of TYPE_STYLE_KEYS) {
    const s = typo.styles[key]
    if (s.size[width] !== s.size.desktop) out[`--type-${key.replace(/_/g, "-")}-size`] = `${s.size[width]}px`
  }
  return out
}

export const SECTION_HEADING_STYLES = ["h1", "h2", "h3", "h4", "custom"] as const
export const SECTION_BODY_STYLES = ["body", "body_large", "body_small", "custom"] as const

export interface SectionTypography {
  /** `data-heading-style` on the section root, or undefined for the theme's choice. */
  heading: string | undefined
  /** `data-body-style` on the section root, or undefined for the theme's choice. */
  body: string | undefined
  /** `--custom-heading-*` and `--custom-body-*`, only for "custom". */
  vars: Record<string, string>
}

function customVars(prefix: string, raw: unknown, base: TypeStyle): Record<string, string> {
  const s = normalizeTypeStyle(raw, base)
  const out: Record<string, string> = {
    [`--custom-${prefix}-font`]: fontFor(s.font),
    [`--custom-${prefix}-size`]: `${s.size.desktop}px`,
    [`--custom-${prefix}-size-tablet`]: `${s.size.tablet}px`,
    [`--custom-${prefix}-size-mobile`]: `${s.size.mobile}px`,
    [`--custom-${prefix}-weight`]: s.weight,
    [`--custom-${prefix}-line-height`]: String(s.line_height),
    [`--custom-${prefix}-tracking`]: `${s.letter_spacing}px`,
    [`--custom-${prefix}-transform`]: s.transform,
  }
  if (isPlain(raw) && typeof raw.family === "string" && raw.family.trim()) {
    out[`--custom-${prefix}-font`] = `${raw.family.trim()}${FONT_FALLBACK}`
  }
  return out
}

/**
 * What a section's settings say about its type. `defaults` is the schema's
 * defaults for `heading_style` and `body_style`, when the instance has not
 * set them.
 */
export function sectionTypography(
  settings: Record<string, unknown> | undefined | null,
  defaults: { heading_style?: unknown; body_style?: unknown } = {},
): SectionTypography {
  const s = settings ?? {}
  const headingRaw = str(s.heading_style, str(defaults.heading_style, ""))
  const bodyRaw = str(s.body_style, str(defaults.body_style, ""))
  const heading = (SECTION_HEADING_STYLES as readonly string[]).includes(headingRaw) ? headingRaw : undefined
  const body = (SECTION_BODY_STYLES as readonly string[]).includes(bodyRaw) ? bodyRaw : undefined
  const vars: Record<string, string> = {}
  if (heading === "custom") Object.assign(vars, customVars("heading", s.custom_heading, DEFAULT_TYPE_STYLES.h2))
  if (body === "custom") Object.assign(vars, customVars("body", s.custom_body, DEFAULT_TYPE_STYLES.body))
  return { heading, body, vars }
}

const PROPS = ["font", "size", "line-height", "weight", "tracking", "transform"] as const

function sectionVarBlock(role: "heading" | "body", from: string): string {
  return PROPS.map((p) => `--section-${role}-${p}:var(--${from}-${p})`).join(";")
}

/**
 * The rules that make the styles land, all under `root`. Sections receive
 * `--section-heading-*` and `--section-body-*` on their `[data-section]`
 * root; the theme's own h1/h2 rules read them, and a .storelib section reads
 * them in its CSS. h3 and h4 take family, weight, spacing and transform from
 * their style and keep the size the section gave them, since inside a
 * section they are card titles and labels, not the section's heading.
 */
export function typographyStylesheet(root: string, typo: ThemeTypography): string {
  const rules: string[] = []
  const sect = `${root} [data-section]`
  // The default: a section's heading is its H2, its body is Body.
  rules.push(`${sect}{${sectionVarBlock("heading", "type-h2")};${sectionVarBlock("body", "type-body")};}`)
  for (const key of ["h1", "h2", "h3", "h4"] as const) {
    rules.push(`${root} [data-heading-style="${key}"] [data-section]{${sectionVarBlock("heading", `type-${key}`)};}`)
  }
  rules.push(`${root} [data-heading-style="custom"] [data-section]{${sectionVarBlock("heading", "custom-heading")};}`)
  for (const key of ["body", "body_large", "body_small"] as const) {
    rules.push(`${root} [data-body-style="${key}"] [data-section]{${sectionVarBlock("body", `type-${key.replace(/_/g, "-")}`)};}`)
  }
  rules.push(`${root} [data-body-style="custom"] [data-section]{${sectionVarBlock("body", "custom-body")};}`)

  // The elements. `:where()` keeps these below anything a section wrote.
  const heading = (from: string) =>
    `font-family:var(--${from}-font);font-size:var(--${from}-size);line-height:var(--${from}-line-height);font-weight:var(--${from}-weight);letter-spacing:var(--${from}-tracking);text-transform:var(--${from}-transform);`
  // Not the header or the footer: their headings are a cart drawer's title
  // and a column label, not the section's heading.
  const content = "[data-section]:not([data-chrome])"
  rules.push(`${root} :where(${content} h1){${heading("type-h1")}}`)
  rules.push(`${root} :where(${content} h2),${root} [data-heading-style] :where(${content} h1){${heading("section-heading")}}`)
  for (const key of ["h3", "h4"] as const) {
    rules.push(`${root} :where(${content} ${key}){font-family:var(--type-${key}-font);font-weight:var(--type-${key}-weight);letter-spacing:var(--type-${key}-tracking);text-transform:var(--type-${key}-transform);}`)
  }
  /**
   * A chosen body style lands on the section root, where unstyled text
   * inherits it, and is republished as `--section-text-*`, which is only
   * defined when a style was chosen, so a template can write
   * `font-size: var(--section-text-size, 17px)` and keep its own size
   * until somebody picks one.
   */
  rules.push(`${root} [data-body-style] [data-section]{font-family:var(--section-body-font);font-size:var(--section-body-size);line-height:var(--section-body-line-height);font-weight:var(--section-body-weight);letter-spacing:var(--section-body-tracking);${PROPS.map((p) => `--section-text-${p}:var(--section-body-${p})`).join(";")};}`)
  rules.push(`${root} :where([data-section] button),${root} :where([data-section] a[href]){font-family:var(--type-button-font);letter-spacing:var(--type-button-tracking);text-transform:var(--type-button-transform);}`)

  // Narrower widths. The query is against the section's container, which is
  // the width the section actually has, in the editor's phone preview too.
  for (const width of ["tablet", "mobile"] as const) {
    const sizes = typographySizeVars(typo, width)
    const decls = Object.entries(sizes).map(([k, v]) => `${k}:${v}`)
    decls.push(`--custom-heading-size:var(--custom-heading-size-${width})`, `--custom-body-size:var(--custom-body-size-${width})`)
    rules.push(`@container (max-width:${TYPE_BREAKPOINTS[width]}px){${sect}{${decls.join(";")};}}`)
  }
  return rules.join("\n")
}

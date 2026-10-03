/**
 * ===========================================================================
 *  COLOUR SCHEMES: THE ONE PLACE A SECTION'S COLOURS ARE DECIDED
 * ===========================================================================
 * A theme has a handful of named colour schemes. A section picks one, and
 * may override a few of its values. Everything a section paints comes from
 * the scheme it picked, so recolouring the scheme recolours every section
 * that uses it, and a section that overrode its background keeps that
 * background when the scheme changes underneath it.
 *
 * WHAT A SCHEME IS. Seventeen semantic values, no more: what the section
 * sits on, what its text and headings are, its accent, links, borders, two
 * buttons and an input. Plus an optional gradient laid over the background.
 * The eighty-slot scheme this replaces ("curriculum lesson title",
 * "pagination active text") was read at twelve slots by anything at all.
 *
 * WHO READS IT. Both renderer families, through this file and nothing else:
 *
 *   • the React renderers, through `sectionColors()` in the application,
 *     which calls `resolveSectionColors()` here and hands back the legacy
 *     slot names (`bg`, `heading`, `primary_btn_bg`) they were written
 *     against, derived from the semantic values;
 *   • the .storelib renderer, through `themeTokens()` and `render.ts`,
 *     which expose the same scheme as `scheme.*` in a template, under both
 *     the semantic names and the legacy ones.
 *
 * Two families, one resolver, so the editor's canvas and the published page
 * cannot disagree about a colour. tests/design-tokens.test.ts holds them to
 * that.
 *
 * STORAGE. `theme.color_schemes[key]` holds a scheme's values; only what
 * differs from the built-in default needs to be there. A saved scheme in the
 * old eighty-slot shape is read through `LEGACY_TO_SEMANTIC` and keeps
 * working. A section stores `settings.color_scheme` (the key) and, when it
 * customised something, `settings.color_overrides` (semantic key → colour).
 * Overrides live apart from the scheme so a global change still reaches
 * every value the section did not touch.
 *
 * This package must not reach into the application, so the defaults are
 * here and the application imports them from here.
 */

export const SCHEME_COLOR_KEYS = [
  "background",
  "background_secondary",
  "text",
  "text_muted",
  "heading",
  "accent",
  "link",
  "border",
  "primary_button_background",
  "primary_button_text",
  "primary_button_border",
  "secondary_button_background",
  "secondary_button_text",
  "secondary_button_border",
  "input_background",
  "input_text",
  "input_border",
  "primary_button_hover_background",
  "primary_button_hover_text",
  "secondary_button_hover_background",
  "secondary_button_hover_text",
] as const

export type SchemeColorKey = (typeof SCHEME_COLOR_KEYS)[number]

export interface ColorScheme extends Record<SchemeColorKey, string> {
  /** What the picker calls it. Renaming changes this, never the key. */
  name: string
  /** A CSS gradient laid over `background`, or "" for none. */
  gradient: string
}

export const SCHEME_COLOR_LABELS: Record<SchemeColorKey, string> = {
  background: "Background",
  background_secondary: "Secondary background",
  text: "Text",
  text_muted: "Muted text",
  heading: "Heading",
  accent: "Accent",
  link: "Link",
  border: "Border",
  primary_button_background: "Primary button",
  primary_button_text: "Primary button text",
  primary_button_border: "Primary button border",
  secondary_button_background: "Secondary button",
  secondary_button_text: "Secondary button text",
  secondary_button_border: "Secondary button border",
  input_background: "Input",
  input_text: "Input text",
  input_border: "Input border",
  primary_button_hover_background: "Primary button on hover",
  primary_button_hover_text: "Primary button text on hover",
  secondary_button_hover_background: "Secondary button on hover",
  secondary_button_hover_text: "Secondary button text on hover",
}

/** How the scheme editor groups the twenty-one. */
export const SCHEME_COLOR_GROUPS: { label: string; keys: SchemeColorKey[] }[] = [
  { label: "Surface", keys: ["background", "background_secondary", "border"] },
  { label: "Text", keys: ["heading", "text", "text_muted", "link", "accent"] },
  { label: "Primary button", keys: ["primary_button_background", "primary_button_text", "primary_button_border", "primary_button_hover_background", "primary_button_hover_text"] },
  { label: "Secondary button", keys: ["secondary_button_background", "secondary_button_text", "secondary_button_border", "secondary_button_hover_background", "secondary_button_hover_text"] },
  { label: "Inputs", keys: ["input_background", "input_text", "input_border"] },
]

/**
 * What a section may override on its own. Not the twenty-one: a section
 * that needs its own input border colour is a section that needs its own
 * scheme. Buttons are offered as a pair in the panel and stored as two.
 */
export const SECTION_OVERRIDE_KEYS: SchemeColorKey[] = [
  "background",
  "text",
  "heading",
  "accent",
  "border",
  "primary_button_background",
  "primary_button_text",
  "secondary_button_background",
  "secondary_button_text",
  "primary_button_hover_background",
  "primary_button_hover_text",
  "secondary_button_hover_background",
  "secondary_button_hover_text",
]

/** The custom property each value is published as on the section's root. */
export const SCHEME_CSS_VARS: Record<SchemeColorKey, string> = {
  background: "--scheme-background",
  background_secondary: "--scheme-background-secondary",
  text: "--scheme-text",
  text_muted: "--scheme-text-muted",
  heading: "--scheme-heading",
  accent: "--scheme-accent",
  link: "--scheme-link",
  border: "--scheme-border",
  primary_button_background: "--scheme-button-primary",
  primary_button_text: "--scheme-button-primary-text",
  primary_button_border: "--scheme-button-primary-border",
  secondary_button_background: "--scheme-button-secondary",
  secondary_button_text: "--scheme-button-secondary-text",
  secondary_button_border: "--scheme-button-secondary-border",
  input_background: "--scheme-input",
  input_text: "--scheme-input-text",
  input_border: "--scheme-input-border",
  primary_button_hover_background: "--scheme-button-primary-hover",
  primary_button_hover_text: "--scheme-button-primary-hover-text",
  secondary_button_hover_background: "--scheme-button-secondary-hover",
  secondary_button_hover_text: "--scheme-button-secondary-hover-text",
}

/**
 * ===========================================================================
 *  A BUTTON'S HOVER COLOURS, WHICH NOBODY HAD TO CHOOSE
 * ===========================================================================
 * There was no hover colour anywhere: a button went to 88% opacity whatever
 * it was, and "button hover colour" was a setting a creator looked for and
 * could not find. Now a scheme has four, and each is AUTOMATIC until
 * somebody sets it: worked out from the button's own colours, so a creator
 * who changes a button's colour gets a hover that belongs to it without
 * being asked, and one who sets a hover colour gets exactly that.
 *
 *   primary     its background a step darker (12% towards black), or for a
 *               button that is already near black a step lighter (14%
 *               towards white), so its text never loses contrast
 *   secondary   its background (the section's, when it is transparent)
 *               moved 8% towards its text: a tint, so an outline button
 *               answers without turning into a solid one
 *   text        the button's own text colour
 *
 * A hover key a saved scheme, or a section's overrides, does not set is
 * worked out again from what they do set, which is what keeps "automatic"
 * automatic: see normalizeScheme, resolveSectionColors, stripSchemeDefaults.
 */
export const HOVER_KEYS = [
  "primary_button_hover_background",
  "primary_button_hover_text",
  "secondary_button_hover_background",
  "secondary_button_hover_text",
] as const satisfies readonly SchemeColorKey[]
export type HoverKey = (typeof HOVER_KEYS)[number]

/** Which colours each hover colour is worked out from. */
export const HOVER_SOURCES: Record<HoverKey, SchemeColorKey[]> = {
  primary_button_hover_background: ["primary_button_background", "primary_button_text"],
  primary_button_hover_text: ["primary_button_text"],
  secondary_button_hover_background: ["secondary_button_background", "secondary_button_text", "background"],
  secondary_button_hover_text: ["secondary_button_text"],
}

function hex6(v: string): [number, number, number] | null {
  const t = v.trim().toLowerCase()
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t)
  if (m3) return [parseInt(m3[1] + m3[1], 16), parseInt(m3[2] + m3[2], 16), parseInt(m3[3] + m3[3], 16)]
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/.exec(t)
  return m6 ? [parseInt(m6[1], 16), parseInt(m6[2], 16), parseInt(m6[3], 16)] : null
}

/** `from` moved `amount` of the way towards `to`, as #rrggbb; `from` itself when either is not a hex colour. */
export function mixColor(from: string, to: string, amount: number): string {
  const a = hex6(from)
  const b = hex6(to)
  if (!a || !b) return from
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * amount))
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`
}

function opaque(v: string): boolean {
  const t = v.trim().toLowerCase()
  return t !== "" && t !== "transparent" && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(t)
}

/** WCAG relative luminance of a hex colour; null when it is not one. */
function luminance(v: string): number | null {
  const c = hex6(v)
  if (!c) return null
  const [r, g, b] = c.map((x) => {
    const u = x / 255
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * A filled button's hover fill: a step darker, or for a button already near
 * black, a step lighter. Never towards its text by default, which is what
 * took a pink button with white text from readable to not (4.1 : 1).
 */
export function hoverFill(background: string): string {
  const l = luminance(background)
  if (l === null) return background
  return l < 0.04 ? mixColor(background, "#ffffff", 0.14) : mixColor(background, "#000000", 0.12)
}

/** The four hover colours a scheme gets when it does not choose them. */
export function automaticHover(s: Record<SchemeColorKey, string>): Record<HoverKey, string> {
  const secondaryBase = opaque(s.secondary_button_background) ? s.secondary_button_background : s.background
  return {
    primary_button_hover_background: hoverFill(s.primary_button_background),
    primary_button_hover_text: s.primary_button_text,
    secondary_button_hover_background: mixColor(secondaryBase, s.secondary_button_text, 0.08),
    secondary_button_hover_text: s.secondary_button_text,
  }
}

/** `--scheme-gradient` is the gradient when there is one, else the background. */
export const SCHEME_GRADIENT_VAR = "--scheme-gradient"

/**
 * The keys a section may be set to out of the box. They are keys, not
 * names: "white" was the first scheme's key before it had a name, and every
 * saved section says "white", so the key stays and the name is "Light".
 */
export const BUILT_IN_SCHEME_KEYS = ["white", "light", "dark", "black", "highlight"] as const
export type BuiltInSchemeKey = (typeof BUILT_IN_SCHEME_KEYS)[number]

function scheme(name: string, v: Omit<Record<SchemeColorKey, string>, HoverKey>, gradient = ""): ColorScheme {
  const full = v as Record<SchemeColorKey, string>
  return { name, gradient, ...full, ...automaticHover(full) }
}

/**
 * The palettes are the ones sections have always shipped on. Only the names
 * are new, so nothing already published changes colour.
 */
export const DEFAULT_COLOR_SCHEMES: Record<BuiltInSchemeKey, ColorScheme> = {
  white: scheme("Light", {
    background: "#ffffff", background_secondary: "#f8fafc", text: "#5c5b63", text_muted: "#76757d",
    heading: "#0f172a", accent: "#1f2937", link: "#0f172a", border: "#e2e8f0",
    primary_button_background: "#000000", primary_button_text: "#ffffff", primary_button_border: "#000000",
    secondary_button_background: "#ffffff", secondary_button_text: "#0f172a", secondary_button_border: "#0f172a",
    input_background: "#ffffff", input_text: "#0f172a", input_border: "#e2e8f0",
  }),
  light: scheme("Soft", {
    background: "#f8fafc", background_secondary: "#ffffff", text: "#475569", text_muted: "#697483",
    heading: "#0f172a", accent: "#1f2937", link: "#0f172a", border: "#e2e8f0",
    primary_button_background: "#0f172a", primary_button_text: "#ffffff", primary_button_border: "#0f172a",
    secondary_button_background: "#ffffff", secondary_button_text: "#0f172a", secondary_button_border: "#0f172a",
    input_background: "#ffffff", input_text: "#0f172a", input_border: "#e2e8f0",
  }),
  dark: scheme("Dark", {
    background: "#1f2937", background_secondary: "#111827", text: "#cbd5e1", text_muted: "#94a3b8",
    heading: "#ffffff", accent: "#e5e7eb", link: "#f8fafc", border: "#374151",
    primary_button_background: "#ffffff", primary_button_text: "#0f172a", primary_button_border: "#ffffff",
    secondary_button_background: "transparent", secondary_button_text: "#ffffff", secondary_button_border: "#ffffff",
    input_background: "#111827", input_text: "#f8fafc", input_border: "#374151",
  }),
  black: scheme("Brand", {
    background: "#000000", background_secondary: "#111111", text: "#cbd5e1", text_muted: "#9ca3af",
    heading: "#ffffff", accent: "#e5e7eb", link: "#ffffff", border: "#1f2937",
    primary_button_background: "#ffffff", primary_button_text: "#000000", primary_button_border: "#ffffff",
    secondary_button_background: "transparent", secondary_button_text: "#ffffff", secondary_button_border: "#ffffff",
    input_background: "#111111", input_text: "#ffffff", input_border: "#1f2937",
  }),
  highlight: scheme("Accent", {
    background: "#fde2e4", background_secondary: "#fff1f2", text: "#475569", text_muted: "#626976",
    heading: "#1f2937", accent: "#0f172a", link: "#1f2937", border: "#fbcfd1",
    primary_button_background: "#1f2937", primary_button_text: "#fde2e4", primary_button_border: "#1f2937",
    secondary_button_background: "transparent", secondary_button_text: "#1f2937", secondary_button_border: "#1f2937",
    input_background: "#ffffff", input_text: "#1f2937", input_border: "#fbcfd1",
  }),
}

/** The key a section gets when it names no scheme, or names one that is gone. */
export const FALLBACK_SCHEME_KEY: BuiltInSchemeKey = "white"

/**
 * The old eighty-slot names, each pointing at the semantic value it meant.
 * Reading: a saved scheme in the old shape fills the semantic values from
 * these. Writing: `legacySchemeValues()` produces every one of them from the
 * semantic values, so a renderer written against `c.plan_heading` still gets
 * a colour, and it is the scheme's heading colour, as it always was.
 */
export const LEGACY_TO_SEMANTIC: Record<string, SchemeColorKey> = {
  bg: "background",
  text: "text",
  paragraph: "text",
  heading: "heading",
  accent: "accent",
  link: "link",
  link_underline: "link",
  border: "border",
  borders: "border",
  inset_border: "border",
  primary_btn_bg: "primary_button_background",
  primary_btn_text: "primary_button_text",
  primary_btn_border: "primary_button_border",
  primary_btn_hover_bg: "primary_button_hover_background",
  primary_btn_hover_text: "primary_button_hover_text",
  primary_btn_hover_border: "primary_button_hover_background",
  secondary_btn_bg: "secondary_button_background",
  secondary_btn_text: "secondary_button_text",
  secondary_btn_border: "secondary_button_border",
  secondary_btn_hover_bg: "secondary_button_hover_background",
  secondary_btn_hover_text: "secondary_button_hover_text",
  secondary_btn_hover_border: "secondary_button_border",
  store_title: "heading",
  nav_link: "text",
  footer_link: "link",
  footer_link_underline: "link",
  plan_bg: "background",
  plan_border: "border",
  plan_heading: "heading",
  plan_paragraph: "text",
  plan_link: "link",
  plan_link_underline: "link",
  login_form_bg: "input_background",
  login_form_border: "input_border",
  slideshow_controls: "text",
  slideshow_controls_bg: "background",
  announcement_bg: "heading",
  announcement_text: "background",
  collage_title: "heading",
  collage_subtitle: "text",
  collage_bg: "background",
  collage_link: "link",
  collage_link_underline: "link",
  header_dropdown_bg: "background",
  header_dropdown_link: "text",
  cart_notification_bg: "heading",
  cart_notification_text: "background",
  pagination_bg: "background",
  pagination_text: "text",
  pagination_active_bg: "heading",
  pagination_active_text: "background",
  curriculum_bg: "background",
  curriculum_list_title: "heading",
  curriculum_lesson_title: "text",
  curriculum_icon: "text",
  desc_tab_bg: "background",
  desc_tab_text: "text",
  desc_tab_border: "border",
  slider_controls: "text",
  slider_controls_bg: "background",
  image_overlay_text: "primary_button_text",
  video_play_icon: "primary_button_text",
}

/**
 * Legacy slots that were never a scheme colour, only a fixed default that
 * lived in the scheme for want of a better place. They keep those defaults.
 */
export const LEGACY_FIXED: Record<string, string> = {
  on_sale: "#ef4444",
  image_overlay_bg: "rgba(0,0,0,0.4)",
  curriculum_free_badge: "#10b981",
  review_star: "#f59e0b",
  review_verified: "#10b981",
  review_recommended: "#6366f1",
  video_play_bg: "rgba(0,0,0,0.6)",
  sale_badge_bg: "#ef4444",
  sale_badge_text: "#ffffff",
  sale_badge_border: "#ef4444",
  oos_badge_bg: "#9ca3af",
  oos_badge_text: "#ffffff",
  oos_badge_border: "#9ca3af",
  sale_time_bg: "#fef3c7",
  sale_time_text: "#92400e",
  sale_time_border: "#fde68a",
  inventory_low_text: "#ef4444",
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function isColor(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== ""
}

/**
 * ===========================================================================
 *  A STRING THAT IS NOT A GRADIENT IS NOT A GRADIENT
 * ===========================================================================
 * Every colour in a scheme goes through `isColor`, and one that does not
 * look like a colour is dropped so the base's value stands. The gradient had
 * no such gate: any string at all became `scheme.gradient`, and the scheme's
 * background is `gradient || background`.
 *
 * A browser handed a background it cannot parse does not fall back to the
 * colour — it drops the declaration entirely and paints nothing. So a
 * gradient that was half-typed, truncated by an import, or written by hand
 * with one comma wrong turns the swatch, the scheme picker's trigger and
 * every row of its list into a plain white box, with the scheme's own
 * heading colour still on the text. On a dark scheme that is white on white:
 * the empty white box the scheme selector "randomly" became.
 *
 * The shape, not a full CSS parse: one of the three gradient functions, with
 * balanced brackets, nothing outside them, and no `url(` — which would make
 * a scheme a way to fetch something from wherever the page is rendered.
 */
const GRADIENT_FN = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i

export function isGradient(v: unknown): v is string {
  if (typeof v !== "string") return false
  const t = v.trim()
  if (t.length < 16 || t.length > 2000) return false
  if (!GRADIENT_FN.test(t) || !t.endsWith(")")) return false
  if (/url\s*\(|expression\s*\(|[;{}<>]/i.test(t)) return false
  let depth = 0
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++
    else if (t[i] === ")") {
      depth--
      if (depth < 0) return false
      // Closed before the end means there is something after it, which a
      // gradient this control wrote never has.
      if (depth === 0 && i !== t.length - 1) return false
    }
  }
  return depth === 0
}

/** Trimmed, and a hex colour lowercased, so equal colours compare equal. */
function color(v: string): string {
  const t = v.trim()
  return /^#[0-9a-f]{3,8}$/i.test(t) ? t.toLowerCase() : t
}

/**
 * A saved scheme, whatever shape it was saved in, as a complete scheme.
 * Semantic keys win; a legacy slot fills a semantic value it names when the
 * semantic key is absent; `base` fills the rest.
 */
export function normalizeScheme(raw: unknown, base: ColorScheme): ColorScheme {
  const out: ColorScheme = { ...base }
  if (!isPlain(raw)) return out
  if (typeof raw.name === "string" && raw.name.trim()) out.name = raw.name.trim()
  /* An empty string is a scheme saying it has no gradient, and clears the
     base's. Anything else has to be one. */
  if (typeof raw.gradient === "string" && raw.gradient.trim() === "") out.gradient = ""
  else if (isGradient(raw.gradient)) out.gradient = raw.gradient.trim()
  const filled = new Set<SchemeColorKey>()
  for (const key of SCHEME_COLOR_KEYS) {
    const v = raw[key]
    if (isColor(v)) { out[key] = color(v); filled.add(key) }
  }
  // Legacy slots, first come: `bg` names `background`; `text` is already a
  // semantic key and was taken above; `paragraph` fills `text` when the old
  // scheme had no `text` of its own.
  for (const slot of Object.keys(LEGACY_TO_SEMANTIC)) {
    const key = LEGACY_TO_SEMANTIC[slot]
    if (filled.has(key)) continue
    const v = raw[slot]
    if (isColor(v)) { out[key] = color(v); filled.add(key) }
  }
  /* A hover colour the scheme does not set is its own, worked out from the
     colours it does set: not the base scheme's, which belongs to a button
     of a different colour. */
  const auto = automaticHover(out)
  for (const key of HOVER_KEYS) if (!filled.has(key)) out[key] = auto[key]
  return out
}

/** A scheme somebody added, before they touched any of its colours. */
export function newSchemeFrom(base: ColorScheme, name: string): ColorScheme {
  return { ...base, name, gradient: base.gradient }
}

/**
 * Every scheme the theme has, complete, keyed. Built-ins first in their
 * fixed order, then anything the creator added, in the order it was saved.
 */
export function themeColorSchemes(theme: Record<string, unknown> | undefined | null): Record<string, ColorScheme> {
  const own = theme && isPlain(theme.color_schemes) ? theme.color_schemes : {}
  const out: Record<string, ColorScheme> = {}
  for (const key of BUILT_IN_SCHEME_KEYS) out[key] = normalizeScheme(own[key], DEFAULT_COLOR_SCHEMES[key])
  for (const [key, raw] of Object.entries(own)) {
    if (out[key] || !isPlain(raw) || !/^[a-z0-9_-]+$/i.test(key)) continue
    out[key] = normalizeScheme(raw, DEFAULT_COLOR_SCHEMES[FALLBACK_SCHEME_KEY])
  }
  return out
}

export function isBuiltInScheme(key: string): key is BuiltInSchemeKey {
  return (BUILT_IN_SCHEME_KEYS as readonly string[]).includes(key)
}

/** The scheme a section gets when it does not say. The theme may choose. */
export function defaultSchemeKey(theme: Record<string, unknown> | undefined | null, schemes?: Record<string, ColorScheme>): string {
  const all = schemes ?? themeColorSchemes(theme)
  const wanted = theme && typeof theme.default_color_scheme === "string" ? theme.default_color_scheme : ""
  return wanted && all[wanted] ? wanted : FALLBACK_SCHEME_KEY
}

/**
 * A deleted scheme names its replacement in `theme.color_scheme_remaps`, so
 * a section on a page that was not open when the scheme was deleted still
 * lands on the scheme the creator chose rather than on the default. A
 * remap that points at another deleted scheme follows the chain, and a
 * loop or a dead end falls back to the theme's default.
 */
export function remappedSchemeKey(theme: Record<string, unknown> | undefined | null, from: string, schemes?: Record<string, ColorScheme>): string {
  const all = schemes ?? themeColorSchemes(theme)
  const remaps = theme && isPlain(theme.color_scheme_remaps) ? theme.color_scheme_remaps : {}
  let key = from
  for (let hops = 0; hops < 8 && key; hops++) {
    const next = remaps[key]
    if (typeof next !== "string" || !next) break
    key = next
    if (all[key]) return key
  }
  return defaultSchemeKey(theme, all)
}

/** A section's `color_overrides`, only the keys it may override, only colours. */
export function sectionOverrides(settings: Record<string, unknown> | undefined | null): Partial<Record<SchemeColorKey, string>> {
  const raw = settings && isPlain(settings.color_overrides) ? settings.color_overrides : {}
  const out: Partial<Record<SchemeColorKey, string>> = {}
  for (const key of SECTION_OVERRIDE_KEYS) if (isColor(raw[key])) out[key] = color(raw[key] as string)
  return out
}

export interface ResolvedSectionColors {
  /** The scheme key the section resolved to (after fallback). */
  key: string
  /** The scheme as the theme defines it. */
  base: ColorScheme
  /** The section's own overrides, only those set. */
  overrides: Partial<Record<SchemeColorKey, string>>
  /** The scheme with the overrides applied: what the section paints. */
  scheme: ColorScheme
  /** `--scheme-*` on the section root. */
  vars: Record<string, string>
  /** The eighty legacy slot names, derived from `scheme`. */
  legacy: Record<string, string>
}

/**
 * THE RESOLVER. The one order, for both renderer families:
 *   theme default scheme → section's chosen scheme → section's overrides.
 * A section naming a scheme the theme no longer has falls back to the
 * theme's default rather than to nothing, which is what makes deleting a
 * scheme safe.
 */
export function resolveSectionColors(
  theme: Record<string, unknown> | undefined | null,
  settings: Record<string, unknown> | undefined | null,
): ResolvedSectionColors {
  const schemes = themeColorSchemes(theme)
  const wanted = settings && typeof settings.color_scheme === "string" ? settings.color_scheme : ""
  const key = wanted && schemes[wanted] ? wanted : remappedSchemeKey(theme, wanted, schemes)
  const base = schemes[key]
  const overrides = sectionOverrides(settings)
  const scheme: ColorScheme = { ...base, ...overrides }
  /* A section that changes its button's colour and not its hover gets the
     hover of the button it now has, not of the scheme's. */
  const auto = automaticHover(scheme)
  for (const key of HOVER_KEYS) {
    if (overrides[key] !== undefined) continue
    if (HOVER_SOURCES[key].some((src) => overrides[src] !== undefined)) scheme[key] = auto[key]
  }
  // An overridden background is a solid colour; the scheme's gradient was
  // designed for the scheme's background, not for this one.
  if (overrides.background !== undefined) scheme.gradient = ""
  return { key, base, overrides, scheme, vars: schemeVars(scheme), legacy: legacySchemeValues(scheme) }
}

export function schemeVars(s: ColorScheme): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of SCHEME_COLOR_KEYS) out[SCHEME_CSS_VARS[key]] = s[key]
  out[SCHEME_GRADIENT_VAR] = s.gradient || s.background
  return out
}

/** The eighty names the React renderers and older templates read. */
export function legacySchemeValues(s: ColorScheme): Record<string, string> {
  const out: Record<string, string> = { ...LEGACY_FIXED }
  for (const [slot, key] of Object.entries(LEGACY_TO_SEMANTIC)) out[slot] = s[key]
  /**
   * `bg` is what a section paints its root with. When the scheme has a
   * gradient, that is the gradient: a `background:` shorthand shows it, a
   * `background-color:` cannot and is ignored, and the section root's own
   * `--scheme-gradient` paints beneath it either way.
   */
  if (s.gradient) out.bg = s.gradient
  return out
}

/** `--scheme-background:#fff;...` for a style attribute. */
export function styleAttr(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${String(v).replace(/[;{}<>"]/g, "")}`)
    .join(";")
}

/**
 * Deleting a scheme: every section on it moves to `to`. Overrides stay,
 * because they were the section's own. Pure; the caller saves.
 */
export function remapScheme<T extends { settings: Record<string, unknown> }>(sections: T[], from: string, to: string): T[] {
  return sections.map((s) =>
    s.settings.color_scheme === from ? { ...s, settings: { ...s.settings, color_scheme: to } } : s,
  )
}

/** The stored form of a scheme: only what differs from its base. */
export function stripSchemeDefaults(s: ColorScheme, base: ColorScheme): Record<string, string> {
  const out: Record<string, string> = {}
  if (s.name !== base.name) out.name = s.name
  if (s.gradient !== base.gradient) out.gradient = s.gradient
  /* A hover colour is stored only when it is not what it would be worked out
     to, so one nobody chose stays automatic when the button changes. */
  const auto = automaticHover(s)
  for (const key of SCHEME_COLOR_KEYS) {
    if ((HOVER_KEYS as readonly string[]).includes(key)) {
      if (s[key] !== auto[key as HoverKey]) out[key] = s[key]
    } else if (s[key] !== base[key]) out[key] = s[key]
  }
  return out
}

/**
 * ===========================================================================
 *  A SECTION'S OWN COLOUR, FOLLOWING THE SCHEME UNTIL SOMEBODY PICKS ONE
 * ===========================================================================
 * A section may declare colours of its own beside its scheme: the stars on a
 * review, the dot on a timeline, the scrim over a photo. A creator sets them
 * in the section's sidebar, and they win over the scheme for that section
 * alone, which is what "a colour just for this section" means.
 *
 * Their default may NAME a scheme colour instead of holding one:
 *
 *     { "type": "color", "id": "star_color", "label": "Stars", "default": "scheme.accent" }
 *
 * Until the creator picks a colour, `settings.star_color` is the section's
 * accent, and it changes when the scheme or the theme does. Picking one
 * stores the hex; clearing it goes back to following the scheme. Any name
 * `scheme` has works: the semantic names in SCHEME_COLOR_KEYS and the older
 * ones in LEGACY_TO_SEMANTIC (`scheme.bg`, `scheme.primary_btn_bg`).
 */
export const SCHEME_TOKEN = /^scheme\.([a-z][a-z0-9_]{1,40})$/

/** Every name a `scheme.<name>` default may use. */
export function isSchemeColorName(name: string): boolean {
  return (SCHEME_COLOR_KEYS as readonly string[]).includes(name) || name in LEGACY_TO_SEMANTIC || name in LEGACY_FIXED
}

/** The scheme colour a value names, or null when it is not `scheme.<name>`. */
export function schemeTokenName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const m = value.trim().match(SCHEME_TOKEN)
  return m && isSchemeColorName(m[1]) ? m[1] : null
}

/** A colour setting's value with a `scheme.<name>` replaced by that colour of `scheme`. */
export function followScheme(value: unknown, scheme: Record<string, string>): unknown {
  const name = schemeTokenName(value)
  if (name === null) return typeof value === "string" && SCHEME_TOKEN.test(value.trim()) ? "" : value
  return scheme[name] ?? ""
}

/**
 * ===========================================================================
 *  A WEBSITE'S DESIGN TOKENS ARE ITS THEME SETTINGS
 * ===========================================================================
 * The agent sets a website's look as `DesignTokens` (lib/ai-builder/types.ts).
 * They are not stored as tokens: `tokensToThemeSettings` writes them into
 * the Theme settings the editor already has (colour schemes, fonts, text
 * styles, radii, spacing, page width, motion), so a person changes them in
 * Theme settings like any other site, and a component that reads
 * `var(--scheme-*)`, `var(--theme-*)` or `var(--t-*)` follows the change.
 *
 * What has no Theme setting (a section's vertical rhythm, a named value the
 * agent invented) goes to `custom_tokens`, a namespaced setting, and comes
 * out as `--t-<name>` beside the theme's own properties (`tokenVars`, spread
 * into themeVars in lib/website-builder/theme-css.ts). Those are edited in
 * Theme settings › Design tokens (components/website-builder/editor/
 * design-tokens-panel.tsx).
 *
 * `--t-*` is also where the shared scale lives under one name for
 * components: `--t-radius-sm|md|lg`, `--t-shadow-sm|md|lg` and `--t-shadow`,
 * `--t-section-y`, `--t-gutter`, `--t-page-width`. Each is read from the
 * Theme setting it stands for, never stored twice, so moving Layout › Card
 * corner radius moves `--t-radius-md` and every component reading it.
 *
 * A component's own setting wins over a token by the cascade: a template
 * writes `--x: {{ settings.accent | default: 'var(--t-accent)' }}`, so an
 * empty setting follows the site and a set one is that component's own.
 *
 * Pure, no React, safe in the published page's bundle.
 */
import { ANIMATION_STYLES, CUSTOM_TOKEN_PREFIX, CUSTOM_TOKENS_SETTING, SHADOW_LEVELS, type DesignTokens, type ShadowLevel } from "./types"

/* ── custom tokens: names and values that are safe to print ───────────── */

/** A token name: lowercase, digits and hyphens, a letter first, at most 40. */
export const TOKEN_NAME = /^[a-z][a-z0-9-]{0,39}$/
/** How many custom tokens a site keeps. */
export const MAX_CUSTOM_TOKENS = 60
const MAX_VALUE = 200

/**
 * A custom token's value, if it is one that can be printed into a style
 * attribute and a stylesheet without leaving it: no url(), no expression(),
 * no braces, semicolons, angle brackets, quotes, backslashes or comments, and
 * no @import. A colour, a length, a calc(), a font stack in single words, a
 * cubic-bezier: yes.
 */
export function cleanTokenValue(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  if (typeof v !== "string") return null
  const t = v.trim()
  if (!t || t.length > MAX_VALUE) return null
  if (/url\s*\(|expression\s*\(|@import|javascript:|[;{}<>"'\\`]|\/\*|\*\//i.test(t)) return null
  let depth = 0
  for (const ch of t) {
    if (ch === "(") depth++
    else if (ch === ")" && --depth < 0) return null
  }
  return depth === 0 ? t : null
}

/** The stored custom tokens, cleaned: only names and values that pass, at most MAX_CUSTOM_TOKENS. */
export function customTokens(theme: Record<string, unknown> | null | undefined): Record<string, string> {
  const raw = theme?.[CUSTOM_TOKENS_SETTING]
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_CUSTOM_TOKENS) break
    if (!TOKEN_NAME.test(name)) continue
    const v = cleanTokenValue(value)
    if (v !== null) out[name] = v
  }
  return out
}

/* ── the theme settings each token stands for ─────────────────────────── */

const SHADOW_CSS: Record<Exclude<ShadowLevel, "none">, string> = {
  sm: "0 1px 3px rgba(15, 23, 42, 0.10)",
  md: "0 4px 14px -4px rgba(15, 23, 42, 0.16)",
  lg: "0 12px 32px -12px rgba(15, 23, 42, 0.28)",
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback)

/**
 * The `--t-*` properties a site has: the shared scale read from its Theme
 * settings, then its custom tokens (which may not shadow the scale's names).
 * Only for a site whose tokens were set (it has `custom_tokens`, even an
 * empty map, or the section rhythm): every other site's page is exactly
 * what it was. A component still writes a fallback, `var(--t-radius-md, 8px)`.
 */
export function tokenVars(theme: Record<string, unknown> | null | undefined): Record<string, string> {
  const t = theme ?? {}
  if (!hasTokens(t)) return {}
  const out: Record<string, string> = {
    [`${CUSTOM_TOKEN_PREFIX}radius-sm`]: `${num(t.input_radius, 8)}px`,
    [`${CUSTOM_TOKEN_PREFIX}radius-md`]: `${num(t.border_radius, 8)}px`,
    [`${CUSTOM_TOKEN_PREFIX}radius-lg`]: `${num(t.popup_radius, 12)}px`,
    [`${CUSTOM_TOKEN_PREFIX}shadow-sm`]: SHADOW_CSS.sm,
    [`${CUSTOM_TOKEN_PREFIX}shadow-md`]: SHADOW_CSS.md,
    [`${CUSTOM_TOKEN_PREFIX}shadow-lg`]: SHADOW_CSS.lg,
    [`${CUSTOM_TOKEN_PREFIX}shadow-none`]: "none",
    [`${CUSTOM_TOKEN_PREFIX}shadow`]: SHADOW_CSS[t.card_shadow as Exclude<ShadowLevel, "none">] ?? "none",
    [`${CUSTOM_TOKEN_PREFIX}gutter`]: `${num(t.content_padding_x, 24)}px`,
    [`${CUSTOM_TOKEN_PREFIX}page-width`]: `${num(t.page_width, 1280)}px`,
    [`${CUSTOM_TOKEN_PREFIX}section-y`]: `calc(${num(t.ai_section_y, 96)}px * ${num(t.spacing_scale, 1)})`,
  }
  for (const [name, value] of Object.entries(customTokens(t))) {
    const key = `${CUSTOM_TOKEN_PREFIX}${name}`
    if (!(key in out)) out[key] = value
  }
  return out
}

/** Whether a site's tokens were ever set: the one switch for emitting `--t-*`. */
export function hasTokens(theme: Record<string, unknown> | null | undefined): boolean {
  return !!theme && (CUSTOM_TOKENS_SETTING in theme || "ai_section_y" in theme)
}

/** The scale's own names, which a custom token may not take. */
export const SCALE_TOKENS = ["radius-sm", "radius-md", "radius-lg", "shadow-sm", "shadow-md", "shadow-lg", "shadow-none", "shadow", "gutter", "page-width", "section-y"] as const

/* ── tokens to theme settings, and back ───────────────────────────────── */

const SUBTLE_STYLE = "fade-up"
const EXPRESSIVE_STYLE = "rise"

/** A heading step `n` up the scale from body, rounded to a whole pixel. */
function step(base: number, ratio: number, n: number): number {
  return Math.round(base * Math.pow(ratio, n))
}

/** The phone size of a desktop size: headings shrink, body text does not. */
function phone(px: number, heading: boolean): number {
  return heading ? Math.max(16, Math.round(px * (px > 40 ? 0.68 : 0.82))) : px
}

/**
 * The Theme settings a set of tokens is. Only keys the tokens decide are
 * returned, to be laid over the site's settings (`{ ...settings, ...this }`),
 * except `custom_tokens`, which is the whole new map.
 */
export function tokensToThemeSettings(tokens: DesignTokens, current?: Record<string, unknown> | null): Record<string, unknown> {
  const c = tokens.colors
  const scheme = (name: string, bg: string, text: string, heading: string, muted: string, accent: string, accentText: string, border: string) => ({
    name,
    background: bg,
    background_secondary: c.surface,
    text,
    text_muted: muted,
    heading,
    accent,
    link: accent,
    border,
    primary_button_background: accent,
    primary_button_text: accentText,
    primary_button_border: accent,
    secondary_button_background: "transparent",
    secondary_button_text: heading,
    secondary_button_border: heading,
    input_background: bg,
    input_text: heading,
    input_border: border,
  })
  const schemes: Record<string, unknown> = {
    ...((current?.color_schemes as Record<string, unknown> | undefined) ?? {}),
    white: scheme("Main", c.background, c.text, c.text, c.muted, c.accent, c.accentText, c.border),
    light: { ...scheme("Surface", c.surface, c.text, c.text, c.muted, c.accent, c.accentText, c.border), background_secondary: c.background },
    highlight: scheme("Accent", c.accent, c.accentText, c.accentText, c.accentText, c.accentText, c.accent, c.accentText),
  }
  if (c.inverse) schemes.black = scheme("Inverse", c.inverse.background, c.inverse.text, c.inverse.text, c.inverse.text, c.inverse.accent, c.inverse.background, c.inverse.text)

  const out: Record<string, unknown> = {
    color_schemes: schemes,
    default_color_scheme: "white",
    background_color: c.background,
    text_color: c.text,
    primary_color: c.accent,
    font_heading: tokens.fonts.heading,
    font_body: tokens.fonts.body,
    font_accent: tokens.fonts.accent ?? "",
    input_radius: tokens.radius.small,
    button_border_radius: tokens.radius.small,
    border_radius: tokens.radius.medium,
    image_border_radius: tokens.radius.medium,
    popup_radius: tokens.radius.large,
    spacing_scale: Math.min(2, Math.max(0.5, tokens.spacing.scale)),
    page_width: Math.min(1800, Math.max(900, tokens.spacing.pageWidth)),
    content_padding_x: Math.min(80, Math.max(8, tokens.spacing.gutter)),
    ai_section_y: Math.min(240, Math.max(0, tokens.spacing.sectionY)),
    animations_enabled: tokens.motion.level !== "none",
    animation_style: tokens.motion.style ?? (tokens.motion.level === "expressive" ? EXPRESSIVE_STYLE : SUBTLE_STYLE),
    animation_duration: Math.min(1200, Math.max(200, tokens.motion.durationMs ?? (tokens.motion.level === "expressive" ? 800 : 500))),
  }
  if (tokens.shadow) out.card_shadow = tokens.shadow
  if (tokens.typeScale) {
    const base = Math.min(22, Math.max(12, tokens.typeScale.base))
    const ratio = Math.min(1.6, Math.max(1.05, tokens.typeScale.ratio))
    const sized = (desktop: number, heading: boolean) => ({ size: { desktop, mobile: phone(desktop, heading) } })
    const own = (current?.typography_styles as Record<string, unknown> | undefined) ?? {}
    const merge = (key: string, v: { size: { desktop: number; mobile: number } }) => ({ ...((own[key] as Record<string, unknown> | undefined) ?? {}), ...v })
    out.typography_styles = {
      ...own,
      h1: merge("h1", sized(step(base, ratio, 5), true)),
      h2: merge("h2", sized(step(base, ratio, 4), true)),
      h3: merge("h3", sized(step(base, ratio, 2), true)),
      h4: merge("h4", sized(step(base, ratio, 1), true)),
      body_large: merge("body_large", sized(Math.round(base * 1.125), false)),
      body: merge("body", sized(base, false)),
      body_small: merge("body_small", sized(Math.max(12, Math.round(base * 0.875)), false)),
    }
  }
  const custom: Record<string, string> = { ...customTokens(current) }
  for (const [name, value] of Object.entries(tokens.custom ?? {})) {
    const clean = cleanTokenValue(value)
    if (TOKEN_NAME.test(name) && clean !== null && !(SCALE_TOKENS as readonly string[]).includes(name)) custom[name] = clean
  }
  out[CUSTOM_TOKENS_SETTING] = custom
  return out
}

const str = (v: unknown, fallback: string) => (typeof v === "string" && v !== "" ? v : fallback)
const scheme = (t: Record<string, unknown>, key: string) => {
  const all = t.color_schemes && typeof t.color_schemes === "object" ? (t.color_schemes as Record<string, Record<string, unknown>>) : {}
  return all[key] ?? {}
}

/** The tokens a site's Theme settings are, for the token panel and for the agent reading the site back. */
export function themeSettingsToTokens(theme: Record<string, unknown> | null | undefined): DesignTokens {
  const t = theme ?? {}
  const main = scheme(t, "white")
  const surface = scheme(t, "light")
  const inverse = scheme(t, "black")
  const style = str(t.animation_style, SUBTLE_STYLE)
  const typo = t.typography_styles && typeof t.typography_styles === "object" ? (t.typography_styles as Record<string, { size?: { desktop?: number } }>) : {}
  const body = typo.body?.size?.desktop
  const h4 = typo.h4?.size?.desktop
  return {
    colors: {
      background: str(main.background, str(t.background_color, "#ffffff")),
      surface: str(surface.background, str(main.background_secondary, "#f8fafc")),
      text: str(main.text, str(t.text_color, "#0f172a")),
      muted: str(main.text_muted, "#64748b"),
      accent: str(main.accent, str(t.primary_color, "#1f2937")),
      accentText: str(main.primary_button_text, "#ffffff"),
      border: str(main.border, "#e2e8f0"),
      ...(inverse.name === "Inverse" ? { inverse: { background: str(inverse.background, "#000000"), text: str(inverse.text, "#ffffff"), accent: str(inverse.accent, "#ffffff") } } : {}),
    },
    fonts: { heading: str(t.font_heading, "Inter"), body: str(t.font_body, "Inter"), ...(str(t.font_accent, "") ? { accent: str(t.font_accent, "") } : {}) },
    ...(typeof body === "number" && typeof h4 === "number" && body > 0 ? { typeScale: { base: body, ratio: Math.round((h4 / body) * 100) / 100 } } : {}),
    ...((SHADOW_LEVELS as readonly string[]).includes(String(t.card_shadow)) ? { shadow: t.card_shadow as ShadowLevel } : {}),
    radius: { small: num(t.input_radius, 8), medium: num(t.border_radius, 8), large: num(t.popup_radius, 12) },
    spacing: { scale: num(t.spacing_scale, 1), sectionY: num(t.ai_section_y, 96), pageWidth: num(t.page_width, 1280), gutter: num(t.content_padding_x, 24) },
    motion: {
      level: t.animations_enabled ? (style === EXPRESSIVE_STYLE ? "expressive" : "subtle") : "none",
      ...((ANIMATION_STYLES as readonly string[]).includes(style) ? { style: style as DesignTokens["motion"]["style"] } : {}),
      durationMs: num(t.animation_duration, 600),
    },
    custom: customTokens(t),
  }
}

/* ── which components read which tokens ───────────────────────────────── */

/** `var(--t-name)` read by each file, for the panel's "used by". */
export function tokenUsage(sources: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [path, text] of Object.entries(sources)) {
    const seen = new Set<string>()
    for (const m of text.matchAll(/var\(\s*--t-([a-z][a-z0-9-]{0,39})/g)) seen.add(m[1])
    for (const name of seen) (out[name] ??= []).push(path)
  }
  return out
}

/* ── one group of tokens changed, as the settings it writes ───────────── */

export type TokenGroup = "colors" | "fonts" | "typeScale" | "radius" | "spacing" | "shadow" | "motion" | "custom"

/** The Theme settings each group writes, and only those: changing a colour never rewrites a radius somebody set in Layout. */
export const TOKEN_GROUP_SETTINGS: Record<TokenGroup, readonly string[]> = {
  colors: ["color_schemes", "default_color_scheme", "background_color", "text_color", "primary_color"],
  fonts: ["font_heading", "font_body", "font_accent"],
  typeScale: ["typography_styles"],
  radius: ["input_radius", "button_border_radius", "border_radius", "image_border_radius", "popup_radius"],
  spacing: ["spacing_scale", "page_width", "content_padding_x", "ai_section_y"],
  shadow: ["card_shadow"],
  motion: ["animations_enabled", "animation_style", "animation_duration"],
  custom: [CUSTOM_TOKENS_SETTING],
}

/**
 * The settings to write when one group of tokens changed: that group's keys
 * from tokensToThemeSettings, and only the ones whose value differs. A
 * custom token removed is removed (the custom map is written whole).
 */
export function tokenPatch(group: TokenGroup, next: DesignTokens, current: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const all = tokensToThemeSettings(group === "custom" ? next : { ...next, custom: {} }, group === "custom" ? { ...(current ?? {}), [CUSTOM_TOKENS_SETTING]: {} } : current)
  const out: Record<string, unknown> = {}
  for (const key of TOKEN_GROUP_SETTINGS[group]) {
    if (!(key in all)) continue
    if (JSON.stringify(all[key]) !== JSON.stringify(current?.[key])) out[key] = all[key]
  }
  return out
}

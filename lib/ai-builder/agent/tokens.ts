/**
 * ===========================================================================
 *  DESIGN TOKENS INTO THEME SETTINGS (architecture D3)
 * ===========================================================================
 * Tokens are Theme settings, so a person changes them in Theme settings:
 *
 *   colors     two colour schemes of the site's own, `site` and
 *              `site_inverse`, made the default scheme; and the page colours
 *   fonts      font_heading, font_body, font_accent
 *   radius     card, button, picture and text box corners
 *   spacing    spacing_scale, page_width, content_padding_x
 *   motion     animations_enabled, animation_style, animation_duration
 *   the rest   custom_tokens (`--t-<name>`), checked: no url(), no
 *              expression, no markup
 *
 * TODO(L5 merge): L5 owns `tokensToThemeSettings` in lib/ai-builder/manifest.ts.
 * The loop takes the mapper as a dependency (AgentDeps.tokensToSettings) and
 * uses this one until that lands. Pure.
 */
import { automaticHover, type ColorScheme } from "@/lib/storelib-theme/color-schemes"
import { ANIMATION_STYLES, CUSTOM_TOKENS_SETTING, type DesignTokens, type ValidationIssue } from "../types"
import type { TokensMapper } from "./ports"

export const SITE_SCHEME = "site"
export const SITE_INVERSE_SCHEME = "site_inverse"

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const TOKEN_NAME = /^[a-z][a-z0-9-]{0,40}$/
/** A custom token value: a length, a number, a colour, a font stack, a duration, a cubic-bezier. Never url(), expression(), markup or a second declaration. */
const TOKEN_VALUE = /^[#a-z0-9 .,%()'"\-+*/]{1,120}$/i

const clamp = (n: unknown, lo: number, hi: number): number | null => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null)

function scheme(name: string, c: { background: string; surface: string; text: string; muted: string; accent: string; accentText: string; border: string }): ColorScheme {
  const base = {
    background: c.background,
    background_secondary: c.surface,
    text: c.text,
    text_muted: c.muted,
    heading: c.text,
    accent: c.accent,
    link: c.accent,
    border: c.border,
    primary_button_background: c.accent,
    primary_button_text: c.accentText,
    primary_button_border: c.accent,
    secondary_button_background: c.background,
    secondary_button_text: c.text,
    secondary_button_border: c.text,
    input_background: c.surface,
    input_text: c.text,
    input_border: c.border,
  }
  return { name, gradient: "", ...base, ...automaticHover({ ...base, primary_button_hover_background: "", primary_button_hover_text: "", secondary_button_hover_background: "", secondary_button_hover_text: "" }) }
}

export const tokensToThemeSettings: TokensMapper = (tokens: Partial<DesignTokens>, current: Record<string, unknown>) => {
  const out: Record<string, unknown> = {}
  const issues: ValidationIssue[] = []
  const warn = (code: string, message: string) => issues.push({ severity: "warning", code, message })

  if (tokens.colors) {
    const c = tokens.colors
    const bad = (["background", "surface", "text", "muted", "accent", "accentText", "border"] as const).filter((k) => !HEX.test(String(c[k] ?? "")))
    if (bad.length) warn("token.color", `Colours must be hex (#rrggbb). Not set: ${bad.join(", ")}.`)
    else {
      const schemes = { ...((current.color_schemes as Record<string, unknown>) ?? {}) }
      schemes[SITE_SCHEME] = scheme("Site", c)
      if (c.inverse && HEX.test(c.inverse.background) && HEX.test(c.inverse.text) && HEX.test(c.inverse.accent)) {
        schemes[SITE_INVERSE_SCHEME] = scheme("Site inverse", { background: c.inverse.background, surface: c.inverse.background, text: c.inverse.text, muted: c.inverse.text, accent: c.inverse.accent, accentText: c.inverse.background, border: c.inverse.text })
      }
      out.color_schemes = schemes
      out.default_color_scheme = SITE_SCHEME
      out.background_color = c.background
      out.text_color = c.text
      out.primary_color = c.accent
    }
  }
  if (tokens.fonts) {
    if (tokens.fonts.heading) out.font_heading = String(tokens.fonts.heading).slice(0, 60)
    if (tokens.fonts.body) out.font_body = String(tokens.fonts.body).slice(0, 60)
    if (tokens.fonts.accent) out.font_accent = String(tokens.fonts.accent).slice(0, 60)
  }
  if (tokens.radius) {
    const card = clamp(tokens.radius.medium, 0, 24)
    const button = clamp(tokens.radius.small, 0, 32)
    const media = clamp(tokens.radius.large, 0, 24)
    if (card !== null) out.border_radius = card
    if (button !== null) out.button_border_radius = button
    if (media !== null) out.image_border_radius = media
    if (button !== null) out.input_radius = Math.min(24, button)
  }
  if (tokens.spacing) {
    const scale = clamp(tokens.spacing.scale, 0.5, 2)
    const width = clamp(tokens.spacing.pageWidth, 900, 1800)
    const gutter = clamp(tokens.spacing.gutter, 8, 80)
    if (scale !== null) out.spacing_scale = Math.round(scale * 10) / 10
    if (width !== null) out.page_width = Math.round(width / 20) * 20
    if (gutter !== null) out.content_padding_x = Math.round(gutter / 4) * 4
  }
  if (tokens.motion) {
    out.animations_enabled = tokens.motion.level !== "none"
    if (tokens.motion.style && (ANIMATION_STYLES as readonly string[]).includes(tokens.motion.style)) out.animation_style = tokens.motion.style
    const d = clamp(tokens.motion.durationMs, 200, 1200)
    if (d !== null) out.animation_duration = Math.round(d / 50) * 50
  }
  const custom: Record<string, string> = {}
  const wantCustom: Record<string, unknown> = { ...(tokens.custom ?? {}) }
  if (tokens.spacing && typeof tokens.spacing.sectionY === "number") wantCustom["section-y"] = `${clamp(tokens.spacing.sectionY, 0, 240)}px`
  for (const [name, value] of Object.entries(wantCustom)) {
    const v = String(value ?? "").trim()
    if (!TOKEN_NAME.test(name)) warn("token.name", `Custom token "${name.slice(0, 40)}" is not a token name (lowercase letters, digits, dashes).`)
    else if (!TOKEN_VALUE.test(v) || /url\s*\(|expression|javascript:|[<>{};]/i.test(v)) warn("token.value", `Custom token "${name}" was refused: no url(), no markup, no braces or semicolons.`)
    else custom[name] = v
  }
  if (Object.keys(custom).length) out[CUSTOM_TOKENS_SETTING] = { ...((current[CUSTOM_TOKENS_SETTING] as Record<string, string>) ?? {}), ...custom }
  const changed = Object.keys(out).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(out[k]))
  return { settings: out, changed, issues }
}

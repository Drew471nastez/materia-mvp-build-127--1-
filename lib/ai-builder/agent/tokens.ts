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
 *   spacing    spacing_scale, page_width, content_padding_x, ai_section_y
 *   typeScale  Typography's text styles; shadow card_shadow
 *   motion     animations_enabled, animation_style, animation_duration,
 *              motion_tier (round O: the site's motion feel, --t-motion-*),
 *              and the page transition while the site has none of its own
 *   the rest   custom_tokens (`--t-<name>`), checked: no url(), no
 *              expression, no markup
 *
 * TODO(L5 merge): L5 owns `tokensToThemeSettings` in lib/ai-builder/manifest.ts.
 * The loop takes the mapper as a dependency (AgentDeps.tokensToSettings) and
 * uses this one until that lands. Pure.
 */
import { automaticHover, type ColorScheme } from "@/lib/storelib-theme/color-schemes"
import { ANIMATION_STYLES, CUSTOM_TOKENS_SETTING, SHADOW_LEVELS, type DesignTokens, type ValidationIssue } from "../types"
import { SCALE_TOKENS, SITE_INVERSE_SCHEME, SITE_SCHEME, typeScaleStyles } from "../tokens"
import type { TokensMapper } from "./ports"
import { isMotionTier, pageTransitionFor, tierFromLevel, MOTION_TIER_SETTING } from "@/lib/storelib-ai/motion"

export { SITE_SCHEME, SITE_INVERSE_SCHEME }

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
      /* Round O (O2): never the platform's indigo fallbacks (theme-css.ts --theme-secondary #8b5cf6, --theme-link): the site's own colours. */
      out.secondary_color = c.inverse && HEX.test(c.inverse.background) ? c.inverse.background : c.text
      out.link_color = c.accent
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
    /* Large corners are what the token panel and `--t-radius-lg` read (lib/ai-builder/tokens.ts): pop-ups and big cards. */
    const large = clamp(tokens.radius.large, 0, 40)
    if (large !== null) out.popup_radius = large
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
    /* Round O (O5): the motion feel every AI component reads as --t-motion-*. Given, or what the level says. */
    if (tokens.motion.tier !== undefined && !isMotionTier(tokens.motion.tier)) warn("token.motion_tier", "motion.tier is quiet, balanced or expressive.")
    const tier = isMotionTier(tokens.motion.tier) ? tokens.motion.tier : tierFromLevel(tokens.motion.level)
    out[MOTION_TIER_SETTING] = tier
    /* Between pages follows the feel until somebody chose one (a choice already stored is the creator's or an earlier pass's, and stays). */
    if (current.page_transition === undefined) Object.assign(out, pageTransitionFor(tier))
  }
  /*
    The section rhythm is the Theme setting `ai_section_y`, read as `--t-section-y`
    (lib/ai-builder/tokens.ts tokenVars). It was written as a custom token
    "section-y", which the scale's own `--t-section-y` (printed after the custom
    ones) always replaced with 96px, so the agent's rhythm never reached the page.
  */
  if (tokens.spacing && typeof tokens.spacing.sectionY === "number") out.ai_section_y = clamp(tokens.spacing.sectionY, 0, 240)
  /* The type scale and the card shadow, as the token panel writes them (round N). */
  if (tokens.typeScale && typeof tokens.typeScale === "object") {
    const base = clamp(tokens.typeScale.base, 12, 22)
    const ratio = clamp(tokens.typeScale.ratio, 1.05, 1.6)
    if (base !== null && ratio !== null) out.typography_styles = typeScaleStyles({ base, ratio }, current)
    else warn("token.type_scale", "typeScale needs base (px, 12 to 22) and ratio (1.05 to 1.6).")
  }
  if (tokens.shadow !== undefined) {
    if ((SHADOW_LEVELS as readonly string[]).includes(String(tokens.shadow))) out.card_shadow = tokens.shadow
    else warn("token.shadow", `shadow is one of ${SHADOW_LEVELS.join(", ")}.`)
  }
  const custom: Record<string, string> = {}
  const wantCustom: Record<string, unknown> = { ...(tokens.custom ?? {}) }
  for (const [name, value] of Object.entries(wantCustom)) {
    const v = String(value ?? "").trim()
    if ((SCALE_TOKENS as readonly string[]).includes(name)) warn("token.name", `"${name}" is one of the site's own scale tokens (--t-${name}), read from Theme settings. Pick another name.`)
    else if (!TOKEN_NAME.test(name)) warn("token.name", `Custom token "${name.slice(0, 40)}" is not a token name (lowercase letters, digits, dashes).`)
    else if (!TOKEN_VALUE.test(v) || /url\s*\(|expression|javascript:|[<>{};]/i.test(v)) warn("token.value", `Custom token "${name}" was refused: no url(), no markup, no braces or semicolons.`)
    else custom[name] = v
  }
  if (Object.keys(custom).length) out[CUSTOM_TOKENS_SETTING] = { ...((current[CUSTOM_TOKENS_SETTING] as Record<string, string>) ?? {}), ...custom }
  const changed = Object.keys(out).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(out[k]))
  return { settings: out, changed, issues }
}

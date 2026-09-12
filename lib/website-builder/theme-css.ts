/**
 * ===========================================================================
 *  THE THEME, AS CSS
 * ===========================================================================
 * Storelib's theme settings are a Shopify-shaped `settings_schema` — twelve
 * groups, ninety-three controls — and fifty-two of them were read by nothing.
 * Not "read by one page and not another": read by NOTHING, anywhere in the
 * repository. The whole Layout group. The whole Animations group. The cookie
 * banner. Base font size, line height, heading weight, heading transform. Five
 * of the seven button controls. Nine of the colours.
 *
 * The reason is structural rather than careless. A theme setting has no way to
 * reach a section: the sections are React components with Tailwind classes,
 * and `page_width: 1440` cannot change `max-w-[1230px]`. So each new setting
 * was added to the panel, wired to nothing, and forgotten.
 *
 * WHAT SHOPIFY DOES, AND WHAT THIS DOES. A Liquid theme compiles its settings
 * into CSS custom properties on one root element, and every section is written
 * against those properties rather than against literal values. The settings
 * then govern the sections without either side knowing about the other, which
 * is the whole point of a theme.
 *
 * This module is that compile step. It is pure — no DOM, no React — so the
 * suite drives it directly.
 */

import { themeTypography, typographyStylesheet, typographyVars } from "@/lib/storelib-theme/typography"
import type { ThemeSettingsValues } from "./types"

/** A setting that arrived as `"1280"`, or as nothing at all. */
function num(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback
}

/** Card and button shadows, by name. */
const SHADOWS: Record<string, string> = {
  none: "none",
  sm: "0 1px 3px rgba(15, 23, 42, 0.10)",
  md: "0 4px 14px -4px rgba(15, 23, 42, 0.16)",
  lg: "0 12px 32px -12px rgba(15, 23, 42, 0.28)",
  xl: "0 24px 60px -20px rgba(15, 23, 42, 0.35)",
}

/** Button corner shapes. `rounded` defers to the numeric radius control. */
const BUTTON_SHAPES: Record<string, string> = {
  square: "0px",
  pill: "999px",
}

/** Button sizes, as the padding and text size pair each name implies. */
const BUTTON_SIZES: Record<string, { padding: string; size: string }> = {
  sm: { padding: "0.5rem 1rem", size: "0.8125rem" },
  md: { padding: "0.75rem 1.5rem", size: "0.875rem" },
  lg: { padding: "0.875rem 2rem", size: "1rem" },
  xl: { padding: "1rem 2.5rem", size: "1.0625rem" },
}

export const THEME_ROOT_ATTRIBUTE = "data-storelib-theme"

/**
 * The custom properties a theme sets, as a style object.
 *
 * Applied to ONE element that wraps the whole page — the editor's canvas card
 * and the published page alike — so a section reading `var(--theme-page-width)`
 * gets the same answer in both.
 */
export function themeVars(theme: ThemeSettingsValues): Record<string, string> {
  const t = theme as Record<string, unknown>
  const radius = num(t.border_radius, 8)
  const buttonShape = str(t.button_shape, "rounded")
  const buttonSize = BUTTON_SIZES[str(t.button_size, "md")] ?? BUTTON_SIZES.md
  const typo = themeTypography(t)

  return {
    // ── Colour ────────────────────────────────────────────────────────────
    "--theme-primary": str(t.primary_color, "#6366f1"),
    "--theme-primary-hover": str(t.primary_hover_color, str(t.primary_color, "#4f46e5")),
    "--theme-secondary": str(t.secondary_color, "#8b5cf6"),
    "--theme-accent": str(t.accent_color, "#ec4899"),
    "--theme-bg": str(t.background_color, "#ffffff"),
    "--theme-surface": str(t.surface_color, "#f8fafc"),
    "--theme-surface-alt": str(t.surface_alt_color, "#f1f5f9"),
    "--theme-text": str(t.text_color, "#0f172a"),
    "--theme-text-secondary": str(t.text_secondary_color, "#475569"),
    "--theme-text-muted": str(t.text_muted_color, "#94a3b8"),
    "--theme-border": str(t.border_color, "#e2e8f0"),
    "--theme-link": str(t.link_color, str(t.primary_color, "#6366f1")),
    "--theme-link-hover": str(t.link_hover_color, str(t.primary_hover_color, "#4f46e5")),
    "--theme-success": str(t.success_color, "#10b981"),
    "--theme-error": str(t.error_color, "#ef4444"),

    // ── Type ──────────────────────────────────────────────────────────────
    /**
     * The three fonts and the nine text styles, compiled by the engine's
     * typography module (lib/storelib-theme/typography.ts): `--theme-font-*`
     * and `--type-<style>-*`. The older `--theme-font-size`, `--theme-line-
     * height` and `--theme-heading-*` names stay, now read off the Body and
     * Heading 2 styles, for anything written against them.
     */
    ...typographyVars(typo),
    "--theme-font-size": `${typo.styles.body.size.desktop}px`,
    "--theme-line-height": String(typo.styles.body.line_height),
    "--theme-heading-weight": typo.styles.h2.weight,
    "--theme-heading-transform": typo.styles.h2.transform,
    "--theme-heading-tracking": `${typo.styles.h2.letter_spacing}px`,

    // ── Layout ────────────────────────────────────────────────────────────
    "--theme-page-width": `${num(t.page_width, 1280)}px`,
    "--theme-padding-x": `${num(t.content_padding_x, 24)}px`,
    "--theme-section-gap": `${num(t.section_gap, 0)}px`,
    /**
     * A MULTIPLIER, not a length. Every section's padding is
     * `calc(<its own default> * var(--theme-spacing-scale))`, so a theme set
     * to 1.4 makes the whole page breathe without touching fifty sections.
     */
    "--theme-spacing-scale": String(num(t.spacing_scale, 1)),
    "--theme-radius": `${radius}px`,
    "--theme-card-shadow": SHADOWS[str(t.card_shadow, "sm")] ?? SHADOWS.sm,
    "--theme-image-radius": `${num(t.image_border_radius, 8)}px`,

    // ── Buttons ───────────────────────────────────────────────────────────
    "--theme-button-radius": BUTTON_SHAPES[buttonShape] ?? `${num(t.button_border_radius, radius)}px`,
    "--theme-button-padding": buttonSize.padding,
    "--theme-button-size": buttonSize.size,
    "--theme-button-weight": typo.styles.button.weight,
    "--theme-button-shadow": SHADOWS[str(t.button_shadow, "none")] ?? "none",

    // ── Motion ────────────────────────────────────────────────────────────
    "--theme-animation-duration": `${num(t.animation_duration, 600)}ms`,
    "--theme-animation-stagger": `${num(t.animation_stagger, 80)}ms`,
  }
}

/** How each animation style enters. */
const ANIMATION_FROM: Record<string, string> = {
  "fade-up": "opacity: 0; transform: translateY(16px);",
  "fade-in": "opacity: 0;",
  "slide-left": "opacity: 0; transform: translateX(24px);",
  "slide-right": "opacity: 0; transform: translateX(-24px);",
  "zoom-in": "opacity: 0; transform: scale(0.96);",
}

/**
 * The rules a theme owns, scoped to the page root.
 *
 * Sections keep their own Tailwind — this only takes over the handful of
 * properties the THEME is supposed to decide, which is what makes a control
 * like "Heading weight" mean anything at all without editing fifty files.
 *
 * Every selector is prefixed with the root attribute so nothing here can
 * escape into the editor's own chrome, which shares the document with the
 * canvas.
 */
export function themeStylesheet(theme: ThemeSettingsValues): string {
  const t = theme as Record<string, unknown>
  const root = `[${THEME_ROOT_ATTRIBUTE}]`
  const transition = str(t.button_transition, "fade")
  const buttonStyle = str(t.button_style, "filled")

  const rules: string[] = [
    // Body type. `font-size` on the root is what `rem`-less sections inherit.
    `${root}{background:var(--theme-bg);color:var(--theme-text);font-family:var(--theme-font-body),ui-sans-serif,system-ui,sans-serif;font-size:var(--theme-font-size);line-height:var(--theme-line-height);}`,
    // Headings answer to the theme's text styles, section by section.
    typographyStylesheet(root, themeTypography(t)),
    /**
     * ═══════════════════════════════════════════════════════════════════
     *  A LINK THE SECTION HAS NOT PAINTED, AND ONLY THAT
     * ═══════════════════════════════════════════════════════════════════
     * This was `${root} a:not([style*="color"])`, meant to read "unless a
     * section has painted them itself". It did not. The escape hatch tests
     * the INLINE style, and a section paints its links in its own
     * stylesheet, so nothing was ever exempt — and the selector weighs
     * 0,2,1, which is MORE than the 0,2,0 of a section's own
     * `[data-section-id="…"] .s__btn--primary`.
     *
     * So every anchor in every section was forced to `color: inherit`,
     * including the buttons. A primary button is a black slab with the
     * section's body colour on it; measured across the shipped theme, nine
     * sections had a label at 3.1:1 and two at 1.5:1, and a white button on
     * a dark section came out white on white — a blank slab where "Book a
     * chair" should be. `scripts/check-buttons.mjs` reads every one of them
     * out of a real browser.
     *
     * `:where()` is the whole fix: zero specificity, so this applies to a
     * link nobody has painted and loses to every section that has, which is
     * what the line always said it did.
     */
    `:where(${root} a){color:inherit;}`,
    /**
     * LONG WORDS DO NOT PUSH THE PAGE SIDEWAYS.
     *
     * Measured in Chromium at 390px: with the shipped demo copy every one of
     * the fifty sections was clean, and with ONE unbreakable string in a text
     * field — a long product name, a pasted URL, an email address — THIRTY-FIVE
     * of them pushed the page into horizontal scroll. Up to 866px of it.
     *
     * `anywhere` rather than `break-word` on purpose: only `anywhere` shrinks
     * an element's min-content width, and it is the min-content width that
     * makes a flex or grid child refuse to get narrower than its longest word.
     * `break-word` wraps the text and leaves the blowout.
     *
     * One rule, inherited by everything in every section, so the fifty-first
     * section cannot forget it.
     */
    `${root} [data-section]{overflow-wrap:anywhere;}`,
  ]

  const gap = num(t.section_gap, 0)
  if (gap > 0) {
    // Between sections, never above the first or below the last — a gap there
    // reads as a broken page rather than as spacing.
    rules.push(`${root} [data-section]:not([data-chrome])+[data-section]:not([data-chrome]){margin-top:var(--theme-section-gap);}`)
  }

  // ── Buttons ─────────────────────────────────────────────────────────────
  const buttonRules = [
    "border-radius:var(--theme-button-radius)",
    "font-weight:var(--theme-button-weight)",
    "box-shadow:var(--theme-button-shadow)",
  ]
  if (transition !== "none") buttonRules.push("transition:all 180ms cubic-bezier(0.22,1,0.36,1)")
  rules.push(`${root} [data-section] a[href],${root} [data-section] button{${buttonRules.join(";")};}`)

  if (transition === "lift") {
    rules.push(`${root} [data-section] a[href]:hover,${root} [data-section] button:hover{transform:translateY(-2px);}`)
  } else if (transition === "scale") {
    rules.push(`${root} [data-section] a[href]:hover,${root} [data-section] button:hover{transform:scale(1.03);}`)
  } else if (transition === "fade") {
    rules.push(`${root} [data-section] a[href]:hover,${root} [data-section] button:hover{opacity:0.9;}`)
  }

  /**
   * "Ghost" and "outline" are the theme's opinion about buttons a section has
   * not painted itself. A section that sets its own background is stating an
   * intention and keeps it — which is why this matches on the absence of an
   * inline background rather than blanket-overriding.
   */
  if (buttonStyle === "ghost") {
    rules.push(`${root} [data-section] a[href]:not([style*="background"]){background:transparent;}`)
  } else if (buttonStyle === "outline") {
    rules.push(
      `${root} [data-section] a[href]:not([style*="background"]){background:transparent;border:1px solid currentColor;}`,
    )
  }

  // ── Motion ──────────────────────────────────────────────────────────────
  if (t.animations_enabled) {
    const from = ANIMATION_FROM[str(t.animation_style, "fade-up")] ?? ANIMATION_FROM["fade-up"]
    rules.push(
      `@keyframes storelibSectionIn{from{${from}}to{opacity:1;transform:none;}}`,
      /**
       * NOT THE HEADER, NOT THE FOOTER.
       *
       * Measured in Chromium: with the animation on every section, a sticky
       * header sat 16px below where it should — `translateY(16px)` is the
       * from-state of "fade up", and the header's own `transform` is what
       * slides it away on scroll, so the two were fighting over the same
       * property. Chrome appears with the page; only content enters.
       */
      `${root} [data-section]:not([data-chrome]){animation:storelibSectionIn var(--theme-animation-duration) cubic-bezier(0.22,1,0.36,1) both;}`,
      // Each section a little after the one above it, capped so the tenth
      // section is not still waiting a second after the page has settled.
      ...Array.from({ length: 8 }, (_, i) =>
        `${root} [data-section]:not([data-chrome]):nth-of-type(${i + 2}){animation-delay:calc(var(--theme-animation-stagger) * ${i + 1});}`,
      ),
      // Somebody who has asked their system for less motion has asked.
      `@media (prefers-reduced-motion:reduce){${root} [data-section]{animation:none;}}`,
    )
  }

  return rules.join("\n")
}

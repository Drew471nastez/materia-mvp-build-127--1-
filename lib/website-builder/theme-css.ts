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

import { buttonSelector, themeTypography, typographyStylesheet, typographyVars } from "@/lib/storelib-theme/typography"
import { cleanCustomCss } from "@/lib/storelib-theme/custom-css"
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
    "--theme-card-shadow": SHADOWS[str(t.card_shadow, "none")] ?? "none",
    "--theme-image-radius": `${num(t.image_border_radius, 8)}px`,

    // ── Buttons ───────────────────────────────────────────────────────────
    "--theme-button-radius": BUTTON_SHAPES[buttonShape] ?? `${num(t.button_border_radius, radius)}px`,
    "--theme-button-padding": buttonSize.padding,
    "--theme-button-size": buttonSize.size,
    "--theme-button-weight": typo.styles.button.weight,
    /*
      Buttons › Button shadow is a switch, saved as `true`. It was read as a
      shadow NAME, so `true` fell through to "none" and the switch did
      nothing. On is the small shadow; an older saved name still works.
    */
    "--theme-button-shadow": t.button_shadow === true ? SHADOWS.sm : SHADOWS[str(t.button_shadow, "none")] ?? "none",

    // ── Motion ────────────────────────────────────────────────────────────
    "--theme-animation-duration": `${num(t.animation_duration, 600)}ms`,
    "--theme-animation-stagger": `${num(t.animation_stagger, 80)}ms`,

    // ── Inputs, pills, cards, containers, media, pop-ups, badges ─────────────
    ...parityVars(t),
    ...buttonSizeVars(t, buttonSize, typo),
  }
}

/**
 * BUTTONS › SIZE AND THE BUTTON TEXT STYLE, ONCE CHOSEN. Every section's
 * `.s__btn` drew itself at 13px by 24px and 15px whatever the theme said, so
 * Buttons › Size and Typography › Button changed nothing on the page. Their
 * values go out as `--sl-button-*` only when one of them was set, and the
 * sections read `var(--sl-button-padding, 13px 24px)`: a site that never
 * opened either keeps the buttons it has.
 */
function buttonSizeVars(t: Record<string, unknown>, size: { padding: string; size: string }, typo: ReturnType<typeof themeTypography>): Record<string, string> {
  const out: Record<string, string> = {}
  if (isSet(t, "button_size")) {
    out["--sl-button-padding"] = size.padding
    out["--sl-button-size"] = size.size
  }
  const own = t.typography_styles && typeof t.typography_styles === "object" ? (t.typography_styles as Record<string, unknown>).button : undefined
  if (own && typeof own === "object") {
    const b = own as Record<string, unknown>
    if (b.size !== undefined) out["--sl-button-size"] = `${typo.styles.button.size.desktop}px`
    if (b.line_height !== undefined) out["--sl-button-line-height"] = String(typo.styles.button.line_height)
  }
  /* Layout › Images and video › Corner radius, the same way: a section's own pictures (not its product cards, which Product cards rounds) take it once it was set, and the card radius they always had until then. */
  if (isSet(t, "image_border_radius")) out["--sl-image-radius"] = `${num(t.image_border_radius, 8)}px`
  /* Typography › Caption, the same way: the small label over a section's heading reads it once it was changed. */
  const cap = t.typography_styles && typeof t.typography_styles === "object" ? (t.typography_styles as Record<string, unknown>).caption : undefined
  if (cap && typeof cap === "object") {
    const c = cap as Record<string, unknown>
    const st = typo.styles.caption
    if (c.size !== undefined) out["--sl-caption-size"] = `${st.size.desktop}px`
    if (c.weight !== undefined) out["--sl-caption-weight"] = String(st.weight)
    if (c.letter_spacing !== undefined) out["--sl-caption-tracking"] = `${st.letter_spacing}px`
    if (c.transform !== undefined) out["--sl-caption-transform"] = st.transform
    if (c.font !== undefined) out["--sl-caption-font"] = "var(--type-caption-font)"
  }
  return out
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  THE REST OF SHOPIFY'S THEME SETTINGS
 * ═══════════════════════════════════════════════════════════════════════════
 * Inputs, Variant pills, Product cards, Collection cards, Content
 * containers, Media, Dropdowns and pop-ups, and Badges, as Dawn has them.
 *
 * ONLY WHAT WAS SET. Each property below is written once its setting has a
 * value, and each rule in parityRules once the property it reads exists. A
 * site that never opened these groups keeps the look its sections always
 * had, so adding the groups changed nobody's page; choosing a value is what
 * changes it, on every section that draws that kind of thing.
 *
 * The elements are found by attribute, not by class: `data-card="product"`,
 * `data-card-media`, `data-badges`, `data-badge`, `data-container`,
 * `data-media`, `data-popup`, `data-variant-pill`. A section names what its
 * elements ARE, and the theme decides how they look, the way a Dawn section
 * uses `card-wrapper` and `media`. docs: content/developers/themes.md.
 */

/** Whether a setting has a value of its own, rather than its group's default. */
function isSet(t: Record<string, unknown>, key: string): boolean {
  const v = t[key]
  return v !== undefined && v !== null && v !== ""
}

/** The two kinds of card the settings cover, and the keys each one's group stores. */
const CARD_KINDS = ["product", "collection"] as const
const CARD_KEYS = {
  product: {
    style: "product_card_style",
    image_padding: "product_card_image_padding",
    align: "product_card_align",
    radius: "product_card_radius",
    border: "product_card_border",
    shadow: "product_card_shadow",
  },
  collection: {
    style: "collection_card_style",
    image_padding: "collection_card_image_padding",
    align: "collection_card_align",
    radius: "collection_card_radius",
    border: "collection_card_border",
    shadow: "collection_card_shadow",
  },
} as const

/** Badge corners, by the position name the panel stores. */
const BADGE_POSITIONS: Record<string, { top: string; bottom: string; left: string; right: string }> = {
  top_left: { top: "10px", bottom: "auto", left: "10px", right: "auto" },
  top_right: { top: "10px", bottom: "auto", left: "auto", right: "10px" },
  bottom_left: { top: "auto", bottom: "10px", left: "10px", right: "auto" },
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const colour = (v: unknown) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim() : "")

/** The custom properties for the groups above, for the settings that have a value. */
export function parityVars(t: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  const px = (key: string, name: string, fallback: number, max: number) => {
    if (isSet(t, key)) out[name] = `${Math.min(max, Math.max(0, num(t[key], fallback)))}px`
  }
  const shadow = (key: string, name: string) => {
    if (isSet(t, key)) out[name] = SHADOWS[str(t[key], "none")] ?? "none"
  }

  px("input_radius", "--theme-input-radius", 8, 24)
  px("input_border_width", "--theme-input-border-width", 1, 4)
  if (isSet(t, "input_border_opacity")) out["--theme-input-border-opacity"] = `${Math.min(100, Math.max(0, num(t.input_border_opacity, 25)))}%`

  px("pill_radius", "--theme-pill-radius", 40, 40)
  px("pill_border_width", "--theme-pill-border-width", 1, 4)

  for (const kind of CARD_KINDS) {
    const keys = CARD_KEYS[kind]
    px(keys.radius, `--theme-${kind}-card-radius`, 8, 40)
    px(keys.border, `--theme-${kind}-card-border`, 0, 4)
    px(keys.image_padding, `--theme-${kind}-card-image-padding`, 0, 24)
    shadow(keys.shadow, `--theme-${kind}-card-shadow`)
  }

  px("container_radius", "--theme-container-radius", 8, 40)
  px("container_border", "--theme-container-border", 0, 4)
  shadow("container_shadow", "--theme-container-shadow")
  /*
    Layout › Card shadow IS the cards' shadow. It used to be written as
    --theme-card-shadow and read by nothing; the boxes a section marks
    `[data-container]` (a feature card, a pricing plan) are the cards it
    meant. An older Content containers shadow, where one was saved, wins.
  */
  if (!isSet(t, "container_shadow")) shadow("card_shadow", "--theme-container-shadow")

  px("media_border", "--theme-media-border", 0, 4)
  shadow("media_shadow", "--theme-media-shadow")

  px("popup_radius", "--theme-popup-radius", 12, 24)
  px("popup_border", "--theme-popup-border", 1, 4)
  shadow("popup_shadow", "--theme-popup-shadow")

  px("badge_radius", "--theme-badge-radius", 40, 40)
  if (isSet(t, "badge_position")) {
    const at = BADGE_POSITIONS[str(t.badge_position, "top_left")] ?? BADGE_POSITIONS.top_left
    out["--theme-badge-top"] = at.top
    out["--theme-badge-bottom"] = at.bottom
    out["--theme-badge-left"] = at.left
    out["--theme-badge-right"] = at.right
  }
  for (const [key, name] of [
    ["badge_sale_bg", "--theme-badge-sale-bg"],
    ["badge_sale_color", "--theme-badge-sale-color"],
    ["badge_soldout_bg", "--theme-badge-soldout-bg"],
    ["badge_soldout_color", "--theme-badge-soldout-color"],
  ] as const) {
    const c = colour(t[key])
    if (c) out[name] = c
  }
  return out
}

/** The rules that put those properties on the elements, for the ones that exist. */
function parityRules(t: Record<string, unknown>, root: string): string[] {
  const vars = parityVars(t)
  const has = (name: string) => name in vars
  /*
    Every selector of a rule starts at the root, so nothing here reaches the
    editor around the canvas, and goes through `[data-section]`, which is
    what lets it win. A section's own rule is `[data-section-id="…"] .tag`,
    0,2,0, and comes later in the page; `[root] [data-badge]` is 0,2,0 too
    and lost every tie, so a badge colour chosen here changed nothing.
    `[root] [data-section] [data-badge]` is 0,3,0.
  */
  const at = (...parts: string[]) => parts.map((p) => `${root} [data-section] ${p}`).join(",")
  const rules: string[] = []

  // ── Inputs ──────────────────────────────────────────────────────────────
  /* Not inside code that keeps its own look: `data-theme-styles="off"` on any element of a section (lib/storelib-theme/typography OWN_STYLES). */
  const field = ":is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=color]):not([type=file]):not([type=submit]):not([type=button]),select,textarea):not([data-theme-styles=off] *)"
  const input: string[] = []
  if (has("--theme-input-radius")) input.push("border-radius:var(--theme-input-radius)")
  if (has("--theme-input-border-width")) input.push("border-width:var(--theme-input-border-width)", "border-style:solid")
  if (has("--theme-input-border-opacity")) input.push("border-color:color-mix(in srgb,currentColor var(--theme-input-border-opacity),transparent)")
  if (input.length) rules.push(`${at(field)}{${input.join(";")};}`)

  // ── Variant pills ───────────────────────────────────────────────────────
  const pill: string[] = []
  if (has("--theme-pill-radius")) pill.push("border-radius:var(--theme-pill-radius)")
  if (has("--theme-pill-border-width")) pill.push("border-width:var(--theme-pill-border-width)", "border-style:solid")
  if (pill.length) rules.push(`${at("[data-variant-pill]")}{${pill.join(";")};}`)

  // ── Product and collection cards ────────────────────────────────────────
  for (const kind of CARD_KINDS) {
    const card = `[data-card="${kind}"]`
    const media = `${card} [data-card-media]`
    const v = (part: string) => `--theme-${kind}-card-${part}`
    const keys = CARD_KEYS[kind]
    const asCard = isSet(t, keys.style) && str(t[keys.style], "standard") === "card"
    const frame: string[] = []
    if (has(v("radius"))) frame.push(`border-radius:var(${v("radius")})`)
    if (has(v("border"))) frame.push(`border:var(${v("border")}) solid color-mix(in srgb,currentColor 18%,transparent)`)
    if (has(v("shadow"))) frame.push(`box-shadow:var(${v("shadow")})`)
    if (asCard) {
      /* Card: the whole card is the frame, on a faint fill of its own text colour, the words inset from its edge. */
      rules.push(`${at(card)}{${[...frame, "overflow:hidden", "background:color-mix(in srgb,currentColor 4%,transparent)", `padding:var(${v("image-padding")},0px) var(${v("image-padding")},0px) 14px`].join(";")};}`)
      rules.push(`${at(`${card} > :not([data-card-media]):not(a)`)}{padding-inline:12px;}`)
      /* The picture keeps a radius only when it is inset; flush, it is the card's own top. */
      rules.push(`${at(media)}{border-radius:min(max(0px,calc(var(${v("radius")},8px) - var(${v("image-padding")},0px))),calc(var(${v("image-padding")},0px) * 1000));}`)
    } else {
      if (frame.length) rules.push(`${at(media)}{${frame.join(";")};}`)
      if (has(v("image-padding"))) {
        rules.push(`${at(media)}{padding:var(${v("image-padding")});background:color-mix(in srgb,currentColor 4%,transparent);}`)
        rules.push(`${at(`${media} img`)}{border-radius:max(0px,calc(var(${v("radius")},8px) - var(${v("image-padding")})));}`)
      }
    }
    if (isSet(t, keys.align) && str(t[keys.align], "left") === "center") {
      rules.push(`${at(card)}{text-align:center;}`, `${at(`${card} :is(p,div):not([data-card-media])`)}{justify-content:center;}`)
    }
  }

  // ── Content containers ──────────────────────────────────────────────────
  const box: string[] = []
  if (has("--theme-container-radius")) box.push("border-radius:var(--theme-container-radius)")
  if (has("--theme-container-border")) box.push("border:var(--theme-container-border) solid color-mix(in srgb,currentColor 18%,transparent)")
  if (has("--theme-container-shadow")) box.push("box-shadow:var(--theme-container-shadow)")
  if (box.length) rules.push(`${at("[data-container]")}{${box.join(";")};}`)

  // ── Media ───────────────────────────────────────────────────────────────
  const pic: string[] = []
  if (isSet(t, "image_border_radius")) pic.push("border-radius:var(--theme-image-radius)", "overflow:hidden")
  if (has("--theme-media-border")) pic.push("border:var(--theme-media-border) solid color-mix(in srgb,currentColor 18%,transparent)")
  if (has("--theme-media-shadow")) pic.push("box-shadow:var(--theme-media-shadow)")
  if (pic.length) rules.push(`${at("[data-media]")}{${pic.join(";")};}`)

  // ── Dropdowns and pop-ups ───────────────────────────────────────────────
  /* The header's own dropdown is one, by its class, so the setting reaches it without the header changing. */
  const pop: string[] = []
  if (has("--theme-popup-radius")) pop.push("border-radius:var(--theme-popup-radius)")
  if (has("--theme-popup-border")) pop.push("border:var(--theme-popup-border) solid color-mix(in srgb,currentColor 14%,transparent)")
  if (has("--theme-popup-shadow")) pop.push("box-shadow:var(--theme-popup-shadow)")
  if (pop.length) rules.push(`${root} [data-popup],${at("[data-popup]", ".theme-nav-dropdown")}{${pop.join(";")};}`)

  // ── Badges ──────────────────────────────────────────────────────────────
  if (has("--theme-badge-top")) {
    rules.push(`${at("[data-badges]")}{top:var(--theme-badge-top);bottom:var(--theme-badge-bottom);left:var(--theme-badge-left);right:var(--theme-badge-right);}`)
    /* Top right is where the wishlist heart sits: the badges stand to its left. */
    if (str(t.badge_position, "") === "top_right") rules.push(`${at("[data-card-media]:has([data-storelib-wishlist]) [data-badges]")}{right:56px;}`)
  }
  if (has("--theme-badge-radius")) rules.push(`${at("[data-badge]")}{border-radius:var(--theme-badge-radius);}`)
  if (has("--theme-badge-sale-bg") || has("--theme-badge-sale-color")) {
    rules.push(`${at('[data-badge="sale"]')}{${[has("--theme-badge-sale-bg") ? "background:var(--theme-badge-sale-bg)" : "", has("--theme-badge-sale-color") ? "color:var(--theme-badge-sale-color)" : ""].filter(Boolean).join(";")};}`)
  }
  if (has("--theme-badge-soldout-bg") || has("--theme-badge-soldout-color")) {
    rules.push(`${at('[data-badge="soldout"]')}{${[has("--theme-badge-soldout-bg") ? "background:var(--theme-badge-soldout-bg)" : "", has("--theme-badge-soldout-color") ? "color:var(--theme-badge-soldout-color)" : ""].filter(Boolean).join(";")};}`)
  }
  return rules
}

/**
 * THE CREATOR'S CUSTOM CSS, cleaned and scoped to the page root
 * (lib/storelib-theme/custom-css.ts). Its own <style>, drawn after every
 * section, so a rule as specific as a section's own wins, the way custom
 * CSS does on Shopify. Empty when there is none.
 */
export function themeCustomCss(theme: ThemeSettingsValues): string {
  const t = theme as Record<string, unknown>
  return cleanCustomCss(t.custom_css, `[${THEME_ROOT_ATTRIBUTE}]`).css
}

/** What Add to cart does: "drawer", "page" or "notification". Shopify's Cart type. */
export function themeCartType(theme: ThemeSettingsValues): "drawer" | "page" | "notification" {
  const t = theme as Record<string, unknown>
  const v = str(t.cart_type, "drawer")
  return v === "page" || v === "notification" ? v : "drawer"
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
    /**
     * EVERY BODY SECTION THAT HAS ONE BEFORE IT, which is "all but the
     * first" — never above the first or below the last, because a gap there
     * reads as a broken page rather than as spacing.
     *
     * `~` rather than `+` on purpose: the editor puts an insert strip
     * between sections, and with `+` the gap would appear on a published
     * page and vanish in the editor. The marker is on the container that
     * actually has siblings; see SectionRenderer.
     */
    rules.push(`${root} [data-section-box]:not([data-chrome]) ~ [data-section-box]:not([data-chrome]){margin-top:var(--theme-section-gap);}`)
  }

  /**
   * PHONE SPACING. Layout › Phone spacing multiplies every section's padding
   * again on a section 767px wide or less, the width the type takes its
   * phone sizes at (typography.ts TYPE_BREAKPOINTS), so a page can breathe
   * on a wide screen and still not scroll forever on a phone. Written only
   * when it is not 1, so a site that never set it is drawn as it was.
   */
  const phoneSpacing = num(t.spacing_scale_mobile, 1)
  if (phoneSpacing > 0 && phoneSpacing !== 1) {
    rules.push(`@container (max-width:767px){${root} [data-section]{--theme-spacing-scale:${Math.round(num(t.spacing_scale, 1) * phoneSpacing * 1000) / 1000};}}`)
  }

  /**
   * SHOWN ON DESKTOP ONLY, OR ON PHONES ONLY: a section's Show on choice
   * (SectionRenderer, `data-show-on` on the box every section is drawn in,
   * which is the query container), so it answers to the width the section
   * actually has, in the editor's phone preview as on a phone. In the
   * builder the section stays faint and clickable instead of vanishing
   * (`data-show-on-editor`), so it can still be chosen and changed.
   */
  rules.push(
    `@container (max-width:767px){${root} [data-show-on="desktop"]>*{display:none !important;}${root} [data-show-on-editor="desktop"]>*{opacity:.35;}}`,
    `@container (min-width:768px){${root} [data-show-on="mobile"]>*{display:none !important;}${root} [data-show-on-editor="mobile"]>*{opacity:.35;}}`,
  )

  // ── Buttons ─────────────────────────────────────────────────────────────
  const buttonRules = [
    "border-radius:var(--theme-button-radius)",
    "font-weight:var(--theme-button-weight)",
    "box-shadow:var(--theme-button-shadow)",
  ]
  if (transition !== "none") buttonRules.push("transition:all 180ms cubic-bezier(0.22,1,0.36,1)")
  /**
   * BUTTONS, NOT EVERY LINK.
   *
   * All four of the rules below were written `[data-section] a[href]`, so a
   * radius, a font weight, a shadow, a hover transform and — with the
   * Outline style — a one pixel border were applied to every link in every
   * section. The nav, the footer, a product card whose title is a link, and
   * the site's own wordmark, which is an anchor to the home page.
   *
   * The Outline case is the one to picture: choosing it drew a box around
   * every link on the site. See buttonSelector in storelib-theme/typography
   * for what counts as a button and why.
   */
  const buttons = buttonSelector(root)
  const buttonsHover = buttonSelector(root, (sel) => `${sel}:hover`)
  rules.push(`${buttons}{${buttonRules.join(";")};}`)

  if (transition === "lift") {
    rules.push(`${buttonsHover}{transform:translateY(-2px);}`)
  } else if (transition === "scale") {
    rules.push(`${buttonsHover}{transform:scale(1.03);}`)
  } else if (transition === "fade") {
    rules.push(`${buttonsHover}{opacity:0.9;}`)
  }

  /**
   * "Ghost" and "outline" are the theme's opinion about buttons a section has
   * not painted itself. A section that sets its own background is stating an
   * intention and keeps it — which is why this matches on the absence of an
   * inline background rather than blanket-overriding.
   */
  if (buttonStyle === "ghost" || buttonStyle === "outline") {
    const unpainted = buttonSelector(root, (sel) => `${sel}:not([style*="background"])`)
    const unpaintedHover = buttonSelector(root, (sel) => `${sel}:not([style*="background"]):hover`)
    /*
      THE LABEL IN THE BUTTON'S COLOUR. Only the fill was taken away, so the
      label stayed the scheme's button TEXT colour, which is chosen to sit
      on the fill: white on white on a light scheme, dark on dark on a dark
      one, a button with nothing on it. An outlined or ghost button is
      drawn in the colour its fill would have been (the scheme's --s-btn,
      or the text colour where a section names none), and Outline fills on
      hover the way a filled button looks at rest.
    */
    rules.push(
      buttonStyle === "ghost"
        ? `${unpainted}{background:transparent;color:var(--s-btn,currentColor);border-color:transparent;}`
        : `${unpainted}{background:transparent;color:var(--s-btn,currentColor);border:1px solid var(--s-btn,currentColor);}`,
      buttonStyle === "ghost"
        ? `${unpaintedHover}{background:color-mix(in srgb,var(--s-btn,currentColor) 10%,transparent);color:var(--s-btn,currentColor);}`
        : `${unpaintedHover}{background:var(--s-btn,currentColor);color:var(--s-btn-text,#fff);border-color:var(--s-btn,currentColor);}`,
    )
  }

  rules.push(...parityRules(t, root))

  // ── Motion ──────────────────────────────────────────────────────────────
  /**
   * SECTIONS ARRIVE AS THEY SCROLL INTO VIEW, NOT AS THE PAGE LOADS.
   *
   * This was a CSS animation on every section after the first, played the
   * moment the page loaded: on a long page it had finished long before
   * anybody scrolled to the sections it was for. The movement is now
   * lib/website-builder/section-motion.ts, which marks only the sections
   * wholly below the screen `data-reveal="pending"` once it is running and
   * brings each in as it arrives. The header, the footer and the first
   * section never move, as before. All the stylesheet has to say is what
   * pending looks like, so without JavaScript nothing is ever hidden.
   *
   * And where a section lands when the browser jumps to it on its own (a
   * hash in the address, focus moving into it): under the sticky header,
   * by the height the same file measures.
   */
  rules.push(
    `${root} [data-section-box],${root} [data-section-box] [id]{scroll-margin-top:var(--sl-anchor-offset,0px);}`,
    `${root} [data-reveal="pending"]{opacity:0;}`,
    /*
      PICTURES ARRIVE (lib/website-builder/media-pass.ts, media-fade.ts):
      faded from nothing once loaded, and only once the page's script is
      running (data-sl-fade), so without it nothing is ever hidden.
    */
    `${root}[data-sl-fade] [data-sl-media]:not([data-sl-loaded]){opacity:0;}`,
    `${root} [data-sl-media]{transition:opacity .45s cubic-bezier(.2,.7,.2,1);}`,
    // Somebody who has asked their system for less motion has asked.
    `@media (prefers-reduced-motion:reduce){${root} [data-reveal]{opacity:1;}${root} [data-sl-media]{transition:none;}}`,
  )

  return rules.join("\n")
}

/**
 * ===========================================================================
 *  THE SOCIAL ICONS' LOOK: ONE RULE FOR THE PAGE, THE THEME CARDS AND DESIGN
 * ===========================================================================
 * The owner: "social media icon styles (solid, outline, glass, brand colours,
 * one colour) must apply correctly and consistently to every social icon in
 * every block and theme". Each surface drew its own:
 *
 *   Glass        the Design tab's sample was a frosted tile; the page drew
 *                the bare mark with nothing behind it (saved as "minimal").
 *   Solid, Outline  a tint written as `${colour}20`, which is a colour only
 *                when the colour is six digit hex: a theme's #fff or an
 *                rgba() drew no tile and no ring at all.
 *   a skin       its own tiles won over the creator's choice even after Design
 *                (lib/onepage/skin-own raises inline values; the shape was a
 *                class, so it was never raised).
 *
 * Now the tile is worked out here, entirely as inline values (size, corners,
 * fill, ring, blur, shadow, mark colour), and the social row, the theme cards
 * and the Design tab's samples all draw it from here.
 */
import type { CSSProperties } from "react"

export type SocialIconStyle = "filled" | "outline" | "minimal"
export type SocialIconTone = "brand" | "mono"

type SocialThemeLike = {
  social_icon_style?: string | null
  social_icon_color?: string | null
  social_icon_tone?: string | null
  text_color?: string | null
}

/** Solid ("filled", and anything unknown), Outline, or Glass (saved as "minimal"). */
export function socialIconStyleOf(theme: SocialThemeLike | null | undefined): SocialIconStyle {
  const s = theme?.social_icon_style
  return s === "outline" || s === "minimal" ? s : "filled"
}

/** Brand colours, or one colour. A page saved before the choice has none and stays one colour. */
export function socialIconToneOf(theme: SocialThemeLike | null | undefined): SocialIconTone {
  return theme?.social_icon_tone === "brand" ? "brand" : "mono"
}

/** The icon colour: Design › Social icons › Icon colour, else the page's words. */
export function socialIconColorOf(theme: SocialThemeLike | null | undefined): string {
  const c = theme?.social_icon_color
  return (typeof c === "string" && c.trim()) || theme?.text_color || "#111111"
}

/** Whether the page's own ground reads as light (a photo or video counts as dark). components/onepage/public-onepage pageIsLight is this. */
export function pageGroundIsLight(theme: { background_type?: string | null; background_color?: string | null; background_gradient?: string | null }): boolean {
  if (theme.background_type === "image" || theme.background_type === "video") return false
  const src = theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color || "#ffffff"
  const hexes = src.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)
  if (!hexes) return true
  const lum = hexes.map((h) => {
    let x = h.slice(1)
    if (x.length === 3) x = x.split("").map((c) => c + c).join("")
    return (0.299 * parseInt(x.slice(0, 2), 16) + 0.587 * parseInt(x.slice(2, 4), 16) + 0.114 * parseInt(x.slice(4, 6), 16)) / 255
  })
  return lum.reduce((a, b) => a + b, 0) / lum.length > 0.6
}

/**
 * BRAND COLOURS ON SOLID IS THE WHITE DISC. Each mark in its own colours (the
 * Instagram gradient, YouTube's red, TikTok's cyan and red) on a white circle,
 * as the owner's reference draws them. A mark that is black (X, Threads,
 * GitHub, TikTok's note) is near black on the disc whatever the icon colour,
 * since a white icon colour would vanish on white.
 */
export function socialIsBrandDisc(theme: SocialThemeLike | null | undefined): boolean {
  return socialIconToneOf(theme) === "brand" && socialIconStyleOf(theme) === "filled"
}

/** The ink a mark is drawn in: near black on the white disc, else the icon colour. */
export const BRAND_DISC_INK = "#111113"
export function socialMarkColorOf(theme: SocialThemeLike | null | undefined): string {
  return socialIsBrandDisc(theme) ? BRAND_DISC_INK : socialIconColorOf(theme)
}

/** `colour` at `percent`, whatever form it was saved in. */
const tint = (colour: string, percent: number) => `color-mix(in srgb, ${colour} ${percent}%, transparent)`

/**
 * The tile behind one mark, for a page whose ground is light (`onLight`) or not. `size` is the tile's side in px
 * (left out, the caller's classes size it).
 *   Solid    a 12.5% tint of the icon colour (what `${colour}20` drew when it drew at all)
 *   Outline  a 2px ring of the icon colour at 25% (`${colour}40`)
 *   Glass    frosted: white over the page, blurred, with a hairline ring
 *   Solid in brand colours: the white disc (socialIsBrandDisc), a hairline and
 *            a soft shadow on a light page so white still reads on white
 */
export function socialTileStyle(theme: SocialThemeLike | null | undefined, { onLight, size }: { onLight: boolean; size?: number }): CSSProperties {
  const style = socialIconStyleOf(theme)
  const colour = socialIconColorOf(theme)
  const base: CSSProperties = {
    ...(size ? { width: size, height: size } : {}),
    borderRadius: 999,
    borderStyle: "solid",
    color: colour,
    boxShadow: "none",
  }
  if (style === "filled" && socialIconToneOf(theme) === "brand")
    return {
      ...base,
      color: BRAND_DISC_INK,
      backgroundColor: "#ffffff",
      borderWidth: 0,
      borderColor: "transparent",
      boxShadow: onLight ? "0 0 0 1px rgba(17, 17, 19, 0.08), 0 1px 3px rgba(17, 17, 19, 0.08)" : "0 1px 3px rgba(0, 0, 0, 0.18)",
    }
  if (style === "outline") return { ...base, backgroundColor: "transparent", borderWidth: 2, borderColor: tint(colour, 25) }
  if (style === "minimal")
    return {
      ...base,
      backgroundColor: onLight ? "rgba(255, 255, 255, 0.62)" : "rgba(255, 255, 255, 0.14)",
      borderWidth: 1,
      borderColor: onLight ? tint(colour, 12) : "rgba(255, 255, 255, 0.22)",
      backdropFilter: "blur(12px) saturate(1.4)",
      WebkitBackdropFilter: "blur(12px) saturate(1.4)",
      boxShadow: onLight ? "0 1px 2px rgba(17, 17, 19, 0.06)" : "none",
    }
  return { ...base, backgroundColor: tint(colour, 12.5), borderWidth: 0, borderColor: "transparent" }
}

/* ─── A block's brand mark (round 3) ──────────────────────────────────── */

/**
 * THE SAME CHOICE FOR A BLOCK'S MARK. The owner: "the Instagram block shows
 * only the purple pink icon; let the creator choose the block's icon style".
 * Saved per block as style.presentation.icon_look (lib/onepage/block-
 * presentation), and drawn by components/onepage/block-mark wherever a block
 * shows a service's mark: the app blocks (Instagram, TikTok, YouTube...), a
 * link with a brand icon, and the followers block.
 *
 *   original  the block's own drawing: the app's coloured tile, a link's mark
 *             in the button's words, as before this choice existed
 *   solid     the social row's Solid: a 12.5% tint behind a one colour mark
 *   outline   the social row's Outline: a ring at 25% round a one colour mark
 *   glass     the social row's Glass: frosted, the mark in its own colours
 *
 * One colour is the colour of the words where the mark sits (currentColor),
 * so a mark inside a dark button is the button's words and one on the page
 * is the page's, with nothing to pick twice.
 */
export const BLOCK_ICON_LOOKS = ["original", "solid", "outline", "glass"] as const
export type BlockIconLook = (typeof BLOCK_ICON_LOOKS)[number]

export function blockIconLookOf(value: unknown): BlockIconLook {
  return (BLOCK_ICON_LOOKS as readonly unknown[]).includes(value) ? (value as BlockIconLook) : "original"
}

/** The tile, and the mark's tone, for a chosen look other than Original. */
export function blockMarkLook(look: Exclude<BlockIconLook, "original">, size?: number): { tile: CSSProperties; tone: SocialIconTone } {
  const colour = "currentColor"
  const base: CSSProperties = { ...(size ? { width: size, height: size } : {}), borderRadius: 999, borderStyle: "solid", boxShadow: "none" }
  if (look === "outline") return { tone: "mono", tile: { ...base, backgroundColor: "transparent", borderWidth: 2, borderColor: tint(colour, 25) } }
  if (look === "glass")
    return {
      tone: "brand",
      tile: {
        ...base,
        backgroundColor: tint(colour, 8),
        borderWidth: 1,
        borderColor: tint(colour, 16),
        backdropFilter: "blur(12px) saturate(1.4)",
        WebkitBackdropFilter: "blur(12px) saturate(1.4)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.22)",
      },
    }
  return { tone: "mono", tile: { ...base, backgroundColor: tint(colour, 12.5), borderWidth: 0, borderColor: "transparent" } }
}

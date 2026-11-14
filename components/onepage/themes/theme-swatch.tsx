/**
 * ===========================================================================
 *  A THEME CARD IS A SWATCH OF THE THEME: ITS WALLPAPER, ITS NAME'S FACE, ITS BUTTON
 * ===========================================================================
 * The owner: "get rid of our current ones that fetch buttons randomly or
 * actual profile avatar", "make the theme preview cards more smooth and
 * clean", "when I hover over a theme, make sure it doesn't bump".
 *
 * The card used to be the creator's whole page at a card's scale: a photo,
 * a bio, socials, links, a product and a newsletter, sixty times over. At
 * 150px wide that is noise, every card moved under the pointer (the theme's
 * own hover played on its buttons), and two themes with the same links
 * looked alike. A card now shows the three things a theme is:
 *
 *   the wallpaper   the page's own layers (the colour, gradient or photo,
 *                   its noise, its pattern, a skin's scene), laid out at a
 *                   phone's width so a pattern's cells and a scene's pieces
 *                   are the size the page draws them
 *   the name        "Aa" in the theme's title face, weight, case, spacing
 *                   and colour (lib/onepage/header-style titleTypeStyle)
 *   the button      one button, drawn by the page's own button style
 *                   (lib/onepage/button-style themeButtonStyle): its fill,
 *                   outline or glass, its corners, border and shadow, hard
 *                   ones included, with the theme's skin on it. It is shown
 *                   close up and runs off the card's edge, so the corner and
 *                   the border are large enough to read
 *
 * A theme with a cover picture keeps the cover as a band across the top.
 * Nothing on a card answers the pointer (pointer-events: none on the whole
 * swatch), so no hover of the theme's can play and nothing moves. The same
 * card is drawn for every creator: it asks for no account and no picture of
 * theirs.
 *
 * scripts/check-onepage-theme-swatches.mjs draws every card in a browser
 * and measures them.
 */
import type * as React from "react"
import { WallpaperNoise, WallpaperPattern } from "@/components/onepage/wallpaper-layers"
import { ThemeSkinScene } from "@/components/onepage/themes/theme-skin-scene"
import { skinRootProps, skinSceneOf, skinVars } from "@/lib/onepage/theme-skin"
import { PILL_FROM, buttonFill, buttonShadow, themeButtonStyle, type ButtonThemeLike } from "@/lib/onepage/button-style"
import { titleTypeStyle } from "@/lib/onepage/header-style"
import { coverImageOf } from "@/lib/onepage/theme-layout"
import { fontStack } from "@/lib/onepage/fonts"
import { readableTheme } from "@/lib/onepage/contrast"

type Look = Record<string, any>

/** The phone page's width, which the swatch's wallpaper is laid out at. */
export const SWATCH_WIDTH = 390
/** A card is 4:5. */
export const SWATCH_HEIGHT = 488
/** A skin's scene is made for a phone's screen (390 by 844); the card shows its top. */
const SCREEN_HEIGHT = 844
/** How much larger than on the page the button is drawn: the card is about 0.4 of the page, so the button reads at about its real size. */
export const SWATCH_ZOOM = 2.2
/** The letters every card sets in its theme's title face. */
export const SWATCH_LETTERS = "Aa"

/** The button's shadow at the swatch's zoom: the page's four (lib/onepage/button-style buttonShadowCss), each length times the zoom. */
function zoomedShadow(theme: ButtonThemeLike): string {
  const color = (theme.button_shadow_color as string) || "#000000"
  const z = SWATCH_ZOOM
  const ink = (pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`
  switch (buttonShadow(theme)) {
    case "subtle":
      return `0 ${2 * z}px ${4 * z}px ${ink(15)}`
    case "strong":
      return `0 ${4 * z}px ${12 * z}px ${ink(30)}`
    case "hard":
      return `${4 * z}px ${4 * z}px 0 ${ink(90)}`
    default:
      return "none"
  }
}

/** The page's button style with every length at the swatch's zoom. A pill stays a pill. */
export function swatchButtonStyle(theme: ButtonThemeLike): React.CSSProperties {
  const radius = Number(theme.button_border_radius ?? 8)
  const style = themeButtonStyle(theme)
  const width = Number.parseFloat(String(style.borderWidth)) || 0
  return {
    ...style,
    borderRadius: radius >= PILL_FROM ? 9999 : Math.max(0, radius) * SWATCH_ZOOM,
    borderWidth: width * SWATCH_ZOOM,
    boxShadow: zoomedShadow(theme),
    backdropFilter: buttonFill(theme) === "glass" ? "blur(14px)" : undefined,
  }
}

/** `thumb` is the address of a theme's own picture (its wallpaper photo or cover) at a card's size. */
export function ThemeSwatch({ c: given, thumb }: { c: Look; thumb: (url: string) => string }) {
  /* The colours the page will really draw (lib/onepage/contrast readableTheme). */
  const c = readableTheme(given)
  const bg: string = c.background_color || "#ffffff"
  const text: string = c.text_color || "#111111"
  const image = c.background_type === "image" && c.background_image_url ? (c.background_image_url as string) : null
  const paint = c.background_type === "gradient" && c.background_gradient ? c.background_gradient : bg
  const cover = c.header_layout === "hero" ? null : coverImageOf(c)
  const theme = c as ButtonThemeLike
  /* A skin's scene keeps the screen's height it was made for; a plain wallpaper is spread over the card, so a gradient shows whole. */
  const wallHeight = skinSceneOf(c) ? SCREEN_HEIGHT : SWATCH_HEIGHT
  const coverHeight = cover ? 112 : 0
  return (
    <span
      data-ts-page=""
      aria-hidden
      {...skinRootProps(c)}
      className="pointer-events-none absolute left-0 top-0 block origin-top-left select-none overflow-hidden text-left [-webkit-touch-callout:none]"
      style={{
        ...skinVars(c),
        width: SWATCH_WIDTH,
        height: SWATCH_HEIGHT,
        transform: "scale(var(--tp-scale, 0.42))",
        background: bg,
        color: text,
        fontFamily: fontStack(c.font_family),
      }}
    >
      <span data-ts-wall="" className="absolute left-0 top-0 block w-full" style={{ height: wallHeight, background: image ? bg : paint }}>
        {image ? (
          <img src={thumb(image)} alt="" draggable={false} loading="eager" decoding="sync" data-theme-thumb="" className="absolute inset-0 h-full w-full object-cover" style={c.image_brightness && c.image_brightness !== 100 ? { filter: `brightness(${c.image_brightness}%)` } : undefined} />
        ) : null}
        {(image && c.image_noise) || (c.background_type === "gradient" && c.gradient_noise) ? <WallpaperNoise strength={c.noise_strength} /> : null}
        <ThemeSkinScene theme={c} />
        <WallpaperPattern theme={c} />
      </span>
      {cover ? (
        <span data-ts-cover="" className="absolute left-0 top-0 block w-full overflow-hidden" style={{ height: coverHeight, backgroundColor: `color-mix(in srgb, ${text} 8%, ${bg})` }}>
          <img src={thumb(cover)} alt="" draggable={false} loading="eager" decoding="sync" data-theme-cover="" className="absolute inset-0 h-full w-full object-cover" />
        </span>
      ) : null}
      <span
        data-ts-name=""
        className="absolute block whitespace-nowrap font-bold"
        style={{
          top: cover ? coverHeight + 22 : 34,
          left: 40,
          fontSize: 104,
          lineHeight: 1,
          color: c.title_color || text,
          fontFamily: fontStack(c.title_font || c.font_family),
          ...titleTypeStyle(c as never),
        }}
      >
        {SWATCH_LETTERS}
      </span>
      {/*
        The button: the page's .op-btn, so a skin's material is on it, close
        up and running off the card's right edge. .op-btn is position:
        relative (app/globals.css), so the place is its holder's.
      */}
      <span data-ts-button-place="" className="absolute block" style={{ left: 40, bottom: 52, width: SWATCH_WIDTH, height: 132 }}>
        <span data-ts-button="" data-shadow={buttonShadow(theme)} className="op-btn block h-full w-full" style={swatchButtonStyle(theme)} />
      </span>
    </span>
  )
}

/**
 * ===========================================================================
 *  A THEME CARD IS THE THEME'S PAGE, DRAWN PLAINLY, IN ITS OWN LAYOUT
 * ===========================================================================
 * Round 17, the owner: the cards were "too much like Linktree", make them
 * "better, more modern, more clean, smooth", and "make clear the difference
 * in themes, which one is profile image layout Classic and which is Hero fade".
 *
 * The round before drew a swatch: the wallpaper, "Aa" and one button running
 * off the card's edge, which is how another product draws its picker. A card
 * is now a small page, drawn plainly, in the layout the theme gives a page:
 *
 *   Classic   a profile disc (a tint, no face; the theme's own avatar shape
 *             and ring, lib/onepage/header-style avatarLook), "Aa" under it
 *             in the theme's title face, weight, case and colour, then two of
 *             the theme's buttons (lib/onepage/button-style). Set left or
 *             centred, as the theme sets its header. A theme with a cover
 *             draws the cover as a band, the disc on its edge, as the page does.
 *   Hero      the top half is a picture that fades into the wallpaper
 *             (the page's own HERO_FADE_MASK), "Aa" on the fade, then the
 *             buttons: the shape a Hero page has. The picture is a real portrait,
 *             so a Hero card reads as a Hero without a label.
 *
 * The wallpaper is the page's own layers (its colour, gradient or photo,
 * noise, pattern, a skin's scene) at a phone's width, so a pattern's cells
 * and a scene's pieces are the size the page draws them. The buttons are the
 * page's .op-btn, so a skin's material is on them. Nothing answers the
 * pointer (no hover plays, nothing moves); it asks for no account and no
 * picture of the creator's, so every creator sees the same card.
 *
 * scripts/check-onepage-theme-swatches.mjs draws every card in a browser
 * and measures them.
 */
import type * as React from "react"
import { WallpaperNoise, WallpaperPattern } from "@/components/onepage/wallpaper-layers"
import { ThemeSkinScene } from "@/components/onepage/themes/theme-skin-scene"
import { skinRootProps, skinSceneOf, skinVars } from "@/lib/onepage/theme-skin"
import { PILL_FROM, buttonFill, buttonShadow, themeButtonStyle, type ButtonThemeLike } from "@/lib/onepage/button-style"
import { avatarLook, titleTypeStyle } from "@/lib/onepage/header-style"
import { coverImageOf, headerAlignOf } from "@/lib/onepage/theme-layout"
import { fontStack } from "@/lib/onepage/fonts"
import { readableTheme } from "@/lib/onepage/contrast"
import { HERO_FADE_MASK } from "@/lib/onepage/poster-video"

type Look = Record<string, any>

/** The phone page's width, which the card is laid out at. */
export const SWATCH_WIDTH = 390
/** A card is 4:5. */
export const SWATCH_HEIGHT = 488
/** A skin's scene is made for a phone's screen (390 by 844); the card shows its top. */
const SCREEN_HEIGHT = 844
/** The buttons are drawn a little larger than the page's, so a corner and a border read at a card's size. */
export const SWATCH_ZOOM = 1.35
/** The letters every card sets in its theme's title face. */
export const SWATCH_LETTERS = "Aa"
/** The card's side margin. */
const SIDE = 34

/** Does this theme give a page the Hero (the picture full bleed, fading into the page)? */
export function themeIsHero(template: { profile_layout?: unknown; theme_config?: { header_layout?: unknown } } | null | undefined): boolean {
  return template?.profile_layout === "hero" || template?.theme_config?.header_layout === "hero"
}

/** The button's shadow at the card's zoom: the page's four (lib/onepage/button-style buttonShadowCss), each length times the zoom. */
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

/** The page's button style with every length at the card's zoom. A pill stays a pill. */
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

/** The portrait every Hero card shows, in place of the creator's photo (the same picture on every card, so the themes are what differs). */
/* Unsplash photo-1544005313-94ddf0286df2 (Unsplash License), kept in public/images so it is served with the app. */
export const HERO_SAMPLE_PHOTO = "/images/onepage/hero-sample.jpg"

/** `thumb` is the address of a theme's own picture (its wallpaper photo or cover) at a card's size. `hero` draws the Hero layout. */
export function ThemeSwatch({ c: given, thumb, hero = false }: { c: Look; thumb: (url: string) => string; hero?: boolean }) {
  /* The colours the page will really draw (lib/onepage/contrast readableTheme). */
  const c = readableTheme(given)
  const bg: string = c.background_color || "#ffffff"
  const text: string = c.text_color || "#111111"
  const image = c.background_type === "image" && c.background_image_url ? (c.background_image_url as string) : null
  const paint = c.background_type === "gradient" && c.background_gradient ? c.background_gradient : bg
  const cover = hero ? null : coverImageOf(c)
  const left = !hero && headerAlignOf(c) === "left"
  const theme = c as ButtonThemeLike
  const look = avatarLook(c as never, false)
  /* A skin's scene keeps the screen's height it was made for; a plain wallpaper is spread over the card, so a gradient shows whole. */
  const wallHeight = skinSceneOf(c) ? SCREEN_HEIGHT : SWATCH_HEIGHT

  /* Where things sit, at the page's 390px. */
  const DISC = 104
  const coverH = cover ? 118 : 0
  const discTop = cover ? coverH - DISC / 2 : 40
  const nameTop = hero ? 236 : discTop + DISC + 18
  const BUTTON_H = hero ? 60 : 62
  const firstButton = hero ? 326 : nameTop + 86
  const button = swatchButtonStyle(theme)
  const name: React.CSSProperties = {
    color: c.title_color || text,
    fontFamily: fontStack(c.title_font || c.font_family),
    ...titleTypeStyle(c as never),
    /* On the Hero's photo the words carry a halo of the page's own colour, as the live page's do. */
    ...(hero ? { textShadow: `0 2px 18px ${bg}, 0 0 3px ${bg}` } : null),
  }

  return (
    <span
      data-ts-page=""
      data-ts-layout={hero ? "hero" : "classic"}
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

      {hero ? (
        /*
          The Hero: a real photo full bleed, fading into the wallpaper with the
          page's own HERO_FADE_MASK. The owner: show "that it's a hero instead of
          displaying the pill shape" and make it "more realistic". A blurred
          figure in the theme's tones read as a placeholder; a portrait reads
          as the page a creator's photo makes.
        */
        <span data-ts-hero="" className="absolute left-0 top-0 block w-full overflow-hidden" style={{ height: 330, maskImage: HERO_FADE_MASK, WebkitMaskImage: HERO_FADE_MASK, backgroundColor: `color-mix(in srgb, ${text} 14%, ${bg})` }}>
          <img src={thumb(HERO_SAMPLE_PHOTO)} alt="" draggable={false} loading="eager" decoding="async" data-ts-hero-photo="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 22%" }} />
        </span>
      ) : null}

      {cover ? (
        <span data-ts-cover="" className="absolute left-0 top-0 block w-full overflow-hidden" style={{ height: coverH, backgroundColor: `color-mix(in srgb, ${text} 8%, ${bg})` }}>
          <img src={thumb(cover)} alt="" draggable={false} loading="eager" decoding="sync" data-theme-cover="" className="absolute inset-0 h-full w-full object-cover" />
        </span>
      ) : null}

      {hero ? null : (
        /* The profile disc: a tint in the theme's avatar shape and ring, no face. */
        <span
          data-ts-disc=""
          className="absolute block"
          style={{
            top: discTop,
            left: left ? SIDE : (SWATCH_WIDTH - DISC) / 2,
            width: DISC,
            height: DISC,
            borderRadius: look.radius,
            borderStyle: "solid",
            borderWidth: Math.max(look.borderWidth, cover ? 4 : 0),
            borderColor: cover ? bg : look.borderColor,
            background: `linear-gradient(160deg, color-mix(in srgb, ${text} 24%, ${bg}) 0%, color-mix(in srgb, ${text} 12%, ${bg}) 100%)`,
          }}
        />
      )}

      <span
        data-ts-name=""
        className="absolute block whitespace-nowrap font-bold"
        style={{ top: nameTop, left: left ? SIDE : 0, right: left ? undefined : 0, textAlign: left ? "left" : "center", fontSize: 66, lineHeight: 1, ...name }}
      >
        {SWATCH_LETTERS}
      </span>

      {/* Two of the theme's buttons: the page's .op-btn, so a skin's material is on them. Each in a holder, since .op-btn is position: relative. */}
      {[0, 1].map((i) => (
        <span key={i} data-ts-button-place="" className="absolute block" style={{ left: SIDE, right: SIDE, top: firstButton + i * (BUTTON_H + 16), height: BUTTON_H }}>
          <span data-ts-button="" data-shadow={buttonShadow(theme)} className="op-btn block h-full w-full" style={button} />
        </span>
      ))}
    </span>
  )
}

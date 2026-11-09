/**
 * ===========================================================================
 *  A THEME CARD IS THE TOP OF THE PAGE THE THEME MAKES, AT A CARD'S SCALE
 * ===========================================================================
 * Round AP. The owner: "fix the themes previews so they're actually correct,
 * because some of them are completely fucked, such as the folio", "the
 * ledger as well, text underlaps very bad".
 *
 * The cards were drawn at a card's size from numbers picked for a card: a
 * 34px avatar, a 14px name, rows 14 to 20px tall, all in a column the card's
 * height held. A theme with a cover and products (Folio) asked that column
 * for more than it had, and the browser took the difference out of the one
 * thing allowed to give, the name, which was squeezed to a 5px sliver: the
 * tops of its letters, the garbage under the avatar. Ledger's four small
 * rows and its price list did the same to its name.
 *
 * Now the card is the phone's page itself, laid out at the phone's width
 * (390px, as the live page and the editor's preview draw it) with the live
 * page's own numbers: lib/onepage/header-style for the avatar's size, shape
 * and ring and the name's size, weight, spacing and case;
 * lib/onepage/button-style for every button's fill, words, corners, border,
 * shadow and size; lib/onepage/theme-layout for the blocks' layout, the gap
 * between them, the header's alignment, the cover and the products; the
 * wallpaper layers the page draws. Nothing is squeezed, because the page is
 * as tall as it is and the card simply shows its top, scaled down as one
 * picture (`--tp-scale`, measured once for the whole grid by the Design tab).
 *
 * It is plain markup, no state and no effects, and every card draws the same
 * small page (the theme's name, a bio, three social icons, three links and,
 * for a theme that lays products out its own way, two products ahead of
 * them), so the picker stays light. The small words (the bio, the labels)
 * are bars of their colour: at a card's scale they would be five pixel
 * letters, which read as noise. The name is real, in the theme's face.
 *
 * scripts/check-onepage-theme-previews.mjs draws every theme's live page
 * beside its card and compares them.
 */
import type * as React from "react"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { WallpaperNoise, WallpaperPattern } from "@/components/onepage/wallpaper-layers"
import { BUTTON_ICON_CLASS, BUTTON_ICON_INSET, BUTTON_SIZE_CLASS, buttonFill, buttonIconSide, buttonSize, buttonAlign, cardButtonTheme, cardRadius, buttonShape, themeButtonStripFill, themeButtonStyle, type ButtonThemeLike } from "@/lib/onepage/button-style"
import { avatarLook, titleSizeClass, titleTypeStyle } from "@/lib/onepage/header-style"
import { blockGapClass, blockLayoutOf, coverAspect, coverImageOf, headerAlignOf, themeProductLayoutOf } from "@/lib/onepage/theme-layout"
import { fontStack } from "@/lib/onepage/fonts"
import { readableOn } from "@/lib/onepage/theme-apply"
import { HERO_FADE_MASK } from "@/lib/onepage/poster-video"
import { cn } from "@/lib/utils"

type Look = Record<string, any>

/** The phone page's width, as the live page lays it out. */
export const PREVIEW_WIDTH = 390
/** A card is 4:5, so it shows the top 487.5px of that page. */
export const PREVIEW_HEIGHT = 487.5
/** The phone's screen, which the page's wallpaper fills (390 by 844). */
const SCREEN_HEIGHT = 844

/**
 * The live page's classes as a phone draws them. They carry `sm:` steps for
 * a wider screen, and `sm:` reads the window, not the card: in the editor
 * on a computer the card would take the computer's sizes. The phone's are kept.
 */
const phone = (cls: string) => cls.split(/\s+/).filter((c) => c && !/^(sm|md|lg|xl):/.test(c)).join(" ")

/** A line of small words, drawn as a bar of their colour, as wide as the words would be. */
function Words({ w, h, color, opacity = 0.85, className, style }: { w: number; h: number; color: string; opacity?: number; className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={cn("block shrink-0 rounded-full", className)} style={{ width: w, height: h, background: color, opacity, ...style }} />
}

/** A flat tint where the creator's photo goes (the avatar, a link's picture, a product's). */
const photoTint = (text: string, bg: string, share = 18) => `color-mix(in srgb, ${text} ${share}%, ${bg})`

const SOCIALS = ["instagram", "tiktok", "youtube"] as const
/* The words' widths at the page's sizes: "Latest work", "Book a session", "Newsletter" at 13px. */
const LINKS = [{ w: 76, picture: true }, { w: 96, picture: false }, { w: 68, picture: false }]

export function ThemePreview({ c, name, thumb }: { c: Look; name: string; thumb: (url: string) => string }) {
  const bg: string = c.background_color || "#ffffff"
  const text: string = c.text_color || "#111111"
  const secondary: string = c.secondary_text_color || `${text}cc`
  const image = c.background_type === "image" && c.background_image_url ? (c.background_image_url as string) : null
  const hero = c.header_layout === "hero"
  const cover = hero ? null : coverImageOf(c)
  const left = !hero && headerAlignOf(c) === "left"
  const look = avatarLook(c as never, false)
  const theme = c as ButtonThemeLike
  const size = buttonSize(theme)
  const button: React.CSSProperties = themeButtonStyle(theme)
  const ink = (c.button_text_color as string) || text
  const align = buttonAlign(theme)
  const iconSide = buttonIconSide(theme)
  const layout = blockLayoutOf(c)
  const products = themeProductLayoutOf(c)
  const socialStyle: string = c.social_icon_style || "filled"
  const socialColor: string = c.social_icon_color || text
  const titleFace = fontStack(c.title_font || c.font_family)
  const pagePaint = c.background_type === "gradient" && c.background_gradient ? c.background_gradient : bg
  /*
    Where the header ends, for the pattern to keep out from behind it, as
    the page's useHeaderClearance measures it: worked out here from the
    same numbers, since every card draws the same header.
  */
  const headerEnd = hero ? 351 + 70 : (cover ? (PREVIEW_WIDTH / coverAspect(c, false)) + look.size / 2 + 4 : 50 + look.size) + 12 + 44 + 12 + 23 + 16 + 49

  /* A link's picture: a tint of the button's words over what is behind them. */
  const linkPicture = photoTint(ink, buttonFill(theme) === "filled" ? (c.button_color as string) || bg : bg, 30)
  const labelRow = (w: number, withPicture: boolean, i: number) => (
    <span
      key={i}
      data-tp-link=""
      className={cn("relative flex w-full items-center font-medium", phone(BUTTON_SIZE_CLASS[size]), "justify-center")}
      style={button}
    >
      {withPicture ? <span className={cn(phone(BUTTON_ICON_CLASS[size]), "absolute shrink-0 rounded", phone(BUTTON_ICON_INSET[size][iconSide]))} style={{ background: linkPicture }} /> : null}
      <span className={cn("flex w-full min-w-0 flex-col", align === "left" ? "items-start" : "items-center", withPicture ? (align === "left" ? (iconSide === "left" ? "pl-12" : "pr-12") : "px-12") : "")}>
        {/* The label's line box (leading-tight at the button's size), the words as a bar in it. */}
        <span className="flex h-[1.25em] items-center"><Words w={w} h={6} color={ink} /></span>
      </span>
    </span>
  )

  /* The links, in the theme's layout, as lib/onepage/theme-layout and the page lay them out. */
  let links: React.ReactNode
  if (layout === "masonry") {
    /* Mixed: the page is two columns ([data-mixed-blocks]), the header full width and each link a half. */
    links = (
      <span className={cn("grid w-full grid-cols-2", phone(blockGapClass(c)))} data-tp-masonry="">
        {/* Each half a tile (app/globals.css, round AP): the icon over the words, the halves of a row one height. */}
        {LINKS.map((l, i) => (
          <span key={i} data-tp-link="" className={cn("flex w-full flex-col items-center justify-center gap-2 font-medium", phone(BUTTON_SIZE_CLASS[size]), "px-3")} style={button}>
            {l.picture ? <span className={cn(phone(BUTTON_ICON_CLASS[size]), "shrink-0 rounded")} style={{ background: linkPicture }} /> : null}
            <span className="flex h-[1.25em] items-center"><Words w={Math.min(l.w, 120)} h={6} color={ink} /></span>
          </span>
        ))}
      </span>
    )
  } else if (layout === "grid") {
    /* Two plain links to a row, each a tile (app/globals.css [data-link-tile]); the third alone, a full row. */
    links = (
      <>
        <span className="grid w-full grid-cols-2 gap-3" data-tp-pair="">
          {LINKS.slice(0, 2).map((l, i) => (
            <span key={i} data-tp-link="" className={cn("flex min-h-[96px] w-full flex-col items-center justify-center gap-[10px] px-3 py-4 font-medium", phone(BUTTON_SIZE_CLASS[size]).replace(/\bp[xy]-\S+/g, ""))} style={button}>
              {l.picture ? <span className={cn(phone(BUTTON_ICON_CLASS[size]), "shrink-0 rounded")} style={{ background: linkPicture }} /> : null}
              <span className="flex h-[1.25em] items-center"><Words w={Math.min(l.w, 120)} h={6} color={ink} /></span>
            </span>
          ))}
        </span>
        {labelRow(LINKS[2].w, false, 2)}
      </>
    )
  } else if (layout === "cards") {
    /* A link with a picture is a featured card: its picture large, its words on a strip under it. */
    const radius = buttonShape(theme.button_border_radius) === "pill" ? 28 : Number(theme.button_border_radius ?? 8)
    links = (
      <>
        <span data-tp-card="" className="block w-full overflow-hidden" style={{ ...button, borderRadius: radius, padding: 0 }}>
          <span className="block aspect-[2/1] w-full" style={{ borderRadius: `${radius}px ${radius}px 0 0`, background: linkPicture }} />
          <span className="flex w-full items-center justify-center px-5 py-3.5" style={{ backgroundColor: themeButtonStripFill(theme), height: 15 * 1.4 + 28 }}>
            <Words w={82} h={6.5} color={ink} />
          </span>
        </span>
        {LINKS.slice(1).map((l, i) => labelRow(l.w, false, i + 1))}
      </>
    )
  } else {
    links = LINKS.map((l, i) => labelRow(l.w, l.picture, i))
  }

  /* Products, for a theme that lays them out its own way (lib/onepage/product-block's tile and row). */
  let shelf: React.ReactNode = null
  if (products !== "own") {
    const surface = buttonFill(theme) === "filled" ? (theme.button_color as string) : bg
    const cardText = readableOn(surface, ink)
    const card: React.CSSProperties = { ...themeButtonStyle(theme), borderRadius: `${cardRadius(theme)}px`, color: undefined }
    const cta = themeButtonStyle(cardButtonTheme(theme, { surface, cardText }))
    const ctaInk = String(cta.color)
    const items = [{ title: 62, price: 46 }, { title: 76, price: 44 }]
    shelf = products === "grid" ? (
      <span className="grid w-full grid-cols-2 gap-3">
        {items.map((p, i) => (
          <span key={i} data-tp-product="tile" className="flex h-full flex-col overflow-hidden" style={card}>
            <span className="block aspect-square w-full" style={{ background: photoTint(cardText, surface, 22) }} />
            <span className="flex flex-1 flex-col gap-0.5 p-3">
              <span className="flex h-[1.375em] items-center text-[14.5px]"><Words w={p.title} h={7} color={cardText} /></span>
              <span className="flex h-[1.5em] items-center text-[13.5px]"><Words w={p.price} h={6} color={cardText} opacity={0.7} /></span>
              <span className="mt-auto pt-2.5">
                <span className="flex h-9 w-full items-center justify-center px-2" style={cta}><Words w={24} h={6} color={ctaInk} /></span>
              </span>
            </span>
          </span>
        ))}
      </span>
    ) : (
      <>
        {items.map((p, i) => (
          <span key={i} data-tp-product="row" className="block w-full overflow-hidden" style={card}>
            <span className="flex items-center gap-3 p-2.5">
              <span className="block h-12 w-12 shrink-0" style={{ background: photoTint(cardText, surface, 22) }} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex h-[1.5em] items-center text-[15px]"><Words w={p.title} h={7} color={cardText} /></span>
                <span className="flex h-[1.5em] items-center text-[13.5px]"><Words w={p.price} h={6} color={cardText} opacity={0.7} /></span>
              </span>
              <span className="flex h-9 shrink-0 items-center justify-center px-3.5" style={cta}><Words w={24} h={6} color={ctaInk} /></span>
            </span>
          </span>
        ))}
      </>
    )
  }

  const title = (
    <span
      data-tp-title=""
      className={cn("block max-w-full whitespace-nowrap font-bold leading-[1.5]", phone(titleSizeClass(c as never, hero, false)))}
      style={{ color: c.title_color || text, fontFamily: titleFace, textShadow: hero ? "0 2px 8px rgba(0,0,0,0.4)" : undefined, ...titleTypeStyle(c as never) }}
    >
      {name}
    </span>
  )
  /* "Prints, posters and a newsletter" at the bio's 14px, a line of leading-relaxed. */
  const bio = <span className="flex h-[22.75px] items-center"><Words w={212} h={7} color={secondary} opacity={0.75} /></span>

  return (
    <span
      data-tp-page=""
      aria-hidden
      className="absolute left-0 top-0 block origin-top-left overflow-hidden text-left"
      style={{
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        transform: "scale(var(--tp-scale, 0.42))",
        background: bg,
        fontFamily: fontStack(c.font_family),
        lineHeight: 1.5,
        ["--op-pattern-clear" as string]: `${Math.round(headerEnd)}px`,
      }}
    >
      {/*
        The wallpaper is as tall as a phone's screen, as the page's is (its
        box is min-h-screen): a photo or a gradient is spread over 844px and
        the card shows its top, rather than squeezed into the card's height.
      */}
      <span className="absolute left-0 top-0 block w-full" style={{ height: SCREEN_HEIGHT, background: image ? bg : pagePaint }}>
        {image ? (
          <img src={thumb(image)} alt="" draggable={false} loading="eager" decoding="sync" data-theme-thumb="" className="absolute inset-0 h-full w-full object-cover" style={c.image_brightness && c.image_brightness !== 100 ? { filter: `brightness(${c.image_brightness}%)` } : undefined} />
        ) : null}
        {(image && c.image_noise) || (c.background_type === "gradient" && c.gradient_noise) ? <WallpaperNoise strength={c.noise_strength} /> : null}
        <WallpaperPattern theme={c} clearHeader />
      </span>
      <span className="relative flex w-full flex-col px-5 pb-5" style={{ paddingTop: hero || cover ? 0 : 50 }}>
        <span className={cn("flex flex-col items-center", phone(blockGapClass(c)))}>
          {hero ? (
            <span className="relative -mx-5 -mt-8 mb-2 block w-[calc(100%+40px)]" data-tp-header="hero">
              <span className="relative block w-full overflow-hidden" style={{ aspectRatio: "10/9", maskImage: HERO_FADE_MASK, WebkitMaskImage: HERO_FADE_MASK, background: photoTint(text, bg, 30) }} />
              <span className="absolute inset-x-0 bottom-4 z-[1] flex flex-col items-center px-6 text-center">
                {title}
                <span className="mt-2 flex h-[22.75px] items-center"><Words w={212} h={7} color={c.secondary_text_color || text} opacity={0.8} /></span>
              </span>
            </span>
          ) : (
            <span className={cn("flex w-full flex-col gap-3", left ? "items-start text-left" : "items-center text-center")} data-tp-header="">
              {cover ? (
                <span className="relative -mx-5 block w-[calc(100%+40px)]" style={{ marginBottom: `calc(${-(look.size / 2)}px - 0.75rem)` }}>
                  <span className="relative block w-full overflow-hidden" style={{ aspectRatio: String(coverAspect(c, false)), backgroundColor: `color-mix(in srgb, ${text} 8%, transparent)` }}>
                    <img src={thumb(cover)} alt="" draggable={false} loading="eager" decoding="sync" data-theme-cover="" className="absolute inset-0 h-full w-full object-cover" />
                  </span>
                </span>
              ) : null}
              <span
                data-tp-avatar=""
                data-theme-avatar=""
                className="relative block shrink-0 shadow-lg"
                style={{
                  width: look.size,
                  height: look.size,
                  borderRadius: look.radius,
                  borderStyle: "solid",
                  borderWidth: look.borderWidth,
                  borderColor: look.borderColor,
                  background: photoTint(text, bg),
                  boxShadow: cover && c.background_type === "solid" ? `0 0 0 4px ${bg}, 0 10px 15px -3px rgba(0,0,0,0.1)` : undefined,
                }}
              />
              {title}
              {bio}
            </span>
          )}
          <span className={cn("flex w-full items-center gap-2.5", left ? "justify-start" : "justify-center", hero ? "relative z-[1]" : "")} style={{ marginTop: hero ? -16 : 4, marginBottom: hero ? 20 : 3 }} data-tp-socials="">
            {SOCIALS.map((p) => (
              <span
                key={p}
                className={cn("flex items-center justify-center", socialStyle === "minimal" ? "p-2.5" : "h-[42px] w-[42px] rounded-full", socialStyle === "outline" && "border-2")}
                style={{ backgroundColor: socialStyle === "filled" ? `${socialColor}20` : "transparent", borderColor: socialStyle === "outline" ? `${socialColor}40` : "transparent" }}
              >
                <span className="flex h-[20px] w-[20px] items-center justify-center [&>svg]:h-full [&>svg]:w-full">
                  <SocialIcon platform={p} size={20} color={socialColor} tone={c.social_icon_tone === "brand" ? "brand" : "mono"} />
                </span>
              </span>
            ))}
          </span>
          {shelf}
          {links}
        </span>
      </span>
    </span>
  )
}

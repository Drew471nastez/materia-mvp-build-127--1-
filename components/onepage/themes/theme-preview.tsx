/**
 * ===========================================================================
 *  A THEME CARD IS THE TOP OF THE PAGE THE THEME MAKES, AT A CARD'S SCALE
 * ===========================================================================
 * Round AP. The owner: "fix the themes previews so they're actually correct,
 * because some of them are completely fucked, such as the folio", "the
 * ledger as well, text underlaps very bad".
 *
 * The card is the phone's page itself, laid out at the phone's width (390px,
 * as the live page and the editor's preview draw it) with the live page's
 * own numbers: lib/onepage/header-style for the avatar's size, shape and
 * ring and the name's size, weight, spacing and case; lib/onepage/button-
 * style for every button's fill, words, corners, border, shadow and size;
 * lib/onepage/theme-layout for the blocks' layout, the gap between them, the
 * header's alignment, the cover and the products; lib/onepage/contrast for
 * the newsletter's card; the wallpaper layers the page draws. Nothing is
 * squeezed, because the page is as tall as it is and the card simply shows
 * its top, scaled down as one picture (`--tp-scale`, measured once for the
 * whole grid by the Design tab).
 *
 * ROUND AS: A REAL PAGE, NOT GREY LINES. The owner: "it has those lines in
 * the theme cards, which looks absolutely cheap", "show how it would look
 * using that theme with some creators ... real offers and real products and
 * newsletter and social icons". Every card is now a fictional creator's
 * page for its theme (./preview-content): their name, a line about them, a
 * drawn portrait, three socials in the theme's icon style, and the blocks a
 * creator really adds, with real words: a product with its price (the
 * page's callout, or the theme's rows or tiles), a booking link with a
 * picture, a newsletter, a plain link, each drawn the way the live page
 * draws that block. The creators arrive with the theme page
 * (./preview-content-loader); until then a card is the theme's colours and
 * header.
 *
 * It is plain markup, no effects, and the pictures are small drawings
 * passed as data addresses (one decode each, shared by every card that
 * draws the same one), so the picker stays light.
 *
 * scripts/check-onepage-theme-previews-as1.mjs draws the live page with the
 * same creator beside its card and compares them.
 */
import type * as React from "react"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { WallpaperNoise, WallpaperPattern } from "@/components/onepage/wallpaper-layers"
/* Round W9: a theme with a skin draws its material and scene here too (lib/onepage/theme-skin). */
import { ThemeSkinScene } from "@/components/onepage/themes/theme-skin-scene"
import { usePreviewContent } from "@/components/onepage/themes/preview-content-loader"
import type { PreviewCreator, Slot } from "@/components/onepage/themes/preview-content"
import { skinRootProps, skinVars } from "@/lib/onepage/theme-skin"
import { BUTTON_ICON_CLASS, BUTTON_ICON_INSET, BUTTON_SIZE_CLASS, buttonFill, buttonIconSide, buttonSize, buttonAlign, buttonThemeOn, cardButtonTheme, cardRadius, buttonShape, themeButtonStripFill, themeButtonStyle, type ButtonThemeLike } from "@/lib/onepage/button-style"
import { avatarLook, bioSizeClass, bioTypeStyle, titleSizeClass, titleTypeStyle } from "@/lib/onepage/header-style"
import { blockGapClass, blockLayoutOf, coverAspect, coverImageOf, headerAlignOf, themeProductLayoutOf } from "@/lib/onepage/theme-layout"
import { fontStack } from "@/lib/onepage/fonts"
import { readableOn } from "@/lib/onepage/theme-apply"
import { readableInk, readableTheme, signupCard } from "@/lib/onepage/contrast"
import { tintOf } from "@/lib/onepage/email-signup"
import { pageGroundIsLight, socialMarkColorOf, socialTileStyle } from "@/lib/onepage/social-look"
import { HERO_FADE_MASK } from "@/lib/onepage/poster-video"
import { cn } from "@/lib/utils"

type Look = Record<string, any>

/** The phone page's width, as the live page lays it out. */
export const PREVIEW_WIDTH = 390
/**
 * A card is 5:7 (round W8, was 4:5), so it shows the top 546px of that page:
 * the header and, for most themes, the first blocks whole.
 */
export const PREVIEW_HEIGHT = 546
/**
 * The page's top inset on the card. The live page keeps 50px clear for its
 * Share and Subscribe buttons, which a card does not draw; at a card's scale
 * that was an empty band over every header, so the card keeps 18.
 */
export const PREVIEW_TOP = 18
/** The phone's screen, which the page's wallpaper fills (390 by 844). */
const SCREEN_HEIGHT = 844

/**
 * The live page's classes as a phone draws them. They carry `sm:` steps for
 * a wider screen, and `sm:` reads the window, not the card: in the editor
 * on a computer the card would take the computer's sizes. The phone's are kept.
 */
const phone = (cls: string) => cls.split(/\s+/).filter((c) => c && !/^(sm|md|lg|xl):/.test(c)).join(" ")

/** A drawn picture where a photo goes. */
const pictureOf = (src: string): React.CSSProperties => ({ backgroundImage: `url("${src}")`, backgroundSize: "cover", backgroundPosition: "center" })

/** The blocks under the socials, in the order the layout shows best in a card's height. */
export function slotsFor(who: PreviewCreator, layout: string): readonly Slot[] {
  if (who.order) return who.order
  return layout === "grid" || layout === "masonry" ? ["link", "link2", "product", "news"] : ["link", "product", "news", "link2"]
}

/**
 * `id` and `kind` name the theme, whose creator the card draws. `name` (the
 * onboarding, round AQ) is the person's own name, and `photo` their own
 * picture, drawn where the page draws it (the avatar, or a Hero's band);
 * without them the creator's.
 */
export function ThemePreview({ c: given, id, kind, name = null, thumb, photo = null }: { c: Look; id: string; kind?: string | null; name?: string | null; thumb: (url: string) => string; photo?: string | null }) {
  const pack = usePreviewContent()
  const who = pack ? pack.creatorFor(id, kind) : null
  /* Round AR: the colours the page will really draw, made to read as the page makes them (lib/onepage/contrast readableTheme). */
  const c = readableTheme(given)
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
  /* The social icons as the page draws them (lib/onepage/social-look). */
  const socialColor: string = socialMarkColorOf(c as never)
  const pageLight = pageGroundIsLight(c as never)
  const titleFace = fontStack(c.title_font || c.font_family)
  const pagePaint = c.background_type === "gradient" && c.background_gradient ? c.background_gradient : bg
  const shownName = name ?? who?.name ?? ""
  const face = photo ?? (who && pack ? pack.faceUri(who.face) : null)
  const art = (a: Parameters<NonNullable<typeof pack>["artUri"]>[0]) => (who && pack ? pack.artUri(a, who.palette) : "")
  /*
    Where the header ends, for the pattern to keep out from behind it, as
    the page's useHeaderClearance measures it: worked out here from the
    same numbers, since every card draws the same header.
  */
  const headerEnd = hero ? 351 + 70 : (cover ? (PREVIEW_WIDTH / coverAspect(c, false)) + look.size / 2 + 4 : PREVIEW_TOP + look.size) + 12 + 44 + 12 + 23 + 16 + 49

  /* A link's label, as the page sets it (public-onepage labelText). */
  const label = (words: string, cls?: string) => (
    <span className={cn(align === "left" ? "text-left" : "text-center", "break-words whitespace-normal leading-tight", cls)} data-tp-label="" data-block-title="">{words}</span>
  )
  /* A link row: the page's button, its words, and a picture inside its edge when it has one (public-onepage, link_button). */
  const labelRow = (words: string, picture: string | null, key: string) => (
    <span
      key={key}
      data-tp-link=""
      className={cn("relative flex w-full items-center justify-center font-medium", phone(BUTTON_SIZE_CLASS[size]))}
      style={button}
    >
      {picture ? <span data-tp-photo="" className={cn(phone(BUTTON_ICON_CLASS[size]), "absolute shrink-0 rounded", phone(BUTTON_ICON_INSET[size][iconSide]))} style={pictureOf(picture)} /> : null}
      <span className={cn("flex w-full min-w-0 flex-col", align === "left" ? "items-start" : "items-center", picture ? (align === "left" ? (iconSide === "left" ? "pl-12" : "pr-12") : "px-12") : "")}>
        {label(words)}
      </span>
    </span>
  )
  /* A link that is a tile (the Grid's pairs and the Mixed tiles, app/globals.css [data-link-tile]): the picture over the words. */
  const tile = (words: string, picture: string | null, key: string, grid: boolean) => (
    <span
      key={key}
      data-tp-link=""
      className={cn("flex w-full flex-col items-center justify-center font-medium", grid ? "min-h-[96px] gap-[10px] px-3 py-4" : "gap-2 px-3", phone(BUTTON_SIZE_CLASS[size]).replace(grid ? /\bp[xy]-\S+/g : /\bpx-\S+/g, ""))}
      style={button}
    >
      {picture ? <span data-tp-photo="" className={cn(phone(BUTTON_ICON_CLASS[size]), "shrink-0 rounded")} style={pictureOf(picture)} /> : null}
      <span className="shrink-0 text-center leading-tight" data-tp-label="" data-block-title="">{words}</span>
    </span>
  )

  /* The product, in the theme's way: the page's callout, two rows, or two tiles (components/onepage/product-block). */
  const product = (key: string) => {
    if (!who) return null
    const surface = buttonFill(theme) === "filled" ? (theme.button_color as string) : bg
    const cardText = readableOn(surface, ink)
    const card: React.CSSProperties = { ...themeButtonStyle(theme), borderRadius: `${cardRadius(theme)}px`, color: undefined }
    const cta = themeButtonStyle(cardButtonTheme(theme, { surface, cardText }))
    const [one, two] = who.products
    if (products === "grid") {
      return (
        <span key={key} className="grid w-full grid-cols-2 gap-3">
          {[one, two].map((p, i) => (
            <span key={i} data-tp-product="tile" className="flex h-full flex-col overflow-hidden" style={card}>
              <span data-tp-photo="" className="block aspect-square w-full" style={pictureOf(art(p.art))} />
              <span className="flex flex-1 flex-col gap-0.5 p-3">
                <span className="line-clamp-2 text-[14.5px] font-semibold leading-snug" style={{ color: cardText }} data-block-title="">{p.title}</span>
                <span className="text-[13.5px] font-semibold tabular-nums opacity-85" style={{ color: cardText }}>{p.price}</span>
                <span className="mt-auto pt-2.5">
                  <span data-product-cta="" className="flex h-9 w-full items-center justify-center px-2 text-[13.5px] font-medium" style={cta}><span className="truncate">{who.cta}</span></span>
                </span>
              </span>
            </span>
          ))}
        </span>
      )
    }
    if (products === "rows") {
      return [one, two].map((p, i) => (
        <span key={`${key}${i}`} data-tp-product="row" className="block w-full overflow-hidden" style={card}>
          <span className="flex items-center gap-3 p-2.5">
            <span data-tp-photo="" className="block h-12 w-12 shrink-0" style={pictureOf(art(p.art))} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="block truncate text-[15px] font-medium" style={{ color: cardText }} data-block-title="">{p.title}</span>
              <span className="text-[13.5px] font-semibold tabular-nums opacity-80" style={{ color: cardText }}>{p.price}</span>
            </span>
            <span data-product-cta="" className="flex h-9 max-w-[45%] shrink-0 items-center justify-center px-3.5 text-[13.5px] font-medium" style={cta}><span className="truncate">{who.cta}</span></span>
          </span>
        </span>
      ))
    }
    return (
      <span key={key} data-tp-product="callout" className="block w-full overflow-hidden" style={card}>
        <span className="flex gap-3 p-3">
          <span data-tp-photo="" className="block h-14 w-14 shrink-0 rounded-lg" style={pictureOf(art(one.art))} />
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <span className="block truncate text-base font-medium" style={{ color: cardText }} data-block-title="">{one.title}</span>
            <span className="text-sm font-semibold tabular-nums" style={{ color: cardText }}>{one.price}</span>
          </span>
        </span>
        <span className="block px-3 pb-3">
          <span data-product-cta="" className="flex h-11 w-full items-center justify-center px-4 text-sm font-medium" style={cta}><span className="truncate">{who.cta}</span></span>
        </span>
      </span>
    )
  }

  /* The newsletter, as its Classic layout draws it (components/onepage/email-signup), on the card the page tints for it. */
  const newsletter = (key: string) => {
    if (!who) return null
    const signup = signupCard(c)
    const soft = c.secondary_text_color ? readableInk(c.secondary_text_color, signup.grounds) : signup.ink
    const send = themeButtonStyle(buttonThemeOn(theme, signup.grounds))
    return (
      <span key={key} data-email-layout="default" data-tp-news="" className="block w-full rounded-xl p-5" style={{ backgroundColor: tintOf(signup.tint, 5) }}>
        <span className="mb-1 block text-center text-base font-semibold leading-snug" style={{ color: signup.ink }}>{who.news.headline}</span>
        <span className="mb-4 block text-center text-xs leading-relaxed" style={{ color: soft }}>{who.news.desc}</span>
        <span data-email-form="row" className="flex flex-row items-stretch gap-2">
          <span className="flex min-h-[46px] min-w-0 flex-1 items-center bg-white/90 px-3 py-3 text-[16px]" style={{ borderRadius: send.borderRadius }}>
            <span className="truncate text-black/50">Your email</span>
          </span>
          <span data-product-cta="" className="flex shrink-0 items-center justify-center whitespace-nowrap px-4 py-3 text-sm font-medium" style={send}>{who.news.button}</span>
        </span>
      </span>
    )
  }

  /* The blocks, in their order, in the theme's layout (lib/onepage/theme-layout pairLinkTiles, mixedTileSizes, linkDrawnAsCard). */
  const blocks: React.ReactNode[] = []
  if (who) {
    const slots = slotsFor(who, layout)
    const linkPicture = art(who.link.art)
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      const next = slots[i + 1]
      if (s === "product") blocks.push(product("product"))
      else if (s === "news") blocks.push(newsletter("news"))
      else if ((layout === "grid" || layout === "masonry") && (s === "link" || s === "link2") && (next === "link" || next === "link2")) {
        /* Two links that follow one another: a pair of tiles. */
        const pair = [s, next].map((x) => (x === "link" ? { words: who.link.label, picture: linkPicture } : { words: who.link2, picture: null }))
        blocks.push(
          <span key={`pair${i}`} className="grid w-full grid-cols-2 gap-3" data-tp-pair={layout === "grid" ? "" : undefined} data-tp-masonry={layout === "masonry" ? "" : undefined}>
            {pair.map((p, j) => tile(p.words, p.picture, String(j), layout === "grid"))}
          </span>,
        )
        i++
      } else if (s === "link" && layout === "cards") {
        /* A link with a picture is a featured card: its picture large, its words on a strip under it. */
        const radius = buttonShape(theme.button_border_radius) === "pill" ? 28 : Number(theme.button_border_radius ?? 8)
        blocks.push(
          <span key="card" data-tp-card="" className="block w-full overflow-hidden" style={{ ...button, borderRadius: radius, padding: 0 }}>
            <span data-tp-photo="" className="block aspect-[2/1] w-full" style={{ borderRadius: `${radius}px ${radius}px 0 0`, ...pictureOf(linkPicture) }} />
            <span className="flex w-full items-center justify-center px-5 py-3.5 text-[15px] font-medium" style={{ backgroundColor: themeButtonStripFill(theme), color: ink }}>
              <span className="truncate">{who.link.label}</span>
            </span>
          </span>,
        )
      } else blocks.push(labelRow(s === "link" ? who.link.label : who.link2, s === "link" ? linkPicture : null, s))
    }
  }

  const title = (
    <span
      data-tp-title=""
      className={cn("block max-w-full font-bold leading-[1.5]", phone(titleSizeClass(c as never, hero, false)))}
      style={{ color: c.title_color || text, fontFamily: titleFace, textShadow: hero ? "0 2px 8px rgba(0,0,0,0.4)" : undefined, ...titleTypeStyle(c as never) }}
    >
      {shownName}
    </span>
  )
  const bio = who ? (
    <span data-tp-bio="" className={cn("block max-w-sm leading-relaxed", left ? "text-left" : "text-center", phone(bioSizeClass(c as never, hero, false)))} style={{ color: hero ? c.secondary_text_color || text : secondary, ...bioTypeStyle(c as never) }}>
      {who.bio}
    </span>
  ) : null

  return (
    <span
      data-tp-page=""
      aria-hidden
      {...skinRootProps(c)}
      className="absolute left-0 top-0 block origin-top-left overflow-hidden text-left"
      style={{
        ...skinVars(c),
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        transform: "scale(var(--tp-scale, 0.42))",
        background: bg,
        color: text,
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
        <ThemeSkinScene theme={c} />
        <WallpaperPattern theme={c} clearHeader />
      </span>
      {/*
        Round W8: the page is as tall as the card and no block is ever cut by
        its bottom edge. The header stays; the blocks under it are one column
        that wraps (flex-wrap in a column), so a block that would not fit
        whole moves to a second column out of sight, and the card ends on the
        last whole block, never on the top sliver of the next one.
      */}
      <span className="relative flex h-full w-full flex-col px-5 pb-2.5" style={{ paddingTop: hero || cover ? 0 : PREVIEW_TOP }}>
        <span className={cn("flex min-h-0 flex-1 flex-col items-center", phone(blockGapClass(c)))}>
          {hero ? (
            <span className="relative -mx-5 -mt-8 mb-2 block w-[calc(100%+40px)]" data-tp-header="hero">
              <span className="relative block w-full overflow-hidden" style={{ aspectRatio: "10/9", maskImage: HERO_FADE_MASK, WebkitMaskImage: HERO_FADE_MASK, background: `color-mix(in srgb, ${text} 18%, ${bg})` }}>
                {face ? <img src={face} alt="" draggable={false} decoding="async" data-tp-photo="" className="absolute inset-0 h-full w-full object-cover" /> : null}
              </span>
              <span className="absolute inset-x-0 bottom-4 z-[1] flex flex-col items-center gap-2 px-6 text-center">
                {title}
                {bio}
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
                  background: `color-mix(in srgb, ${text} 16%, ${bg})`,
                  boxShadow: cover && c.background_type === "solid" ? `0 0 0 4px ${bg}, 0 10px 15px -3px rgba(0,0,0,0.1)` : undefined,
                  overflow: face ? "hidden" : undefined,
                }}
              >
                {face ? <img src={face} alt="" draggable={false} decoding="async" data-tp-photo="" className="block h-full w-full object-cover" /> : null}
              </span>
              {title}
              {bio}
            </span>
          )}
          {/* Round AS: 24px wider than the column, so the -mx-3 px-3 that gives a hard shadow room leaves the blocks the page's own width (they were 326px, not 350). */}
          <span data-tp-blocks="" className={cn("flex min-h-0 w-[calc(100%+24px)] flex-1 flex-col flex-wrap content-start items-stretch overflow-hidden [&>*]:shrink-0", phone(blockGapClass(c)), "!gap-x-[200px] -mx-3 px-3 pb-1", hero ? "relative z-[1] -mt-4" : "mt-1")}>
            <span className={cn("flex w-full items-center gap-2.5", left ? "justify-start" : "justify-center")} style={{ marginBottom: hero ? 20 : 3 }} data-tp-socials="">
              {(who?.socials ?? ["instagram", "tiktok", "youtube"]).map((p) => (
                <span
                  key={p}
                  className="flex h-[42px] w-[42px] items-center justify-center"
                  style={socialTileStyle(c as never, { onLight: pageLight })}
                >
                  <span className="flex h-[20px] w-[20px] items-center justify-center [&>svg]:h-full [&>svg]:w-full">
                    <SocialIcon platform={p} size={20} color={socialColor} tone={c.social_icon_tone === "brand" ? "brand" : "mono"} />
                  </span>
                </span>
              ))}
            </span>
            {blocks}
          </span>
        </span>
      </span>
    </span>
  )
}

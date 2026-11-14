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
 * ROUND AT: THIS CREATOR'S OWN PAGE. The owner: "instead of adding those
 * cartoonish avatars, you can actually fetch ... the actual avatar and
 * profile of the creator", "the blocks and the buttons more accurate and
 * realistic". Every card draws the page the editor holds
 * (./preview-account): the creator's name and photo (or the page's
 * monogram), their bio and socials, their own links with thumbnails, their
 * own products with prices and pictures, and their newsletter, filled with
 * plain samples where the page has none yet. Each block is drawn the way
 * the live page draws it, with the page's own classes where the look lives
 * in them: a link is an .op-btn with the theme's look (its data-hover and
 * variables carry its layers). Nothing on a card can be selected.
 *
 * WAVE 15, the owner: "when I hover over the theme cards, they must not
 * hover the buttons inside them". The page takes no pointer
 * (pointer-events-none on its root) and the frames no longer carry op-demo,
 * so no button, product or card on it plays a hover; the card it sits in
 * lifts instead (design-tab ThemeCard, onboarding TemplateCard).
 *
 * scripts/check-onepage-theme-previews-as1.mjs draws the live page with the
 * same creator beside its card and compares them.
 */
import type * as React from "react"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { WallpaperNoise, WallpaperPattern } from "@/components/onepage/wallpaper-layers"
/* Round W9: a theme with a skin draws its material and scene here too (lib/onepage/theme-skin). */
import { ThemeSkinScene } from "@/components/onepage/themes/theme-skin-scene"
import type { PreviewAccount } from "@/components/onepage/themes/preview-account"
import { skinRootProps, skinVars } from "@/lib/onepage/theme-skin"
import { BUTTON_ICON_CLASS, BUTTON_ICON_INSET, BUTTON_SIZE_CLASS, buttonFill, buttonHover, buttonHoverVars, buttonShadow, buttonIconSide, buttonSize, buttonAlign, buttonThemeOn, cardButtonTheme, cardRadius, buttonShape, themeButtonStripFill, themeButtonStyle, type ButtonThemeLike } from "@/lib/onepage/button-style"
import { avatarLook, bioSizeClass, bioTypeStyle, titleSizeClass, titleTypeStyle } from "@/lib/onepage/header-style"
import { blockGapClass, blockLayoutOf, coverAspect, coverImageOf, headerAlignOf, themeProductLayoutOf } from "@/lib/onepage/theme-layout"
import { fontStack } from "@/lib/onepage/fonts"
import { readableOn } from "@/lib/onepage/theme-apply"
import { readableInk, readableTheme, signupCard } from "@/lib/onepage/contrast"
import { tintOf } from "@/lib/onepage/email-signup"
import { pageGroundIsLight, socialMarkColorOf, socialTileStyle } from "@/lib/onepage/social-look"
import { HERO_FADE_MASK } from "@/lib/onepage/poster-video"
import { pageCanvasColour } from "@/lib/onepage/page-frame"
import { onePageImageSrc } from "@/lib/onepage/display-image"
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
/**
 * Wave 15: the live Hero is 8:9 on a phone (round R3, public-onepage), not
 * 4:5, so the card draws it 8:9, at the page's proportions. 72px of its top
 * is scrolled off, the least that brings the first link whole onto the card
 * under the name, the bio and the socials; the face, which sits in the
 * picture's upper middle, stays on it. (Was:)
 *
 * A Hero card shows the page scrolled this far (round AT). The live Hero is
 * 4:5 on a phone since round AS (487px of a 546px card), so its card was the
 * picture and the name and nothing else: no socials, no buttons. The card
 * now starts 170px into the picture, where the fade has begun, so the name,
 * the socials and the first links are on it, all at the page's own sizes.
 */
export const HERO_CARD_SHIFT = 72
/** Under Grid or Mixed the first links are a pair of tall tiles, which need this much to show whole. */
export const HERO_TILE_CARD_SHIFT = 116
/** Wave 15: a picture that cannot be fetched leaves the theme's own colour under it, never the browser's broken-image mark. */
const hideBroken = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = "hidden" }
/** The live Hero's shape on a phone (public-onepage, round R3). */
const HERO_ASPECT = "8/9"
/** The phone's screen, which the page's wallpaper fills (390 by 844). */
const SCREEN_HEIGHT = 844

/**
 * The live page's classes as a phone draws them. They carry `sm:` steps for
 * a wider screen, and `sm:` reads the window, not the card: in the editor
 * on a computer the card would take the computer's sizes. The phone's are kept.
 */
const phone = (cls: string) => cls.split(/\s+/).filter((c) => c && !/^(sm|md|lg|xl):/.test(c)).join(" ")

/** A photo where the page puts one, at the size the card needs. */
const pictureOf = (src: string, width: number): React.CSSProperties => ({ backgroundImage: `url("${onePageImageSrc(src, width)}")`, backgroundSize: "cover", backgroundPosition: "center" })
/**
 * A sample block's picture. Wave 15, the owner: previews that "look very
 * nice, great, smooth, clean", with nothing vague. Round AT drew a quiet
 * tint of the colours under it, which on a plain or dark theme was a grey
 * box. Now each sample has its own small, clean picture in warm, natural
 * colours, drawn with gradients alone (no file, no drawing of a person):
 * the guide a cream booklet on apricot, the session a pale sun on sage,
 * a featured link a horizon on sky. The same on every card, so what
 * differs between cards is the theme, never the picture.
 */
const SAMPLE_PICTURES: readonly React.CSSProperties[] = [
  { backgroundImage: "linear-gradient(#fbf4e8, #f3e6d2), radial-gradient(70% 60% at 28% 22%, rgba(255,255,255,0.5), transparent 70%), linear-gradient(145deg, #f7c98f 0%, #ea8a62 58%, #c95c43 100%)", backgroundSize: "40% 56%, 100% 100%, 100% 100%", backgroundPosition: "54% 56%, 0 0, 0 0", backgroundRepeat: "no-repeat" },
  { backgroundImage: "radial-gradient(circle at 50% 44%, #f5efe3 0 21%, transparent 22%), radial-gradient(150% 60% at 50% 118%, #2f6a5e 0 56%, transparent 57%), radial-gradient(70% 60% at 28% 22%, rgba(255,255,255,0.45), transparent 70%), linear-gradient(160deg, #b9dccd 0%, #6fae98 60%, #3f8573 100%)" },
  { backgroundImage: "radial-gradient(circle at 70% 46%, #fff3dc 0 9%, transparent 9.5%), radial-gradient(160% 70% at 20% 120%, #3c6187 0 52%, transparent 53%), radial-gradient(160% 70% at 95% 128%, #2b4868 0 54%, transparent 55%), linear-gradient(180deg, #cfe2f2 0%, #8db6da 70%, #f2c9a5 100%)" },
]
const samplePicture = (i: number): React.CSSProperties => SAMPLE_PICTURES[i % SAMPLE_PICTURES.length]

/** A plain link under Cards is a taller row with bolder words (app/globals.css [data-block-layout="cards"] .op-btn). */
const CARDS_ROW: Record<string, string> = { compact: "min-h-[66px] py-4", regular: "min-h-[80px] py-5", large: "min-h-[96px] py-6" }

/** The blocks under the socials, in the page's own order: its first two links, a product, the newsletter, a third link. */
export type Slot = { kind: "link"; at: number } | { kind: "product" } | { kind: "news" }
export function slotsFor(who: PreviewAccount): Slot[] {
  const out: Slot[] = [{ kind: "link", at: 0 }, { kind: "link", at: 1 }, { kind: "product" }, { kind: "news" }]
  if (who.links.length > 2) out.push({ kind: "link", at: 2 })
  return out
}

/**
 * `who` is the creator whose page every card draws (./preview-account),
 * one object for the whole grid. `thumb` is the address of a theme's own
 * picture (its wallpaper photo or cover) at a card's size.
 */
export function ThemePreview({ c: given, who, thumb }: { c: Look; who: PreviewAccount; thumb: (url: string) => string }) {
  /* Round AR: the colours the page will really draw, made to read as the page makes them (lib/onepage/contrast readableTheme). */
  const c = readableTheme(given)
  const bg: string = c.background_color || "#ffffff"
  const text: string = c.text_color || "#111111"
  const secondary: string = c.secondary_text_color || `${text}cc`
  const image = c.background_type === "image" && c.background_image_url ? (c.background_image_url as string) : null
  /* A Hero is drawn only with a photo, as the page draws it (lib/onepage/page-frame heroHeaderShown). */
  const hero = c.header_layout === "hero" && !!who.avatar
  const cover = hero ? null : coverImageOf(c)
  const left = !hero && headerAlignOf(c) === "left"
  const look = avatarLook(c as never, false)
  const theme = c as ButtonThemeLike
  const size = buttonSize(theme)
  const button: React.CSSProperties = { ...themeButtonStyle(theme), ...buttonHoverVars(theme) }
  const hoverAttrs = { "data-hover": buttonHover(theme), "data-shadow": buttonShadow(theme) }
  const ink = (c.button_text_color as string) || text
  const surface = buttonFill(theme) === "filled" ? ((theme.button_color as string) || bg) : bg
  const align = buttonAlign(theme)
  const iconSide = buttonIconSide(theme)
  const layout = blockLayoutOf(c)
  const products = themeProductLayoutOf(c)
  /* The social icons as the page draws them (lib/onepage/social-look). */
  const socialColor: string = socialMarkColorOf(c as never)
  const pageLight = pageGroundIsLight(c as never)
  const titleFace = fontStack(c.title_font || c.font_family)
  const pagePaint = c.background_type === "gradient" && c.background_gradient ? c.background_gradient : bg
  const face = who.avatar
  const heroShift = hero ? (layout === "grid" || layout === "masonry" ? HERO_TILE_CARD_SHIFT : HERO_CARD_SHIFT) : 0
  /* Wave 15: a Hero's words carry a halo of the page's own colour, as the live page's do (public-onepage), not a black shadow. */
  const halo = `color-mix(in srgb, ${pageCanvasColour(c as never)} 72%, transparent)`
  /*
    Where the header ends, for the pattern to keep out from behind it, as
    the page's useHeaderClearance measures it: worked out here from the
    same numbers, since every card draws the same header.
  */
  const headerEnd = hero ? PREVIEW_WIDTH * 9 / 8 - heroShift + 20 : (cover ? (PREVIEW_WIDTH / coverAspect(c, false)) + look.size / 2 + 4 : PREVIEW_TOP + look.size) + 12 + 44 + 12 + (who.bio ? 23 + 16 : 0) + 49

  /* A link's thumbnail: the creator's picture, or none (the page draws none). */
  const linkPicture = (l: PreviewAccount["links"][number]) => (l.picture ? pictureOf(l.picture, 48) : null)
  /* A link row: the page's button (.op-btn with the theme's hover), its words, and its thumbnail inside its edge (public-onepage, link_button). */
  const labelRow = (l: PreviewAccount["links"][number], key: string) => {
    const pic = linkPicture(l)
    return (
      <span
        key={key}
        data-tp-link=""
        {...hoverAttrs}
        data-align={align}
        className={cn("op-btn relative flex w-full items-center justify-center font-medium", phone(BUTTON_SIZE_CLASS[size]), layout === "cards" && CARDS_ROW[size])}
        style={button}
      >
        {pic ? <span data-tp-photo="" className={cn(phone(BUTTON_ICON_CLASS[size]), "absolute shrink-0 rounded", phone(BUTTON_ICON_INSET[size][iconSide]))} style={pic} /> : null}
        <span className={cn("flex w-full min-w-0 flex-col", align === "left" ? "items-start" : "items-center", pic ? (align === "left" ? (iconSide === "left" ? "pl-12" : "pr-12") : "px-12") : "")}>
          <span className={cn("op-label break-words whitespace-normal leading-tight", align === "left" ? "text-left" : "text-center", layout === "cards" && "text-[1.07em] font-semibold")} data-tp-label="" data-block-title="">{l.label}</span>
        </span>
      </span>
    )
  }
  /* A link that is a tile (the Grid's pairs and the Mixed tiles, app/globals.css [data-link-tile]): the picture over the words. */
  const tile = (l: PreviewAccount["links"][number], key: string, grid: boolean) => {
    const pic = linkPicture(l)
    return (
      <span
        key={key}
        data-tp-link=""
        {...hoverAttrs}
        className={cn("op-btn flex w-full flex-col items-center justify-center font-medium", grid ? "min-h-[96px] gap-[10px] px-3 py-4" : "gap-2 px-3", phone(BUTTON_SIZE_CLASS[size]).replace(grid ? /\bp[xy]-\S+/g : /\bpx-\S+/g, ""))}
        style={button}
      >
        {pic ? <span data-tp-photo="" className={cn(phone(BUTTON_ICON_CLASS[size]), "shrink-0 rounded")} style={pic} /> : null}
        <span className="op-label shrink-0 text-center leading-tight" data-tp-label="" data-block-title="">{l.label}</span>
      </span>
    )
  }

  /* The product, in the theme's way: the page's callout, two rows, or two tiles (components/onepage/product-block). */
  const product = (key: string) => {
    const cardText = readableOn(surface, ink)
    const card: React.CSSProperties = { ...themeButtonStyle(theme), borderRadius: `${cardRadius(theme)}px`, color: undefined }
    const ctaTheme = cardButtonTheme(theme, { surface, cardText })
    const cta: React.CSSProperties = { ...themeButtonStyle(ctaTheme), ...buttonHoverVars(ctaTheme) }
    const ctaAttrs = { "data-hover": buttonHover(ctaTheme), "data-shadow": buttonShadow(ctaTheme) }
    /* A product's picture: its own, a sample's own clean picture, or none (the page draws none without one). */
    const shot = (p: PreviewAccount["products"][number], width: number, at: number) => (p.picture ? pictureOf(p.picture, width) : p.sample ? samplePicture(at) : null)
    const [one, two] = who.products
    if (products === "grid") {
      return (
        <span key={key} className="grid w-full grid-cols-2 gap-3">
          {[one, two].map((p, i) => {
            const pic = shot(p, 175, i)
            return (
              <span key={i} data-tp-product="tile" className="op-host flex h-full flex-col overflow-hidden" style={card}>
                {pic ? <span data-tp-photo="" className="block aspect-square w-full" style={pic} /> : null}
                <span className="flex flex-1 flex-col gap-0.5 p-3">
                  <span className="line-clamp-2 text-[14.5px] font-semibold leading-snug" style={{ color: cardText }} data-block-title="">{p.title}</span>
                  <span className="truncate text-[13.5px] font-semibold tabular-nums opacity-85" style={{ color: cardText }}>{p.price}</span>
                  <span className="mt-auto pt-2.5">
                    <span data-product-cta="" {...ctaAttrs} className="op-btn flex h-9 w-full items-center justify-center px-2 text-[13.5px] font-medium" style={cta}><span className="op-label truncate">{p.cta}</span></span>
                  </span>
                </span>
              </span>
            )
          })}
        </span>
      )
    }
    if (products === "rows") {
      return [one, two].map((p, i) => {
        const pic = shot(p, 48, i)
        return (
          <span key={`${key}${i}`} data-tp-product="row" className="op-host block w-full overflow-hidden" style={card}>
            <span className="flex items-center gap-3 p-2.5">
              {pic ? <span data-tp-photo="" className="block h-12 w-12 shrink-0" style={pic} /> : null}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="block truncate text-[15px] font-medium" style={{ color: cardText }} data-block-title="">{p.title}</span>
                <span className="truncate text-[13.5px] font-semibold tabular-nums opacity-80" style={{ color: cardText }}>{p.price}</span>
              </span>
              <span data-product-cta="" {...ctaAttrs} className="op-btn flex h-9 max-w-[45%] shrink-0 items-center justify-center px-3.5 text-[13.5px] font-medium" style={cta}><span className="op-label truncate">{p.cta}</span></span>
            </span>
          </span>
        )
      })
    }
    const pic = shot(one, 56, 0)
    return (
      <span key={key} data-tp-product="callout" className="op-host block w-full overflow-hidden" style={card}>
        <span className="flex gap-3 p-3">
          {pic ? <span data-tp-photo="" className="block h-14 w-14 shrink-0 rounded-lg" style={pic} /> : null}
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <span className="block truncate text-base font-medium" style={{ color: cardText }} data-block-title="">{one.title}</span>
            <span className="truncate text-sm font-semibold tabular-nums" style={{ color: cardText }}>{one.price}</span>
          </span>
        </span>
        <span className="block px-3 pb-3">
          <span data-product-cta="" {...ctaAttrs} className="op-btn flex h-11 w-full items-center justify-center px-4 text-sm font-medium" style={cta}><span className="op-label truncate">{one.cta}</span></span>
        </span>
      </span>
    )
  }

  /* The newsletter, as its Classic layout draws it (components/onepage/email-signup), on the card the page tints for it; its button at full strength, as the page draws it before an email is typed. */
  const newsletter = (key: string) => {
    const signup = signupCard(c)
    const soft = c.secondary_text_color ? readableInk(c.secondary_text_color, signup.grounds) : signup.ink
    const send = themeButtonStyle(buttonThemeOn(theme, signup.grounds))
    return (
      <span key={key} data-email-layout="default" data-tp-news="" className="block w-full rounded-xl p-5" style={{ backgroundColor: tintOf(signup.tint, 5) }}>
        <span className="mb-1 block text-center text-base font-semibold leading-snug" style={{ color: signup.ink }}>{who.news.headline}</span>
        {who.news.desc ? <span className="mb-4 block text-center text-xs leading-relaxed" style={{ color: soft }}>{who.news.desc}</span> : <span className="mb-3 block" />}
        <span data-email-form="row" className="flex flex-row items-stretch gap-2">
          <span className="flex min-h-[46px] min-w-0 flex-1 items-center bg-white/90 px-3 py-3 text-[16px]" style={{ borderRadius: send.borderRadius }}>
            <span className="truncate text-black/50">Email</span>
          </span>
          <span data-product-cta="" className="flex shrink-0 items-center justify-center whitespace-nowrap px-4 py-3 text-sm font-medium" style={send}>{who.news.button}</span>
        </span>
      </span>
    )
  }

  /* The blocks, in their order, in the theme's layout (lib/onepage/theme-layout pairLinkTiles, mixedTileSizes, linkDrawnAsCard). */
  const blocks: React.ReactNode[] = []
  const slots = slotsFor(who)
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    const next = slots[i + 1]
    if (s.kind === "product") blocks.push(product("product"))
    else if (s.kind === "news") blocks.push(newsletter("news"))
    else if ((layout === "grid" || layout === "masonry") && next?.kind === "link") {
      /* Two links that follow one another: a pair of tiles. */
      const pair = [s, next] as { kind: "link"; at: number }[]
      blocks.push(
        <span key={`pair${i}`} className="grid w-full grid-cols-2 gap-3" data-tp-pair={layout === "grid" ? "" : undefined} data-tp-masonry={layout === "masonry" ? "" : undefined}>
          {pair.map((x, j) => tile(who.links[x.at], String(j), layout === "grid"))}
        </span>,
      )
      i++
    } else {
      const l = who.links[s.at]
      /* Cards: a link with a picture is a featured card, its picture large and its words on a strip under it. A sample's first link shows the card with a tint. */
      const cardPicture = layout === "cards" ? (l.picture ? pictureOf(l.picture, 350) : l.sample && s.at === 0 ? samplePicture(2) : null) : null
      if (cardPicture) {
        const radius = buttonShape(theme.button_border_radius) === "pill" ? 28 : Number(theme.button_border_radius ?? 8)
        blocks.push(
          <span key={`card${i}`} data-tp-card="" className="op-card block w-full overflow-hidden" style={{ ...themeButtonStyle(theme), borderRadius: radius, padding: 0 }}>
            <span data-tp-photo="" className="block aspect-[2/1] w-full" style={{ borderRadius: `${radius}px ${radius}px 0 0`, ...cardPicture }} />
            <span className="flex w-full items-center justify-center px-5 py-3.5 text-[15px] font-medium" style={{ backgroundColor: themeButtonStripFill(theme), color: ink }}>
              <span className="truncate" data-tp-label="" data-block-title="">{l.label}</span>
            </span>
          </span>,
        )
      } else blocks.push(labelRow(l, `link${i}`))
    }
  }

  const title = (
    <span
      data-tp-title=""
      className={cn("block max-w-full font-bold leading-[1.5]", phone(titleSizeClass(c as never, hero, false)))}
      style={{ color: c.title_color || text, fontFamily: titleFace, textShadow: hero ? `0 1px 14px ${halo}, 0 0 2px ${halo}` : undefined, ...titleTypeStyle(c as never) }}
    >
      {who.name}
    </span>
  )
  const bio = who.bio ? (
    <span data-tp-bio="" className={cn("line-clamp-2 block max-w-sm leading-relaxed", left ? "text-left" : "text-center", phone(bioSizeClass(c as never, hero, false)))} style={{ color: hero ? c.secondary_text_color || text : secondary, textShadow: hero ? `0 1px 10px ${halo}` : undefined, ...bioTypeStyle(c as never) }}>
      {who.bio}
    </span>
  ) : null
  /* No photo: the page's monogram, the name's first letter on the theme's button colour (public-onepage ProfileImage fallback). */
  const monogram: React.CSSProperties = c.button_style === "glass" || c.button_style === "outline"
    ? { backgroundColor: `color-mix(in srgb, ${text} 16%, ${bg})`, color: text }
    : { backgroundColor: c.button_color || text, color: readableOn(c.button_color || text, c.button_text_color || bg) } /* Wave 15: the letter reads on its disc, as the live page draws it (Cobalt's cream on cream was blank). */

  return (
    <span
      data-tp-page=""
      aria-hidden
      {...skinRootProps(c)}
      className="pointer-events-none absolute left-0 top-0 block origin-top-left select-none overflow-hidden text-left [-webkit-touch-callout:none]"
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
          <img src={thumb(image)} alt="" draggable={false} loading="eager" decoding="sync" data-theme-thumb="" onError={hideBroken} className="absolute inset-0 h-full w-full object-cover" style={c.image_brightness && c.image_brightness !== 100 ? { filter: `brightness(${c.image_brightness}%)` } : undefined} />
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
      <span className="relative flex h-full w-full flex-col px-5 pb-0.5" style={{ paddingTop: hero || cover ? 0 : PREVIEW_TOP }}>
        <span className={cn("flex min-h-0 flex-1 flex-col items-center", phone(blockGapClass(c)))}>
          {hero ? (
            <span className="relative -mx-5 mb-2 block w-[calc(100%+40px)] shrink-0" style={{ marginTop: -heroShift }} data-tp-header="hero" data-tp-shift={heroShift}>
              <span className="relative block w-full overflow-hidden" style={{ aspectRatio: HERO_ASPECT, maskImage: HERO_FADE_MASK, WebkitMaskImage: HERO_FADE_MASK, backgroundColor: `color-mix(in srgb, ${text} 6%, transparent)` }}>
                {face ? <img src={onePageImageSrc(face, PREVIEW_WIDTH)} alt="" draggable={false} decoding="async" data-tp-photo="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `50% ${c.hero_position_y ?? 50}%` }} /> : null}
              </span>
              <span className="absolute inset-x-0 bottom-4 z-[1] flex flex-col items-center gap-2 px-6 text-center">
                {title}
                {bio}
              </span>
            </span>
          ) : (
            <span className={cn("flex w-full shrink-0 flex-col gap-3", left ? "items-start text-left" : "items-center text-center")} data-tp-header="">
              {cover ? (
                <span className="relative -mx-5 block w-[calc(100%+40px)]" style={{ marginBottom: `calc(${-(look.size / 2)}px - 0.75rem)` }}>
                  <span className="relative block w-full overflow-hidden" style={{ aspectRatio: String(coverAspect(c, false)), backgroundColor: `color-mix(in srgb, ${text} 8%, transparent)` }}>
                    <img src={thumb(cover)} alt="" draggable={false} loading="eager" decoding="sync" data-theme-cover="" className="absolute inset-0 h-full w-full object-cover" onError={hideBroken} />
                  </span>
                </span>
              ) : null}
              {/* Round AT: the photo is clipped to the avatar's own shape, so nothing drawn in it can stand out of the ring (the owner's cut Neon card). */}
              <span
                data-tp-avatar=""
                data-theme-avatar=""
                className="relative flex shrink-0 items-center justify-center overflow-hidden text-2xl font-semibold shadow-lg"
                style={{
                  width: look.size,
                  height: look.size,
                  borderRadius: look.radius,
                  borderStyle: "solid",
                  borderWidth: look.borderWidth,
                  borderColor: look.borderColor,
                  ...(face ? { background: `color-mix(in srgb, ${text} 16%, ${bg})` } : monogram),
                  boxShadow: cover && c.background_type === "solid" ? `0 0 0 4px ${bg}, 0 10px 15px -3px rgba(0,0,0,0.1)` : undefined,
                }}
              >
                {face ? <img src={onePageImageSrc(face, 160)} alt="" draggable={false} decoding="async" data-tp-photo="" className="block h-full w-full rounded-[inherit] object-cover" /> : <span data-tp-monogram="">{who.name.charAt(0).toUpperCase()}</span>}
              </span>
              {title}
              {bio}
            </span>
          )}
          {/* Round AS: 24px wider than the column, so the -mx-3 px-3 that gives a hard shadow room leaves the blocks the page's own width (they were 326px, not 350). */}
          <span data-tp-blocks="" className={cn("flex min-h-0 w-[calc(100%+24px)] flex-1 flex-col flex-wrap content-start items-stretch overflow-hidden [&>*]:shrink-0", phone(blockGapClass(c)), "!gap-x-[200px] -mx-3 px-3 pb-1", hero ? "relative z-[1] -mt-4" : "mt-1")}>
            <span className={cn("flex w-full items-center gap-2.5", left ? "justify-start" : "justify-center")} style={{ marginBottom: hero ? 20 : 3 }} data-tp-socials="">
              {who.socials.map((p) => (
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

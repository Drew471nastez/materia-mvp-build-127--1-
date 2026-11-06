"use client"

import { BlockSubtitle } from "./block-presentation"
import { presentationOf } from "@/lib/onepage/block-presentation"

/**
 * ===========================================================================
 *  A PRODUCT ON THE ONEPAGE: EIGHT WAYS TO DRAW IT, THREE THINGS A TAP DOES
 * ===========================================================================
 * The product block of the live page and of the editor's preview, which is
 * the live page in a frame (components/onepage/preview-document), so both draw
 * exactly this. components/onepage/public-onepage hands it the block, the
 * theme and the page's helpers.
 *
 * THE LAYOUTS (lib/onepage/product-block PRODUCT_LAYOUTS). Every one wears the
 * theme the way the page's buttons do (solid, outline or glass, its corners,
 * border and shadow), keeps colours chosen for the block, and keeps its text
 * readable on whatever it sits on (readableOn):
 *
 *   button    one button: a small picture, the words and the price
 *   callout   a card: picture left, title, a line, the price, a button below
 *   row       a slim line: picture, title and price, a small button right
 *   preview   a card with a wide picture on top ("Card" in the editor)
 *   side      a card with a square picture on the left and the words beside
 *   tile      a picture on top, title, price and a button; two tiles that
 *             follow one another sit side by side (public-onepage pairs them)
 *   overlay   the picture edge to edge with the words and button over it
 *   minimal   no card and no picture: the title and a price pill
 *
 * EVERY BUTTON HERE IS THE PAGE'S BUTTON (lib/onepage/button-style): the
 * "button" layout is drawn exactly as a link button is, and the button inside
 * a card takes the page's style, corners, border, shadow and hover, turned
 * around only where it would not show (cardButtonTheme). A Soft page has soft
 * product buttons; a Pill page has pill ones, on cards that stop at 28px.
 *
 * THE BUTTON MOVES, THE CARD DOES NOT. "Make sure the button can have the
 * hover feel, not the whole block." Pointing at a card lifts its button by a
 * pixel, tints it a little (a layer of its own text colour at low opacity,
 * so a dark button lightens and a light one darkens) and shows a soft shadow
 * under it; the card stays where it is. Only on a device that really hovers
 * (this app's hover variants sit inside @media (hover: hover) and (pointer: fine)), so a phone
 * never keeps a stuck hover. Motion is `translate` and `opacity`, named.
 *
 * A TAP (lib/onepage/product-block productTapPlan): the checkout page, the
 * product page, a sheet over this page (./product-sheet), or with instant
 * checkout on, the checkout window right here (components/checkout/
 * instant-checkout). Whatever it does, the click is counted first
 * (/api/onepage/track, as every block's), and the block stays a real link to
 * where it goes, for a crawler, a long press and a page without script.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import type { OnePageBlock, OnePageTheme, ProductBlockData } from "@/lib/onepage/types"
import { readableOn } from "@/lib/onepage/theme-apply"
import { buttonFill, buttonHover, buttonHoverVars, buttonShadow as themeShadowKind, cardButtonTheme, cardRadius, themeButtonStyle, type ButtonThemeLike } from "@/lib/onepage/button-style"
import { PLAN_CURRENCY, isPlanPriced } from "@/lib/money/product-currency"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { intervalOf, perInterval } from "@/lib/pricing/list-price"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { backThen } from "@/lib/navigation/go-back"
import { instantCheckoutOn, productHref, productLayoutOf, productPriceParts, productSheetAction, productSheetHash, productTapAction, productTapPlan, sheetButtonPrice, sheetShowsPageLink, shipsProduct } from "@/lib/onepage/product-block"
import { onePageTapCheckoutHref } from "@/lib/onepage/shipped-checkout"
import { fontStack } from "@/lib/onepage/fonts"
import { onePageOutboundHref, platformOrigin, currentOnePageAddress } from "@/lib/onepage/return-address"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import { ProductSheet } from "./product-sheet"
import { InstantCheckout, loadProductFacts } from "@/components/checkout/instant-checkout"
import { sheetPalette } from "@/lib/onepage/sheet-theme"

/** The free product quick checkout made before round 10 (public-onepage's own window), kept for the blocks that use it. */
export interface LegacyQuickCheckout {
  openQuickCheckoutModal: (data: { productId: string; productTitle: string; productThumbnail?: string | null; productSlug?: string | null; ctaText: string; blockBackgroundColor: string; textColor: string; buttonBorderRadius: number }) => void
  purchasedProducts: Record<string, unknown>
  downloadPurchasedAsset: (productId: string) => void
}

export interface OnePageProductBlockProps {
  block: OnePageBlock
  theme: OnePageTheme
  /** Inside a group or carousel: the theme's own hover is off there, as for every button. */
  quiet?: boolean
  /** Drawn as one of two tiles side by side. */
  inPair?: boolean
  seller: { name: string; avatarUrl: string | null }
  pageMoney: (cents: number) => string
  plainText: (html?: string | null) => string
  trackClick: (blockId: string, url: string) => void
  animationClass: string
  quick: LegacyQuickCheckout | null
}

const isHex6 = (c: string) => /^#[0-9a-f]{6}$/i.test(c)
const tintOf = (c: string, alpha: string) => (isHex6(c) ? `${c}${alpha}` : "rgba(127,127,127,0.12)")

/**
 * The button's own hover: the page's choice (Lift, Bigger, Glow, Fill, Underline, None), drawn by `.op-btn` in
 * app/globals.css as the link buttons are. Inside a card it plays when the card is pointed at (`.op-host`), and only
 * the button moves: the card has no hover of its own. Pointer devices only; translate, scale and opacity, named.
 */
export const PRODUCT_CTA_HOVER = "op-btn"

/** The card that hands its hover to the button inside it. */
export const PRODUCT_CARD_HOST = "op-host"

/*
  WHERE A TAP GOES, AND HOW TO COME BACK (round 11). The OnePage is on
  storelib.me and the checkout and product pages on storelib.com: a link to
  "/checkout" was a 308 from storelib.me first, and Back from there went to the
  product or the creator page, never the OnePage. So the link is the final
  address on storelib.com, carrying the OnePage to come back to
  (lib/onepage/return-address). The OnePage's own address is known only in the
  browser, so the server draws the link without it and the first render after
  hydration adds it: one value, read once (useSyncExternalStore's server
  snapshot is null, so hydration matches).
*/
const noSubscribe = () => () => {}
function useOnePageBack(): string | null {
  return React.useSyncExternalStore(noSubscribe, () => (isOnePagePreview() ? null : currentOnePageAddress()), () => null)
}

/*
  READ AHEAD WHERE THE BROWSER CAN. A press on a link to the checkout or a
  product page has the browser fetch it while the finger is still down
  (speculation rules, "moderate": a pointer held on it, or 200ms of hover on
  a computer). Across sites the browser only does this for a visitor with no
  storelib.com cookies, which is most people arriving from a bio link; for the
  rest it is simply the one navigation. Added once per page.
*/
let readAheadAdded = false
function addReadAhead() {
  if (readAheadAdded || typeof document === "undefined") return
  readAheadAdded = true
  try {
    const supports = (HTMLScriptElement as unknown as { supports?: (t: string) => boolean }).supports
    if (!supports?.("speculationrules")) return
    const origin = platformOrigin()
    const s = document.createElement("script")
    s.type = "speculationrules"
    s.textContent = JSON.stringify({ prefetch: [{ source: "document", where: { or: [{ href_matches: `${origin}/checkout*` }, { href_matches: `${origin}/p/*` }] }, eagerness: "moderate" }] })
    document.head.appendChild(s)
  } catch {
    /* no read ahead: the press is still one navigation */
  }
}

function ProductTitle({ block, children }: { block: OnePageBlock; children: React.ReactNode }) {
  const subtitle = presentationOf(block).subtitle
  return subtitle ? <span className="flex min-w-0 flex-col">{children}<BlockSubtitle subtitle={subtitle} /></span> : <>{children}</>
}

export function OnePageProductBlock({ block, theme, quiet = false, inPair = false, seller, pageMoney, plainText, trackClick, animationClass, quick }: OnePageProductBlockProps) {
  const data = block.data as ProductBlockData
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [checkout, setCheckout] = React.useState<{ variantId: string | null; fromSheet: boolean } | null>(null)
  const pushed = React.useRef(false)
  const [warm, setWarm] = React.useState(false)
  const seen = React.useRef<HTMLSpanElement>(null)

  const layout = productLayoutOf(data, theme)
  const plan = productTapPlan(data)
  const back = useOnePageBack()
  /*
    A product that ships, tapped to buy (round 49): its store website's checkout. The link drawn on the server is
    storelib.com's, which sends it on there; once the product's facts are read (the block nearing the screen, below)
    the link is that checkout itself, one navigation (lib/onepage/shipped-checkout).
  */
  const shipsToCheckout = plan === "navigate" && productTapAction(data) === "checkout" && shipsProduct(data.product_type) && !!data.product_id
  const [shopSite, setShopSite] = React.useState<{ origin: string; shopId: string } | null>(null)
  /* The final address on storelib.com, with the OnePage to come back to once it is known (see useOnePageBack). */
  const path = productHref(data)
  const direct = shipsToCheckout && shopSite && !isOnePagePreview() ? onePageTapCheckoutHref({ siteOrigin: shopSite.origin, shopId: shopSite.shopId, productId: data.product_id, onePage: back }) : null
  const href = direct ?? onePageOutboundHref(path, back)
  const hash = productSheetHash(data.product_slug)
  const instant = instantCheckoutOn(data)

  /* ── The sheet in the address: #product-<slug>. A shared link opens it, Back closes it. ── */
  const openSheet = React.useCallback(() => {
    setSheetOpen(true)
    if (hash && typeof window !== "undefined" && window.location.hash !== hash) {
      try {
        window.history.pushState({ ...(window.history.state ?? {}), onepageProductSheet: block.id }, "", hash)
        pushed.current = true
      } catch {
        pushed.current = false
      }
    }
  }, [hash, block.id])
  const closeSheet = React.useCallback(() => {
    setSheetOpen(false)
    if (pushed.current) {
      pushed.current = false
      /* Back off the sheet's own entry, watched (lib/navigation/go-back): should it do nothing, the hash is just taken off. */
      backThen(() => {
        try {
          window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search)
        } catch {
          /* the address keeps its hash */
        }
      })
    } else if (hash && window.location.hash === hash) {
      try {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search)
      } catch {
        /* the address keeps its hash */
      }
    }
  }, [hash])
  React.useEffect(() => {
    if (plan !== "sheet" || !hash) return
    if (window.location.hash === hash) setSheetOpen(true)
    const onPop = () => {
      if (window.location.hash !== hash) {
        pushed.current = false
        setSheetOpen(false)
      } else setSheetOpen(true)
    }
    window.addEventListener("popstate", onPop)
    window.addEventListener("hashchange", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("hashchange", onPop)
    }
  }, [plan, hash])

  /*
    WARM BEFORE THE TAP. A block that opens a sheet or the checkout window reads its product once it comes near the
    screen, so the tap opens something already drawn: on a phone four times slower, reading and drawing it on the tap
    cost frames of 80 to 100ms while the sheet slid (scripts/check-onepage-products.mjs).
  */
  React.useEffect(() => {
    if (plan === "navigate" && !isOnePagePreview()) addReadAhead()
  }, [plan])
  React.useEffect(() => {
    const el = seen.current
    if (!el || warm || (plan === "navigate" && !shipsToCheckout) || !data.product_id) return
    if (typeof IntersectionObserver === "undefined") return setWarm(true)
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect()
        const go = () => {
          setWarm(true)
          if (plan === "instant") void loadProductFacts(data.product_id).catch(() => undefined)
          if (shipsToCheckout)
            void loadProductFacts(data.product_id)
              .then((f) => (f.product.siteOrigin && f.product.shopId ? setShopSite({ origin: f.product.siteOrigin, shopId: f.product.shopId }) : undefined))
              .catch(() => undefined)
        }
        const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
        if (idle) idle(go, { timeout: 1200 })
        else window.setTimeout(go, 200)
      }
    }, { rootMargin: "200px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [plan, warm, data.product_id, shipsToCheckout])

  if (!data.product_id && !data.product_title) return null

  /* ── Colours: the theme's button, the block's own choices, always readable ── */
  const radius = cardRadius(theme as ButtonThemeLike)
  const ownBackground = data.block_background_color || null
  /* Only a Solid card has the button colour behind its words; Soft, Outline and Glass sit on the page. */
  const themeFill = buttonFill(theme as ButtonThemeLike) === "filled"
  const surfaceColor = ownBackground || (themeFill ? theme.button_color : theme.background_color)
  const textColor = readableOn(surfaceColor, theme.button_text_color, data.text_color)

  /* The page's button, as a link button draws it (the "button" layout, and the card itself). */
  const themeButton: React.CSSProperties = { ...themeButtonStyle(theme as ButtonThemeLike), ...buttonHoverVars(theme as ButtonThemeLike) }
  const shadowCss = themeButton.boxShadow as string
  const cardStyle: React.CSSProperties = ownBackground
    ? { borderRadius: `${radius}px`, backgroundColor: ownBackground, border: "none", boxShadow: shadowCss }
    : { ...themeButtonStyle(theme as ButtonThemeLike), borderRadius: `${radius}px`, color: undefined }
  /* The hover a button here plays: the page's, still inside a group or carousel as every button is there. */
  const hoverKind = quiet ? "none" : buttonHover(theme as ButtonThemeLike)
  const hoverAttrs = (t: ButtonThemeLike) => ({ "data-hover": hoverKind, "data-shadow": themeShadowKind(t) })
  /* The button inside a card: the page's button, made to read on the card (cardButtonTheme). */
  const ctaTheme = (onPhoto = false) =>
    cardButtonTheme(theme as ButtonThemeLike, { surface: surfaceColor, cardText: textColor, ownBackground, ownButtonColor: data.button_color || null, ownButtonText: data.button_text_color || null, onPhoto })

  /* ── Words ── */
  const title = data.product_title || "Product"
  const description = data.show_description !== false ? plainText(data.product_description) : ""
  const image = data.custom_thumbnail || data.product_thumbnail || null
  const planPriced = isPlanPriced({ type: data.product_type })
  const money = (cents: number) => (planPriced ? shopMoneyIn(cents, PLAN_CURRENCY) : pageMoney(cents))
  const parts = productPriceParts(data, money)
  const interval = intervalOf({ type: data.product_type, price_interval: data.product_price_interval })
  const now = parts.free ? "Free" : `${parts.prefix === "from" ? "From " : ""}${perInterval(parts.now, interval)}`
  const showPrice = data.show_price !== false

  /* ── The older free quick checkout, for the blocks that turned it on before instant checkout existed ── */
  const legacyQuick = !instant && parts.free && data.quick_checkout === true && !!quick
  const purchased = legacyQuick && quick!.purchasedProducts?.[data.product_id] !== undefined
  const cta = purchased ? "Download" : data.cta_text || "Get My Guide"

  /* Counted by the block's own address, as it always was: the way back is the visitor's, not the link's. */
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackClick(block.id, path)
    /* A press with a key held (a new tab, a new window) is the browser's, always. */
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (legacyQuick && quick) {
      e.preventDefault()
      if (purchased) quick.downloadPurchasedAsset(data.product_id)
      else quick.openQuickCheckoutModal({ productId: data.product_id, productTitle: title, productThumbnail: image, productSlug: data.product_slug, ctaText: data.cta_text || "Get it Now", blockBackgroundColor: surfaceColor, textColor, buttonBorderRadius: radius })
      return
    }
    if (plan === "sheet" && data.product_id) {
      e.preventDefault()
      openSheet()
      return
    }
    if (plan === "instant" && data.product_id) {
      e.preventDefault()
      setCheckout({ variantId: null, fromSheet: false })
      return
    }
    /* The checkout or the product page only make sense live: in the editor's preview, a note instead of leaving it. */
    if (isOnePagePreview()) {
      e.preventDefault()
      showPreviewNotice("link")
    }
  }
  /* A tap that opens something on this page: the platform's loading line must not start for it (components/navigation/route-loading-bar). */
  const staysHere = legacyQuick || ((plan === "sheet" || plan === "instant") && !!data.product_id) ? "" : undefined

  const priceLine = (cls: string, color: string) =>
    showPrice && !purchased ? (
      <p className={cn("flex flex-wrap items-baseline gap-x-1.5 tabular-nums", cls)} style={{ color }} data-product-price="">
        <span>{now}</span>
        {parts.was ? <s className="text-[0.85em] font-normal opacity-60">{parts.was}</s> : null}
      </p>
    ) : null
  const ctaButton = (cls: string, onPhoto = false) => {
    const t = ctaTheme(onPhoto)
    return (
      <span className={cn("inline-flex items-center justify-center font-medium", PRODUCT_CTA_HOVER, cls)} style={{ ...themeButtonStyle(t), ...buttonHoverVars(t) }} {...hoverAttrs(t)} data-product-cta="">
        <span className="op-label relative truncate">{cta}</span>
      </span>
    )
  }
  const picture = (cls: string, ratio?: string) =>
    image ? (
      <span className={cn("block shrink-0 overflow-hidden bg-black/5", ratio, cls)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={title} className="h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />
      </span>
    ) : null

  const shell = (children: React.ReactNode, cls: string, style: React.CSSProperties = cardStyle) => (
    <a
      href={href}
      onClick={onClick}
      className={cn("group/pc block w-full cursor-pointer overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2", PRODUCT_CARD_HOST, cls, animationClass)}
      style={style}
      data-product-block={layout}
      data-product-tap={plan}
      data-stays-here={staysHere}
      aria-label={`${title}${showPrice ? `, ${now}` : ""}`}
    >
      {children}
    </a>
  )

  let body: React.ReactNode
  switch (layout) {
    case "button": {
      body = (
        <a
          href={href}
          onClick={onClick}
          className={cn("op-btn flex w-full cursor-pointer items-center justify-center gap-2 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:gap-3 sm:px-5 sm:py-4 sm:text-base", animationClass)}
          style={themeButton}
          {...hoverAttrs(theme as ButtonThemeLike)}
          data-product-block="button"
          data-product-tap={plan}
          data-stays-here={staysHere}
        >
          {data.product_thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.product_thumbnail} alt={title} className="relative h-6 w-6 shrink-0 rounded object-cover sm:h-7 sm:w-7" />
          ) : null}
          {presentationOf(block).subtitle ? <span className="relative min-w-0"><span className="op-label block break-words">{cta}</span><BlockSubtitle subtitle={presentationOf(block).subtitle} /></span> : <span className="op-label relative truncate">{cta}</span>}
          {showPrice && !purchased ? (
            <span className="relative shrink-0 text-sm tabular-nums opacity-75">
              {now}
              {parts.was ? <s className="ml-1 opacity-70">{parts.was}</s> : null}
            </span>
          ) : null}
        </a>
      )
      break
    }
    case "row": {
      body = shell(
        <span className="flex items-center gap-3 p-2.5 sm:p-3">
          {picture("h-12 w-12 sm:h-14 sm:w-14", undefined)}
          <span className="min-w-0 flex-1">
            <ProductTitle block={block}>
              <span className="block truncate text-[15px] font-medium sm:text-base" style={{ color: textColor }} data-block-title="">
              {title}
            </span>
            </ProductTitle>
            {priceLine("text-[13.5px] font-semibold opacity-80", textColor)}
          </span>
          {ctaButton("h-9 max-w-[45%] shrink-0 px-3.5 text-[13.5px] sm:h-10 sm:px-4 sm:text-sm")}
        </span>,
        "",
      )
      break
    }
    case "side": {
      body = shell(
        <span className="flex items-stretch">
          {picture("w-[36%] min-h-[132px] sm:w-[34%]", undefined)}
          <span className="flex min-w-0 flex-1 flex-col gap-1 p-3.5 sm:p-4">
            <ProductTitle block={block}>
              <span className="line-clamp-2 text-[15px] font-semibold leading-snug sm:text-base" style={{ color: textColor }} data-block-title="">
              {title}
            </span>
            </ProductTitle>
            {description ? (
              <span className="line-clamp-2 text-[13px] leading-snug opacity-75" style={{ color: textColor }}>
                {description}
              </span>
            ) : null}
            {priceLine("mt-auto pt-1 text-[14.5px] font-semibold", textColor)}
            {ctaButton("mt-2 h-10 w-full px-3 text-sm")}
          </span>
        </span>,
        "",
      )
      break
    }
    case "tile": {
      body = shell(
        <span className="flex h-full flex-col">
          {picture("w-full", inPair ? "aspect-square" : "aspect-[16/10]")}
          <span className="flex flex-1 flex-col gap-0.5 p-3">
            <ProductTitle block={block}>
              <span className="line-clamp-2 text-[14.5px] font-semibold leading-snug" style={{ color: textColor }} data-block-title="">
              {title}
            </span>
            </ProductTitle>
            {priceLine("text-[13.5px] font-semibold opacity-85", textColor)}
            <span className="mt-auto pt-2.5">{ctaButton("h-9 w-full px-2 text-[13.5px]")}</span>
          </span>
        </span>,
        "h-full",
      )
      break
    }
    case "overlay": {
      if (image) {
        body = shell(
          <span className="relative block aspect-[4/3] w-full">
            {picture("absolute inset-0 h-full w-full", undefined)}
            <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_35%,rgba(0,0,0,0.72)_100%)]" />
            <span className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
              <span className="min-w-0 flex-1">
                <ProductTitle block={block}>
              <span className="line-clamp-2 text-[17px] font-semibold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]" data-block-title="">{title}</span>
            </ProductTitle>
                {priceLine("mt-0.5 text-[14.5px] font-semibold", "#ffffff")}
              </span>
              {ctaButton("h-10 max-w-[48%] shrink-0 px-4 text-sm", true)}
            </span>
          </span>,
          "",
          { ...cardStyle, padding: 0 },
        )
        break
      }
      /* No picture to lay the words over: the card with a picture on top, which has none either. */
    }
    // falls through
    case "preview": {
      body = shell(
        <span className="block">
          {picture("w-full", "aspect-[2/1]")}
          <span className="block space-y-1.5 p-4">
            <ProductTitle block={block}>
              <span className="block text-base font-medium sm:text-lg" style={{ color: textColor }} data-block-title="">
              {title}
            </span>
            </ProductTitle>
            {description ? (
              <span className="block text-sm opacity-75" style={{ color: textColor }}>
                {description}
              </span>
            ) : null}
            {priceLine("text-base font-semibold", textColor)}
            <span className="block pt-1.5">{ctaButton("h-11 w-full px-4 text-sm sm:text-base")}</span>
          </span>
        </span>,
        "",
      )
      break
    }
    case "minimal": {
      /* The price pill sits on the page, as a link button does: the page's button exactly, its words readable on the page. */
      const pillTheme: ButtonThemeLike = themeFill ? (theme as ButtonThemeLike) : { ...(theme as ButtonThemeLike), button_text_color: readableOn(theme.background_color, theme.button_text_color) }
      body = shell(
        <span className="flex items-center gap-3 px-1 py-3" style={{ borderBottom: `1px solid ${tintOf(theme.text_color, "26")}` }}>
          <span className="min-w-0 flex-1">
            <ProductTitle block={block}>
              <span className="block truncate text-[15.5px] font-medium sm:text-base" style={{ color: theme.text_color }} data-block-title="">
              {title}
            </span>
            </ProductTitle>
            {description ? (
              <span className="block truncate text-[13px] opacity-70" style={{ color: theme.text_color }}>
                {description}
              </span>
            ) : null}
          </span>
          <span className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 px-3.5 text-[13.5px] font-semibold tabular-nums", PRODUCT_CTA_HOVER)} style={{ ...themeButtonStyle(pillTheme), ...buttonHoverVars(pillTheme) }} {...hoverAttrs(pillTheme)} data-product-cta="">
            <span className="op-label relative">{showPrice && !purchased ? now : cta}</span>
            {showPrice && parts.was && !purchased ? <s className="relative text-[12px] font-normal opacity-60">{parts.was}</s> : null}
          </span>
        </span>,
        "",
        { background: "transparent", border: "none", boxShadow: "none", borderRadius: 0 },
      )
      break
    }
    case "callout":
    default: {
      body = shell(
        <span className="block">
          <span className="flex gap-3 p-3 sm:gap-4 sm:p-4">
            {picture("h-14 w-14 rounded-lg sm:h-16 sm:w-16 sm:rounded-xl", undefined)}
            <span className="min-w-0 flex-1 space-y-0.5 sm:space-y-1">
              <ProductTitle block={block}>
              <span className="block truncate text-base font-medium sm:text-lg" style={{ color: textColor }} data-block-title="">
                {title}
              </span>
            </ProductTitle>
              {description ? (
                <span className="line-clamp-1 block text-sm opacity-75" style={{ color: textColor }}>
                  {description}
                </span>
              ) : null}
              {priceLine("text-sm font-semibold sm:text-base", textColor)}
            </span>
          </span>
          <span className="block px-3 pb-3 sm:px-4 sm:pb-4">{ctaButton("h-11 w-full px-4 text-sm sm:text-base")}</span>
        </span>,
        "",
      )
    }
  }

  return (
    <>
      {body}
      {plan !== "navigate" || shipsToCheckout ? <span ref={seen} aria-hidden className="block h-0 w-full" /> : null}
      {plan === "sheet" && data.product_id ? (
        <ProductSheet
          open={sheetOpen}
          warm={warm}
          onClose={closeSheet}
          productId={data.product_id}
          title={title}
          image={image}
          priceText={showPrice ? now : null}
          ctaText={data.cta_text || "Buy now"}
          instant={instant && !shipsProduct(data.product_type)}
          onBuy={(variantId) => setCheckout({ variantId, fromSheet: true })}
          onCheckoutLink={(to) => trackClick(block.id, to)}
          back={back}
          /* Round 41: the creator's choice of the sheet's button (lib/onepage/product-block). */
          action={productSheetAction(data)}
          pageLink={sheetShowsPageLink(data)}
          /* Round 43: "Buy now · €49" when the creator asked for it, and the page's own typefaces. */
          priceOnButton={sheetButtonPrice(data)}
          font={{ body: fontStack(theme.font_family), title: fontStack((theme as { title_font?: string }).title_font || theme.font_family) }}
        />
      ) : null}
      {checkout && data.product_id ? (
        <InstantCheckout
          productId={data.product_id}
          title={title}
          sellerName={seller.name}
          sellerAvatar={seller.avatarUrl}
          variantId={checkout.variantId}
          /* Round 40: the window wears the page's colours; its card field is dark exactly when that window is (lib/onepage/sheet-theme). */
          dark={sheetPalette(theme).dark}
          themed
          origin={pageOrigin}
          onClose={() => setCheckout(null)}
          onBack={checkout.fromSheet ? () => setCheckout(null) : null}
          back={back}
        />
      ) : null}
    </>
  )
}

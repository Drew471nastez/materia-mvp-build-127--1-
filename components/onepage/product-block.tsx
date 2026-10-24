"use client"

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
import { luminance } from "@/lib/onepage/color"
import { PLAN_CURRENCY, isPlanPriced } from "@/lib/money/product-currency"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { intervalOf, perInterval } from "@/lib/pricing/list-price"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { backThen } from "@/lib/navigation/go-back"
import { instantCheckoutOn, productHref, productLayoutOf, productPriceParts, productSheetHash, productTapPlan, shipsProduct } from "@/lib/onepage/product-block"
import { ProductSheet } from "./product-sheet"
import { InstantCheckout, loadProductFacts } from "@/components/checkout/instant-checkout"

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
const rgba = (hex: string, alpha: number) => {
  if (!isHex6(hex)) return `rgba(0,0,0,${alpha})`
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},${alpha})`
}

/**
 * The button's own hover, as classes on the button inside a card (`group/pc` is the card). The tint is a layer of the
 * button's text colour (`before`), the shadow a layer under it (`after`); both fade, the button rises a pixel.
 */
export const PRODUCT_CTA_HOVER =
  "relative isolate transition-[translate] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-hover/pc:-translate-y-px group-active/pc:translate-y-0 " +
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity before:duration-200 group-hover/pc:before:opacity-[0.09] group-active/pc:before:opacity-[0.14] " +
  "after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-[inherit] after:shadow-[0_1px_2px_rgba(0,0,0,0.12),0_6px_14px_-6px_rgba(0,0,0,0.28)] after:opacity-0 after:transition-opacity after:duration-200 group-hover/pc:after:opacity-100"

/** The same, for a block that is itself the button (the "button" layout): its own hover, not a card's. */
export const PRODUCT_BUTTON_HOVER =
  "relative isolate transition-[translate] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-y-px active:translate-y-0 " +
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity before:duration-200 hover:before:opacity-[0.07] active:before:opacity-[0.12] " +
  "after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-[inherit] after:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_10px_22px_-10px_rgba(0,0,0,0.35)] after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-100"

export function OnePageProductBlock({ block, theme, quiet = false, inPair = false, seller, pageMoney, plainText, trackClick, animationClass, quick }: OnePageProductBlockProps) {
  const data = block.data as ProductBlockData
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [checkout, setCheckout] = React.useState<{ variantId: string | null; fromSheet: boolean } | null>(null)
  const pushed = React.useRef(false)
  const [warm, setWarm] = React.useState(false)
  const seen = React.useRef<HTMLSpanElement>(null)

  const layout = productLayoutOf(data)
  const plan = productTapPlan(data)
  const href = productHref(data)
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
    const el = seen.current
    if (!el || warm || plan === "navigate" || !data.product_id) return
    if (typeof IntersectionObserver === "undefined") return setWarm(true)
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect()
        const go = () => {
          setWarm(true)
          if (plan === "instant") void loadProductFacts(data.product_id).catch(() => undefined)
        }
        const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
        if (idle) idle(go, { timeout: 1200 })
        else window.setTimeout(go, 200)
      }
    }, { rootMargin: "200px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [plan, warm, data.product_id])

  if (!data.product_id && !data.product_title) return null

  /* ── Colours: the theme's button, the block's own choices, always readable ── */
  const radius = theme.button_border_radius
  const ownBackground = data.block_background_color || null
  const themeFill = theme.button_style !== "outline" && theme.button_style !== "glass"
  const surfaceColor = ownBackground || (themeFill ? theme.button_color : theme.background_color)
  const textColor = readableOn(surfaceColor, theme.button_text_color, data.text_color)
  const hasFill = Boolean(ownBackground) || themeFill
  /* The button inside a card: its own colour where one was chosen, else a shade of the card (or a tint of its text on a card with no fill). */
  /* A tint of the card's own text over the card: a light grey on a white card, a dark grey on a black one (a shade of black was black, and the button vanished). */
  const ctaBg = data.button_color || tintOf(textColor, hasFill ? "24" : "1c")
  const ctaText = data.button_color ? readableOn(isHex6(data.button_color) ? data.button_color : surfaceColor, textColor, data.button_text_color) : data.button_text_color || textColor

  const buttonShadow = (theme as { button_shadow?: string }).button_shadow || "none"
  const shadowColor = (theme as { button_shadow_color?: string }).button_shadow_color || "#000000"
  const shadow: Record<string, string> = {
    none: "none",
    subtle: `0 2px 4px ${rgba(shadowColor, 0.15)}`,
    strong: `0 4px 12px ${rgba(shadowColor, 0.3)}`,
    hard: `4px 4px 0px ${rgba(shadowColor, 0.9)}`,
  }
  const themeButton: React.CSSProperties = {
    backgroundColor: theme.button_style === "outline" ? "transparent" : theme.button_style === "glass" ? "rgba(255, 255, 255, 0.15)" : theme.button_color,
    color: theme.button_text_color,
    borderRadius: `${radius}px`,
    borderWidth: `${theme.button_style === "outline" ? Math.max(2, theme.button_border_width || 0) : theme.button_border_width || 0}px`,
    borderStyle: "solid",
    borderColor: theme.button_style === "outline" ? theme.button_border_color || theme.button_color : theme.button_border_color,
    backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
    boxShadow: shadow[buttonShadow] || "none",
  }
  const cardStyle: React.CSSProperties = ownBackground
    ? { borderRadius: `${radius}px`, backgroundColor: ownBackground, border: "none", boxShadow: shadow[buttonShadow] || "none" }
    : { ...themeButton, color: undefined }
  const innerRadius = Math.max(6, radius - 6)

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

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackClick(block.id, href)
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
    }
  }

  const priceLine = (cls: string, color: string) =>
    showPrice && !purchased ? (
      <p className={cn("flex flex-wrap items-baseline gap-x-1.5 tabular-nums", cls)} style={{ color }} data-product-price="">
        <span>{now}</span>
        {parts.was ? <s className="text-[0.85em] font-normal opacity-60">{parts.was}</s> : null}
      </p>
    ) : null
  const ctaButton = (cls: string, style?: React.CSSProperties) => (
    <span className={cn("inline-flex items-center justify-center font-medium", PRODUCT_CTA_HOVER, cls)} style={{ backgroundColor: ctaBg, color: ctaText, borderRadius: `${innerRadius}px`, ...style }} data-product-cta="">
      <span className="relative truncate">{cta}</span>
    </span>
  )
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
      className={cn("group/pc block w-full cursor-pointer overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2", cls, animationClass)}
      style={style}
      data-product-block={layout}
      data-product-tap={plan}
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
          className={cn("flex w-full cursor-pointer items-center justify-center gap-2 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:gap-3 sm:px-5 sm:py-4 sm:text-base", !quiet && PRODUCT_BUTTON_HOVER, animationClass)}
          style={themeButton}
          data-product-block="button"
          data-product-tap={plan}
        >
          {data.product_thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.product_thumbnail} alt={title} className="relative h-6 w-6 shrink-0 rounded object-cover sm:h-7 sm:w-7" />
          ) : null}
          <span className="relative truncate">{cta}</span>
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
            <span className="block truncate text-[15px] font-medium sm:text-base" style={{ color: textColor }}>
              {title}
            </span>
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
            <span className="line-clamp-2 text-[15px] font-semibold leading-snug sm:text-base" style={{ color: textColor }}>
              {title}
            </span>
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
            <span className="line-clamp-2 text-[14.5px] font-semibold leading-snug" style={{ color: textColor }}>
              {title}
            </span>
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
                <span className="line-clamp-2 text-[17px] font-semibold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">{title}</span>
                {priceLine("mt-0.5 text-[14.5px] font-semibold", "#ffffff")}
              </span>
              {ctaButton("h-10 max-w-[48%] shrink-0 px-4 text-sm", { backgroundColor: "#ffffff", color: "#111113" })}
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
            <span className="block text-base font-medium sm:text-lg" style={{ color: textColor }}>
              {title}
            </span>
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
      const pillBg = theme.button_style === "outline" || theme.button_style === "glass" ? theme.text_color : theme.button_color
      const pillText = readableOn(pillBg, theme.button_style === "outline" || theme.button_style === "glass" ? theme.background_color : theme.button_text_color)
      body = shell(
        <span className="flex items-center gap-3 px-1 py-3" style={{ borderBottom: `1px solid ${tintOf(theme.text_color, "26")}` }}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15.5px] font-medium sm:text-base" style={{ color: theme.text_color }}>
              {title}
            </span>
            {description ? (
              <span className="block truncate text-[13px] opacity-70" style={{ color: theme.text_color }}>
                {description}
              </span>
            ) : null}
          </span>
          <span className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold tabular-nums", PRODUCT_CTA_HOVER)} style={{ backgroundColor: pillBg, color: pillText }} data-product-cta="">
            <span className="relative">{showPrice && !purchased ? now : cta}</span>
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
              <span className="block truncate text-base font-medium sm:text-lg" style={{ color: textColor }}>
                {title}
              </span>
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

  /* The page's ground decides the checkout window's look: the community's dark window on a dark page. */
  const bg = theme.background_color && isHex6(theme.background_color) ? theme.background_color : "#ffffff"
  const darkPage = (() => {
    try {
      return luminance(bg) < 0.18
    } catch {
      return false
    }
  })()

  return (
    <>
      {body}
      {plan !== "navigate" ? <span ref={seen} aria-hidden className="block h-0 w-full" /> : null}
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
        />
      ) : null}
      {checkout && data.product_id ? (
        <InstantCheckout
          productId={data.product_id}
          title={title}
          sellerName={seller.name}
          sellerAvatar={seller.avatarUrl}
          variantId={checkout.variantId}
          dark={darkPage}
          origin={pageOrigin}
          onClose={() => setCheckout(null)}
          onBack={checkout.fromSheet ? () => setCheckout(null) : null}
        />
      ) : null}
    </>
  )
}

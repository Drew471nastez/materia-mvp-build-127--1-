"use client"

/**
 * ===========================================================================
 *  A PRODUCT IN A SHEET, OVER THE ONEPAGE
 * ===========================================================================
 * Round 10, the owner: "when I click on a product, instead of redirecting me
 * to a new link of that product page, it can keep me on the OnePage but open
 * a mobile bottom sheet, very smooth, with that product page there".
 *
 * On a phone it is the app's one sheet (components/ui/bottom-sheet, through
 * components/ui/sheet-dialog), so it opens, follows the thumb and flicks
 * closed like every other sheet; on a computer the same content sits in a
 * centred window. Its pictures, title, price, description and options come
 * from /api/onepage/product, which answers only for a published product. Its
 * button buys the way the block asked: the checkout window on this page
 * (components/checkout/instant-checkout) or the checkout page.
 *
 * The block keeps #product-<slug> in the address while the sheet is up, so
 * Back closes it and a shared link opens it (components/onepage/product-block).
 *
 * ROUND 41. "Make the sheet more modern, not cut at the top by the pill-shaped
 * drag handle": the pictures ran edge to edge right under the handle, so the
 * handle's strip looked like it had cut the top off them. They now sit inside
 * the sheet with their own rounded corners and room above, the handle alone
 * on the sheet's surface over them. And what the button does is the creator's
 * choice (lib/onepage/product-block productSheetAction): check out (with a
 * quiet link to the full page, or not), or the full page. Before anything is
 * paid the option is chosen and, for a product that ships, the quantity: the
 * button says what is missing until it is (sheetBuyBlocker). A product that
 * ships goes straight to its store website's checkout with that option and
 * quantity in it (round 49, lib/onepage/shipped-checkout), not to its page first.
 *
 * ROUND 43, "complete and smooth":
 *
 *   pictures     swiped on a phone, arrows and the arrow keys on a computer,
 *                a row of thumbnails under them when there are two or more,
 *                and dots on a dark capsule so they read on a white photo.
 *                Choosing a variant with its own picture goes to it.
 *   options      one row per option, as the product defines it: colours as
 *                swatches (the seller's own colour or photo, else the
 *                colour the name says), sizes as pills, a value that cannot
 *                be bought crossed out (lib/onepage/product-sheet, on the
 *                product page's own rules)
 *   size guide   a link beside the size option that slides the chart open
 *                under it (grid rows, so nothing jumps)
 *   price        the variant's, its compare at price struck through and a
 *                "Save 24%" badge
 *   asked        the product's personalization fields, checked before the
 *                cart checkout is opened (components/personalization)
 *   button       says what is missing ("Choose a size", "Sold out"), and
 *                with the creator's choice carries the price ("Buy now ·
 *                €49", lib/onepage/product-block sheetButtonLabel)
 *   theme        the page's colours through `op-sheet` (lib/onepage/
 *                sheet-theme), and now its typefaces too
 *
 * On a computer the window is two columns: the pictures on the left, the
 * words, options and button on the right.
 */
import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Minus, Pause, Play, Plus, Ruler } from "lucide-react"
import { cn } from "@/lib/utils"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { loadProductFacts, type ProductFacts } from "@/components/checkout/instant-checkout"
import { productCheckoutUrl, sheetBuyBlocker, sheetButtonLabel, sheetMaxQuantity } from "@/lib/onepage/product-block"
import { onePageShippedCheckoutHref } from "@/lib/onepage/shipped-checkout"
import { onePageOutboundHref, platformHref } from "@/lib/onepage/return-address"
import { ProductQuestions, SizeChartBody, SizeChartPanel } from "@/components/product/size-chart-panel"
import { pixelEvent } from "@/lib/analytics/pixels"
import { choose, pickerOptions, valueAvailable, variantFor, type ProductOptionData } from "@/lib/products/product-page-model"
import { DOT_STEP_PX, SHEET_GALLERY_RATIO, dotPosition, isSizeOption, mediaFit, optionLook, savedPercent, sheetImageFor, sheetImages, sheetModel, sheetStartChoice, sheetValued, valueSwatch, type SheetModel } from "@/lib/onepage/product-sheet"
import { mediaOf, type MediaEntry } from "@/lib/media/video"
import { FramedPicture, useLetterbox } from "@/components/ui/framed-picture"
import { firstFrameSrc, prefersStill } from "@/lib/onepage/poster-video"
import { ProductLightbox, preloadLightboxPlayer } from "./product-lightbox"
import { PersonalizationFields, usePersonalization } from "@/components/personalization/personalization-fields"
import { filledAnswers } from "@/lib/products/personalization"
import type { SizeChart } from "@/lib/size-charts/model"

/** The sheet's main button: lifted a pixel under a mouse (translate), lit by a layer's opacity. */
const MAIN_BUTTON =
  "relative isolate flex h-12 items-center justify-center overflow-hidden rounded-xl bg-[#111113] text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] outline-none transition-[translate,opacity] duration-200 ease-out before:absolute before:inset-0 before:bg-white before:opacity-0 before:transition-opacity before:duration-200 hover:-translate-y-px hover:before:opacity-[0.08] active:translate-y-0 focus-visible:ring-2 focus-visible:ring-[#111113]/30 focus-visible:ring-offset-2"

/** The motion every opening part of the sheet shares: iOS's own curve. */
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]"

/** Under 768px the sheet; above it the window. Known before the first paint, so it never swaps on screen. */
export function usePhoneWidth(): boolean {
  const [phone, setPhone] = React.useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches)
  React.useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)")
    const sync = () => setPhone(m.matches)
    sync()
    m.addEventListener("change", sync)
    return () => m.removeEventListener("change", sync)
  }, [])
  return phone
}

export interface ProductSheetProps {
  open: boolean
  onClose: () => void
  /** The block has been on screen: the product is read now, and the sheet built while the page is idle, so a tap only slides it up. */
  warm?: boolean
  productId: string
  /** What the block already shows, drawn at once while the rest arrives. */
  title: string
  image?: string | null
  priceText?: string | null
  ctaText: string
  /** The button opens the checkout window on this page (instant checkout); otherwise the checkout page. */
  instant: boolean
  onBuy: (variantId: string | null) => void
  onClosed?:()=>void
  onCheckoutLink?: (href: string) => void
  /** The OnePage to come back to from the checkout or the product page (lib/onepage/return-address). */
  back?: string | null
  /** Round 41: the main button checks out (unset) or opens the full page. */
  action?: "checkout" | "page"
  /** Round 41: with checkout as the main button, a quiet link to the full page under it. */
  pageLink?: boolean
  /** Round 43: the checkout button carries the price ("Buy now · €49"). */
  priceOnButton?: boolean
  /** Round 43: the page's typefaces (lib/onepage/fonts fontStack), for the words and for the title. */
  font?: { body?: string; title?: string } | null
}

const EMPTY_MODEL: SheetModel = { options: [], variants: [] }

export function ProductSheet({ open, onClose, warm = false, productId, title, image, priceText, ctaText, instant, onBuy, onClosed, onCheckoutLink, back = null, action = "checkout", pageLink = true, priceOnButton = false, font = null }: ProductSheetProps) {
  const phone = usePhoneWidth()
  /*
    GONE MEANS GONE (round AK). The checkout opens once the sheet has left (lib/onepage/purchase-flow), so `onClosed`
    must say when that is. On a phone the sheet says it itself (BottomSheet onClosed). On a computer the Radix dialog
    fades its content (150ms) and its dimming layer (200ms) separately and says nothing: it is watched, frame by
    frame, until both are out of the document. A 180ms guess opened the checkout under the fading layer.
  */
  const closedCallback = React.useRef(onClosed)
  closedCallback.current = onClosed
  const wasOpen = React.useRef(false)
  const body = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (open) {
      wasOpen.current = true
      return
    }
    if (phone || !wasOpen.current) return
    let frame = 0
    const started = performance.now()
    /* Read now: the content is still in the document while it fades, and React clears the ref when it goes. */
    const content = body.current
    const watch = () => {
      const fading = (content && content.isConnected) || document.querySelector("[data-slot=dialog-overlay]")
      if (fading && performance.now() - started < 600) {
        frame = requestAnimationFrame(watch)
        return
      }
      wasOpen.current = false
      closedCallback.current?.()
    }
    frame = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(frame)
  }, [open, phone])
  const [facts, setFacts] = React.useState<ProductFacts | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  /* The value chosen for each option, in the options' order (lib/onepage/product-sheet sheetStartChoice). */
  const [chosen, setChosen] = React.useState<(string | null)[] | null>(null)
  const [quantity, setQuantity] = React.useState(1)

  React.useEffect(() => {
    if (!open && !warm) return
    let live = true
    setFailed(null)
    loadProductFacts(productId)
      .then((f) => {
        if (!live) return
        setFacts(f)
        /* One option is the product: chosen for the buyer. Valued options open on the first that can be bought. Two or more licences: the buyer chooses. */
        setChosen((c) => c ?? sheetStartChoice(sheetModel(f.product)))
      })
      .catch((e: Error) => live && setFailed(e.message))
    return () => {
      live = false
    }
  }, [open, warm, productId])

  const p = facts?.product ?? null
  /* Round 41: the sheet opened on its product is a product view to the store's pixels (Meta and TikTok ViewContent, GA4 view_item), once per opening. */
  const toldView = React.useRef(false)
  React.useEffect(() => {
    if (!open) toldView.current = false
    else if (p && !toldView.current) {
      toldView.current = true
      pixelEvent(window, "view_item", productId, { valueCents: p.priceCents, currency: p.currency })
    }
  }, [open, p, productId])

  const model = React.useMemo(() => (p ? sheetModel(p) : EMPTY_MODEL), [p])
  const options = React.useMemo(() => pickerOptions(model), [model])
  const valued = React.useMemo(() => sheetValued(model), [model])
  const choice = chosen ?? []
  const picked = p && p.variants.length ? variantFor(model, choice) : null
  const variant = picked ? p!.variants.find((v) => v.id === picked.id) ?? null : null
  const personal = usePersonalization(p?.ships ? p.personalization : undefined)

  const fmt = (cents: number) => shopMoneyIn(cents, p?.currency || "usd")
  const nowCents = p ? (variant ? variant.priceCents : p.priceCents) : 0
  const price = !p
    ? priceText ?? null
    : p.pwyw && !variant
      ? p.pwywMinCents > 0
        ? `From ${fmt(p.pwywMinCents)}`
        : "Free"
      : nowCents > 0
        ? fmt(nowCents)
        : "Free"
  /* The struck price: the variant's own, else the product's while no variant has a price of its own to say. */
  const wasCents = !p ? null : variant ? (picked?.compare_at_cents ?? (variant.priceCents === p.priceCents ? p.compareAtCents : null)) : p.compareAtCents
  const was = p && wasCents && wasCents > nowCents && !(p.pwyw && !variant) ? fmt(wasCents) : null
  const saved = was ? savedPercent(nowCents, wasCents) : null
  const images = React.useMemo(() => sheetImages(p?.images ?? [], model, image), [p, model, image])
  const focusImage = sheetImageFor(images, picked)
  const owned = !!facts?.buyer && (facts.buyer.owned || (!!variant && facts.buyer.ownedVariants.includes(variant.id)))
  const variantOut = !!picked && picked.available === false
  const soldOut = !!p?.soldOut || variantOut
  const maxQuantity = p?.ships ? Math.min(sheetMaxQuantity(p.maxQuantity), picked && picked.max_quantity > 0 ? picked.max_quantity : 99) : 1
  React.useEffect(() => {
    if (quantity > maxQuantity) setQuantity(Math.max(1, maxQuantity))
  }, [quantity, maxQuantity])
  const left = picked && typeof picked.left === "number" ? (picked.left > 0 && picked.left < 10 ? picked.left : null) : p?.left ?? null
  const blocker = sheetBuyBlocker({ loaded: !!p, soldOut, variantCount: p?.variants.length ?? 0, variantChosen: !!variant, quantity, maxQuantity })
  /*
    A product that ships: its store website's checkout (round 49, lib/onepage/shipped-checkout), the new one every
    product that ships is paid on, with the option, quantity and what the buyer wrote, Back to this OnePage and the
    order's Source as the OnePage. Anything else: its checkout.
  */
  const cartFor = (properties?: Record<string, string>) =>
    p?.ships && p.shopId ? onePageShippedCheckoutHref({ siteOrigin: p.siteOrigin, shopId: p.shopId, items: [{ productId: p.id, variantId: variant?.id ?? null, quantity, ...(properties ? { properties } : {}) }], onePage: back }) : null
  const cartPath = cartFor(filledAnswers(personal.values))
  const checkoutPath = p ? (p.ships ? cartPath ?? p.pageUrl : productCheckoutUrl(p.id, variant?.id ?? null)) : null
  /* The website's own address, or on storelib.com itself with the way back here: one navigation, and Back lands on this OnePage. */
  const checkoutHref = cartPath ? platformHref(cartPath) : checkoutPath ? onePageOutboundHref(checkoutPath, back) : null
  const pageHref = p?.pageUrl && p.pageUrl !== "#" ? onePageOutboundHref(p.pageUrl, back) : null
  const free = price === "Free"
  /* The first option still to choose, by its own name: "Choose a size". */
  const missing = blocker === "choose option" ? options.find((_, i) => !choice[i]) ?? null : null
  const words = p?.ships ? "Check out" : free ? "Get it free" : "Buy now"
  const label =
    blocker === "loading"
      ? ctaText
      : blocker === "sold out"
        ? "Sold out"
        : blocker === "choose option"
          ? valued && missing && missing.name !== "Option"
            ? `Choose ${/^[aeiou]/i.test(missing.name) ? "an" : "a"} ${missing.name.toLowerCase()}`
            : "Choose an option"
          : sheetButtonLabel(words, price, priceOnButton)

  const pick = (i: number, value: string) => {
    if (!p) return
    setChosen((c) => (valued ? choose(model, c ?? [], i, value) : options.map((_, j) => (j === i ? value : (c ?? [])[j] ?? null))))
  }

  const buy = (e: React.MouseEvent) => {
    if (!p || blocker) {
      e.preventDefault()
      return
    }
    if (instant && facts?.checkout.instant && !p.ships) {
      e.preventDefault()
      onBuy(variant?.id ?? null)
      return
    }
    /* What the buyer was asked: every required answer there and no photo still going up, or the fields say what is missing. */
    if (p.ships && personal.fields.length) {
      e.preventDefault()
      const answers = personal.check()
      if (answers === null) return
      const to = cartFor(answers ?? undefined)
      if (!to) return
      onCheckoutLink?.(to)
      window.location.assign(platformHref(to))
      return
    }
    if (checkoutPath) onCheckoutLink?.(checkoutPath)
  }

  const bodyFont = font?.body ? { fontFamily: font.body } : undefined
  const titleFont = font?.title ? { fontFamily: font.title } : undefined
  const desktop = !phone
  const twoColumns = desktop && images.length > 0

  const gallery = images.length ? (
    /* Inside the sheet, with room above and its own corners: the handle sits alone on the sheet over it. */
    /* Round W8: the same side padding as the title, price and Buy under it, so the square lines up with them. */
    <div className={twoColumns ? "min-h-0 p-5 pr-0" : "px-5 pt-2 sm:px-6 sm:pt-5"}>
      <Gallery images={images} title={title} phone={phone} focus={focusImage} tall={twoColumns} active={open} />
    </div>
  ) : null

  const details = (
    <div className={cn("space-y-3 px-5 pb-8 pt-4 sm:px-6", twoColumns && "pt-6")} data-product-sheet-details="">
      <SheetDialogTitle className={cn("text-[20px] font-semibold leading-snug tracking-[-0.01em] text-[#111113]", twoColumns && "pr-8")}>
        <span style={titleFont}>{p?.title || title}</span>
      </SheetDialogTitle>
      {price ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1" data-product-sheet-price="">
          <span className="text-[18px] font-semibold tabular-nums text-[#111113]">{price}</span>
          {was ? <s className="text-[14px] tabular-nums text-[#6b7280]" data-product-sheet-was="">{was}</s> : null}
          {saved ? (
            <span className="inline-flex h-6 items-center rounded-full bg-[#111113] px-2 text-[12px] font-semibold tabular-nums text-white" data-product-sheet-sale="">
              Save {saved}%
            </span>
          ) : null}
          {left && !soldOut ? <span className="rounded-full bg-[#f4f4f6] px-2 py-0.5 text-[12px] font-medium text-[#4b5563]">Only {left} left</span> : null}
        </p>
      ) : null}
      {p && p.variants.length > 1 ? (
        <div className="space-y-4 pt-1" data-product-sheet-options="">
          {options.map((o, i) => (
            <OptionRow
              key={`${o.name}-${i}`}
              option={o}
              index={i}
              named={valued}
              model={model}
              chosen={choice}
              onPick={(value) => pick(i, value)}
              sizeChart={valued && isSizeOption(o.name) ? p.sizeChart ?? null : null}
            />
          ))}
        </div>
      ) : null}
      {p?.ships && !p.soldOut ? (
        <div className="flex items-center justify-between gap-3 pt-1" data-product-sheet-qty="">
          <span className="text-[14px] font-medium text-[#374151]">Quantity</span>
          <div className="flex h-10 items-center rounded-xl border border-[#e3e4e8]">
            <button type="button" aria-label="One fewer" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} className="grid h-10 w-10 place-items-center text-[#111113] transition-opacity disabled:opacity-30" data-product-sheet-qty-less="">
              <Minus aria-hidden className="h-4 w-4" />
            </button>
            <span className="w-8 text-center text-[15px] font-semibold tabular-nums text-[#111113]" aria-live="polite">
              {quantity}
            </span>
            <button type="button" aria-label="One more" onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} disabled={quantity >= maxQuantity} className="grid h-10 w-10 place-items-center text-[#111113] transition-opacity disabled:opacity-30" data-product-sheet-qty-more="">
              <Plus aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
      {p?.ships && personal.fields.length && !soldOut ? (
        <PersonalizationFields
          state={personal}
          productId={p.id}
          className="space-y-4 pt-2"
          look={{ ink: "var(--opk-ink, #111113)", muted: "var(--opk-muted, #6b7280)", line: "var(--opk-line, #e3e4e8)", field: "var(--opk-surface, #ffffff)", radius: 12 }}
        />
      ) : null}
      {failed ? <p className="text-[14px] text-[#6b7280]">{failed}</p> : null}
      {p?.descriptionHtml ? (
        <div
          className="max-w-none pt-1 text-[15px] leading-relaxed text-[#374151] [&_a]:underline [&_h1]:text-[17px] [&_h1]:font-semibold [&_h2]:text-[16px] [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:my-3 [&_img]:rounded-xl [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc"
          data-product-sheet-description=""
          /* Sanitised on the server (lib/website-builder/sanitize sanitizeRichText), as every creator text a page shows. */
          dangerouslySetInnerHTML={{ __html: p.descriptionHtml }}
        />
      ) : !p && !failed ? (
        <div aria-hidden className="space-y-2 pt-1">
          <div className="h-3.5 w-11/12 rounded-full bg-[#f1f2f4]" />
          <div className="h-3.5 w-4/5 rounded-full bg-[#f1f2f4]" />
          <div className="h-3.5 w-2/3 rounded-full bg-[#f1f2f4]" />
        </div>
      ) : null}
      {/* Round 13: its size chart and its own questions, as its product page shows them. Round 43: beside the size option when it has one. */}
      {p?.sizeChart && !(valued && options.some((o) => isSizeOption(o.name)) && p.variants.length > 1) ? <SizeChartPanel chart={p.sizeChart} className="mt-1" /> : null}
      {p?.faqs?.length ? <ProductQuestions faqs={p.faqs} className="pt-2" /> : null}
    </div>
  )

  const actions = (
    /*
      Wave 10 (legible), the owner's phone: the Buy bar "cuts" the Size row. No hard line across the words any more: the
      bar is the sheet's own surface, and a soft fade of that surface (::before, 24px, over the last words) says there is
      more under it; the words above end with room to clear that fade (details' pb-8), so the last row scrolls fully into
      view. The bar's own bottom keeps the iPhone's home indicator clear (safe area).
    */
    <div className="relative z-[1] shrink-0 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-gradient-to-t before:from-[color-mix(in_srgb,var(--opk-surface,#ffffff)_88%,transparent)] before:to-transparent before:content-[''] sm:px-6 sm:pb-5" data-product-sheet-actions="">
      {failed && !p ? (
        <p className="flex h-12 items-center justify-center rounded-xl bg-[#f4f4f6] text-[15px] font-semibold text-[#6b7280]" data-product-sheet-unavailable="">
          Not for sale right now
        </p>
      ) : p?.soldOut ? (
        <p className="flex h-12 items-center justify-center rounded-xl bg-[#f4f4f6] text-[15px] font-semibold text-[#6b7280]" data-product-sheet-soldout="">
          Sold out
        </p>
      ) : owned && facts?.buyer ? (
        <a href={platformHref(facts.buyer.library)} className="flex h-12 items-center justify-center rounded-xl bg-[#111113] text-[15px] font-semibold text-white transition-[opacity] duration-150 hover:opacity-90">
          Open in your library
        </a>
      ) : action === "page" && pageHref ? (
        <a href={pageHref} className={MAIN_BUTTON} data-product-sheet-buy="" data-product-sheet-action="page">
          <span className="relative inline-flex items-center gap-1.5">
            View full page
            <ExternalLink aria-hidden className="h-4 w-4" />
          </span>
        </a>
      ) : (
        <a
          href={checkoutHref ?? "#"}
          onClick={buy}
          aria-disabled={blocker ? true : undefined}
          className={cn(MAIN_BUTTON, blocker === "loading" && "pointer-events-none opacity-60", (blocker === "choose option" || blocker === "sold out") && "opacity-50")}
          data-product-sheet-buy=""
          data-product-sheet-action="checkout"
        >
          <span className="relative truncate px-4 tabular-nums" data-product-sheet-label="">{label}</span>
        </a>
      )}
      {pageHref && pageLink && action !== "page" && !(failed && !p) ? (
        <a href={pageHref} className="mt-2 flex h-10 items-center justify-center gap-1.5 text-[13.5px] font-medium text-[#6b7280] transition-colors hover:text-[#111113]" data-product-sheet-page="">
          See full page
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  )

  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      phone={phone}
      label={title}
      onOpenAutoFocus={(e) => e.preventDefault()}
      /*
        Round 40: `op-sheet` draws it in the page's own colours (lib/onepage/sheet-theme, app/globals.css). The
        variables are written by the OnePage itself; anywhere else the fallbacks are the colours it always had.
        Round 43: on a computer, two columns when there are pictures: they on the left, the rest on the right.
      */
      className={cn(
        "op-sheet flex max-h-[min(90dvh,820px)] flex-col gap-0 overflow-hidden rounded-[20px] border-[#ececf1] bg-white p-0 [&>[data-slot=dialog-close]]:rounded-full [&>[data-slot=dialog-close]]:bg-white/90 [&>[data-slot=dialog-close]]:p-1.5",
        twoColumns ? "sm:max-w-[920px]" : "sm:max-w-[560px]",
      )}
      /* Kept built once the block is seen (keepMounted): opening is a transform, never a render of the whole product on the tap. */
      sheet={{ onClosed: () => { wasOpen.current = false; closedCallback.current?.() }, waitForImages: !warm, keepMounted: warm, maxHeight: "calc(var(--vv-h, 100dvh) * 0.92)", className: "op-sheet" }}
    >
      {twoColumns ? (
        <div ref={body} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" style={bodyFont} data-product-sheet={productId} data-product-sheet-columns="">
          <div className="min-h-0 overflow-y-auto overscroll-contain op-subtle-scroll">{gallery}</div>
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain op-subtle-scroll">{details}</div>
            {actions}
          </div>
        </div>
      ) : (
        <div ref={body} className="flex min-h-0 flex-col" style={bodyFont} data-product-sheet={productId}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain op-subtle-scroll">
            {gallery}
            {details}
          </div>
          {actions}
        </div>
      )}
    </SheetDialog>
  )
}

/* ── One option: its name and chosen value, then its values as swatches or pills ── */

function OptionRow({
  option,
  index,
  named,
  model,
  chosen,
  onPick,
  sizeChart,
}: {
  option: ProductOptionData
  index: number
  /** The option has a name of its own (Size, Colour); licences are one row of names under no heading. */
  named: boolean
  model: SheetModel
  chosen: (string | null)[]
  onPick: (value: string) => void
  sizeChart: SizeChart | null
}) {
  const [guide, setGuide] = React.useState(false)
  const look = optionLook(option)
  const current = chosen[index] ?? null
  const swatches = look === "swatch" ? option.values.map((v) => valueSwatch(option, index, v, model)) : null
  /* A colour option whose values are no colour and have no photo is drawn as pills, the same as a size. */
  const asSwatches = !!swatches && swatches.some((s) => s.kind !== "word")
  const id = `sheet-opt-${index}`
  return (
    <div data-product-sheet-option={option.name} data-look={asSwatches ? "swatch" : "pill"}>
      {named ? (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p id={id} className="min-w-0 truncate text-[14px] font-medium text-[#111113]">
            {option.name}
            {current ? <span className="ml-1.5 font-normal text-[#6b7280]">{current}</span> : null}
          </p>
          {sizeChart ? (
            <button
              type="button"
              aria-expanded={guide}
              onClick={() => setGuide((g) => !g)}
              className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-[#6b7280] underline-offset-2 transition-colors hover:text-[#111113] hover:underline"
              data-product-sheet-size-guide=""
            >
              <Ruler aria-hidden className="h-3.5 w-3.5" />
              Size guide
              <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-[rotate] duration-200", guide && "rotate-180")} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div role="radiogroup" aria-labelledby={named ? id : undefined} aria-label={named ? undefined : "Options"} className={cn("flex flex-wrap", asSwatches ? "gap-2.5" : "gap-2")}>
        {option.values.map((value, j) => {
          const on = value === current
          const can = valueAvailable(model, chosen, index, value)
          const sw = asSwatches ? swatches![j] : null
          if (sw && sw.kind !== "word") {
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={can ? value : `${value}, sold out`}
                title={value}
                onClick={() => onPick(value)}
                data-product-sheet-value={value}
                data-swatch={sw.kind}
                data-unavailable={can ? undefined : ""}
                className={cn(
                  "relative grid h-10 w-10 shrink-0 place-items-center rounded-full border outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#111113]/30",
                  on ? "border-[#111113] shadow-[0_0_0_1px_var(--opk-ink,#111113)]" : "border-[#e3e4e8] hover:border-[#c9ccd2]",
                )}
              >
                <span
                  aria-hidden
                  className="block h-[30px] w-[30px] overflow-hidden rounded-full bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
                  style={sw.kind === "color" ? { backgroundColor: sw.color } : { backgroundImage: `url("${sw.src.replace(/"/g, "%22")}")` }}
                />
                {!can ? <span aria-hidden className="pointer-events-none absolute inset-[5px] rounded-full bg-[linear-gradient(135deg,transparent_calc(50%-0.75px),rgba(255,255,255,0.95)_calc(50%-0.75px),rgba(255,255,255,0.95)_calc(50%+0.75px),transparent_calc(50%+0.75px))] opacity-90" /> : null}
              </button>
            )
          }
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={can ? undefined : `${value}, sold out`}
              onClick={() => onPick(value)}
              data-product-sheet-value={value}
              data-unavailable={can ? undefined : ""}
              className={cn(
                "min-h-10 min-w-11 rounded-xl border px-3.5 text-[14px] font-medium outline-none transition-[border-color,box-shadow,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25",
                on ? "border-[#111113] bg-white text-[#111113] shadow-[0_0_0_1px_var(--opk-ink,#111113)]" : "border-[#e3e4e8] bg-[#fbfbfc] text-[#374151] hover:border-[#c9ccd2]",
                !can && "text-[#9ca3af] line-through decoration-1",
              )}
            >
              {value}
            </button>
          )
        })}
      </div>
      {sizeChart ? (
        /* Slid open under the option, grid rows from 0 to its height: nothing below it jumps. */
        <div className={cn("grid transition-[grid-template-rows,opacity] duration-300", EASE, guide ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} data-product-sheet-size-chart={guide ? "open" : "closed"} inert={!guide || undefined}>
          <div className="min-h-0 overflow-hidden">
            <div className="mt-3 rounded-xl border border-[#ececf1] bg-white pt-3">
              <p className="mb-2 px-4 text-[13px] font-medium text-[#6b7280]">{sizeChart.name}</p>
              <SizeChartBody chart={sizeChart} className="px-4 pb-4" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ── The pictures and videos ───────────────────────────────────────────── */

/**
 * Swiped on a phone (scroll snap), stepped with arrows and the arrow keys on a computer; with two or more, dots on
 * a dark capsule over them and a row of thumbnails under them. `focus` is a picture to go to (a variant's own).
 *
 * ROUND 53, the owner: "the dots glitch and flash on phones", "the arrows are hidden or badly coloured", "a bit
 * taller", "a proper image and video player".
 *
 *   DOTS      the lit dot is moved with the scroll itself, in every frame (its `translate` written from the scroll
 *             position, no render): it follows the thumb and lands with the snap. It was a bar that jumped from one
 *             dot to the next when the scroll crossed half way, its width animated over 300ms behind the finger,
 *             and a step by an arrow or a thumbnail moved it at once while the picture took its time.
 *   SLIDES    keyed by their place, not their address: when the product's own pictures arrive over the block's,
 *             the same <img> takes the new address, and a browser keeps the old picture until the new one is
 *             decoded, so no frame is empty. The dots fade in when they arrive (starting style), never pop.
 *   STEPS     an arrow or a thumbnail scrolls to its slide; the slide index moves at once and the scroll's own
 *             positions on the way are not read back as steps.
 *   ARROWS    the sheet's own surface and ink (the page's theme), with a hairline, so they read on a white photo
 *             and on a dark sheet; dimmed at the ends rather than gone.
 *   RATIO     a square on a phone and in its column (round W8, SHEET_GALLERY_RATIO), pictures filled; a video
 *             fills it when that cuts little and sits whole otherwise (lib/onepage/product-sheet mediaFit).
 *   VIDEO     a video in the product's gallery (products.gallery_urls, lib/media/video) is a video: muted, inline
 *             and looping, from its stored first frame, playing while it is the one shown and the sheet is up,
 *             with a play and pause button; never by itself with reduced motion or Save Data. A tap on any slide
 *             opens it full screen (./product-lightbox), where a video plays in Storelib's own player.
 */
function Gallery({ images, title, phone, focus = -1, active = true }: { images: string[]; title: string; phone: boolean; focus?: number; tall?: boolean; active?: boolean }) {
  const media = React.useMemo(() => mediaOf(images), [images])
  const count = media.length
  /*
    Round W8, the owner: the main picture stood tall and portrait over the sheet. The frame is a square now
    (lib/onepage/product-sheet SHEET_GALLERY_RATIO), the full width of the sheet's content, every picture filling it
    (object-cover) as its thumbnail under it does. One shape whatever the pictures are, so nothing resizes on a
    swipe or when a picture's own shape is read late; the computer's column (`tall`) is the same square.
  */
  const ratio = SHEET_GALLERY_RATIO
  const strip = React.useRef<HTMLDivElement>(null)
  const lit = React.useRef<HTMLSpanElement>(null)
  const thumbs = React.useRef<HTMLDivElement>(null)
  const [at, setAt] = React.useState(0)
  const atRef = React.useRef(0)
  /* The slide an arrow or a thumbnail is scrolling to: the scroll's positions on the way there are not steps. */
  const heading = React.useRef<number | null>(null)
  const [lightbox, setLightbox] = React.useState<number | null>(null)
  const ratios = React.useRef<Record<number, number>>({})
  const many = count > 1
  const hasVideo = media.some((m) => m.type === "video")

  const settle = React.useCallback((n: number) => {
    if (n === atRef.current) return
    atRef.current = n
    setAt(n)
  }, [])

  /* The lit dot to the scroll, written straight to its style: once per scroll event, no render. */
  const track = React.useCallback(() => {
    const el = strip.current
    if (!el) return
    const pos = dotPosition(el.scrollLeft, el.clientWidth, count)
    if (lit.current) lit.current.style.translate = `${pos * DOT_STEP_PX}px 0`
    if (heading.current !== null) {
      if (Math.abs(pos - heading.current) > 0.01) return
      heading.current = null
    }
    settle(Math.round(pos))
  }, [count, settle])

  const go = React.useCallback(
    (i: number, smooth = true) => {
      const el = strip.current
      if (!el) return
      const n = Math.max(0, Math.min(count - 1, i))
      heading.current = smooth ? n : null
      el.scrollTo({ left: n * el.clientWidth, behavior: smooth ? "smooth" : "auto" })
      settle(n)
      if (!smooth) track()
      /* Where scrollend is not heard: the step lets go once a smooth scroll has surely finished. */
      else
        window.setTimeout(() => {
          if (heading.current !== n) return
          heading.current = null
          track()
        }, 900)
    },
    [count, settle, track],
  )

  /* A finger or a wheel takes over from a step on its way; the end of any scroll reads where it stopped. */
  React.useEffect(() => {
    const el = strip.current
    if (!el) return
    const takeOver = () => {
      heading.current = null
    }
    const ended = () => {
      heading.current = null
      track()
    }
    el.addEventListener("pointerdown", takeOver, { passive: true })
    el.addEventListener("touchstart", takeOver, { passive: true })
    el.addEventListener("wheel", takeOver, { passive: true })
    el.addEventListener("scrollend", ended)
    return () => {
      el.removeEventListener("pointerdown", takeOver)
      el.removeEventListener("touchstart", takeOver)
      el.removeEventListener("wheel", takeOver)
      el.removeEventListener("scrollend", ended)
    }
  }, [track, many])

  /* The dot where the strip is, before the first paint and whenever the count changes. */
  React.useLayoutEffect(() => {
    track()
  }, [track])

  /* A variant chosen with a picture of its own: to it. The first time without moving (the sheet is opening). */
  const focused = React.useRef(false)
  React.useEffect(() => {
    if (focus < 0) return
    go(focus, focused.current)
    focused.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, count])

  /* The thumbnail of the slide shown stays in view in its row. */
  React.useEffect(() => {
    const row = thumbs.current
    const t = row?.children[at] as HTMLElement | undefined
    if (!row || !t) return
    const left = t.offsetLeft - (row.clientWidth - t.offsetWidth) / 2
    row.scrollTo({ left: Math.max(0, left), behavior: "smooth" })
  }, [at])

  /* The full player's file, asked for while the page is idle when there is a video to play in it. */
  React.useEffect(() => {
    if (!hasVideo || !active) return
    const w = window as Window & { requestIdleCallback?: (f: () => void) => number; cancelIdleCallback?: (id: number) => void }
    const id = w.requestIdleCallback ? w.requestIdleCallback(preloadLightboxPlayer) : window.setTimeout(preloadLightboxPlayer, 1500)
    return () => (w.cancelIdleCallback ? w.cancelIdleCallback(id) : window.clearTimeout(id))
  }, [hasVideo, active])

  if (!count) return null
  const fitOf = (w: number, h: number) => mediaFit(w, h, ratio)

  return (
    <div data-product-sheet-gallery="" data-count={count}>
      <div
        className="relative isolate mx-auto overflow-hidden rounded-2xl bg-[#f4f4f6]"
        style={{aspectRatio:String(ratio),width:`min(100%, calc(60dvh * ${ratio}))`}}
        tabIndex={many && !phone ? 0 : undefined}
        aria-roledescription={many ? "carousel" : undefined}
        aria-label={many ? `${title}, ${at + 1} of ${count}` : undefined}
        onKeyDown={(e) => {
          if (!many) return
          if (e.key === "ArrowRight") {
            e.preventDefault()
            go(at + 1)
          } else if (e.key === "ArrowLeft") {
            e.preventDefault()
            go(at - 1)
          }
        }}
      >
        <div
          ref={strip}
          data-sheet-no-drag={many ? "" : undefined}
          data-product-sheet-strip=""
          onScroll={track}
          className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {media.map((m, i) =>
            m.type === "video" ? (
              <SlideVideo
                key={i}
                entry={m}
                label={`${title}, video`}
                near={Math.abs(i - at) <= 1}
                shown={i === at && active && lightbox === null}
                fitOf={fitOf}
                onRatio={(r) => {
                  ratios.current[i] = r
                }}
                onOpen={() => setLightbox(i)}
              />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => setLightbox(i)}
                aria-label={many ? `${i + 1} of ${count}, full screen` : "Full screen"}
                className="relative block h-full w-full shrink-0 snap-center snap-always cursor-zoom-in outline-none [-webkit-tap-highlight-color:transparent]"
                data-product-sheet-expand=""
              >
                <SlidePicture
                  src={m.url}
                  alt={i === 0 ? title : ""}
                  frame={ratio}
                  eager={i === 0}
                  near={Math.abs(i - at) <= 1}
                  onRatio={(r) => (ratios.current[i] = r)}
                />
              </button>
            ),
          )}
        </div>
        {many ? (
          <>
            {/* On a dark capsule, so the dots read on a white photo as on a dark one; the lit one rides the scroll. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center transition-opacity duration-200 ease-out starting:opacity-0" data-product-sheet-dots="">
              <div className="relative flex items-center gap-[6px] rounded-full bg-black/35 px-2 py-[5px]">
                {media.map((_, i) => (
                  <span key={i} className="block h-[6px] w-[6px] rounded-full bg-white/45" />
                ))}
                <span ref={lit} aria-hidden className="absolute left-2 top-[5px] block h-[6px] w-[6px] rounded-full bg-white [will-change:translate]" data-product-sheet-dot-on="" />
              </div>
            </div>
            {!phone ? (
              <>
                <button type="button" aria-label="Previous" onClick={() => go(at - 1)} disabled={at === 0} className={cn(ARROW, "left-3")} data-product-sheet-prev="">
                  <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={2.25} />
                </button>
                <button type="button" aria-label="Next" onClick={() => go(at + 1)} disabled={at === count - 1} className={cn(ARROW, "right-3")} data-product-sheet-next="">
                  <ChevronRight aria-hidden className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
      {many ? (
        /*
          Wave 10 (legible), the owner: "find a way to display the product images there the best, keep the format square".
          The row was 56px squares at the left with the rest of the width empty. Now each thumbnail is a fifth of the
          gallery's width (less the gaps, at most 72px), square, the row centred under the square while it fits (auto
          margins on its ends, so a longer row still scrolls from its first) and a strip that scrolls beyond five.
          A video's thumbnail is its still, filled, with a small play mark in its corner; without a still, the sheet's
          raised tone with the mark in the middle, never a grey box or a cut-off screenshot of words.
        */
        <div ref={thumbs} className="mt-2.5 flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-sheet-no-drag="" data-product-sheet-thumbs="">
          {media.map((m, i) => {
            const still = m.type === "video" ? m.poster : m.url
            return (
              <button
                key={i}
                type="button"
                aria-label={m.type === "video" ? `Video ${i + 1}` : `Picture ${i + 1}`}
                aria-current={i === at ? "true" : undefined}
                onClick={() => go(i)}
                className={cn(
                  "relative aspect-square w-[calc((100%-32px)/5)] max-w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-[#f4f4f6] outline-none transition-opacity duration-200 first:ml-auto last:mr-auto focus-visible:ring-2 focus-visible:ring-[#111113]/30",
                  i === at ? "opacity-100" : "opacity-60 hover:opacity-90",
                )}
                data-product-sheet-thumb={m.type}
              >
                {still ? (
                  /* Square, filled, the editor's padding cut off as on the slide itself; a still that does not load leaves the tile's tone, never a broken-picture mark. */
                  <FramedPicture src={still} frame={1} className="h-full w-full" imgClassName="object-cover" imgProps={{ loading: "lazy", decoding: "async", onError: (e) => { e.currentTarget.style.visibility = "hidden" } }} />
                ) : null}
                {m.type === "video" ? (
                  <span aria-hidden className={cn("absolute grid place-items-center", still ? "bottom-1 left-1" : "inset-0")} data-product-sheet-thumb-video="">
                    <span className={cn("grid place-items-center rounded-full", still ? "h-5 w-5 bg-black/55 text-white" : "h-7 w-7 bg-[var(--opk-surface,#ffffff)] text-[color:var(--opk-ink,#111113)] shadow-sm")}>
                      <Play className={cn("ml-px fill-current", still ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} />
                    </span>
                  </span>
                ) : null}
                <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-[10px] transition-shadow duration-200", i === at ? "shadow-[inset_0_0_0_2px_var(--opk-ink,#111113)]" : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]")} />
              </button>
            )
          })}
        </div>
      ) : null}
      <ProductLightbox media={media} title={title} index={lightbox} ratios={ratios.current} onClose={(i) => {
        setLightbox(null)
        go(i, false)
      }} />
    </div>
  )
}

/**
 * One picture in the gallery (round AK). The editor's grey padding is cut off (components/ui/framed-picture), then the
 * picture fills the frame when little is lost (mediaFit, at most SHEET_MAX_CROP) and otherwise sits whole over a
 * soft, blurred fill of itself: never an empty band of grey, white or black either way.
 */
function SlidePicture({ src, alt, frame, eager, near, onRatio }: { src: string; alt: string; frame: number; eager: boolean; near: boolean; onRatio: (r: number) => void }) {
  const shape = useLetterbox(src, near || eager)
  /* Round W8: always filled (object-cover), as the square thumbnails are; the editor's padding is still cut off first. */
  return (
    <FramedPicture
      src={src}
      alt={alt}
      frame={frame}
      fit="cover"
      shape={shape ?? null}
      className="h-full w-full"
      imgClassName="object-cover"
      imgProps={{
        loading: eager ? "eager" : "lazy",
        decoding: "async",
        onLoad: (e) => {
          const img = e.currentTarget
          const r = img.naturalWidth / img.naturalHeight
          if (Number.isFinite(r) && r > 0) onRatio(r)
        },
      }}
    />
  )
}

/**
 * The sheet's arrows: its own surface and ink (lib/onepage/sheet-theme, the page's colours), not a white disc whose
 * chevron took the ink, which on a dark sheet is white: white on white. A hairline and a soft shadow keep the disc
 * apart from a photo of its own colour. Only opacity and scale move.
 */
const ARROW =
  "absolute top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-[var(--opk-surface,#ffffff)]/92 text-[color:var(--opk-ink,#111113)] shadow-[0_1px_3px_rgba(0,0,0,0.16),0_0_0_1px_rgba(0,0,0,0.06)] outline-none transition-[opacity,scale] duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-[color:var(--opk-ink,#111113)]/40 disabled:pointer-events-none disabled:opacity-35"

/**
 * One video in the gallery: its stored first frame, the video over it once it plays (opacity only), and its button.
 * It plays while it is the one shown and the sheet is up, muted and inline, and waits otherwise. Reduced motion or
 * Save Data: it waits for its button. A refused play() (iOS Low Power Mode) leaves it on its frame with the button.
 */
function SlideVideo({ entry, label, near, shown, fitOf, onRatio, onOpen }: { entry: Extract<MediaEntry, { type: "video" }>; label: string; near: boolean; shown: boolean; fitOf: (w: number, h: number) => "cover" | "contain"; onRatio: (r: number) => void; onOpen: () => void }) {
  const ref = React.useRef<HTMLVideoElement>(null)
  /* Paused by the buyer, or by reduced motion and Save Data until the button is pressed. */
  const [held, setHeld] = React.useState(() => typeof window !== "undefined" && prefersStill(window as never))
  const [playing, setPlaying] = React.useState(false)
  const [fit, setFit] = React.useState<"cover" | "contain">("cover")
  const wasShown = React.useRef(shown)

  React.useEffect(() => {
    const v = ref.current
    if (!v) return
    /* Swiped away: it waits, and plays again by itself the next time it is shown (unless motion is reduced). */
    if (wasShown.current && !shown) setHeld(prefersStill(window as never))
    wasShown.current = shown
    if (!shown || held || document.hidden) {
      v.pause()
      return
    }
    const p = v.play()
    if (p && typeof p.catch === "function") p.catch(() => setHeld(true))
  }, [shown, held])

  React.useEffect(() => {
    const onVisibility = () => {
      const v = ref.current
      if (!v) return
      if (document.hidden) v.pause()
      else if (shown && !held) void v.play().catch(() => setHeld(true))
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [shown, held])

  return (
    <div className="relative h-full w-full shrink-0 snap-center snap-always overflow-hidden bg-[#0b0b0c]" data-product-sheet-slide="video">
      {entry.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.poster} alt="" aria-hidden className="absolute inset-0 h-full w-full" style={{ objectFit: fit }} decoding="async" draggable={false} loading={near ? "eager" : "lazy"} />
      ) : null}
      <video
        ref={ref}
        src={entry.poster ? entry.url : firstFrameSrc(entry.url)}
        poster={entry.poster ?? undefined}
        muted
        loop
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        preload={near ? "metadata" : "none"}
        aria-label={label}
        className="absolute inset-0 h-full w-full transition-opacity duration-300 ease-out motion-reduce:transition-none"
        style={{ objectFit: fit, opacity: playing || !entry.poster ? 1 : 0 }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            setFit(fitOf(v.videoWidth, v.videoHeight))
            onRatio(v.videoWidth / v.videoHeight)
          }
        }}
        onPlaying={() => setPlaying(true)}
      />
      {/* The surface opens it full screen; the button plays and pauses it where it is. */}
      <button type="button" onClick={onOpen} aria-label={`${label}, full screen`} className="absolute inset-0 cursor-zoom-in outline-none [-webkit-tap-highlight-color:transparent]" data-product-sheet-expand="" />
      <button
        type="button"
        onClick={() => setHeld((h) => !h)}
        aria-label={held || !shown ? "Play" : "Pause"}
        className="absolute bottom-3 left-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-black/60 active:scale-95 focus-visible:ring-2 focus-visible:ring-white/70"
        data-product-sheet-play=""
      >
        {held || !shown ? <Play aria-hidden className="ml-0.5 h-4 w-4 fill-current" /> : <Pause aria-hidden className="h-4 w-4 fill-current" />}
      </button>
    </div>
  )
}

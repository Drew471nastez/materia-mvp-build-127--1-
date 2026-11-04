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
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, Ruler } from "lucide-react"
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
import { isSizeOption, optionLook, savedPercent, sheetImageFor, sheetImages, sheetModel, sheetStartChoice, sheetValued, valueSwatch, type SheetModel } from "@/lib/onepage/product-sheet"
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

export function ProductSheet({ open, onClose, warm = false, productId, title, image, priceText, ctaText, instant, onBuy, onCheckoutLink, back = null, action = "checkout", pageLink = true, priceOnButton = false, font = null }: ProductSheetProps) {
  const phone = usePhoneWidth()
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
    <div className={twoColumns ? "min-h-0 p-5 pr-0" : "px-4 pt-2 sm:px-5 sm:pt-5"}>
      <Gallery images={images} title={title} phone={phone} focus={focusImage} tall={twoColumns} />
    </div>
  ) : null

  const details = (
    <div className={cn("space-y-3 px-5 pb-4 pt-4 sm:px-6", twoColumns && "pt-6")}>
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
    <div className="shrink-0 border-t border-[#f0f0f3] bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5" data-product-sheet-actions="">
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
        "op-sheet flex max-h-[min(90vh,820px)] flex-col gap-0 overflow-hidden rounded-[20px] border-[#ececf1] bg-white p-0 [&>[data-slot=dialog-close]]:rounded-full [&>[data-slot=dialog-close]]:bg-white/90 [&>[data-slot=dialog-close]]:p-1.5",
        twoColumns ? "sm:max-w-[920px]" : "sm:max-w-[560px]",
      )}
      /* Kept built once the block is seen (keepMounted): opening is a transform, never a render of the whole product on the tap. */
      sheet={{ waitForImages: !warm, keepMounted: warm, maxHeight: "calc(var(--vv-h, 100dvh) * 0.92)", className: "op-sheet" }}
    >
      {twoColumns ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" style={bodyFont} data-product-sheet={productId} data-product-sheet-columns="">
          <div className="min-h-0 overflow-y-auto overscroll-contain">{gallery}</div>
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{details}</div>
            {actions}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col" style={bodyFont} data-product-sheet={productId}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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

/* ── The pictures ──────────────────────────────────────────────────────── */

/**
 * Swiped on a phone (scroll snap), stepped with arrows and the arrow keys on a computer; with two or more, dots on
 * a dark capsule over them and a row of thumbnails under them. `focus` is a picture to go to (a variant's own).
 */
function Gallery({ images, title, phone, focus = -1, tall = false }: { images: string[]; title: string; phone: boolean; focus?: number; tall?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const thumbs = React.useRef<HTMLDivElement>(null)
  const [at, setAt] = React.useState(0)
  const many = images.length > 1
  const go = React.useCallback(
    (i: number, smooth = true) => {
      const el = ref.current
      if (!el) return
      const n = Math.max(0, Math.min(images.length - 1, i))
      el.scrollTo({ left: n * el.clientWidth, behavior: smooth ? "smooth" : "auto" })
      setAt(n)
    },
    [images.length],
  )
  /* A variant chosen with a picture of its own: to it. */
  React.useEffect(() => {
    if (focus >= 0) go(focus)
  }, [focus, go])
  /* The thumbnail of the picture shown stays in view in its row. */
  React.useEffect(() => {
    const row = thumbs.current
    const t = row?.children[at] as HTMLElement | undefined
    if (!row || !t) return
    const left = t.offsetLeft - (row.clientWidth - t.offsetWidth) / 2
    row.scrollTo({ left: Math.max(0, left), behavior: "smooth" })
  }, [at])
  if (!images.length) return null
  return (
    <div data-product-sheet-gallery="" data-count={images.length}>
      <div
        className="group/gal relative overflow-hidden rounded-2xl bg-[#f4f4f6] [contain:paint]"
        tabIndex={many && !phone ? 0 : undefined}
        aria-roledescription={many ? "carousel" : undefined}
        aria-label={many ? `${title}, picture ${at + 1} of ${images.length}` : undefined}
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
          ref={ref}
          data-sheet-no-drag={many ? "" : undefined}
          onScroll={(e) => {
            const el = e.currentTarget
            const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
            if (n !== at) setAt(n)
          }}
          className={cn("flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", tall ? "aspect-square" : "aspect-[4/3]")}
        >
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={i === 0 ? title : ""} className="h-full w-full shrink-0 snap-center snap-always object-cover" loading={i === 0 ? "eager" : "lazy"} decoding="async" draggable={false} />
          ))}
        </div>
        {many ? (
          <>
            {/* On a dark capsule, so the dots read on a white photo as on a dark one; the one shown is a short bar. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center" data-product-sheet-dots="">
              <div className="flex items-center gap-[5px] rounded-full bg-black/35 px-2 py-[5px]">
                {images.map((_, i) => (
                  <span key={i} className={cn("block h-[6px] rounded-full bg-white transition-[width,opacity] duration-300", EASE, i === at ? "w-4 opacity-100" : "w-[6px] opacity-60")} />
                ))}
              </div>
            </div>
            {!phone ? (
              <>
                <button type="button" aria-label="Previous picture" onClick={() => go(at - 1)} disabled={at === 0} className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#111113] shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-[opacity,scale] duration-150 hover:scale-105 disabled:pointer-events-none disabled:opacity-0" data-product-sheet-prev="">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button type="button" aria-label="Next picture" onClick={() => go(at + 1)} disabled={at === images.length - 1} className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#111113] shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-[opacity,scale] duration-150 hover:scale-105 disabled:pointer-events-none disabled:opacity-0" data-product-sheet-next="">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
      {many ? (
        <div ref={thumbs} className="mt-2.5 flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-sheet-no-drag="" data-product-sheet-thumbs="">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Picture ${i + 1}`}
              aria-current={i === at ? "true" : undefined}
              onClick={() => go(i)}
              className={cn("relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-[#f4f4f6] outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-[#111113]/30 sm:h-16 sm:w-16", i === at ? "opacity-100" : "opacity-55 hover:opacity-85")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />
              <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-[10px] transition-shadow duration-200", i === at ? "shadow-[inset_0_0_0_2px_var(--opk-ink,#111113)]" : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]")} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

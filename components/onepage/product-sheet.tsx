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
 * ships goes straight to the cart checkout with that option and quantity in
 * it (lib/physical/cart-link physicalCheckoutHref), not to its page first.
 */
import * as React from "react"
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { loadProductFacts, type ProductFacts } from "@/components/checkout/instant-checkout"
import { productCheckoutUrl, sheetBuyBlocker, sheetMaxQuantity } from "@/lib/onepage/product-block"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"
import { onePageOutboundHref, platformHref } from "@/lib/onepage/return-address"
import { ProductQuestions, SizeChartPanel } from "@/components/product/size-chart-panel"
import { pixelEvent } from "@/lib/analytics/pixels"

/** The sheet's main button: lifted a pixel under a mouse (translate), lit by a layer's opacity. */
const MAIN_BUTTON =
  "relative isolate flex h-12 items-center justify-center overflow-hidden rounded-xl bg-[#111113] text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] outline-none transition-[translate,opacity] duration-200 ease-out before:absolute before:inset-0 before:bg-white before:opacity-0 before:transition-opacity before:duration-200 hover:-translate-y-px hover:before:opacity-[0.08] active:translate-y-0 focus-visible:ring-2 focus-visible:ring-[#111113]/30 focus-visible:ring-offset-2"

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
}

export function ProductSheet({ open, onClose, warm = false, productId, title, image, priceText, ctaText, instant, onBuy, onCheckoutLink, back = null, action = "checkout", pageLink = true }: ProductSheetProps) {
  const phone = usePhoneWidth()
  const [facts, setFacts] = React.useState<ProductFacts | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [variantId, setVariantId] = React.useState<string | null>(null)
  const [quantity, setQuantity] = React.useState(1)

  React.useEffect(() => {
    if (!open && !warm) return
    let live = true
    setFailed(null)
    loadProductFacts(productId)
      .then((f) => {
        if (!live) return
        setFacts(f)
        /* One option is the product: chosen for the buyer. Two or more: the buyer chooses before paying. */
        setVariantId((v) => v ?? (f.product.variants.length === 1 ? f.product.variants[0].id : null))
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
  const fmt =(cents: number) => shopMoneyIn(cents, p?.currency || "usd")
  const variant = p?.variants.find((v) => v.id === variantId) ?? null
  const price = !p
    ? priceText ?? null
    : p.pwyw && !variant
      ? p.pwywMinCents > 0
        ? `From ${fmt(p.pwywMinCents)}`
        : "Free"
      : (variant ? variant.priceCents : p.priceCents) > 0
        ? fmt(variant ? variant.priceCents : p.priceCents)
        : "Free"
  const was = p && !variant && p.compareAtCents ? fmt(p.compareAtCents) : null
  const images = p?.images.length ? p.images : image ? [image] : []
  const owned = !!facts?.buyer && (facts.buyer.owned || (!!variant && facts.buyer.ownedVariants.includes(variant.id)))
  const maxQuantity = p?.ships ? sheetMaxQuantity(p.maxQuantity) : 1
  const blocker = sheetBuyBlocker({ loaded: !!p, soldOut: !!p?.soldOut, variantCount: p?.variants.length ?? 0, variantChosen: !!variant, quantity, maxQuantity })
  /* A product that ships: the cart checkout, with the option and quantity chosen here. Anything else: its checkout. */
  const cartPath = p?.ships && p.shopId ? physicalCheckoutHref(p.shopId, [{ productId: p.id, variantId: variant?.id ?? null, quantity }], back) : null
  const checkoutPath = p ? (p.ships ? cartPath ?? p.pageUrl : productCheckoutUrl(p.id, variant?.id ?? null)) : null
  /* On storelib.com itself, with the way back here: one navigation, and Back lands on this OnePage. */
  const checkoutHref = cartPath ? platformHref(cartPath) : checkoutPath ? onePageOutboundHref(checkoutPath, back) : null
  const pageHref = p?.pageUrl && p.pageUrl !== "#" ? onePageOutboundHref(p.pageUrl, back) : null
  const free = price === "Free"
  const label =
    blocker === "loading"
      ? ctaText
      : blocker === "sold out"
        ? "Sold out"
        : blocker === "choose option"
          ? "Choose an option"
          : p?.ships
            ? "Check out"
            : free
              ? "Get it free"
              : "Buy now"

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
    if (checkoutPath) onCheckoutLink?.(checkoutPath)
  }

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
      */
      className="op-sheet flex max-h-[min(90vh,820px)] flex-col gap-0 overflow-hidden rounded-[20px] border-[#ececf1] bg-white p-0 sm:max-w-[560px] [&>[data-slot=dialog-close]]:rounded-full [&>[data-slot=dialog-close]]:bg-white/90 [&>[data-slot=dialog-close]]:p-1.5"
      /* Kept built once the block is seen (keepMounted): opening is a transform, never a render of the whole product on the tap. */
      sheet={{ waitForImages: !warm, keepMounted: warm, maxHeight: "calc(var(--vv-h, 100dvh) * 0.92)", className: "op-sheet" }}
    >
      <div className="flex min-h-0 flex-col" data-product-sheet={productId}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Inside the sheet, with room above and its own corners: the handle sits alone on the sheet over it. */}
          {images.length ? (
            <div className="px-4 pt-2 sm:px-5 sm:pt-5">
              <Gallery images={images} title={title} phone={phone} />
            </div>
          ) : null}
          <div className="space-y-3 px-5 pb-4 pt-4 sm:px-6">
            <SheetDialogTitle className="text-[20px] font-semibold leading-snug tracking-[-0.01em] text-[#111113]">{p?.title || title}</SheetDialogTitle>
            {price ? (
              <p className="flex flex-wrap items-baseline gap-2" data-product-sheet-price="">
                <span className="text-[18px] font-semibold tabular-nums text-[#111113]">{price}</span>
                {was ? <s className="text-[14px] tabular-nums text-[#9ca3af]">{was}</s> : null}
                {p?.left ? <span className="rounded-full bg-[#f4f4f6] px-2 py-0.5 text-[12px] font-medium text-[#4b5563]">Only {p.left} left</span> : null}
              </p>
            ) : null}
            {p && p.variants.length > 1 ? (
              <div role="radiogroup" aria-label="Options" className="flex flex-wrap gap-2 pt-1" data-product-sheet-options="">
                {p.variants.map((v) => {
                  const on = v.id === variantId
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setVariantId(v.id)}
                      className={cn(
                        "min-h-10 rounded-xl border px-3.5 text-[14px] font-medium outline-none transition-[border-color,box-shadow,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25",
                        on ? "border-[#111113] bg-white text-[#111113] shadow-[0_0_0_1px_#111113]" : "border-[#e3e4e8] bg-[#fbfbfc] text-[#374151] hover:border-[#c9cbd1]",
                      )}
                    >
                      {v.name}
                    </button>
                  )
                })}
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
            {failed ? <p className="text-[14px] text-[#6b7280]">{failed}</p> : null}
            {p?.descriptionHtml ? (
              <div
                className="max-w-none text-[15px] leading-relaxed text-[#374151] [&_a]:underline [&_h1]:text-[17px] [&_h1]:font-semibold [&_h2]:text-[16px] [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:my-3 [&_img]:rounded-xl [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc"
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
            {/* Round 13: its size chart and its own questions, as its product page shows them. */}
            {p?.sizeChart ? <SizeChartPanel chart={p.sizeChart} className="mt-1" /> : null}
            {p?.faqs?.length ? <ProductQuestions faqs={p.faqs} className="pt-2" /> : null}
          </div>
        </div>
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
              className={cn(MAIN_BUTTON, blocker === "loading" && "pointer-events-none opacity-60", blocker === "choose option" && "opacity-50")}
              data-product-sheet-buy=""
              data-product-sheet-action="checkout"
            >
              <span className="relative">{label}</span>
            </a>
          )}
          {pageHref && pageLink && action !== "page" && !(failed && !p) ? (
            <a href={pageHref} className="mt-2 flex h-10 items-center justify-center gap-1.5 text-[13.5px] font-medium text-[#6b7280] transition-colors hover:text-[#111113]" data-product-sheet-page="">
              See full page
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </SheetDialog>
  )
}

/** The pictures, swiped on a phone and stepped with arrows on a computer; one picture is just the picture. */
function Gallery({ images, title, phone }: { images: string[]; title: string; phone: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [at, setAt] = React.useState(0)
  if (!images.length) return null
  const go = (i: number) => {
    const el = ref.current
    if (!el) return
    const n = Math.max(0, Math.min(images.length - 1, i))
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" })
  }
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#f4f4f6] [contain:paint]" data-product-sheet-gallery="">
      <div
        ref={ref}
        data-sheet-no-drag={images.length > 1 ? "" : undefined}
        onScroll={(e) => {
          const el = e.currentTarget
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
        className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={i === 0 ? title : ""} className="h-full w-full shrink-0 snap-center object-cover" loading={i === 0 ? "eager" : "lazy"} decoding="async" draggable={false} />
        ))}
      </div>
      {images.length > 1 ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <span key={i} className={cn("h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.15)] transition-opacity duration-200", i === at ? "opacity-100" : "opacity-50")} />
            ))}
          </div>
          {!phone ? (
            <>
              <button type="button" aria-label="Previous picture" onClick={() => go(at - 1)} disabled={at === 0} className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#111113] shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-opacity duration-150 disabled:opacity-0">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" aria-label="Next picture" onClick={() => go(at + 1)} disabled={at === images.length - 1} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#111113] shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-opacity duration-150 disabled:opacity-0">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

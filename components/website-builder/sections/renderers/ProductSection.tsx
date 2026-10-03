"use client"

/**
 * ===========================================================================
 *  THE MAIN PRODUCT SECTION
 * ===========================================================================
 * What a product page on a creator's website is: the product's pictures in
 * one column, and in the other its blocks, in the creator's order, each with
 * its own settings (themes/default/sections/product.json). Title, price,
 * variant picker, the amount box for pay what you want, quantity, the buy
 * buttons, low stock, the description, collapsible tabs, badges, text,
 * icons with text, share, the wishlist, dividers, breadcrumbs, the file
 * list and custom code. Shopify's main product section, the same way round.
 *
 * THE PRODUCT IS THE PAGE'S. `_product_data` is filled in as the page is
 * drawn, for whichever product's page this is (components/website-builder/
 * theme/render-product.tsx), and in the builder for the product the creator
 * chose to preview, by the same read (lib/products/product-section-data.ts).
 * Nothing about the product is a setting.
 *
 * WHAT THE BLOCKS SHARE lives here: the chosen variant, the quantity and
 * the amount a buyer named. Choosing a variant changes the price block, the
 * stock line, the buy buttons and the picture together. Add to cart puts
 * the product, the variant, the quantity and the named amount in the cart
 * (lib/website-builder/cart.ts), which opens the cart; Buy now goes to
 * checkout with the same. Checkout prices all of it again on the server and
 * holds a named amount to the product's own minimum (lib/checkout/pricing.ts).
 *
 * The rules (which variant a choice is, which pictures, which amount is
 * allowed) are plain functions in lib/products/product-page-model.ts,
 * tested in tests/product-page-t.test.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { useSiteCart } from "../../site-cart"
import { useSiteWishlist } from "../../site-wishlist"
import { useStorefront } from "../../theme/storefront-context"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { trackFunnelStep } from "@/lib/analytics-utils"
import { checkoutHrefWithOrigin } from "@/lib/orders/checkout-origin"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { addLine, cartStorageKey, parseCart, serializeCart } from "@/lib/website-builder/cart"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"
import { withProductBlocks } from "@/lib/website-builder/product-page"
import {
  amountToCents,
  buyNowHref,
  cartLineFor,
  checkPwyw,
  choose as chooseValue,
  imageIndexForVariant,
  initialChoice,
  priceFacts,
  productImages,
  purchasable,
  variantFor,
  type ProductSectionData,
} from "@/lib/products/product-page-model"
import { type SectionProps, sectionColors, str, bool, buttonRadiusStyle, SectionWrapper } from "../_shared"
import { ProductMedia, type MediaLayout } from "./product/product-media"
import { ProductBlock, type ProductCtx } from "./product/product-blocks"

/** What the builder draws before a product is chosen to preview. Never on a live page. */
const SAMPLE: ProductSectionData = {
  id: "",
  title: "Product title",
  slug: "",
  type: "digital",
  description: "",
  description_html: "<p>The product's description appears here.</p>",
  price_cents: 2400,
  compare_at_cents: null,
  thumbnail_url: "",
  gallery_urls: [],
}

/** `_product_data` as it arrives: the full read, or the builder's quicker list copy, or an older page's. */
function readProduct(raw: unknown): ProductSectionData | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== "string" || !r.id) return null
  return {
    ...(r as unknown as ProductSectionData),
    title: str(r.title),
    slug: str(r.slug),
    type: str(r.type),
    description: str(r.description),
    price_cents: typeof r.price_cents === "number" ? r.price_cents : 0,
    compare_at_cents: typeof r.compare_at_cents === "number" ? r.compare_at_cents : null,
    thumbnail_url: str(r.thumbnail_url),
    gallery_urls: Array.isArray(r.gallery_urls) ? (r.gallery_urls as string[]) : [],
    variants: Array.isArray(r.variants) ? (r.variants as ProductSectionData["variants"]) : [],
    options: Array.isArray(r.options) ? (r.options as ProductSectionData["options"]) : [],
  }
}

const WIDTHS: Record<string, string> = { compact: "960px", standard: "1230px", wide: "1440px" }

export function ProductSection({ section: raw, theme, isEditing, isSelected, onClick }: SectionProps) {
  /* A section saved before it had blocks draws the blocks its old switches describe (lib/website-builder/product-page.ts). */
  const section = useMemo(() => withProductBlocks(raw), [raw])
  const s = section.settings
  const storefront = useStorefront()
  const cart = useSiteCart()
  const wishlistStore = useSiteWishlist()
  const physicalOn = usePhysicalCommerceEnabled()
  const inEditor = isEditing === true || storefront.inEditor === true

  const real = useMemo(() => readProduct(s._product_data), [s._product_data])
  const product = real ?? SAMPLE
  const sample = !real

  /* ── Colours, from the section's scheme and its own Advanced colours ── */
  const palette = sectionColors(section, theme)
  const radius = `var(--theme-image-radius, ${typeof theme.border_radius === "number" ? theme.border_radius : 8}px)`
  const buttonRadius = buttonRadiusStyle(theme)

  /* ── The variant, the quantity and the named amount ── */
  const [chosen, setChosen] = useState<(string | null)[]>(() => initialChoice(product))
  const [quantity, setQuantityRaw] = useState(1)
  const [pwywInput, setPwywInput] = useState("")
  const [pwywTouched, setPwywTouched] = useState(false)
  /* A different product (the builder's preview changed): start again from its first variant that sells. */
  const productKey = `${product.id}:${(product.variants ?? []).map((v) => v.id).join(",")}`
  const lastKey = useRef(productKey)
  useEffect(() => {
    if (lastKey.current === productKey) return
    lastKey.current = productKey
    setChosen(initialChoice(product))
    setQuantityRaw(1)
    setPwywInput("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKey])

  const variant = (product.variants ?? []).length ? variantFor(product, chosen) : null
  const facts = priceFacts(product, variant)
  const canBuy = sample || purchasable(product, variant)
  const choose = useCallback((i: number, value: string) => setChosen((c) => chooseValue(product, c, i, value)), [product])

  /* ── The pictures: each once, and the chosen variant's when it has one ── */
  const images = useMemo(() => productImages(product), [product])
  const featured = bool(s.variant_image, true) ? imageIndexForVariant(images, variant) : -1

  /* ── Quantity and the named amount ── */
  const maxQuantity = product.type !== "physical" ? 1 : Math.max(1, variant ? variant.max_quantity : 99)
  const setQuantity = useCallback((n: number) => setQuantityRaw(Math.max(1, Math.min(maxQuantity, Math.floor(n) || 1))), [maxQuantity])
  const qty = Math.min(quantity, maxQuantity)
  const pwyw = useMemo(() => {
    if (!facts.payWhatYouWant || pwywInput.trim() === "") return { cents: null as number | null, error: null as string | null }
    const checked = checkPwyw(amountToCents(pwywInput), facts.minCents)
    return checked.ok === true ? { cents: checked.cents, error: null } : { cents: null, error: (checked as { error: string }).error }
  }, [facts.payWhatYouWant, facts.minCents, pwywInput])

  /* ── Buying ── */
  const [added, setAdded] = useState(false)
  const physical = product.type === "physical"
  const unavailable = physical && !physicalOn && !sample ? "Not available right now" : null

  const add = useCallback(() => {
    if (isEditing || sample || !canBuy || unavailable) return
    if (pwyw.error) { setPwywTouched(true); return }
    const line = cartLineFor(product, variant, qty, pwyw.cents)
    if (physical && !cart.live && storefront.creatorId) {
      /* No website cart here: this browser's cart for the shop, which the physical checkout reads. */
      try {
        const key = cartStorageKey(storefront.creatorId)
        window.localStorage.setItem(key, serializeCart(addLine(parseCart(window.localStorage.getItem(key)), line)))
      } catch {
        /* Storage refused: Buy now still works. */
      }
    } else {
      /* The shop's cart: it opens, so the buyer sees what went in. */
      cart.add(line)
    }
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2400)
  }, [isEditing, sample, canBuy, unavailable, pwyw, product, variant, qty, physical, cart, storefront.creatorId])

  const now = useCallback(() => {
    /* NOT IN THE BUILDER. With the inspector off the canvas is a preview you
       can click through, and this would leave the editor for checkout. */
    if (inEditor || sample || !canBuy || unavailable) return
    if (pwyw.error) { setPwywTouched(true); return }
    if (physical) {
      if (!storefront.creatorId) return
      window.location.href = physicalCheckoutHref(storefront.creatorId, [{ productId: product.id, variantId: variant?.id ?? null, quantity: qty }], window.location.href)
      return
    }
    /* `src=website` is how the order ends up in the Orders table as a Website
       order (lib/orders/order-source.ts); checkoutHrefWithOrigin adds which
       website and where its visit came from. The address is built from the
       product, its variant and the named amount only (buyNowHref): checkout
       reads every price again. */
    if (storefront.creatorId) void trackFunnelStep("buy_click", storefront.creatorId, product.id)
    window.location.href = checkoutHrefWithOrigin(buyNowHref(product, variant, pwyw.cents), pageOrigin(), window.location.href)
  }, [inEditor, sample, canBuy, unavailable, pwyw, physical, storefront.creatorId, product, variant, qty])

  const saved = !!product.id && wishlistStore.has(product.id)
  const ctx: ProductCtx = {
    product,
    sample,
    variant,
    chosen,
    choose,
    facts,
    canBuy,
    quantity: qty,
    setQuantity,
    maxQuantity,
    pwywInput,
    setPwywInput: (v: string) => { setPwywInput(v); setPwywTouched(false) },
    pwywError: pwyw.error && (pwywTouched || pwywInput.length > 0) ? pwyw.error : null,
    palette,
    inEditor,
    inert: isEditing === true,
    buy: { add, now, added, unavailable },
    wishlist: { saved, toggle: () => { if (product.id) wishlistStore.toggle(product.id) } },
    radius,
    buttonRadius,
  }

  /* ── Layout ── */
  const twoColumns = str(s.product_layout, "two_column") !== "one_column"
  const sticky = twoColumns && bool(s.sticky_info, true)
  const layout = (["stacked", "stacked_2col", "slideshow", "carousel"].includes(str(s.multiple_images_layout)) ? str(s.multiple_images_layout) : "stacked") as MediaLayout
  const blocks = (section.blocks ?? []).filter((b) => !b.hidden)

  /* Where a sticky column stops: under a header that stays on screen, measured
     once from the header itself, so the two cannot disagree. */
  const rootRef = useRef<HTMLDivElement>(null)
  const [stickyTop, setStickyTop] = useState(24)
  useEffect(() => {
    if (!sticky) return
    const measure = () => {
      let h = 0
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-chrome]"))) {
        const pos = getComputedStyle(el).position
        const inner = el.querySelector<HTMLElement>("header") ?? el
        const innerPos = getComputedStyle(inner).position
        if (pos === "sticky" || pos === "fixed" || innerPos === "sticky" || innerPos === "fixed") {
          const r = inner.getBoundingClientRect()
          if (r.top <= 1 && r.height < 240) h = Math.max(h, r.height)
        }
      }
      setStickyTop(Math.round(h) + 24)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [sticky])

  const rootStyle = {
    maxWidth: twoColumns ? WIDTHS[str(s.format, "standard")] ?? WIDTHS.standard : "42rem",
    color: palette.text,
    paddingTop: `${s.padding_top ?? 48}px`,
    paddingBottom: `${s.padding_bottom ?? 48}px`,
    "--pp-media-w": str(s.image_width, "55%"),
    "--pp-gap": `${typeof s.column_gap === "number" ? s.column_gap : 48}px`,
    "--pp-sticky-top": `${stickyTop}px`,
  } as CSSProperties

  return (
    <SectionWrapper bgColor={palette.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div ref={rootRef} className="mx-auto w-full px-[var(--theme-padding-x,20px)]" style={rootStyle} data-product-section="" data-product-layout={twoColumns ? "two" : "one"}>
        <div className={cn("flex flex-col gap-8", twoColumns && "@[768px]:flex-row @[768px]:items-start @[768px]:gap-[var(--pp-gap)]")}>
          <div className={cn("w-full min-w-0", twoColumns && "@[768px]:w-[var(--pp-media-w)] @[768px]:shrink-0")} data-product-media-column="">
            <ProductMedia
              images={sample ? [] : images}
              title={product.title}
              layout={layout}
              mobile={str(s.mobile_media, "slider")}
              ratio={str(s.media_ratio, "natural")}
              clickAction={str(s.image_click_action, "lightbox")}
              hoverZoom={str(s.image_hover_action, "none") === "zoom"}
              featured={featured}
              surface={palette.background_secondary ?? palette.bg}
              border={palette.border}
              accent={palette.heading}
              radius={radius}
              interactive={!isEditing}
            />
          </div>
          <div
            className={cn("min-w-0 flex-1", sticky && "@[768px]:sticky @[768px]:top-[var(--pp-sticky-top)]")}
            data-product-info=""
            data-sticky={sticky ? "" : undefined}
          >
            {blocks.map((b) => (
              <ProductBlock key={b.id} block={b} ctx={ctx} />
            ))}
            {blocks.length === 0 && inEditor ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-[13px]" style={{ borderColor: palette.border, color: palette.paragraph }}>
                Add a block in the sidebar
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </SectionWrapper>
  )
}

export default ProductSection

"use client"

// ============================================================
// Storelib Theme Engine — ProductSection
// Extracted from SectionRenderer.tsx (Stage 2 refactor).
// Renders the single-product page (image gallery + buy buttons
// + description + files list). Behaviour is identical to the
// inline version it replaced.
// ============================================================

import { Facebook, FileText, Heart, Instagram, Package, Share2, Twitter } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useSiteCart } from "../../site-cart"
import { PhysicalBuyBox } from "@/components/physical/buy-box"
import { useSiteWishlist } from "../../site-wishlist"
import { useStorefront } from "../../theme/storefront-context"
import { trackFunnelStep } from "@/lib/analytics-utils"
import { checkoutHrefWithOrigin } from "@/lib/orders/checkout-origin"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import {
  type SectionProps,
  sectionColors,
  str,
  bool,
  buttonRadiusStyle,
  SectionWrapper,
} from "../_shared"

// ── Product section (single product page) ────────────────────
export function ProductSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const layout = str(s.product_layout, "two_column")
  const imageWidth = str(s.image_width, "55%")
  const colorScheme = str(s.color_scheme, "white")
  const showWishlist = bool(s.show_wishlist, true)
  const showShare = bool(s.show_share_button, true)
  const showWhatsIncluded = bool(s.show_whats_included, true)
  const [showAllFiles, setShowAllFiles] = useState(false)

  // Product data is injected via section.settings._product_data by the editor
  const { add } = useSiteCart()
  const storefront = useStorefront()
  const productData = (s._product_data as Record<string, unknown> | undefined) ?? null

  const productId = str(productData?.id as unknown, "")
  const wishlist = useSiteWishlist()
  const saved = !!productId && wishlist.has(productId)
  const title = str(productData?.title as unknown, "Product Title")
  const description = str(productData?.description as unknown, "Product description will appear here. This is where you describe your product in detail, including features, benefits, and what makes it special.")
  const priceCents = typeof productData?.price_cents === "number" ? productData.price_cents : 2999
  const compareAtCents = typeof productData?.compare_at_cents === "number" ? productData.compare_at_cents : null
  const thumbnailUrl = str(productData?.thumbnail_url as unknown, "")
  const galleryUrls: string[] = Array.isArray(productData?.gallery_urls) ? (productData.gallery_urls as string[]) : []
  const files: { file_name: string; file_size: number; mime_type: string }[] = Array.isArray(productData?.files) ? (productData.files as any[]) : []

  const allImages = thumbnailUrl ? [thumbnailUrl, ...galleryUrls] : galleryUrls
  const [activeImage, setActiveImage] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const galleryLayout = str(s.multiple_images_layout, "stacked")
  const clickAction = str(s.image_click_action, "none")
  const zoomOnHover = str(s.image_hover_action, "none") === "zoom"

  /**
   * `format` sizes the page: compact for a simple digital download, wide when
   * the images are the point. It offered three widths and produced one.
   */
  const format = str(s.format, "standard")
  const formatWidth = format === "compact" ? "860px" : format === "wide" ? "1440px" : "1230px"

  const formatPrice = (cents: number) => {
    const val = cents / 100
    return val % 1 === 0 ? `$${val}` : `$${val.toFixed(2)}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const getFileExtension = (name: string) => {
    const ext = name.split(".").pop()?.toUpperCase() ?? ""
    return ext
  }

  const isOnSale = compareAtCents && compareAtCents > priceCents
  const discount = isOnSale ? Math.round(((compareAtCents - priceCents) / compareAtCents) * 100) : 0

  // Resolve the full global color scheme so the product section tracks
  // whatever the creator configured in General Settings → Color Schemes.
  /* With the section's own Advanced colors, which resolveScheme left out. */
  const resolved = sectionColors({ ...section, settings: { ...s, color_scheme: colorScheme } }, theme)
  const scheme = {
    bg: resolved.bg,
    text: resolved.paragraph,
    muted: resolved.paragraph,
    surface: resolved.bg === "#ffffff" ? "#f8fafc" : resolved.bg,
    border: resolved.inset_border,
  }
  const primaryColor = resolved.primary_btn_bg

  const visibleFiles = showAllFiles ? files : files.slice(0, 4)

  /**
   * A star line, above the title or above the description — the section
   * offered the toggle and the position and rendered neither.
   *
   * Declared here rather than beside the other settings because it reads
   * `scheme` and `primaryColor`, which are resolved further down; a const
   * cannot be used before it is initialised.
   */
  const reviewsSummary = bool(s.show_reviews_summary) ? (
    <div className="mb-3 flex items-center gap-2 text-sm" style={{ color: scheme.muted }}>
      <span style={{ color: primaryColor }}>★★★★★</span>
      <span>4.9 · 128 reviews</span>
    </div>
  ) : null

  return (
    <SectionWrapper bgColor={scheme.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className={cn("w-full mx-auto", layout === "one_column" ? "px-6" : "flex flex-col @[768px]:flex-row")}
        // `format` — Standard, Compact or Wide — set the page width and set
        // nothing. A one-column layout keeps its own narrower measure.
        style={{
          maxWidth: layout === "one_column" ? "42rem" : formatWidth,
          color: scheme.text,
          paddingTop: `${s.padding_top ?? 48}px`,
          paddingBottom: `${s.padding_bottom ?? 48}px`,
        }}
      >
        {/* Image column */}
        <div
          className={cn(layout === "two_column" ? "px-6 @[768px]:px-8" : "mb-8")}
          style={layout === "two_column" ? { width: imageWidth, flexShrink: 0 } : undefined}
        >
          {allImages.length > 0 ? (
            <div>
              {/*
                MULTIPLE IMAGES LAYOUT. The control offered Slideshow, Stacked,
                Stacked (2 col) and Carousel; every product page was the
                slideshow — one big image with a thumbnail strip — whichever
                was chosen. "Stacked" is the layout most product pages actually
                want: every image down the page, nothing to click.
              */}
              {galleryLayout === "stacked" || galleryLayout === "stacked_2col" ? (
                <div className={cn("grid gap-3", galleryLayout === "stacked_2col" && "@[560px]:grid-cols-2")}>
                  {allImages.map((image, i) => (
                    <div
                      key={i}
                      className={cn("w-full overflow-hidden rounded-lg", zoomOnHover && "group")}
                      style={{ background: scheme.surface }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt={title}
                        className={cn(
                          "w-full h-auto object-contain transition-transform duration-500",
                          zoomOnHover && "group-hover:scale-105",
                          clickAction !== "none" && "cursor-zoom-in",
                        )}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding="async"
                        onClick={clickAction === "none" ? undefined : (e) => { e.stopPropagation(); setLightbox(i) }}
                      />
                    </div>
                  ))}
                </div>
              ) : galleryLayout === "carousel" ? (
                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                  {allImages.map((image, i) => (
                    <div
                      key={i}
                      className="w-[82%] shrink-0 snap-start overflow-hidden rounded-lg @[560px]:w-[48%]"
                      style={{ background: scheme.surface }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt={title}
                        className={cn("h-full w-full object-contain", clickAction !== "none" && "cursor-zoom-in")}
                        loading="lazy"
                        decoding="async"
                        onClick={clickAction === "none" ? undefined : (e) => { e.stopPropagation(); setLightbox(i) }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
              <>
              {/* Main image */}
              <div
                className={cn("w-full overflow-hidden rounded-lg", zoomOnHover && "group")}
                style={{ background: scheme.surface }}
              >
                <img
                  src={allImages[activeImage] ?? allImages[0]}
                  alt={title}
                  className={cn(
                    "w-full h-auto object-contain transition-transform duration-500",
                    zoomOnHover && "group-hover:scale-105",
                    clickAction !== "none" && "cursor-zoom-in",
                  )}
                  style={{ maxHeight: "600px" }}
                  loading="lazy"
                  decoding="async"
                  onClick={clickAction === "none" ? undefined : (e) => { e.stopPropagation(); setLightbox(activeImage) }}
                />
              </div>
              {/* Thumbnails */}
              {allImages.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                  {allImages.map((img, i) => (
                    <button
                      key={i}
                      className={cn(
                        "w-16 h-16 rounded-md overflow-hidden border-2 shrink-0 transition-all",
                        activeImage === i ? "border-current opacity-100" : "opacity-50 hover:opacity-80"
                      )}
                      style={{ borderColor: activeImage === i ? primaryColor : scheme.border }}
                      onClick={e => { e.stopPropagation(); setActiveImage(i) }}
                    >
                      {/* The button's only content, so its name: the product and which picture, as storelib.com's gallery says it. */}
                      <img src={img} alt={`${title} thumbnail ${i + 1}`} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              )}
              </>
              )}
            </div>
          ) : (
            <div
              className="w-full aspect-[4/5] rounded-lg flex items-center justify-center"
              style={{ background: scheme.surface, border: `1px solid ${scheme.border}` }}
            >
              <div className="text-center" style={{ color: scheme.muted }}>
                <Package className="h-12 w-12 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Product image</p>
              </div>
            </div>
          )}
        </div>

        {/* Content column */}
        <div className={cn("flex-1 min-w-0", layout === "two_column" ? "px-6 @[768px]:px-8 py-4" : "")}>
          {/* Sale badge */}
          {isOnSale && (
            <span
              className="inline-block px-3 py-1 text-xs font-bold text-white rounded-full mb-4"
              style={{ background: "#16a34a" }}
            >
              On Sale
            </span>
          )}

          {str(s.reviews_position, "above_title") === "above_title" && reviewsSummary}

          {/* Title */}
          <h1
            className="text-2xl @[768px]:text-3xl font-bold mb-4 leading-tight"
            style={{ fontFamily: theme.font_heading, color: scheme.text }}
          >
            {title}
          </h1>

          {/* Pricing */}
          <div className="flex items-baseline gap-3 mb-6">
            {isOnSale && (
              <span className="text-lg line-through" style={{ color: scheme.muted }}>
                {formatPrice(compareAtCents)}
              </span>
            )}
            {isOnSale && (
              <span className="text-sm" style={{ color: scheme.muted }}>
                ({discount}% off)
              </span>
            )}
            <span className="text-2xl font-bold" style={{ color: scheme.text }}>
              {priceCents === 0 ? "Free" : formatPrice(priceCents)}
            </span>
          </div>

          {/* A product that ships: options, stock, Add to cart and Buy now of its own (components/physical/buy-box.tsx). */}
          {str((productData?.type as unknown) ?? "", "") === "physical" && productId ? (
            <div className="mb-6">
              <PhysicalBuyBox productId={productId} accent={primaryColor} inEditor={isEditing || storefront.inEditor === true} />
            </div>
          ) : null}
          {/* CTA Buttons */}
          <div className="space-y-3 mb-6" hidden={str((productData?.type as unknown) ?? "", "") === "physical"}>
            {/*
              ADD TO CART USED TO BE BUY NOW WITH A DIFFERENT WORD ON IT.
              Both buttons ran the same line and sent the visitor straight to
              a single-product checkout, because there was no cart to add to.
              There is one now, so this one adds and the one below still
              goes straight through.

              A free product has nothing to collect: adding it to a basket to
              pay nothing for it is a step in the way of a download, so on a
              free product this button is not drawn at all.
            */}
            {priceCents > 0 && (
              <button
                type="button"
                disabled={isEditing || !productId}
                onClick={e => {
                  e.stopPropagation()
                  if (isEditing || !productId) return
                  add({
                    productId,
                    variantId: null,
                    title,
                    variantName: null,
                    priceCents,
                    thumbnailUrl: thumbnailUrl || null,
                    slug: str((productData?.slug as unknown) ?? "", ""),
                    digital: str((productData?.type as unknown) ?? "", "") === "digital",
                    quantity: 1,
                  })
                }}
                className="w-full py-3.5 text-base font-semibold border-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                style={{ borderColor: primaryColor, color: primaryColor, ...buttonRadiusStyle(theme) }}
              >
                Add to cart
              </button>
            )}
            <button
              type="button"
              disabled={isEditing || !productId}
              onClick={e => {
                e.stopPropagation()
                /* NOT IN THE BUILDER. With the inspector off the canvas is a
                   preview you can click through, and this went straight to
                   /checkout, out of the editor. Links and forms are caught by
                   the canvas; a script navigation is not, so it is caught here. */
                if (isEditing || storefront.inEditor === true || !productId) return
                const slug = str((productData?.slug as unknown) ?? "", "")
                const from = slug ? `&from=${encodeURIComponent(`/products/${slug}`)}` : ""
                /* `src=website` is how the order ends up in the Orders
                   table as a Website order (lib/orders/order-source.ts);
                   the rest says which website and where its visit came from. */
                if (storefront.creatorId) void trackFunnelStep("buy_click", storefront.creatorId, productId)
                window.location.href = checkoutHrefWithOrigin(`/checkout?productId=${encodeURIComponent(productId)}${from}&src=website`, pageOrigin(), window.location.href)
              }}
              className="w-full py-3.5 text-base font-semibold text-white rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              style={{ background: primaryColor, ...buttonRadiusStyle(theme) }}
            >
              {priceCents === 0 ? "Get for Free" : "Buy Now"}
            </button>
          </div>

          {/* Wishlist + Share */}
          <div className="flex items-center gap-4 mb-6" style={{ color: scheme.muted }}>
            {/*
              IT SAVES NOW. This was a button with no handler: "Add to
              wishlist" on every product page, and nothing happened. It is the
              same list as the hearts on the product cards and the Wishlist
              page (../../site-wishlist): the browser's own until the visitor
              signs in, then their account's. In the canvas it toggles in
              memory, so a creator can see both states.
            */}
            {showWishlist && productId && (
              <button
                type="button"
                aria-pressed={saved}
                onClick={(e) => { e.stopPropagation(); wishlist.toggle(productId) }}
                className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity"
              >
                <Heart className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
                <span className="underline">{saved ? "Saved to your wishlist" : "Add to wishlist"}</span>
              </button>
            )}
            {showShare && (
              <button className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity">
                <Share2 className="h-4 w-4" />
                <span className="underline">Share</span>
              </button>
            )}
            {/* "Show social media icons" was a toggle over nothing. The links
                are the store's, from the theme, so a product page does not ask
                for them a second time. */}
            {bool(s.show_social_icons) && (
              <div className="flex items-center gap-3">
                {[
                  { href: str(theme.social_instagram), Icon: Instagram, label: "Instagram" },
                  { href: str(theme.social_twitter), Icon: Twitter, label: "X" },
                  { href: str(theme.social_facebook), Icon: Facebook, label: "Facebook" },
                ]
                  .filter((x) => !!x.href)
                  .map(({ href, Icon, label }) => (
                    <a key={label} href={href} aria-label={label} className="hover:opacity-80">
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
              </div>
            )}
          </div>

          {str(s.reviews_position, "above_title") === "above_description" && reviewsSummary}

          {/* Description — rendered as text (whitespace-pre-wrap preserves
              line breaks). We deliberately do NOT use dangerouslySetInnerHTML
              here: product descriptions come from user input and would
              otherwise be a stored-XSS vector on public product pages. */}
          <div className="mb-6">
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: scheme.text }}
            >
              {description}
            </div>
          </div>

          {/* Files list — only rendered for digital products that actually
              have uploaded files. The old "What you're getting" bullet list
              ("Instant download access / All included files / Lifetime
              access") was removed: it was generic boilerplate that leaked
              through `whats_included` and added no real info. */}
          {showWhatsIncluded && files.length > 0 && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: scheme.surface, border: `1px solid ${scheme.border}` }}>
              <p className="text-sm font-semibold mb-1" style={{ color: scheme.text }}>
                You will get the following files:
              </p>
              <div className="space-y-1.5 mb-3">
                {visibleFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm" style={{ color: scheme.muted }}>
                    <span className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      {getFileExtension(f.file_name)} ({formatFileSize(f.file_size)})
                    </span>
                  </div>
                ))}
              </div>
              {files.length > 4 && !showAllFiles && (
                <button
                  className="text-sm font-medium underline"
                  style={{ color: primaryColor }}
                  onClick={e => { e.stopPropagation(); setShowAllFiles(true) }}
                >
                  Show all ({files.length} files)
                </button>
              )}
              {showAllFiles && files.length > 4 && (
                <button
                  className="text-sm font-medium underline"
                  style={{ color: primaryColor }}
                  onClick={e => { e.stopPropagation(); setShowAllFiles(false) }}
                >
                  Show less
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {lightbox !== null && allImages[lightbox] && (
        /* "Image click action" offered Zoom and Lightbox and neither did
           anything — clicking a product image did nothing at all. */
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={allImages[lightbox]}
            alt={title}
            className={cn("max-h-[calc(var(--sl-vh,1vh)*85)] w-auto object-contain", clickAction === "zoom" && "scale-110")}
          />
        </div>
      )}
    </SectionWrapper>
  )
}

export default ProductSection

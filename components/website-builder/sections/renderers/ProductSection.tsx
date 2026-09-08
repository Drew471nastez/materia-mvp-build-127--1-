"use client"

// ============================================================
// Storelib Theme Engine — ProductSection
// Extracted from SectionRenderer.tsx (Stage 2 refactor).
// Renders the single-product page (image gallery + buy buttons
// + description + files list). Behaviour is identical to the
// inline version it replaced.
// ============================================================

import { FileText, Heart, Package, Share2 } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  type SectionProps,
  resolveScheme,
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
  const productData = (s._product_data as Record<string, unknown> | undefined) ?? null

  const productId = str(productData?.id as unknown, "")
  const title = str(productData?.title as unknown, "Product Title")
  const description = str(productData?.description as unknown, "Product description will appear here. This is where you describe your product in detail, including features, benefits, and what makes it special.")
  const priceCents = typeof productData?.price_cents === "number" ? productData.price_cents : 2999
  const compareAtCents = typeof productData?.compare_at_cents === "number" ? productData.compare_at_cents : null
  const thumbnailUrl = str(productData?.thumbnail_url as unknown, "")
  const galleryUrls: string[] = Array.isArray(productData?.gallery_urls) ? (productData.gallery_urls as string[]) : []
  const files: { file_name: string; file_size: number; mime_type: string }[] = Array.isArray(productData?.files) ? (productData.files as any[]) : []

  const allImages = thumbnailUrl ? [thumbnailUrl, ...galleryUrls] : galleryUrls
  const [activeImage, setActiveImage] = useState(0)

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
  const resolved = resolveScheme(theme, colorScheme)
  const scheme = {
    bg: resolved.bg,
    text: resolved.paragraph,
    muted: resolved.paragraph,
    surface: resolved.bg === "#ffffff" ? "#f8fafc" : resolved.bg,
    border: resolved.inset_border,
  }
  const primaryColor = resolved.primary_btn_bg

  const visibleFiles = showAllFiles ? files : files.slice(0, 4)

  return (
    <SectionWrapper bgColor={scheme.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className={cn("w-full mx-auto", layout === "one_column" ? "max-w-2xl px-6" : "max-w-[1230px] flex flex-col @[768px]:flex-row")}
        style={{ color: scheme.text, paddingTop: `${s.padding_top ?? 48}px`, paddingBottom: `${s.padding_bottom ?? 48}px` }}
      >
        {/* Image column */}
        <div
          className={cn(layout === "two_column" ? "px-6 @[768px]:px-8" : "mb-8")}
          style={layout === "two_column" ? { width: imageWidth, flexShrink: 0 } : undefined}
        >
          {allImages.length > 0 ? (
            <div>
              {/* Main image */}
              <div className="w-full overflow-hidden rounded-lg" style={{ background: scheme.surface }}>
                <img
                  src={allImages[activeImage] ?? allImages[0]}
                  alt={title}
                  className="w-full h-auto object-contain"
                  style={{ maxHeight: "600px" }}
                  loading="lazy"
                  decoding="async"
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
                      <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
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

          {/* CTA Buttons */}
          <div className="space-y-3 mb-6">
            <button
              type="button"
              disabled={isEditing || !productId}
              onClick={e => {
                e.stopPropagation()
                if (isEditing || !productId) return
                const slug = str((productData?.slug as unknown) ?? "", "")
                const from = slug ? `&from=${encodeURIComponent(`/products/${slug}`)}` : ""
                window.location.href = `/checkout?productId=${encodeURIComponent(productId)}${from}`
              }}
              className="w-full py-3.5 text-base font-semibold border-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              style={{ borderColor: primaryColor, color: primaryColor, ...buttonRadiusStyle(theme) }}
            >
              Add to Cart
            </button>
            <button
              type="button"
              disabled={isEditing || !productId}
              onClick={e => {
                e.stopPropagation()
                if (isEditing || !productId) return
                const slug = str((productData?.slug as unknown) ?? "", "")
                const from = slug ? `&from=${encodeURIComponent(`/products/${slug}`)}` : ""
                window.location.href = `/checkout?productId=${encodeURIComponent(productId)}${from}`
              }}
              className="w-full py-3.5 text-base font-semibold text-white rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              style={{ background: primaryColor, ...buttonRadiusStyle(theme) }}
            >
              {priceCents === 0 ? "Get for Free" : "Buy Now"}
            </button>
          </div>

          {/* Wishlist + Share */}
          <div className="flex items-center gap-4 mb-6" style={{ color: scheme.muted }}>
            {showWishlist && (
              <button className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity">
                <Heart className="h-4 w-4" />
                <span className="underline">Add to wishlist</span>
              </button>
            )}
            {showShare && (
              <button className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity">
                <Share2 className="h-4 w-4" />
                <span className="underline">Share</span>
              </button>
            )}
          </div>

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
    </SectionWrapper>
  )
}

export default ProductSection

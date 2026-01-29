"use client"

import { ReactNode, useState, useCallback } from "react"
import { usePurchaseStatus } from "./use-purchase-status"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { DownloadButton } from "@/components/download-button"
import { BuyButton } from "@/components/checkout/buy-button"
import { VariantSelector, type ProductVariant } from "@/components/product/variant-selector"
import { Badge } from "@/components/ui/badge"

interface PurchaseStatusWrapperProps {
  productId: string
  productType?: string
  priceCents: number
  compareAtCents?: number | null
  creatorId?: string
  serverHasPurchased?: boolean
  serverAssetId?: string | null
  serverPurchasedVariantId?: string | null // The variant that was purchased (if any)
  // Variants
  variants?: ProductVariant[]
  // Call to action text for buy button
  callToAction?: string | null
  // Button colors
  buyButtonBgColor?: string
  buyButtonTextColor?: string
  downloadButtonBgColor?: string
  downloadButtonTextColor?: string
  // Theme colors for variants
  themeColors?: {
    cardBackground?: string
    cardTextColor?: string
    cardBorderColor?: string
    cardPriceColor?: string
    accentColor?: string
  }
  // Content to render after buttons (wishlist, refund policy)
  purchasedExtraContent?: ReactNode
  notPurchasedExtraContent?: ReactNode
  // Show price display
  showPriceDisplay?: boolean
}

/**
 * PurchaseStatusWrapper - Smart buy/download button that checks localStorage
 * Shows Download if purchased (server or localStorage), Buy otherwise
 * Supports product variants with PER-VARIANT access control
 *
 * IMPORTANT: Each variant is a separate purchasable entitlement.
 * - User can only download the specific variant they purchased
 * - Switching to a different variant shows Buy button, not Download
 *
 * LAYOUT ORDER (not purchased):
 * 1. Price display (if showPriceDisplay)
 * 2. Buy button
 * 3. Add to wishlist (notPurchasedExtraContent)
 * 4. Variant selector (UNDER buy button and wishlist)
 */
export function PurchaseStatusWrapper({
  productId,
  productType = "digital",
  priceCents,
  compareAtCents,
  creatorId,
  serverHasPurchased = false,
  serverAssetId = null,
  serverPurchasedVariantId = null,
  variants = [],
  callToAction,
  buyButtonBgColor,
  buyButtonTextColor,
  downloadButtonBgColor,
  downloadButtonTextColor,
  themeColors,
  purchasedExtraContent,
  notPurchasedExtraContent,
  showPriceDisplay = false,
}: PurchaseStatusWrapperProps) {
  const { hasPurchased, assetId: hookAssetId, receiptToken, purchasedVariantId, isChecking } = usePurchaseStatus(
    productId,
    serverHasPurchased,
    serverAssetId,
    serverPurchasedVariantId
  )

  // Find the initial variant to select:
  // 1. If user has purchased a variant, default to that variant for instant Download button
  // 2. Otherwise, default to first variant
  const getInitialVariant = (): ProductVariant | null => {
    if (variants.length === 0) return null

    // If user purchased a specific variant, default to it so Download shows immediately
    if (purchasedVariantId) {
      const purchasedVariant = variants.find(v => v.id === purchasedVariantId)
      if (purchasedVariant) return purchasedVariant
    }

    return variants[0]
  }

  const initialVariant = getInitialVariant()
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(initialVariant)
  const [currentPrice, setCurrentPrice] = useState(
    initialVariant ? (initialVariant.price_cents || 0) : priceCents
  )

  // Get effective asset ID - use variant's files if available, otherwise product-level
  const getEffectiveAssetId = (): string | null => {
    // If variant has assigned files, use the first one
    if (selectedVariant?.files && selectedVariant.files.length > 0) {
      return selectedVariant.files[0].id
    }
    // Fall back to hook's asset ID (product-level or from localStorage)
    return hookAssetId
  }

  const effectiveAssetId = getEffectiveAssetId()

  const handleVariantChange = useCallback((variant: ProductVariant | null, finalPrice: number) => {
    setSelectedVariant(variant)
    setCurrentPrice(finalPrice)
  }, [])

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  // Compare at price only shown when no variants selected
  const effectiveCompareAtPrice = variants.length === 0 ? compareAtCents : null

  // Per-variant access control:
  // - If product has NO variants: use product-level purchase status
  // - If product HAS variants: check if selected variant === purchased variant
  const hasVariantAccess = (): boolean => {
    if (!hasPurchased) return false

    // No variants = product-level access
    if (variants.length === 0) return true

    // If user purchased with no variant (old purchase), give access to first variant only
    if (!purchasedVariantId) {
      return selectedVariant?.id === variants[0]?.id
    }

    // User purchased a specific variant - only that variant has access
    return selectedVariant?.id === purchasedVariantId
  }

  const canDownload = hasVariantAccess() && effectiveAssetId && productType === "digital"

  // Loading state
  if (isChecking) {
    return (
      <div className="space-y-3">
        <Button
          disabled
          className="w-full min-h-[48px]"
          style={{
            backgroundColor: buyButtonBgColor || undefined,
            color: buyButtonTextColor || undefined,
          }}
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </Button>
      </div>
    )
  }

  // Render the component with unified variant selector
  // Button changes based on whether user can download the CURRENT selected variant
  return (
    <div className="space-y-3">
      {/* Price display */}
      {showPriceDisplay && (
        <div className="mb-4">
          <div
            className="text-2xl sm:text-3xl font-bold"
            style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
          >
            {currentPrice === 0 ? "Free" : formatPrice(currentPrice)}
          </div>
          {effectiveCompareAtPrice && effectiveCompareAtPrice > currentPrice && (
            <div className="mt-1 flex items-center gap-2">
              <span
                className="text-base sm:text-lg line-through"
                style={{ color: themeColors?.cardPriceColor || "var(--muted-foreground)" }}
              >
                {formatPrice(effectiveCompareAtPrice)}
              </span>
              <Badge variant="destructive">
                {Math.round((1 - currentPrice / effectiveCompareAtPrice) * 100)}% OFF
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Download button - ONLY if user purchased THIS specific variant */}
      {canDownload ? (
        <>
          <DownloadButton
            assetId={effectiveAssetId}
            receiptToken={receiptToken}
            className="w-full min-h-[48px]"
            size="default"
            style={{
              backgroundColor: downloadButtonBgColor || undefined,
              color: downloadButtonTextColor || undefined,
            }}
          >
            Download File
          </DownloadButton>
          {purchasedExtraContent}
        </>
      ) : (
        <>
          {/* Buy button - shown when user hasn't purchased THIS variant */}
          <BuyButton
            productId={productId}
            price={currentPrice}
            creatorId={creatorId}
            backgroundColor={buyButtonBgColor}
            textColor={buyButtonTextColor}
            variantId={selectedVariant?.id}
            callToAction={callToAction}
          />
          {notPurchasedExtraContent}
        </>
      )}

      {/* Variant selector - ALWAYS visible, allows switching between variants */}
      {variants.length > 0 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: themeColors?.cardBorderColor || "var(--border)" }}>
          {!canDownload && (
            <p
              className="text-sm font-medium mb-3"
              style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
            >
              Select option
            </p>
          )}
          <VariantSelector
            variants={variants}
            basePrice={priceCents}
            onVariantChange={handleVariantChange}
            initialSelectedId={purchasedVariantId}
            themeColors={{
              cardBackground: themeColors?.cardBackground,
              cardTextColor: themeColors?.cardTextColor,
              cardBorderColor: themeColors?.cardBorderColor,
              accentColor: themeColors?.accentColor || "#000000",
            }}
          />
        </div>
      )}
    </div>
  )
}

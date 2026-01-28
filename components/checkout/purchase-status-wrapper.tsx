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
  // Variants
  variants?: ProductVariant[]
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
  // Content to render after buttons
  purchasedExtraContent?: ReactNode
  notPurchasedExtraContent?: ReactNode
  // Show price display
  showPriceDisplay?: boolean
}

/**
 * PurchaseStatusWrapper - Smart buy/download button that checks localStorage
 * Shows Download if purchased (server or localStorage), Buy otherwise
 * Supports product variants with dynamic pricing
 */
export function PurchaseStatusWrapper({
  productId,
  productType = "digital",
  priceCents,
  compareAtCents,
  creatorId,
  serverHasPurchased = false,
  serverAssetId = null,
  variants = [],
  buyButtonBgColor,
  buyButtonTextColor,
  downloadButtonBgColor,
  downloadButtonTextColor,
  themeColors,
  purchasedExtraContent,
  notPurchasedExtraContent,
  showPriceDisplay = false,
}: PurchaseStatusWrapperProps) {
  const { hasPurchased, assetId, receiptToken, isChecking } = usePurchaseStatus(
    productId,
    serverHasPurchased,
    serverAssetId
  )

  // Variant state - if variants exist, use first variant's price as FINAL price
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    variants.length > 0 ? variants[0] : null
  )
  const [currentPrice, setCurrentPrice] = useState(
    variants.length > 0 ? (variants[0]?.price_cents || 0) : priceCents
  )

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

  // Loading state
  if (isChecking) {
    return (
      <div className="space-y-3">
        <Button
          disabled
          className="w-full min-h-[44px]"
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

  // Purchased state - show download button
  if (hasPurchased && assetId && productType === "digital") {
    return (
      <div className="space-y-3">
        <DownloadButton
          assetId={assetId}
          receiptToken={receiptToken}
          className="w-full min-h-[44px]"
          size="default"
          style={{
            backgroundColor: downloadButtonBgColor || undefined,
            color: downloadButtonTextColor || undefined,
          }}
        >
          Download File
        </DownloadButton>
        {purchasedExtraContent}
      </div>
    )
  }

  // Not purchased - show variant selector and buy button
  return (
    <div className="space-y-3">
      {/* Price display (optional) */}
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

      {/* Variant selector */}
      {variants.length > 0 && (
        <div className="mb-4">
          <VariantSelector
            variants={variants}
            basePrice={priceCents}
            onVariantChange={handleVariantChange}
            themeColors={{
              cardBackground: themeColors?.cardBackground,
              cardTextColor: themeColors?.cardTextColor,
              cardBorderColor: themeColors?.cardBorderColor,
              accentColor: themeColors?.accentColor || "#000000",
            }}
          />
        </div>
      )}

      <BuyButton
        productId={productId}
        price={currentPrice}
        creatorId={creatorId}
        backgroundColor={buyButtonBgColor}
        textColor={buyButtonTextColor}
        variantId={selectedVariant?.id}
      />
      {notPurchasedExtraContent}
    </div>
  )
}

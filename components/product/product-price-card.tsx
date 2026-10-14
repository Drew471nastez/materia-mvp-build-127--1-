"use client"

import { useState, useCallback } from "react"
import { shopMoney } from "@/lib/store/shop-money"
import { Badge } from "@/components/ui/badge"
import { VariantSelector, type ProductVariant } from "./variant-selector"

interface ProductPriceCardProps {
  productId: string
  basePrice: number
  compareAtPrice?: number | null
  variants: ProductVariant[]
  themeColors?: {
    cardBackground?: string
    cardTextColor?: string
    cardBorderColor?: string
    cardPriceColor?: string
    cardIconColor?: string
    accentColor?: string
  }
  purchaseButton: React.ReactNode
  purchasedContent?: React.ReactNode
  notPurchasedContent?: React.ReactNode
  whatsIncluded: React.ReactNode
  salesAnnouncement?: React.ReactNode
  hasPurchased?: boolean
  className?: string
}

export function ProductPriceCard({
  productId,
  basePrice,
  compareAtPrice,
  variants,
  themeColors,
  purchaseButton,
  purchasedContent,
  notPurchasedContent,
  whatsIncluded,
  salesAnnouncement,
  hasPurchased = false,
  className,
}: ProductPriceCardProps) {
  // If variants exist, use first variant's price as initial price
  // Otherwise use base product price
  const initialPrice = variants.length > 0 ? (variants[0]?.price_cents || 0) : basePrice

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    variants.length > 0 ? variants[0] : null
  )
  const [currentPrice, setCurrentPrice] = useState(initialPrice)

  const handleVariantChange = useCallback((variant: ProductVariant | null, finalPrice: number) => {
    setSelectedVariant(variant)
    setCurrentPrice(finalPrice)
  }, [])

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free"
    return shopMoney(cents, { grouping: true })
  }

  // Compare at price logic - only relevant when no variants, or we could compare variant price
  // For simplicity, only show compare price when no variants selected
  const showComparePrice = compareAtPrice && compareAtPrice > currentPrice && variants.length === 0

  return (
    <div className={className}>
      {/* Price display */}
      <div className="mb-4">
        <div
          className="text-2xl sm:text-3xl font-bold"
          style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
        >
          {formatPrice(currentPrice)}
        </div>
        {showComparePrice && (
          <div className="mt-1 flex items-center gap-2">
            <span
              className="text-base sm:text-lg line-through"
              style={{ color: themeColors?.cardPriceColor || "var(--muted-foreground)" }}
            >
              {formatPrice(compareAtPrice)}
            </span>
            <Badge variant="destructive">
              {Math.round((1 - currentPrice / compareAtPrice) * 100)}% OFF
            </Badge>
          </div>
        )}
      </div>

      {/* Purchase button - ABOVE variants */}
      {purchaseButton}

      {/* Variants selector - UNDER buy button with divider */}
      {variants.length > 0 && (
        <>
          <div
            className="my-4 border-t"
            style={{ borderColor: themeColors?.cardBorderColor || "#e5e7eb" }}
          />
          <VariantSelector
            variants={variants}
            basePrice={basePrice}
            onVariantChange={handleVariantChange}
            themeColors={{
              cardBackground: themeColors?.cardBackground,
              cardTextColor: themeColors?.cardTextColor,
              cardBorderColor: themeColors?.cardBorderColor,
              accentColor: themeColors?.accentColor || "#000000",
            }}
          />
        </>
      )}

      {/* Purchased/Not purchased content */}
      {hasPurchased ? purchasedContent : notPurchasedContent}

      {/* What's included */}
      {whatsIncluded}

      {/* Sales announcement */}
      {salesAnnouncement}
    </div>
  )
}

"use client"

import { useState, useCallback } from "react"
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
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    variants.length > 0 ? variants[0] : null
  )
  const [currentPrice, setCurrentPrice] = useState(
    basePrice + (variants[0]?.additional_price_cents || 0)
  )

  const handleVariantChange = useCallback((variant: ProductVariant | null, totalPrice: number) => {
    setSelectedVariant(variant)
    setCurrentPrice(totalPrice)
  }, [])

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  // Calculate compare at price with variant additional
  const effectiveCompareAtPrice = compareAtPrice
    ? compareAtPrice + (selectedVariant?.additional_price_cents || 0)
    : null

  return (
    <div className={className}>
      {/* Price display */}
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

      {/* Variant selector */}
      {variants.length > 0 && (
        <div className="mb-4">
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
        </div>
      )}

      {/* Purchase button */}
      {purchaseButton}

      {/* Purchased/Not purchased content */}
      {hasPurchased ? purchasedContent : notPurchasedContent}

      {/* What's included */}
      {whatsIncluded}

      {/* Sales announcement */}
      {salesAnnouncement}
    </div>
  )
}

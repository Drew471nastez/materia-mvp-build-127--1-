"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Check, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export interface ProductVariant {
  id: string
  name: string
  description?: string | null
  price_cents: number
  compare_at_cents?: number | null
  position: number
  is_default: boolean
}

interface ProductVariantSelectorLiveProps {
  variants: ProductVariant[]
  onVariantChange?: (variant: ProductVariant) => void
  className?: string
  // Theme colors
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  selectedBgColor?: string
  selectedBorderColor?: string
  priceColor?: string
}

export function ProductVariantSelectorLive({
  variants,
  onVariantChange,
  className,
  backgroundColor,
  textColor,
  borderColor,
  selectedBgColor,
  selectedBorderColor,
  priceColor,
}: ProductVariantSelectorLiveProps) {
  // Sort variants by position
  const sortedVariants = [...variants].sort((a, b) => a.position - b.position)

  // Initialize with the default variant (first one)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
    const defaultVariant = sortedVariants.find((v) => v.is_default) || sortedVariants[0]
    return defaultVariant?.id || null
  })

  // If only one variant, it's always selected and can't be unselected
  const isSingleVariant = variants.length === 1
  const effectiveSelectedId = selectedVariantId || sortedVariants[0]?.id

  // Notify parent of variant changes
  useEffect(() => {
    if (onVariantChange && effectiveSelectedId) {
      const selectedVariant = variants.find((v) => v.id === effectiveSelectedId)
      if (selectedVariant) {
        onVariantChange(selectedVariant)
      }
    }
  }, [effectiveSelectedId, variants, onVariantChange])

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const handleSelect = (variant: ProductVariant) => {
    // If single variant, don't allow unselect
    if (isSingleVariant) return

    // If already selected, don't unselect (must have one selected)
    if (variant.id === effectiveSelectedId) return

    setSelectedVariantId(variant.id)
  }

  if (variants.length === 0) return null

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Package
          className="h-4 w-4"
          style={{ color: priceColor || "var(--muted-foreground)" }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: textColor || "var(--foreground)" }}
        >
          {isSingleVariant ? "Package" : "Select a package"}
        </span>
      </div>

      <div className="space-y-2">
        {sortedVariants.map((variant) => {
          const isSelected = variant.id === effectiveSelectedId
          const hasDiscount =
            variant.compare_at_cents && variant.compare_at_cents > variant.price_cents
          const discountPercent = hasDiscount
            ? Math.round((1 - variant.price_cents / variant.compare_at_cents!) * 100)
            : 0

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => handleSelect(variant)}
              className={cn(
                "w-full rounded-xl border-2 p-4 text-left transition-all",
                "focus:outline-none focus:ring-2 focus:ring-offset-2",
                isSelected ? "ring-2 ring-offset-1" : "hover:border-muted-foreground/50",
                isSingleVariant && "cursor-default"
              )}
              style={{
                backgroundColor: isSelected
                  ? selectedBgColor || "rgba(59, 130, 246, 0.08)"
                  : backgroundColor || "var(--card)",
                borderColor: isSelected
                  ? selectedBorderColor || "#3b82f6"
                  : borderColor || "var(--border)",
                color: textColor,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-semibold"
                      style={{ color: textColor || "var(--foreground)" }}
                    >
                      {variant.name}
                    </span>
                    {variant.is_default && variants.length > 1 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        Popular
                      </Badge>
                    )}
                  </div>
                  {variant.description && (
                    <p
                      className="mt-1 text-sm line-clamp-2"
                      style={{ color: priceColor || "var(--muted-foreground)" }}
                    >
                      {variant.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-bold text-lg"
                      style={{ color: textColor || "var(--foreground)" }}
                    >
                      {formatPrice(variant.price_cents)}
                    </span>
                    {isSelected && (
                      <div
                        className="flex items-center justify-center w-5 h-5 rounded-full"
                        style={{
                          backgroundColor: selectedBorderColor || "#3b82f6",
                          color: "#ffffff",
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                  {hasDiscount && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="text-xs line-through"
                        style={{ color: priceColor || "var(--muted-foreground)" }}
                      >
                        {formatPrice(variant.compare_at_cents!)}
                      </span>
                      <Badge
                        variant="destructive"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {discountPercent}% OFF
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {isSingleVariant && (
        <p
          className="text-xs text-center mt-2"
          style={{ color: priceColor || "var(--muted-foreground)" }}
        >
          This is the only available package
        </p>
      )}
    </div>
  )
}

// Wrapper component that manages variant state and connects to purchase system
interface ProductVariantsWithPurchaseProps {
  variants: ProductVariant[]
  productId: string
  productTitle: string
  productType: string
  basePrice: number
  creatorId: string
  hasPurchased: boolean
  firstAssetId: string | null
  buyButtonBgColor?: string
  buyButtonTextColor?: string
  downloadButtonBgColor?: string
  downloadButtonTextColor?: string
  themeColors: {
    cardBackground?: string
    cardTextColor?: string
    cardPriceColor?: string
    cardBorderColor?: string
    cardIconColor?: string
    viewInLibraryBg?: string
    viewInLibraryText?: string
    viewInLibraryBorder?: string
  }
  refundPolicy?: {
    enabled: boolean
    type?: string
    finePrint?: string
    updatedAt?: string
  }
  themePreset?: string
  isDarkTheme?: boolean
  userId?: string
}

export function ProductVariantsWithPurchase({
  variants,
  productId,
  basePrice,
  themeColors,
}: ProductVariantsWithPurchaseProps) {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(() => {
    const sortedVariants = [...variants].sort((a, b) => a.position - b.position)
    return sortedVariants.find((v) => v.is_default) || sortedVariants[0] || null
  })

  // Get the effective price based on selected variant or base price
  const effectivePrice = selectedVariant?.price_cents ?? basePrice

  return (
    <div className="space-y-4">
      <ProductVariantSelectorLive
        variants={variants}
        onVariantChange={setSelectedVariant}
        backgroundColor={themeColors.cardBackground}
        textColor={themeColors.cardTextColor}
        borderColor={themeColors.cardBorderColor}
        priceColor={themeColors.cardPriceColor}
        selectedBorderColor="#3b82f6"
        selectedBgColor="rgba(59, 130, 246, 0.08)"
      />

      {/* Hidden input to pass selected variant to purchase forms */}
      <input type="hidden" name="variant_id" value={selectedVariant?.id || ""} />
      <input type="hidden" name="variant_price" value={effectivePrice} />
    </div>
  )
}

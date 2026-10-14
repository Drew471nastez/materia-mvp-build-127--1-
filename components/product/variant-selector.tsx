"use client"

import { useState, useEffect } from "react"
import { shopMoney, shopAmount } from "@/lib/store/shop-money"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export interface ProductVariant {
  id: string
  name: string
  description: string | null
  price_cents: number // FINAL price for this variant (not additional)
  max_purchases: number | null
  position: number
  files?: Array<{
    id: string
    file_name: string
  }>
  // Pay What You Want fields (per-variant)
  pay_what_you_want?: boolean
  pwyw_min_price_cents?: number | null
  pwyw_suggested_price_cents?: number | null
}

interface VariantSelectorProps {
  variants: ProductVariant[]
  basePrice: number // Only used when no variants exist
  onVariantChange: (variant: ProductVariant | null, finalPrice: number) => void
  initialSelectedId?: string | null // Pre-select a specific variant (e.g., purchased variant)
  purchasedVariantIds?: string[] // Array of variant IDs the user has purchased
  themeColors?: {
    cardBackground?: string
    cardTextColor?: string
    cardBorderColor?: string
    accentColor?: string
  }
  className?: string
}

export function VariantSelector({
  variants,
  basePrice,
  onVariantChange,
  initialSelectedId,
  purchasedVariantIds = [],
  themeColors,
  className,
}: VariantSelectorProps) {
  // Default to initialSelectedId if provided and valid, otherwise first variant
  const getInitialVariantId = () => {
    if (variants.length === 0) return null
    if (initialSelectedId && variants.some(v => v.id === initialSelectedId)) {
      return initialSelectedId
    }
    return variants[0].id
  }

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(getInitialVariantId)

  useEffect(() => {
    // Notify parent of initial selection
    if (variants.length > 0) {
      const selectedVariant = variants.find(v => v.id === selectedVariantId) || variants[0]
      // Use variant's price_cents directly as the final price
      onVariantChange(selectedVariant, selectedVariant?.price_cents || 0)
    } else {
      onVariantChange(null, basePrice)
    }
  }, []) // Only run on mount

  const handleVariantSelect = (variant: ProductVariant) => {
    // If only 1 variant, can't unselect
    if (variants.length === 1) return

    setSelectedVariantId(variant.id)
    // Use variant's price_cents directly as the final price
    onVariantChange(variant, variant.price_cents)
  }

  if (variants.length === 0) return null

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free"
    return shopMoney(cents, { grouping: true })
  }

  // Format PWYW min as "$X+"
  const formatPwywMin = (cents: number | null | undefined): string => {
    if (!cents || cents === 0) return `${shopAmount(0)}+`
    return `${shopMoney(cents).replace(/\.00$/, "")}+`
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* No heading - removed "Package" / "Choose a package" */}
      <div className="space-y-2">
        {variants.map((variant) => {
          const isSelected = selectedVariantId === variant.id
          const isOwned = purchasedVariantIds.includes(variant.id)
          const isPwyw = variant.pay_what_you_want

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => handleVariantSelect(variant)}
              disabled={variants.length === 1}
              className={cn(
                "w-full text-left rounded-xl p-3 sm:p-4 transition-all duration-200 relative z-10",
                isSelected
                  ? "bg-gray-50"
                  : "bg-white hover:border-gray-300",
                variants.length === 1 ? "cursor-default" : "cursor-pointer"
              )}
              style={{
                border: `2px solid ${isSelected
                  ? `${themeColors?.accentColor || "#000000"}`
                  : themeColors?.cardBorderColor || "#e5e7eb"}`,
                boxShadow: isSelected
                  ? `0 0 0 1px ${themeColors?.accentColor || "#000000"}80`
                  : "none",
                backgroundColor: isSelected
                  ? `${themeColors?.accentColor || "#000000"}08`
                  : themeColors?.cardBackground || undefined,
              }}
            >
              <div className="flex items-start gap-3">
                {/* Selection indicator - dot radio button */}
                <div
                  className={cn(
                    "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors",
                    isSelected ? "border-black" : "border-gray-300"
                  )}
                  style={{
                    borderColor: isSelected
                      ? themeColors?.accentColor || "#000000"
                      : themeColors?.cardBorderColor || "#d1d5db",
                    backgroundColor: "transparent",
                  }}
                >
                  {isSelected && (
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: themeColors?.accentColor || "#000000" }}
                    />
                  )}
                </div>

                {/* Variant info - name, price, description, owned badge */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <h4
                        className="font-semibold text-sm sm:text-base truncate"
                        style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
                      >
                        {variant.name}
                      </h4>
                      {isOwned && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 flex-shrink-0">
                          <Check className="h-3 w-3" />
                          Owned
                        </span>
                      )}
                    </div>
                    <span
                      className="font-bold text-sm sm:text-base flex-shrink-0"
                      style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
                    >
                      {isPwyw
                        ? formatPwywMin(variant.pwyw_min_price_cents)
                        : formatPrice(variant.price_cents)
                      }
                    </span>
                  </div>

                  {variant.description && (
                    <p
                      className="text-xs sm:text-sm mt-1 line-clamp-2"
                      style={{ color: `${themeColors?.cardTextColor || "var(--foreground)"}99` }}
                    >
                      {variant.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Compact variant selector for sticky bar / mobile
export function VariantSelectorCompact({
  variants,
  basePrice,
  selectedVariantId,
  onVariantChange,
  purchasedVariantIds = [],
  themeColors,
  className,
}: {
  variants: ProductVariant[]
  basePrice: number
  selectedVariantId: string | null
  onVariantChange: (variant: ProductVariant | null, finalPrice: number) => void
  purchasedVariantIds?: string[]
  themeColors?: {
    cardBackground?: string
    cardTextColor?: string
    cardBorderColor?: string
    accentColor?: string
  }
  className?: string
}) {
  if (variants.length <= 1) return null

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free"
    return shopMoney(cents, { grouping: true })
  }

  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-1 -mx-1 px-1", className)}>
      {variants.map((variant) => {
        const isSelected = selectedVariantId === variant.id
        const isOwned = purchasedVariantIds.includes(variant.id)

        return (
          <button
            key={variant.id}
            type="button"
            onClick={() => {
              // Use variant's price_cents directly as the final price
              onVariantChange(variant, variant.price_cents)
            }}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
              isSelected
                ? "bg-black text-white border-black"
                : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
            )}
            style={{
              backgroundColor: isSelected ? themeColors?.accentColor || "#000000" : undefined,
              borderColor: isSelected ? themeColors?.accentColor || "#000000" : undefined,
            }}
          >
            {variant.name} - {formatPrice(variant.price_cents)}
            {isOwned && " ✓"}
          </button>
        )
      })}
    </div>
  )
}

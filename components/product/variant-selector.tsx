"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Check, Package } from "lucide-react"

export interface ProductVariant {
  id: string
  name: string
  description: string | null
  additional_price_cents: number
  max_purchases: number | null
  position: number
  files?: Array<{
    id: string
    file_name: string
  }>
}

interface VariantSelectorProps {
  variants: ProductVariant[]
  basePrice: number
  onVariantChange: (variant: ProductVariant | null, totalPrice: number) => void
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
  themeColors,
  className,
}: VariantSelectorProps) {
  // If only 1 variant, it's always selected and can't be unselected
  // If multiple variants, first one is selected by default but can switch
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.length > 0 ? variants[0].id : null
  )

  useEffect(() => {
    // Notify parent of initial selection
    if (variants.length > 0) {
      const selectedVariant = variants.find(v => v.id === selectedVariantId) || variants[0]
      const totalPrice = basePrice + (selectedVariant?.additional_price_cents || 0)
      onVariantChange(selectedVariant, totalPrice)
    } else {
      onVariantChange(null, basePrice)
    }
  }, []) // Only run on mount

  const handleVariantSelect = (variant: ProductVariant) => {
    // If only 1 variant, can't unselect
    if (variants.length === 1) return

    setSelectedVariantId(variant.id)
    const totalPrice = basePrice + variant.additional_price_cents
    onVariantChange(variant, totalPrice)
  }

  if (variants.length === 0) return null

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p
        className="text-sm font-medium mb-3"
        style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
      >
        {variants.length === 1 ? "Package" : "Choose a package"}
      </p>
      <div className="space-y-2">
        {variants.map((variant) => {
          const isSelected = selectedVariantId === variant.id
          const totalPrice = basePrice + variant.additional_price_cents

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => handleVariantSelect(variant)}
              disabled={variants.length === 1}
              className={cn(
                "w-full text-left rounded-xl border-2 p-3 sm:p-4 transition-all duration-200",
                isSelected
                  ? "border-black bg-gray-50"
                  : "border-gray-200 hover:border-gray-300 bg-white",
                variants.length === 1 && "cursor-default"
              )}
              style={{
                borderColor: isSelected
                  ? themeColors?.accentColor || "#000000"
                  : themeColors?.cardBorderColor || undefined,
                backgroundColor: isSelected
                  ? `${themeColors?.accentColor || "#000000"}08`
                  : themeColors?.cardBackground || undefined,
              }}
            >
              <div className="flex items-start gap-3">
                {/* Selection indicator */}
                <div
                  className={cn(
                    "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors",
                    isSelected ? "border-black bg-black" : "border-gray-300"
                  )}
                  style={{
                    borderColor: isSelected
                      ? themeColors?.accentColor || "#000000"
                      : themeColors?.cardBorderColor || "#d1d5db",
                    backgroundColor: isSelected
                      ? themeColors?.accentColor || "#000000"
                      : "transparent",
                  }}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>

                {/* Variant info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4
                      className="font-semibold text-sm sm:text-base truncate"
                      style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
                    >
                      {variant.name}
                    </h4>
                    <span
                      className="font-bold text-sm sm:text-base flex-shrink-0"
                      style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
                    >
                      {formatPrice(totalPrice)}
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

                  {/* File count indicator */}
                  {variant.files && variant.files.length > 0 && (
                    <div
                      className="flex items-center gap-1.5 mt-2 text-xs"
                      style={{ color: `${themeColors?.cardTextColor || "var(--foreground)"}80` }}
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>
                        {variant.files.length} file{variant.files.length !== 1 ? "s" : ""} included
                      </span>
                    </div>
                  )}

                  {/* Additional price indicator */}
                  {variant.additional_price_cents > 0 && (
                    <div
                      className="text-xs mt-1"
                      style={{ color: `${themeColors?.cardTextColor || "var(--foreground)"}70` }}
                    >
                      +{formatPrice(variant.additional_price_cents)} from base price
                    </div>
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
  themeColors,
  className,
}: {
  variants: ProductVariant[]
  basePrice: number
  selectedVariantId: string | null
  onVariantChange: (variant: ProductVariant | null, totalPrice: number) => void
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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-1 -mx-1 px-1", className)}>
      {variants.map((variant) => {
        const isSelected = selectedVariantId === variant.id
        const totalPrice = basePrice + variant.additional_price_cents

        return (
          <button
            key={variant.id}
            type="button"
            onClick={() => {
              onVariantChange(variant, totalPrice)
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
            {variant.name}
            {variant.additional_price_cents > 0 && (
              <span className="ml-1 opacity-70">+{formatPrice(variant.additional_price_cents)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

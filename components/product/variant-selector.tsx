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

interface VariantSelectorProps {
  variants: ProductVariant[]
  selectedVariantId: string | null
  onSelect: (variant: ProductVariant) => void
  disabled?: boolean
  className?: string
  // Theme colors
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  selectedBgColor?: string
  selectedBorderColor?: string
  selectedTextColor?: string
  priceColor?: string
}

export function VariantSelector({
  variants,
  selectedVariantId,
  onSelect,
  disabled = false,
  className,
  backgroundColor,
  textColor,
  borderColor,
  selectedBgColor,
  selectedBorderColor,
  selectedTextColor,
  priceColor,
}: VariantSelectorProps) {
  // Sort variants by position
  const sortedVariants = [...variants].sort((a, b) => a.position - b.position)

  // If only one variant, it's always selected and can't be unselected
  const isSingleVariant = variants.length === 1
  const effectiveSelectedId = selectedVariantId || sortedVariants[0]?.id

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

    onSelect(variant)
  }

  if (variants.length === 0) return null

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4" style={{ color: textColor || "var(--muted-foreground)" }} />
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
          const hasDiscount = variant.compare_at_cents && variant.compare_at_cents > variant.price_cents
          const discountPercent = hasDiscount
            ? Math.round((1 - variant.price_cents / variant.compare_at_cents!) * 100)
            : 0

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => handleSelect(variant)}
              disabled={disabled || (isSingleVariant && isSelected)}
              className={cn(
                "w-full rounded-xl border-2 p-4 text-left transition-all",
                "focus:outline-none focus:ring-2 focus:ring-offset-2",
                isSelected
                  ? "ring-2 ring-offset-1"
                  : "hover:border-muted-foreground/50",
                disabled && "opacity-60 cursor-not-allowed",
                isSingleVariant && "cursor-default"
              )}
              style={{
                backgroundColor: isSelected
                  ? selectedBgColor || "rgba(var(--primary), 0.05)"
                  : backgroundColor || "var(--card)",
                borderColor: isSelected
                  ? selectedBorderColor || "var(--primary)"
                  : borderColor || "var(--border)",
                color: isSelected ? selectedTextColor : textColor,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-semibold"
                      style={{ color: isSelected ? selectedTextColor || "var(--foreground)" : textColor || "var(--foreground)" }}
                    >
                      {variant.name}
                    </span>
                    {variant.is_default && variants.length > 1 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
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
                      style={{ color: isSelected ? selectedTextColor || "var(--foreground)" : textColor || "var(--foreground)" }}
                    >
                      {formatPrice(variant.price_cents)}
                    </span>
                    {isSelected && (
                      <div
                        className="flex items-center justify-center w-5 h-5 rounded-full"
                        style={{
                          backgroundColor: selectedBorderColor || "var(--primary)",
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
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
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

// Hook to manage variant selection state
export function useVariantSelection(variants: ProductVariant[]) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)

  // Set default variant on mount or when variants change
  useEffect(() => {
    if (variants.length > 0) {
      // Find the default variant or use the first one
      const defaultVariant = variants.find((v) => v.is_default) || variants[0]
      setSelectedVariantId(defaultVariant.id)
    }
  }, [variants])

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) || variants[0]

  const handleSelect = (variant: ProductVariant) => {
    setSelectedVariantId(variant.id)
  }

  return {
    selectedVariantId,
    selectedVariant,
    handleSelect,
  }
}

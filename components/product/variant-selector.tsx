"use client"

import { useState, useEffect } from "react"
import { shopAmountIn } from "@/lib/store/shop-money"
import { usePageMoney, usePriceCurrency } from "@/components/platform/price-currency"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import { tint } from "@/lib/appearance/site-paint"
import { useSitePaint } from "@/lib/appearance/site-paint-context"

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
  /* In the page's store currency (components/platform/price-currency). */
  const pageMoney = usePageMoney()
  const pageCurrency = usePriceCurrency()
  // Default to initialSelectedId if provided and valid, otherwise first variant
  const getInitialVariantId = () => {
    if (variants.length === 0) return null
    if (initialSelectedId && variants.some(v => v.id === initialSelectedId)) {
      return initialSelectedId
    }
    return variants[0].id
  }

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(getInitialVariantId)
  /*
    Round 31: on Storelib's own product page the option rows follow the person's look (lib/appearance/site-paint): the
    chosen row's ring and dot are the ink, the others' edge a hairline, in either look exactly the colours they were.
    A near black accent is a ring in the light look and a graphite row with a strong hairline in the dark one, never a
    white ring (the dark sheet's chosen pill); a coloured accent (the buy button's blue) is itself in both.
  */
  const paint = useSitePaint()
  const accentLit = themeColors?.accentColor || "#000000"
  const accent = paint(accentLit, "ink")
  const ring = paint(accentLit, "line")
  const chosenBg = ring !== accentLit ? `var(--sl-pp-selected, ${accentLit}08)` : tint(accent, "08")
  const edge = paint(themeColors?.cardBorderColor || "#e5e7eb", "line")
  const dotEdge = paint(themeColors?.cardBorderColor || "#d1d5db", "line")
  const rowBg = paint(themeColors?.cardBackground, "bg")
  const ink = paint(themeColors?.cardTextColor, "ink")

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
    return pageMoney(cents, { grouping: true })
  }

  // Format PWYW min as "$X+"
  const formatPwywMin = (cents: number | null | undefined): string => {
    if (!cents || cents === 0) return `${shopAmountIn(0, pageCurrency)}+`
    return `${pageMoney(cents).replace(/\.00$/, "")}+`
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
                border: `2px solid ${isSelected ? ring : edge}`,
                boxShadow: isSelected
                  ? `0 0 0 1px ${tint(ring, "80")}`
                  : "none",
                backgroundColor: isSelected
                  ? chosenBg
                  : rowBg || undefined,
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
                    borderColor: isSelected ? ring : dotEdge,
                    backgroundColor: "transparent",
                  }}
                >
                  {isSelected && (
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                  )}
                </div>

                {/* Variant info - name, price, description, owned badge */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <h4
                        className="font-semibold text-sm sm:text-base truncate"
                        style={{ color: ink || "var(--foreground)" }}
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
                      style={{ color: ink || "var(--foreground)" }}
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
                      style={{ color: ink ? tint(ink, "99") : undefined }}
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
  /* In the page's store currency (components/platform/price-currency). */
  const pageMoney = usePageMoney()
  const pageCurrency = usePriceCurrency()
  if (variants.length <= 1) return null

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free"
    return pageMoney(cents, { grouping: true })
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

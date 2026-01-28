"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Check, Package, Download, Files, Infinity } from "lucide-react"
import { cn } from "@/lib/utils"
import { PurchaseStatusWrapper } from "@/components/checkout/purchase-status-wrapper"
import { ViewInLibraryButton } from "@/components/checkout/view-in-library-button"
import { WishlistButton } from "@/components/wishlist/wishlist-button"
import { RefundPolicyDisplay } from "@/components/product/refund-policy-display"

// Icon mapping for what's included items
function getIncludedItemIcon(item: string, iconColor?: string) {
  const lowerItem = item.toLowerCase()
  const colorStyle = iconColor ? { color: iconColor } : undefined
  const defaultClass = iconColor ? "h-4 w-4 mt-0.5 shrink-0" : "h-4 w-4 mt-0.5 shrink-0 text-black"

  if (lowerItem.includes("instant") || lowerItem.includes("download")) {
    return <Download className={defaultClass} style={colorStyle} />
  }
  if (lowerItem.includes("files") || lowerItem.includes("included")) {
    return <Files className={defaultClass} style={colorStyle} />
  }
  if (lowerItem.includes("lifetime") || lowerItem.includes("access")) {
    return <Infinity className={defaultClass} style={colorStyle} />
  }
  // For check icon, use iconColor if provided, otherwise default green
  const checkClass = iconColor ? "h-4 w-4 mt-0.5 shrink-0" : "h-4 w-4 mt-0.5 shrink-0 text-green-600"
  return <Check className={checkClass} style={colorStyle} />
}

export interface ProductVariant {
  id: string
  name: string
  description?: string | null
  price_cents: number
  compare_at_cents?: number | null
  position: number
  is_default: boolean
}

interface PriceCardWithVariantsProps {
  productId: string
  productType: string
  basePrice: number
  baseCompareAtPrice?: number | null
  creatorId: string
  variants: ProductVariant[]
  hasPurchased: boolean
  firstAssetId: string | null
  buyButtonBgColor?: string
  buyButtonTextColor?: string
  downloadButtonBgColor?: string
  downloadButtonTextColor?: string
  isLoggedIn: boolean
  // What's included items getter
  whatsIncludedItems: string[]
  // Refund policy
  refundPolicyEnabled?: boolean
  refundPolicyType?: string
  refundPolicyFinePrint?: string
  refundPolicyUpdatedAt?: string
  // Sales badge
  showSalesAnnouncement?: boolean
  salesCount?: number
  // Theme
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
  themePreset?: string
  isDarkTheme?: boolean
  // Mobile or desktop
  isMobile?: boolean
}

export function PriceCardWithVariants({
  productId,
  productType,
  basePrice,
  baseCompareAtPrice,
  creatorId,
  variants,
  hasPurchased,
  firstAssetId,
  buyButtonBgColor,
  buyButtonTextColor,
  downloadButtonBgColor,
  downloadButtonTextColor,
  isLoggedIn,
  whatsIncludedItems,
  refundPolicyEnabled,
  refundPolicyType,
  refundPolicyFinePrint,
  refundPolicyUpdatedAt,
  showSalesAnnouncement,
  salesCount,
  themeColors,
  themePreset,
  isDarkTheme,
  isMobile = false,
}: PriceCardWithVariantsProps) {
  // Sort variants by position
  const sortedVariants = [...variants].sort((a, b) => a.position - b.position)
  const hasVariants = variants.length > 0
  const isSingleVariant = variants.length === 1

  // Initialize with the default variant (first one)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
    const defaultVariant = sortedVariants.find((v) => v.is_default) || sortedVariants[0]
    return defaultVariant?.id || null
  })

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) || sortedVariants[0]

  // Get effective price based on variant selection
  const effectivePrice = selectedVariant?.price_cents ?? basePrice
  const effectiveCompareAtPrice = selectedVariant?.compare_at_cents ?? baseCompareAtPrice

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const handleVariantSelect = (variant: ProductVariant) => {
    if (isSingleVariant) return
    if (variant.id === selectedVariantId) return
    setSelectedVariantId(variant.id)
  }

  const hasDiscount = effectiveCompareAtPrice && effectiveCompareAtPrice > effectivePrice

  return (
    <div
      className={cn(
        "rounded-xl border shadow-sm",
        isMobile ? "p-4 sm:p-6" : "p-6"
      )}
      style={{
        backgroundColor: themeColors.cardBackground || "var(--card)",
        borderColor: themeColors.cardBorderColor || "var(--border)",
      }}
    >
      {/* Price Display */}
      <div className="mb-4">
        <div
          className={cn("font-bold", isMobile ? "text-2xl" : "text-3xl")}
          style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
        >
          {effectivePrice === 0 ? "Free" : formatPrice(effectivePrice)}
        </div>
        {hasDiscount && (
          <div className="mt-1 flex items-center gap-2">
            <span
              className={cn("line-through", isMobile ? "text-base" : "text-lg")}
              style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
            >
              {formatPrice(effectiveCompareAtPrice!)}
            </span>
            <Badge variant="destructive">
              {Math.round((1 - effectivePrice / effectiveCompareAtPrice!) * 100)}% OFF
            </Badge>
          </div>
        )}
      </div>

      {/* Variant Selector */}
      {hasVariants && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Package
              className="h-4 w-4"
              style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
            >
              {isSingleVariant ? "Package" : "Select a package"}
            </span>
          </div>

          <div className="space-y-2">
            {sortedVariants.map((variant) => {
              const isSelected = variant.id === selectedVariantId
              const variantHasDiscount =
                variant.compare_at_cents && variant.compare_at_cents > variant.price_cents
              const variantDiscountPercent = variantHasDiscount
                ? Math.round((1 - variant.price_cents / variant.compare_at_cents!) * 100)
                : 0

              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => handleVariantSelect(variant)}
                  className={cn(
                    "w-full rounded-xl border-2 p-3 sm:p-4 text-left transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-offset-2",
                    isSelected ? "ring-2 ring-offset-1" : "hover:border-muted-foreground/50",
                    isSingleVariant && "cursor-default"
                  )}
                  style={{
                    backgroundColor: isSelected
                      ? "rgba(59, 130, 246, 0.08)"
                      : themeColors.cardBackground || "var(--card)",
                    borderColor: isSelected
                      ? "#3b82f6"
                      : themeColors.cardBorderColor || "var(--border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="font-semibold text-sm sm:text-base"
                          style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
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
                          className="mt-1 text-xs sm:text-sm line-clamp-2"
                          style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                        >
                          {variant.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end shrink-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-bold text-base sm:text-lg"
                          style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
                        >
                          {formatPrice(variant.price_cents)}
                        </span>
                        {isSelected && (
                          <div
                            className="flex items-center justify-center w-5 h-5 rounded-full"
                            style={{
                              backgroundColor: "#3b82f6",
                              color: "#ffffff",
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                      {variantHasDiscount && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span
                            className="text-[10px] sm:text-xs line-through"
                            style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
                          >
                            {formatPrice(variant.compare_at_cents!)}
                          </span>
                          <Badge
                            variant="destructive"
                            className="text-[9px] sm:text-[10px] px-1 py-0"
                          >
                            {variantDiscountPercent}% OFF
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
              style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
            >
              This is the only available package
            </p>
          )}
        </div>
      )}

      {/* Purchase Button */}
      <PurchaseStatusWrapper
        productId={productId}
        productType={productType}
        priceCents={effectivePrice}
        creatorId={creatorId}
        serverHasPurchased={hasPurchased}
        serverAssetId={firstAssetId}
        buyButtonBgColor={buyButtonBgColor}
        buyButtonTextColor={buyButtonTextColor}
        downloadButtonBgColor={downloadButtonBgColor}
        downloadButtonTextColor={downloadButtonTextColor}
        variantId={selectedVariant?.id}
        purchasedExtraContent={
          <>
            <ViewInLibraryButton
              backgroundColor={themeColors.viewInLibraryBg}
              textColor={themeColors.viewInLibraryText}
              borderColor={themeColors.viewInLibraryBorder}
            />
            <RefundPolicyDisplay
              enabled={refundPolicyEnabled}
              policyType={refundPolicyType}
              finePrint={refundPolicyFinePrint}
              updatedAt={refundPolicyUpdatedAt}
              className="mt-3"
              textColor={themeColors.cardTextColor}
              themePreset={themePreset}
              isDarkTheme={isDarkTheme}
            />
          </>
        }
        notPurchasedExtraContent={
          <>
            <WishlistButton
              productId={productId}
              isLoggedIn={isLoggedIn}
              backgroundColor={themeColors.cardBackground}
              textColor={themeColors.cardTextColor}
              borderColor={themeColors.cardBorderColor}
              iconColor={themeColors.cardIconColor}
            />
            <RefundPolicyDisplay
              enabled={refundPolicyEnabled}
              policyType={refundPolicyType}
              finePrint={refundPolicyFinePrint}
              updatedAt={refundPolicyUpdatedAt}
              className="mt-3"
              textColor={themeColors.cardTextColor}
              themePreset={themePreset}
              isDarkTheme={isDarkTheme}
            />
          </>
        }
      />

      {/* What's Included */}
      <div
        className="mt-4 border-t pt-4"
        style={{ borderColor: themeColors.cardBorderColor || "var(--border)" }}
      >
        <h3
          className="font-semibold"
          style={{ color: themeColors.cardTextColor || "var(--foreground)" }}
        >
          What&apos;s included
        </h3>
        <ul className="mt-3 space-y-2">
          {whatsIncludedItems.map((item: string, idx: number) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-sm"
              style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
            >
              {getIncludedItemIcon(item, themeColors.cardIconColor)}
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Sales Announcement */}
      {showSalesAnnouncement && salesCount && salesCount > 0 && (
        <div
          className="mt-4 pt-4 border-t"
          style={{ borderColor: themeColors.cardBorderColor || "var(--border)" }}
        >
          <p
            className="text-sm text-center"
            style={{ color: themeColors.cardPriceColor || "var(--muted-foreground)" }}
          >
            {salesCount} {salesCount === 1 ? "person has" : "people have"} purchased this
          </p>
        </div>
      )}
    </div>
  )
}

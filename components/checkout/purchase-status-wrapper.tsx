"use client"

import { ReactNode, useState, useCallback, useEffect, useMemo } from "react"
import { shopMoney, shopAmount } from "@/lib/store/shop-money"
import { usePurchaseStatus } from "./use-purchase-status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Download as DownloadIcon } from "lucide-react"
import { DownloadButton } from "@/components/download-button"
import { BuyButton } from "@/components/checkout/buy-button"
import { VariantSelector, type ProductVariant } from "@/components/product/variant-selector"
import { Badge } from "@/components/ui/badge"
import { downloadEntitledFile } from "@/components/download-button"
import { DownloadFilesSheet } from "@/components/checkout/download-files-sheet"
import { PhysicalBuyBox } from "@/components/physical/buy-box"

interface PurchaseStatusWrapperProps {
  productId: string
  productType?: string
  priceCents: number
  compareAtCents?: number | null
  creatorId?: string
  serverHasPurchased?: boolean
  serverAssetId?: string | null
  serverPurchasedVariantIds?: string[] // Array of purchased variant IDs
  serverProductFiles?: Array<{ id: string; file_name?: string }>
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
  // Pay What You Want settings (product-level)
  payWhatYouWant?: boolean
  pwywMinPriceCents?: number | null
  pwywSuggestedPriceCents?: number | null
  /**
   * A membership (lib/memberships): joined, not owned. A member is shown
   * their membership (memberHref, /library/memberships/<id>) in place of the
   * download area; anybody else gets Join, which opens the membership
   * checkout. The page reads both on the server.
   */
  membership?: { memberHref: string | null } | null
  /**
   * Limit sales (lib/products/sales-limit.ts), counted on the server: every
   * copy sold says Sold out in place of the buy button; a few left says how
   * many under it. Null for a product with no limit.
   */
  sales?: { soldOut: boolean; fewLeft: string | null } | null
}


/**
 * PurchaseStatusWrapper - Smart buy/download button that checks localStorage
 * Shows Download if purchased (server or localStorage), Buy otherwise
 * Supports product variants with PER-VARIANT access control
 * Supports Pay What You Want pricing
 *
 * IMPORTANT: Each variant is a separate purchasable entitlement.
 * - User can only download the specific variant they purchased
 * - Switching to a different variant shows Buy button, not Download
 * - User can purchase MULTIPLE variants and have access to all of them
 *
 * LAYOUT ORDER (not purchased):
 * 1. Price display (if showPriceDisplay) OR PWYW input
 * 2. Buy button
 * 3. Add to wishlist (notPurchasedExtraContent)
 * 4. Variant selector (UNDER buy button and wishlist)
 */
/**
 * A product that ships is bought with its options, stock and a delivery
 * address (components/physical/buy-box.tsx); everything else as it always
 * was, below.
 */
export function PurchaseStatusWrapper(props: PurchaseStatusWrapperProps) {
  if (props.productType === "physical") {
    return (
      <PhysicalBuyBox
        productId={props.productId}
        accent={props.buyButtonBgColor || props.themeColors?.accentColor || "#1a1a2e"}
        accentText={props.buyButtonTextColor || "#ffffff"}
        textColor={props.themeColors?.cardTextColor}
        mutedColor={props.themeColors?.cardPriceColor}
        callToAction={props.callToAction}
      />
    )
  }
  return <DigitalPurchaseStatus {...props} />
}

function DigitalPurchaseStatus({
  productId,
  productType = "digital",
  priceCents,
  compareAtCents,
  creatorId,
  serverHasPurchased = false,
  serverAssetId = null,
  serverPurchasedVariantIds = [],
  serverProductFiles = [],
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
  // PWYW props
  payWhatYouWant = false,
  pwywMinPriceCents = null,
  pwywSuggestedPriceCents = null,
  membership = null,
  sales = null,
}: PurchaseStatusWrapperProps) {
  const {
    hasPurchased,
    assetId: hookAssetId,
    receiptToken,
    purchasedVariantIds,
    isChecking,
    hasVariantAccess
  } = usePurchaseStatus(
    productId,
    serverHasPurchased,
    serverAssetId,
    serverPurchasedVariantIds
  )

  // Find the initial variant to select:
  // 1. If user has purchased any variant, default to the first purchased one for instant Download button
  // 2. Otherwise, default to first variant
  const getInitialVariant = (): ProductVariant | null => {
    if (variants.length === 0) return null

    // If user purchased specific variants, default to first purchased one
    if (purchasedVariantIds.length > 0) {
      for (const vid of purchasedVariantIds) {
        const purchasedVariant = variants.find(v => v.id === vid)
        if (purchasedVariant) return purchasedVariant
      }
    }

    return variants[0]
  }

  const initialVariant = getInitialVariant()
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(initialVariant)
  const [currentPrice, setCurrentPrice] = useState(
    initialVariant ? (initialVariant.price_cents || 0) : priceCents
  )

  // When purchase status is detected from localStorage (after mount), auto-select
  // the purchased variant if the currently selected one isn't owned.
  useEffect(() => {
    if (purchasedVariantIds.length === 0 || variants.length === 0) return
    const currentIsOwned = selectedVariant ? purchasedVariantIds.includes(selectedVariant.id) : false
    if (!currentIsOwned) {
      const purchasedVariant = variants.find(v => purchasedVariantIds.includes(v.id))
      if (purchasedVariant) {
        setSelectedVariant(purchasedVariant)
        setCurrentPrice(purchasedVariant.price_cents || 0)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchasedVariantIds])

  // Track if user has access to the CURRENTLY selected variant
  const currentVariantHasAccess = selectedVariant
    ? hasVariantAccess(selectedVariant.id)
    : (variants.length === 0 && hasPurchased)

  // PWYW state - custom price entered by buyer
  // ALWAYS start empty, never prefilled
  const [pwywInputValue, setPwywInputValue] = useState("")
  const [pwywError, setPwywError] = useState<string | null>(null)

  const [showDownloadFilesModal, setShowDownloadFilesModal] = useState(false)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)

  // Determine if PWYW is active (product-level or variant-level)
  // Only active if user does NOT own the current variant
  const isPwywActiveForVariant = selectedVariant?.pay_what_you_want || false
  const isPwywActiveForProduct = variants.length === 0 && payWhatYouWant
  const isPwywActive = (isPwywActiveForVariant || isPwywActiveForProduct) && !currentVariantHasAccess

  // Get PWYW min/suggested for current context (variant or product)
  const getEffectivePwywSettings = () => {
    if (selectedVariant?.pay_what_you_want) {
      return {
        minCents: selectedVariant.pwyw_min_price_cents || 0,
        suggestedCents: selectedVariant.pwyw_suggested_price_cents || 0,
      }
    }
    if (payWhatYouWant) {
      return {
        minCents: pwywMinPriceCents || 0,
        suggestedCents: pwywSuggestedPriceCents || 0,
      }
    }
    return { minCents: 0, suggestedCents: 0 }
  }

  const pwywSettings = getEffectivePwywSettings()

  const downloadFiles = useMemo(() => {
    const variantFiles = (selectedVariant?.files || []).filter((f) => !!f.id)
    if (variantFiles.length > 0) return variantFiles

    const productFiles = (serverProductFiles || []).filter((f) => !!f.id)
    if (productFiles.length > 0) return productFiles

    return hookAssetId ? [{ id: hookAssetId, file_name: "File" }] : []
  }, [selectedVariant, serverProductFiles, hookAssetId])

  const effectiveAssetId = downloadFiles[0]?.id || null

  const handleVariantChange = useCallback((variant: ProductVariant | null, finalPrice: number) => {
    setSelectedVariant(variant)
    setCurrentPrice(finalPrice)
    setShowDownloadFilesModal(false)

    // Reset PWYW input when variant changes - always empty
    setPwywInputValue("")
    setPwywError(null)
  }, [])

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free"
    return shopMoney(cents, { grouping: true })
  }

  // Format minimum price as hint text like "$10+"
  const formatMinHint = (cents: number): string => {
    if (cents === 0) return `${shopAmount(0)}+`
    return `${shopMoney(cents).replace(/\.00$/, "")}+`
  }

  // Get custom price for buy button
  const getCustomPriceCents = (): number | null => {
    if (!isPwywActive) return null

    const inputValue = parseFloat(pwywInputValue || "0")
    return Math.round(inputValue * 100)
  }

  // Check if buy button should be disabled (PWYW validation)
  const isBuyDisabled = isPwywActive && (() => {
    const inputValue = parseFloat(pwywInputValue || "0")
    const inputCents = Math.round(inputValue * 100)
    return inputCents < pwywSettings.minCents
  })()

  // Compare at price only shown when no variants selected
  const effectiveCompareAtPrice = variants.length === 0 ? compareAtCents : null

  // User owns this variant (can download if there are files)
  const hasFiles = downloadFiles.length > 0 && productType === "digital"
  const canDownload = currentVariantHasAccess && hasFiles

  // Show owned state even if no files - this hides buy button and shows View in Library
  const showOwnedState = currentVariantHasAccess

  /* A membership: a member opens theirs, anybody else joins. Nothing here downloads. */
  if (membership) {
    return (
      <div className="relative z-10 space-y-3">
        {membership.memberHref ? (
          <>
            <a
              href={membership.memberHref}
              data-open-membership=""
              className="flex min-h-[48px] w-full items-center justify-center rounded-md px-4 text-[15px] font-semibold"
              style={{ backgroundColor: downloadButtonBgColor || "#1a1a2e", color: downloadButtonTextColor || "#ffffff" }}
            >
              Open your membership
            </a>
            <p className="text-center text-sm" style={{ color: themeColors?.cardPriceColor || "var(--muted-foreground)" }}>
              You are a member
            </p>
          </>
        ) : (
          <>
            <BuyButton
              productId={productId}
              price={priceCents}
              creatorId={creatorId}
              backgroundColor={buyButtonBgColor}
              textColor={buyButtonTextColor}
              callToAction={callToAction || "Join"}
            />
            {notPurchasedExtraContent}
          </>
        )}
      </div>
    )
  }

  // Loading state
  if (isChecking) {
    return (
      <div className="space-y-3">
        <Button
          disabled
          className="w-full min-h-[48px] cursor-pointer"
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

  const handleDownloadFile = async (assetId: string) => {
    setDownloadingFileId(assetId)
    await downloadEntitledFile(assetId, { receiptToken: receiptToken || undefined })
    setDownloadingFileId(null)
  }

  // Render the component with unified variant selector
  // Button changes based on whether user can download the CURRENT selected variant
  return (
    <div className="space-y-3 relative z-10">
      {/* Price display OR PWYW input */}
      {isPwywActive ? (
        // Pay What You Want - show price input (only if user doesn't own this variant)
        <div className="mb-4">
          <p
            className="text-lg font-semibold mb-2"
            style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
          >
            Name a fair price
          </p>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium"
              style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
            >
              $
            </span>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder={formatMinHint(pwywSettings.minCents)}
              value={pwywInputValue}
              onChange={(e) => {
                setPwywInputValue(e.target.value)
                setPwywError(null)
              }}
              className="pl-8 h-12 text-lg font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{
                backgroundColor: themeColors?.cardBackground || undefined,
                color: themeColors?.cardTextColor || undefined,
                borderColor: pwywError ? "#ef4444" : (themeColors?.cardBorderColor || undefined),
              }}
            />
          </div>
          {pwywError && (
            <p className="text-sm text-red-500 mt-1">{pwywError}</p>
          )}
          {pwywSettings.minCents === 0 && !pwywError && (
            <p
              className="text-sm mt-1"
              style={{ color: themeColors?.cardPriceColor || "var(--muted-foreground)" }}
            >
              Pay what you want (including free)
            </p>
          )}
        </div>
      ) : currentVariantHasAccess ? (
        // User owns this variant - no price display needed
        null
      ) : showPriceDisplay && !(selectedVariant?.pay_what_you_want) ? (
        // Fixed price display (not for PWYW variants even if not currently in PWYW mode)
        <div className="mb-4">
          <div
            className="text-2xl sm:text-3xl font-bold"
            style={{ color: themeColors?.cardTextColor || "var(--foreground)" }}
          >
            {currentPrice === 0 ? "Free" : formatPrice(currentPrice)}
          </div>
          {!!effectiveCompareAtPrice && effectiveCompareAtPrice > currentPrice && (
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
      ) : null}

      {/* OWNED STATE - Show Download button (if files) + View in Library */}
      {showOwnedState ? (
        <>
          {canDownload ? (
            downloadFiles.length > 1 ? (
              <Button
                type="button"
                onClick={() => setShowDownloadFilesModal(true)}
                className="w-full min-h-[48px] cursor-pointer"
                style={{
                  backgroundColor: downloadButtonBgColor || undefined,
                  color: downloadButtonTextColor || undefined,
                }}
              >
                <DownloadIcon className="mr-2 h-4 w-4" />
                Download Files ({downloadFiles.length})
              </Button>
            ) : (
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
            )
          ) : (
            // Owned but no files - show a placeholder or the files aren't ready
            <Button
              disabled
              className="w-full min-h-[48px]"
              style={{
                backgroundColor: downloadButtonBgColor || undefined,
                color: downloadButtonTextColor || undefined,
                opacity: 0.7,
              }}
            >
              No files available yet
            </Button>
          )}
          {purchasedExtraContent}
        </>
      ) : (
        <>
          {/* Buy button - shown when user hasn't purchased THIS variant; Sold out once a limited run has gone */}
          {sales?.soldOut ? (
            <button
              type="button"
              disabled
              aria-disabled="true"
              data-sold-out=""
              className="flex min-h-[48px] w-full cursor-not-allowed items-center justify-center rounded-md px-4 text-[15px] font-semibold"
              style={{ backgroundColor: themeColors?.cardBorderColor || "#e5e7eb", color: themeColors?.cardPriceColor || "#6b7280" }}
            >
              Sold out
            </button>
          ) : (
            <BuyButton
              productId={productId}
              price={currentPrice}
              creatorId={creatorId}
              backgroundColor={buyButtonBgColor}
              textColor={buyButtonTextColor}
              variantId={selectedVariant?.id}
              callToAction={callToAction}
              customPriceCents={isPwywActive ? getCustomPriceCents() : null}
              disabled={isBuyDisabled}
            />
          )}
          {!sales?.soldOut && sales?.fewLeft && (
            <p data-few-left="" className="text-center text-[13px] font-medium tabular-nums" style={{ color: themeColors?.cardPriceColor || "#6b7280" }}>
              {sales.fewLeft}
            </p>
          )}
          {notPurchasedExtraContent}
        </>
      )}

      {/* Download files sheet — portaled to body, above all sticky elements */}
      {downloadFiles.length > 1 && (
        <DownloadFilesSheet
          isOpen={showDownloadFilesModal}
          onClose={() => setShowDownloadFilesModal(false)}
          title={selectedVariant?.name || "Download files"}
          files={downloadFiles}
          downloadingFileId={downloadingFileId}
          onDownload={handleDownloadFile}
        />
      )}

      {/* Variant selector - ALWAYS visible, allows switching between variants */}
      {variants.length > 0 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: themeColors?.cardBorderColor || "var(--border)" }}>
          {!showOwnedState && (
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
            initialSelectedId={purchasedVariantIds[0] || undefined}
            purchasedVariantIds={purchasedVariantIds}
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

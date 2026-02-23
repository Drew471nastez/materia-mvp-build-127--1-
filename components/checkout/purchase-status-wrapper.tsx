"use client"

import { ReactNode, useState, useCallback, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { usePurchaseStatus } from "./use-purchase-status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Download, FileText, X } from "lucide-react"
import { DownloadButton } from "@/components/download-button"
import { BuyButton } from "@/components/checkout/buy-button"
import { VariantSelector, type ProductVariant } from "@/components/product/variant-selector"
import { Badge } from "@/components/ui/badge"
import { downloadEntitledFile } from "@/components/download-button"

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
}

// ─────────────────────────────────────────────────────────────────────────────
// DownloadFilesSheet
// Portaled to document.body — always above sticky bars (z: 99999).
// Desktop ≥ 768px → polished centered modal with scale + fade animation.
// Mobile  < 768px → bottom sheet with drag-to-dismiss + smooth enter/exit.
// ─────────────────────────────────────────────────────────────────────────────
function DownloadFilesSheet({
  isOpen,
  onClose,
  title,
  files,
  downloadingFileId,
  onDownload,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  files: Array<{ id: string; file_name?: string }>
  downloadingFileId: string | null
  onDownload: (id: string) => void
}) {
  const [animateIn, setAnimateIn] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Drag state for mobile sheet
  const [dragY, setDragY] = useState(0)
  const dragStartY = useRef<number | null>(null)
  const dragging = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Mount / unmount with enter + exit animation
  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      // Double-rAF: browser must paint the initial (hidden) state before
      // we flip to visible, so the CSS transition actually fires.
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setAnimateIn(true))
        return () => cancelAnimationFrame(r2)
      })
      return () => cancelAnimationFrame(r1)
    } else {
      setAnimateIn(false)
      setDragY(0)
      dragging.current = false
      dragStartY.current = null
      const t = setTimeout(() => setMounted(false), 400)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [mounted])

  // Escape key
  useEffect(() => {
    if (!mounted) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [mounted, onClose])

  // ── Drag-to-dismiss ─────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    dragging.current = false
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const dy = e.touches[0].clientY - dragStartY.current
    // Only drag down; only drag when file list is scrolled to top
    const scrollTop = contentRef.current?.scrollTop ?? 0
    if (dy > 0 && scrollTop === 0) {
      dragging.current = true
      setDragY(dy)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (dragY > 90) {
      onClose()
    } else {
      setDragY(0)
    }
    dragStartY.current = null
  }, [dragY, onClose])

  if (!mounted || typeof window === "undefined") return null

  // Shared file list
  const fileList = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => onDownload(file.id)}
          disabled={downloadingFileId === file.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid #ebebeb",
            backgroundColor: "#fff",
            cursor: downloadingFileId === file.id ? "default" : "pointer",
            opacity: downloadingFileId === file.id ? 0.55 : 1,
            textAlign: "left" as const,
            transition: "background-color 120ms, box-shadow 120ms",
            gap: 0,
          }}
          onMouseEnter={(e) => {
            if (downloadingFileId !== file.id) {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = "#fafafa"
              el.style.boxShadow = "0 0 0 1px #e0e0e0"
            }
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.backgroundColor = "#fff"
            el.style.boxShadow = "none"
          }}
        >
          {/* Icon + name */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1, paddingRight: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: "#f4f4f5",
                flexShrink: 0,
              }}
            >
              <FileText style={{ width: 16, height: 16, color: "#71717a" }} />
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#18181b",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
              }}
            >
              {file.file_name || "File"}
            </span>
          </div>
          {/* Download button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: "50%",
              backgroundColor: "#18181b",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {downloadingFileId === file.id ? (
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
            ) : (
              <Download style={{ width: 14, height: 14 }} />
            )}
          </div>
        </button>
      ))}
    </div>
  )

  return createPortal(
    <>
      {/* ── Backdrop ───────────────────────────────────────────────────────── */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99998,
          backgroundColor: "rgba(0,0,0,0.48)",
          opacity: animateIn ? 1 : 0,
          transition: "opacity 280ms ease",
        }}
      />

      {/* ── Desktop modal (md+) ─────────────────────────────────────────────── */}
      <div
        onClick={onClose}
        className="hidden md:flex"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Download files"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 520,
            borderRadius: 20,
            backgroundColor: "#fff",
            boxShadow: "0 32px 80px -12px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.05)",
            opacity: animateIn ? 1 : 0,
            transform: animateIn
              ? "scale(1) translateY(0)"
              : "scale(0.96) translateY(14px)",
            transition:
              "opacity 260ms cubic-bezier(0.16,1,0.3,1), transform 260ms cubic-bezier(0.16,1,0.3,1)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              padding: "24px 24px 20px 24px",
              borderBottom: "1px solid #f4f4f5",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: "#f4f4f5",
                  flexShrink: 0,
                }}
              >
                <Download style={{ width: 20, height: 20, color: "#3f3f46" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 700,
                    color: "#09090b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {title}
                </h2>
                <p style={{ margin: 0, marginTop: 2, fontSize: 13, color: "#71717a" }}>
                  {files.length} file{files.length !== 1 ? "s" : ""} — click any file to download
                </p>
              </div>
            </div>
            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                backgroundColor: "#f4f4f5",
                color: "#71717a",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background-color 130ms",
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.backgroundColor = "#e4e4e7"
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.backgroundColor = "#f4f4f5"
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* File list */}
          <div
            ref={contentRef}
            style={{
              padding: "20px 24px 24px 24px",
              maxHeight: "60vh",
              overflowY: "auto",
            }}
          >
            {fileList}
          </div>
        </div>
      </div>

      {/* ── Mobile bottom sheet (< md) ──────────────────────────────────────── */}
      <div
        className="md:hidden"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            borderRadius: "22px 22px 0 0",
            backgroundColor: "#fff",
            boxShadow:
              "0 -8px 48px -4px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)",
            // Disable CSS transition while dragging (instant follow), re-enable on snap/close
            transform:
              dragging.current && dragY > 0
                ? `translateY(${dragY}px)`
                : animateIn
                ? "translateY(0)"
                : "translateY(100%)",
            transition:
              dragging.current && dragY > 0
                ? "none"
                : "transform 400ms cubic-bezier(0.32,0.72,0,1)",
            maxHeight: "88dvh",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            display: "flex",
            flexDirection: "column" as const,
          }}
        >
          {/* Drag handle */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: 14,
              paddingBottom: 6,
              touchAction: "none",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                borderRadius: 9999,
                backgroundColor: "#d4d4d8",
              }}
            />
          </div>

          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 20px 14px 20px",
              borderBottom: "1px solid #f4f4f5",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#09090b",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                }}
              >
                {title}
              </h2>
              <p style={{ margin: 0, marginTop: 2, fontSize: 13, color: "#71717a" }}>
                {files.length} file{files.length !== 1 ? "s" : ""} included
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                backgroundColor: "#f4f4f5",
                color: "#71717a",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* File list — scrollable; drag only fires when this is at scrollTop=0 */}
          <div
            ref={contentRef}
            style={{
              flex: 1,
              padding: "16px 20px 8px 20px",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {fileList}
          </div>

          {/* Bottom spacer so last file isn't flush with system home bar */}
          <div style={{ height: 16 }} />
        </div>
      </div>
    </>,
    document.body
  )
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
export function PurchaseStatusWrapper({
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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  // Format minimum price as hint text like "$10+"
  const formatMinHint = (cents: number): string => {
    if (cents === 0) return "$0+"
    return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}+`
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
                <FileText className="mr-2 h-4 w-4" />
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
          {/* Buy button - shown when user hasn't purchased THIS variant */}
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

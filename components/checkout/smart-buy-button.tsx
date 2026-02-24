"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Download } from "lucide-react"
import { downloadEntitledFile } from "@/components/download-button"

interface SmartBuyButtonProps {
  productId: string
  variantId?: string | null
  price: number
  disabled?: boolean
  creatorId?: string
  backgroundColor?: string
  textColor?: string
  callToAction?: string | null
  // For when server already knows purchase status
  serverHasPurchased?: boolean
  serverAssetId?: string | null
}

// localStorage key for purchased products
const PURCHASED_PRODUCTS_KEY = "materia_purchased_products"

interface PurchaseInfo {
  receiptToken: string
  assets: Array<{ id: string; file_name?: string }>
}

/**
 * SmartBuyButton - A smart buy button that:
 * 1. Shows "Download" if user has purchased (from server or localStorage)
 * 2. Shows "Buy" if user hasn't purchased
 * 3. Persists purchase info across refreshes via localStorage
 */
export function SmartBuyButton({
  productId,
  variantId,
  price,
  disabled,
  creatorId,
  backgroundColor,
  textColor,
  callToAction,
  serverHasPurchased = false,
  serverAssetId = null,
}: SmartBuyButtonProps) {
  const [loading, setLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [hasPurchased, setHasPurchased] = useState(serverHasPurchased)
  const [assetId, setAssetId] = useState<string | null>(serverAssetId)
  const [receiptToken, setReceiptToken] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(!serverHasPurchased)

  // Check URL tokens, localStorage, and API for purchase status on mount
  useEffect(() => {
    // If server already confirmed purchase, no need to check
    if (serverHasPurchased && serverAssetId) {
      setIsChecking(false)
      return
    }

    const checkPurchaseStatus = async () => {
      try {
        // 1. Check URL token first (Safari/WhatsApp/in-app browser proof)
        try {
          const params = new URLSearchParams(window.location.search)
          const urlToken = params.get("purchaseToken")
          if (urlToken) {
            setHasPurchased(true)
            setReceiptToken(urlToken)
            // Persist to localStorage for future visits
            try {
              const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
              const purchases: Record<string, PurchaseInfo> = stored ? JSON.parse(stored) : {}
              if (!purchases[productId]?.receiptToken) {
                purchases[productId] = { receiptToken: urlToken, assets: [] }
                localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))
              }
            } catch { /* localStorage may be unavailable */ }
            setIsChecking(false)
            return
          }
        } catch { /* ignore URL parsing errors */ }

        // 2. Check localStorage
        const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
        if (stored) {
          const purchases: Record<string, PurchaseInfo> = JSON.parse(stored)
          const purchaseInfo = purchases[productId]
          if (purchaseInfo) {
            setHasPurchased(true)
            setReceiptToken(purchaseInfo.receiptToken)
            if (purchaseInfo.assets && purchaseInfo.assets.length > 0) {
              setAssetId(purchaseInfo.assets[0].id)
            }
            setIsChecking(false)
            return
          }
        }

        // 3. API fallback for logged-in users
        const res = await fetch(`/api/purchases/check?productId=${productId}`, {
          credentials: "include",
        })

        if (res.ok) {
          const data = await res.json()
          if (data.hasPurchased) {
            setHasPurchased(true)
            if (data.assetId) {
              setAssetId(data.assetId)
            }
            if (data.receiptToken) {
              setReceiptToken(data.receiptToken)
            }
          }
        }
      } catch (e) {
        console.error("[SmartBuyButton] Error checking purchase status:", e)
      } finally {
        setIsChecking(false)
      }
    }

    checkPurchaseStatus()
  }, [productId, serverHasPurchased, serverAssetId])

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const handleBuyClick = async () => {
    setLoading(true)

    if (creatorId) {
      try {
        await fetch("/api/track-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "buy_click",
            creatorId,
            productId,
          }),
        })
      } catch (e) {
        // Don't block checkout on tracking failure
      }
    }

    // Use window.location.href for reliable navigation
    let checkoutUrl = `/checkout?productId=${productId}`
    if (variantId) {
      checkoutUrl += `&variantId=${variantId}`
    }
    window.location.href = checkoutUrl
  }

  const handleDownloadClick = async () => {
    if (!assetId) return

    setDownloadLoading(true)

    try {
      const result = await downloadEntitledFile(assetId, {
        receiptToken: receiptToken,
      })

      if (!result.success) {
        console.error("[SmartBuyButton] Download failed:", result.error)
      }
    } catch (e) {
      console.error("[SmartBuyButton] Download error:", e)
    } finally {
      setDownloadLoading(false)
    }
  }

  // Loading state while checking purchase status
  if (isChecking) {
    return (
      <Button
        disabled
        className="w-full min-h-[44px]"
        style={{
          backgroundColor: backgroundColor || undefined,
          color: textColor || undefined,
        }}
      >
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    )
  }

  // Purchased state - show download button
  if (hasPurchased && assetId) {
    return (
      <Button
        onClick={handleDownloadClick}
        disabled={downloadLoading}
        className="w-full min-h-[44px]"
        style={{
          backgroundColor: backgroundColor || undefined,
          color: textColor || undefined,
        }}
      >
        {downloadLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Downloading...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Download File
          </>
        )}
      </Button>
    )
  }

  // Not purchased - show buy button
  return (
    <Button
      onClick={handleBuyClick}
      disabled={disabled || loading}
      className="w-full min-h-[44px]"
      style={{
        backgroundColor: backgroundColor || undefined,
        color: textColor || undefined,
      }}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : (
        callToAction || (price === 0 ? "Get for Free" : "I want this!")
      )}
    </Button>
  )
}

/**
 * Helper function to save a purchase to localStorage
 * Call this after a successful checkout
 */
export function savePurchaseToLocalStorage(
  productId: string,
  receiptToken: string,
  assets: Array<{ id: string; file_name?: string }>
) {
  try {
    const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
    const purchases: Record<string, PurchaseInfo> = stored ? JSON.parse(stored) : {}
    purchases[productId] = { receiptToken, assets }
    localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))
  } catch (e) {
    console.error("[savePurchaseToLocalStorage] Error:", e)
  }
}

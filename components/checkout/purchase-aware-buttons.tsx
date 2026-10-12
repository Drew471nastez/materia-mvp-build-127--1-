"use client"

import { useState, useEffect, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { BuyButton } from "@/components/checkout/buy-button"
import { DownloadButton } from "@/components/download-button"
import { fetchWithDeadline } from "@/lib/net/request"

/** How long Buy waits on "have you bought this already?" before it shows. A hung check used to mean the product could not be bought at all. */
const PURCHASE_CHECK_MS = 6_000

// localStorage key for purchased products
const PURCHASED_PRODUCTS_KEY = "materia_purchased_products"

interface PurchaseInfo {
  receiptToken: string
  assets: Array<{ id: string; file_name?: string }>
}

interface PurchaseAwareButtonsProps {
  productId: string
  price: number
  creatorId?: string
  backgroundColor?: string
  textColor?: string
  // Server-side purchase info (for logged-in users)
  serverHasPurchased?: boolean
  serverAssetId?: string | null
  productType?: string
  // For download button styling
  downloadButtonBgColor?: string
  downloadButtonTextColor?: string
  // Content to show after buy button (not purchased state)
  notPurchasedContent?: ReactNode
  // Content to show after download button (purchased state)
  purchasedContent?: ReactNode
}

/**
 * PurchaseAwareButtons - Checks both server state and localStorage for purchase status
 * Shows Download button if purchased, Buy button otherwise
 */
export function PurchaseAwareButtons({
  productId,
  price,
  creatorId,
  backgroundColor,
  textColor,
  serverHasPurchased = false,
  serverAssetId = null,
  productType = "digital",
  downloadButtonBgColor,
  downloadButtonTextColor,
  notPurchasedContent,
  purchasedContent,
}: PurchaseAwareButtonsProps) {
  const [hasPurchased, setHasPurchased] = useState(serverHasPurchased)
  const [assetId, setAssetId] = useState<string | null>(serverAssetId)
  const [receiptToken, setReceiptToken] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(!serverHasPurchased)

  // Check URL tokens (Safari/WhatsApp proof), localStorage, and API for purchase status
  useEffect(() => {
    // If server already confirmed purchase, no need to check further
    if (serverHasPurchased) {
      setIsChecking(false)
      return
    }

    // 1. Check URL token first (immune to Safari ITP, in-app browsers)
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
    try {
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
    } catch (e) {
      console.error("[PurchaseAwareButtons] Error checking localStorage:", e)
    }

    // 3. API fallback for logged-in users (handles cross-device/cleared storage)
    const checkApi = async () => {
      try {
        const res = await fetchWithDeadline(`/api/purchases/check?productId=${productId}`, {
          credentials: "include",
        }, PURCHASE_CHECK_MS)
        if (res.ok) {
          const data = await res.json()
          if (data.hasPurchased) {
            setHasPurchased(true)
            if (data.assetId) setAssetId(data.assetId)
            if (data.receiptToken) setReceiptToken(data.receiptToken)
          }
        }
      } catch { /* silent */ }
      finally { setIsChecking(false) }
    }
    checkApi()
  }, [productId, serverHasPurchased])

  // Loading state while checking localStorage
  if (isChecking) {
    return (
      <div className="space-y-3">
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
      </div>
    )
  }

  // Purchased state - show download button
  if (hasPurchased && assetId && productType === "digital") {
    return (
      <div className="space-y-3">
        <DownloadButton
          assetId={assetId}
          receiptToken={receiptToken}
          className="w-full min-h-[44px]"
          size="default"
          style={{
            backgroundColor: downloadButtonBgColor || backgroundColor || undefined,
            color: downloadButtonTextColor || textColor || undefined,
          }}
        >
          Download File
        </DownloadButton>
        {purchasedContent}
      </div>
    )
  }

  // Not purchased - show buy button
  return (
    <div className="space-y-3">
      <BuyButton
        productId={productId}
        price={price}
        creatorId={creatorId}
        backgroundColor={backgroundColor}
        textColor={textColor}
      />
      {notPurchasedContent}
    </div>
  )
}

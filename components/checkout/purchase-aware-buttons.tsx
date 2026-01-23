"use client"

import { useState, useEffect, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { BuyButton } from "@/components/checkout/buy-button"
import { DownloadButton } from "@/components/download-button"

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

  // Check localStorage for purchase status on mount
  useEffect(() => {
    // If server already confirmed purchase, no need to check localStorage
    if (serverHasPurchased) {
      setIsChecking(false)
      return
    }

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
        }
      }
    } catch (e) {
      console.error("[PurchaseAwareButtons] Error checking localStorage:", e)
    } finally {
      setIsChecking(false)
    }
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

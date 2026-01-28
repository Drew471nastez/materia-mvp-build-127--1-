"use client"

import { ReactNode } from "react"
import { usePurchaseStatus } from "./use-purchase-status"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { DownloadButton } from "@/components/download-button"
import { BuyButton } from "@/components/checkout/buy-button"

interface PurchaseStatusWrapperProps {
  productId: string
  productType?: string
  priceCents: number
  creatorId?: string
  serverHasPurchased?: boolean
  serverAssetId?: string | null
  // Button colors
  buyButtonBgColor?: string
  buyButtonTextColor?: string
  downloadButtonBgColor?: string
  downloadButtonTextColor?: string
  // Content to render after buttons
  purchasedExtraContent?: ReactNode
  notPurchasedExtraContent?: ReactNode
  // Variant support
  variantId?: string
}

/**
 * PurchaseStatusWrapper - Smart buy/download button that checks localStorage
 * Shows Download if purchased (server or localStorage), Buy otherwise
 */
export function PurchaseStatusWrapper({
  productId,
  productType = "digital",
  priceCents,
  creatorId,
  serverHasPurchased = false,
  serverAssetId = null,
  buyButtonBgColor,
  buyButtonTextColor,
  downloadButtonBgColor,
  downloadButtonTextColor,
  purchasedExtraContent,
  notPurchasedExtraContent,
  variantId,
}: PurchaseStatusWrapperProps) {
  const { hasPurchased, assetId, receiptToken, isChecking } = usePurchaseStatus(
    productId,
    serverHasPurchased,
    serverAssetId
  )

  // Loading state
  if (isChecking) {
    return (
      <div className="space-y-3">
        <Button
          disabled
          className="w-full min-h-[44px]"
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
            backgroundColor: downloadButtonBgColor || undefined,
            color: downloadButtonTextColor || undefined,
          }}
        >
          Download File
        </DownloadButton>
        {purchasedExtraContent}
      </div>
    )
  }

  // Not purchased - show buy button
  return (
    <div className="space-y-3">
      <BuyButton
        productId={productId}
        price={priceCents}
        creatorId={creatorId}
        backgroundColor={buyButtonBgColor}
        textColor={buyButtonTextColor}
        variantId={variantId}
      />
      {notPurchasedExtraContent}
    </div>
  )
}

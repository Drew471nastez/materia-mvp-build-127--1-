"use client"

import { useState, useEffect } from "react"

// localStorage key for purchased products
const PURCHASED_PRODUCTS_KEY = "materia_purchased_products"

interface PurchaseInfo {
  receiptToken: string
  assets: Array<{ id: string; file_name?: string }>
  variantId?: string | null // The specific variant purchased (null = no variant / base product)
}

interface UsePurchaseStatusResult {
  hasPurchased: boolean
  assetId: string | null
  receiptToken: string | null
  purchasedVariantId: string | null // The variant ID that was purchased
  isChecking: boolean
}

/**
 * Hook to check if a product has been purchased
 * Checks both server-provided state and localStorage
 * Returns the specific variant that was purchased for variant-level access control
 */
export function usePurchaseStatus(
  productId: string,
  serverHasPurchased: boolean = false,
  serverAssetId: string | null = null,
  serverPurchasedVariantId: string | null = null
): UsePurchaseStatusResult {
  const [hasPurchased, setHasPurchased] = useState(serverHasPurchased)
  const [assetId, setAssetId] = useState<string | null>(serverAssetId)
  const [receiptToken, setReceiptToken] = useState<string | null>(null)
  const [purchasedVariantId, setPurchasedVariantId] = useState<string | null>(serverPurchasedVariantId)
  const [isChecking, setIsChecking] = useState(!serverHasPurchased)

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
          setPurchasedVariantId(purchaseInfo.variantId || null)
          if (purchaseInfo.assets && purchaseInfo.assets.length > 0) {
            setAssetId(purchaseInfo.assets[0].id)
          }
        }
      }
    } catch (e) {
      console.error("[usePurchaseStatus] Error checking localStorage:", e)
    } finally {
      setIsChecking(false)
    }
  }, [productId, serverHasPurchased])

  return { hasPurchased, assetId, receiptToken, purchasedVariantId, isChecking }
}

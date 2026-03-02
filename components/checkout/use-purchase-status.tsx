"use client"

import { useState, useEffect, useCallback } from "react"

// localStorage key for purchased products
const PURCHASED_PRODUCTS_KEY = "materia_purchased_products"

interface PurchaseInfo {
  receiptToken: string
  assets: Array<{ id: string; file_name?: string }>
  variantIds?: string[] // Array of purchased variant IDs for this product
  // Legacy support
  variantId?: string | null
}

interface UsePurchaseStatusResult {
  hasPurchased: boolean
  assetId: string | null
  receiptToken: string | null
  purchasedVariantIds: string[] // Array of all purchased variant IDs
  isChecking: boolean
  // Helper to check if a specific variant was purchased
  hasVariantAccess: (variantId: string | null) => boolean
  // Add a newly purchased variant to localStorage
  addPurchasedVariant: (variantId: string | null, receiptToken: string, assets: Array<{ id: string; file_name?: string }>) => void
}

/**
 * Hook to check if a product has been purchased
 * Checks both server-provided state and localStorage
 * Returns an array of all purchased variant IDs for per-variant access control
 */
export function usePurchaseStatus(
  productId: string,
  serverHasPurchased: boolean = false,
  serverAssetId: string | null = null,
  serverPurchasedVariantIds: string[] = [] // Now an array
): UsePurchaseStatusResult {
  const [hasPurchased, setHasPurchased] = useState(serverHasPurchased)
  const [assetId, setAssetId] = useState<string | null>(serverAssetId)
  const [receiptToken, setReceiptToken] = useState<string | null>(null)
  const [purchasedVariantIds, setPurchasedVariantIds] = useState<string[]>(serverPurchasedVariantIds)
  const [isChecking, setIsChecking] = useState(!serverHasPurchased)

  useEffect(() => {
    const syncPurchaseState = () => {
      let resolvedHasPurchased = serverHasPurchased
      let resolvedReceiptToken: string | null = null
      let resolvedAssetId = serverAssetId
      let resolvedVariantIds = [...serverPurchasedVariantIds]

      // 1) URL token path (works even when storage is isolated in Safari/in-app browsers)
      let urlToken: string | null = null
      let urlVariantId: string | null = null
      try {
        const params = new URLSearchParams(window.location.search)
        urlToken = params.get("purchaseToken")
        urlVariantId = params.get("purchaseVariantId")
      } catch {
        // no-op
      }

      if (urlToken) {
        resolvedHasPurchased = true
        resolvedReceiptToken = urlToken
        resolvedVariantIds = urlVariantId
          ? [urlVariantId]
          : resolvedVariantIds.length > 0
            ? resolvedVariantIds
            : [""]

        // Keep URL clean after we've consumed the purchase token
        try {
          const cleanUrl = new URL(window.location.href)
          cleanUrl.searchParams.delete("purchaseToken")
          cleanUrl.searchParams.delete("purchaseVariantId")
          window.history.replaceState({}, "", cleanUrl.toString())
        } catch {
          // no-op
        }
      }

      // 2) Merge localStorage (best effort, may be unavailable in private mode)
      try {
        const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
        const purchases: Record<string, PurchaseInfo> = stored ? JSON.parse(stored) : {}
        const purchaseInfo = purchases[productId]

        if (purchaseInfo) {
          const localVariantIds: string[] = []

          if (purchaseInfo.variantIds && Array.isArray(purchaseInfo.variantIds)) {
            localVariantIds.push(...purchaseInfo.variantIds)
          } else if (purchaseInfo.variantId) {
            localVariantIds.push(purchaseInfo.variantId)
          }

          resolvedVariantIds = [...new Set([...resolvedVariantIds, ...localVariantIds])]

          if (purchaseInfo.receiptToken) {
            resolvedHasPurchased = true
            resolvedReceiptToken = resolvedReceiptToken || purchaseInfo.receiptToken
          }

          if (purchaseInfo.assets && purchaseInfo.assets.length > 0) {
            resolvedAssetId = purchaseInfo.assets[0].id
          }
        }

        // Persist URL-derived token so reload/back-forward cache restores still work
        if (urlToken) {
          const current = purchases[productId]
          purchases[productId] = {
            receiptToken: urlToken,
            assets: current?.assets || [],
            variantIds: resolvedVariantIds,
          }
          localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))
        }
      } catch (e) {
        console.error("[usePurchaseStatus] Error syncing purchase state:", e)
      }

      setHasPurchased(resolvedHasPurchased)
      setReceiptToken(resolvedReceiptToken)
      setPurchasedVariantIds(resolvedVariantIds)
      setAssetId(resolvedAssetId)
      setIsChecking(false)
    }

    syncPurchaseState()

    // Safari + iOS webviews can restore pages from bfcache (Back button)
    // without rerunning React mount. Re-sync on resume/focus-related events.
    const onPageShow = () => syncPurchaseState()
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncPurchaseState()
    }
    const onFocus = () => syncPurchaseState()
    const onStorage = (event: StorageEvent) => {
      if (event.key === PURCHASED_PRODUCTS_KEY) syncPurchaseState()
    }

    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("focus", onFocus)
    window.addEventListener("storage", onStorage)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("storage", onStorage)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [productId, serverAssetId, serverHasPurchased, serverPurchasedVariantIds])

  // Helper to check if a specific variant was purchased
  const hasVariantAccess = useCallback((variantId: string | null): boolean => {
    if (!hasPurchased) return false

    // No variant specified = product-level access
    if (!variantId) {
      // If no variants exist, any purchase gives access
      return purchasedVariantIds.length === 0 || purchasedVariantIds.includes("")
    }

    // Check if this specific variant was purchased
    return purchasedVariantIds.includes(variantId)
  }, [hasPurchased, purchasedVariantIds])

  // Add a newly purchased variant to localStorage (called after successful purchase)
  const addPurchasedVariant = useCallback((
    variantId: string | null,
    newReceiptToken: string,
    assets: Array<{ id: string; file_name?: string }>
  ) => {
    try {
      const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
      const purchases: Record<string, PurchaseInfo> = stored ? JSON.parse(stored) : {}

      const existing = purchases[productId] || {
        receiptToken: newReceiptToken,
        assets: assets,
        variantIds: []
      }

      // Ensure variantIds is an array
      if (!Array.isArray(existing.variantIds)) {
        existing.variantIds = []
        // Migrate legacy variantId if present
        if (existing.variantId) {
          existing.variantIds.push(existing.variantId)
        }
      }

      // Add new variant if not already present
      const vidToAdd = variantId || ""
      if (!existing.variantIds.includes(vidToAdd)) {
        existing.variantIds.push(vidToAdd)
      }

      // Update receipt token and assets
      existing.receiptToken = newReceiptToken
      existing.assets = assets

      purchases[productId] = existing
      localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))

      // Update state
      setHasPurchased(true)
      setReceiptToken(newReceiptToken)
      setPurchasedVariantIds(existing.variantIds)
      if (assets.length > 0) {
        setAssetId(assets[0].id)
      }
    } catch (e) {
      console.error("[usePurchaseStatus] Error updating localStorage:", e)
    }
  }, [productId])

  return {
    hasPurchased,
    assetId,
    receiptToken,
    purchasedVariantIds,
    isChecking,
    hasVariantAccess,
    addPurchasedVariant
  }
}

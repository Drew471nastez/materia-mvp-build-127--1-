"use client"

import { useState, useEffect, useCallback } from "react"

// localStorage key for purchased products
const PURCHASED_PRODUCTS_KEY = "materia_purchased_products"

// Cookie-based fallback for Safari ITP / in-app browsers (WhatsApp, Instagram)
// that may clear localStorage between navigations or not share it with the
// system browser. Cookies survive better in these contexts.
const COOKIE_PREFIX = "mp_"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

function setCookiePurchase(productId: string, receiptToken: string, variantIds: string[]) {
  try {
    const value = JSON.stringify({ t: receiptToken, v: variantIds })
    document.cookie = `${COOKIE_PREFIX}${productId}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  } catch { /* ignore */ }
}

function getCookiePurchase(productId: string): { receiptToken: string; variantIds: string[] } | null {
  try {
    const prefix = `${COOKIE_PREFIX}${productId}=`
    const cookie = document.cookie.split("; ").find((c) => c.startsWith(prefix))
    if (!cookie) return null
    const raw = decodeURIComponent(cookie.slice(prefix.length))
    const parsed = JSON.parse(raw)
    return { receiptToken: parsed.t || "", variantIds: parsed.v || [] }
  } catch {
    return null
  }
}

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
    // ── 1. URL-token path (Safari/WhatsApp/in-app-browser proof) ────────────────
    // When the user completes checkout and clicks "Back to product", the receipt
    // page appends ?purchaseToken=<token>&purchaseVariantId=<vid> to the product URL.
    // Reading from the URL is immune to:
    //   • Safari ITP localStorage clearing (cross-site tracking prevention)
    //   • Safari/Chrome private/incognito mode (storage quota = 0)
    //   • In-app browsers (WhatsApp, Instagram) that don't share cookies/storage
    //     with the main Safari session
    let urlToken: string | null = null
    let urlVariantId: string | null = null
    try {
      const params = new URLSearchParams(window.location.search)
      urlToken = params.get("purchaseToken")
      urlVariantId = params.get("purchaseVariantId")
    } catch { /* ignore */ }

    if (urlToken) {
      // Trust the URL token immediately. It is only placed there by our own
      // receipt page after a confirmed purchase. The actual download API
      // independently verifies the token server-side, so there's no security risk.
      const variantIds = urlVariantId
        ? [urlVariantId]
        : serverPurchasedVariantIds.length > 0
          ? [...serverPurchasedVariantIds]
          : [""] // empty-string = no-variant product

      setHasPurchased(true)
      setReceiptToken(urlToken)
      setPurchasedVariantIds(variantIds)

      // Remove the token from the visible URL (keeps it clean in history)
      try {
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete("purchaseToken")
        cleanUrl.searchParams.delete("purchaseVariantId")
        window.history.replaceState({}, "", cleanUrl.toString())
      } catch { /* ignore */ }

      // Best-effort: persist to localStorage + cookie for future visits on this device
      try {
        const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
        const purchases: Record<string, PurchaseInfo> = stored ? JSON.parse(stored) : {}
        if (!purchases[productId]?.receiptToken) {
          purchases[productId] = { receiptToken: urlToken, assets: [], variantIds }
          localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))
        }
      } catch { /* localStorage may be unavailable in private mode — that's fine */ }
      // Cookie fallback: survives Safari ITP and in-app browsers
      setCookiePurchase(productId, urlToken, variantIds)

      setIsChecking(false)
      return
    }

    // ── 2. localStorage + cookie path ──────────────────────────────────────────
    // Check both localStorage and cookie for purchase data; merge everything.
    let foundPurchase = false
    try {
      const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
      if (stored) {
        const purchases: Record<string, PurchaseInfo> = JSON.parse(stored)
        const purchaseInfo = purchases[productId]
        if (purchaseInfo) {
          const localVariantIds: string[] = []
          if (purchaseInfo.variantIds && Array.isArray(purchaseInfo.variantIds)) {
            localVariantIds.push(...purchaseInfo.variantIds)
          } else if (purchaseInfo.variantId) {
            localVariantIds.push(purchaseInfo.variantId)
          }

          const allVariantIds = [...new Set([...serverPurchasedVariantIds, ...localVariantIds])]

          if (allVariantIds.length > 0 || purchaseInfo.receiptToken) {
            setHasPurchased(true)
            setPurchasedVariantIds(allVariantIds)
            setReceiptToken(purchaseInfo.receiptToken)
            if (purchaseInfo.assets && purchaseInfo.assets.length > 0) {
              setAssetId(purchaseInfo.assets[0].id)
            }
            foundPurchase = true
            // Sync to cookie for cross-browser resilience
            setCookiePurchase(productId, purchaseInfo.receiptToken, allVariantIds)
          }
        }
      }
    } catch (e) {
      console.error("[usePurchaseStatus] Error checking localStorage:", e)
    }

    // ── 3. Cookie fallback (Safari ITP / WhatsApp / in-app browsers) ──────────
    // If localStorage had nothing, try cookie. This handles the case where
    // localStorage was cleared by ITP but the first-party cookie survived.
    if (!foundPurchase) {
      const cookieData = getCookiePurchase(productId)
      if (cookieData && (cookieData.receiptToken || cookieData.variantIds.length > 0)) {
        const allVariantIds = [...new Set([...serverPurchasedVariantIds, ...cookieData.variantIds])]
        setHasPurchased(true)
        setPurchasedVariantIds(allVariantIds)
        setReceiptToken(cookieData.receiptToken)

        // Re-hydrate localStorage from cookie
        try {
          const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
          const purchases: Record<string, PurchaseInfo> = stored ? JSON.parse(stored) : {}
          if (!purchases[productId]) {
            purchases[productId] = {
              receiptToken: cookieData.receiptToken,
              assets: [],
              variantIds: allVariantIds,
            }
            localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))
          }
        } catch { /* localStorage unavailable */ }
      }
    }

    setIsChecking(false)
  }, [productId, serverHasPurchased, serverPurchasedVariantIds])

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

      // Cookie fallback for Safari ITP / in-app browsers
      setCookiePurchase(productId, newReceiptToken, existing.variantIds)
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

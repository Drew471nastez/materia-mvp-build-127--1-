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

      // Best-effort: persist to localStorage for future visits on this device
      try {
        const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
        const purchases: Record<string, PurchaseInfo> = stored ? JSON.parse(stored) : {}
        if (!purchases[productId]?.receiptToken) {
          purchases[productId] = { receiptToken: urlToken, assets: [], variantIds }
          localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))
        }
      } catch { /* localStorage may be unavailable in private mode — that's fine */ }

      setIsChecking(false)
      return
    }

    // ── 2. localStorage path (normal browsers, non-private mode) ────────────────
    // If server already confirmed purchase, merge with localStorage for complete picture
    try {
      const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
      if (stored) {
        const purchases: Record<string, PurchaseInfo> = JSON.parse(stored)
        const purchaseInfo = purchases[productId]
        if (purchaseInfo) {
          // Merge localStorage variants with server variants
          const localVariantIds: string[] = []

          // Handle new array format
          if (purchaseInfo.variantIds && Array.isArray(purchaseInfo.variantIds)) {
            localVariantIds.push(...purchaseInfo.variantIds)
          }
          // Handle legacy single variantId format
          else if (purchaseInfo.variantId) {
            localVariantIds.push(purchaseInfo.variantId)
          }

          // Merge with server variants (deduplicate)
          const allVariantIds = [...new Set([...serverPurchasedVariantIds, ...localVariantIds])]

          if (allVariantIds.length > 0 || purchaseInfo.receiptToken) {
            setHasPurchased(true)
            setPurchasedVariantIds(allVariantIds)
            setReceiptToken(purchaseInfo.receiptToken)

            if (purchaseInfo.assets && purchaseInfo.assets.length > 0) {
              setAssetId(purchaseInfo.assets[0].id)
            }
          }
        }
      }
    } catch (e) {
      console.error("[usePurchaseStatus] Error checking localStorage:", e)
    } finally {
      setIsChecking(false)
    }
  }, [productId, serverHasPurchased, serverPurchasedVariantIds])

  /*
    ── 3. AND THEN THE SERVER SAYS WHAT THAT RECEIPT IS ACTUALLY WORTH ──────
    Everything above is this browser's own copy, and a copy drifts. Refund an
    order, delete a product, buy variant A and hand-edit the stored list to
    include B, and the button says Download while the download says 403 — the
    page promising something it cannot deliver.

    So the stored token is a HINT and /api/purchases/verify is the answer.
    This is how a marketplace does it: the browser holds a bearer receipt,
    the server decides what it unlocks.

    IT RUNS AFTER THE OPTIMISTIC READ, NOT INSTEAD OF IT. A returning buyer
    sees Download immediately from localStorage rather than watching a
    request resolve; this corrects it a moment later if the copy was wrong.
    Being slower than the truth is fine. Being wrong and staying wrong is not.
  */
  useEffect(() => {
    if (!productId) return
    let cancelled = false

    const tokens: string[] = []
    try {
      const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
      if (stored) {
        const purchases: Record<string, PurchaseInfo> = JSON.parse(stored)
        const token = purchases[productId]?.receiptToken
        if (token) tokens.push(token)
      }
    } catch { /* private mode: nothing stored, nothing to verify */ }

    /*
      ONLY WHEN THERE IS SOMETHING UNVERIFIED TO CHECK.

      A stored token is a claim this browser made that nothing has confirmed,
      so it gets checked. Everything else is already settled: the server
      computed `serverHasPurchased` from the session on this very request, and
      a visitor with neither a token nor a session has not bought anything.

      An earlier version asked on every product page view unless the browser
      had no cookies at all, which is nearly never — that is a request per
      visitor per page to re-derive an answer the page already had.
    */
    if (tokens.length === 0) {
      setIsChecking(false)
      return
    }

    ;(async () => {
      try {
        const res = await fetch("/api/purchases/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, receiptTokens: tokens }),
        })
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return

        setHasPurchased(!!data.hasPurchased)
        setPurchasedVariantIds(Array.isArray(data.variantIds) ? data.variantIds : [])
        if (Array.isArray(data.assets) && data.assets.length > 0) {
          setAssetId(data.assets[0].id)
        }

        /*
          SELF-HEALING. A token the server does not recognise is dropped, so
          the next visit does not ask about it again and the button stops
          offering something that is not there.
        */
        if (Array.isArray(data.staleTokens) && data.staleTokens.length > 0) {
          try {
            const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
            if (stored) {
              const purchases: Record<string, PurchaseInfo> = JSON.parse(stored)
              if (data.staleTokens.includes(purchases[productId]?.receiptToken)) {
                delete purchases[productId]
                localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))
              }
            }
          } catch { /* nothing to clean up */ }
        }
      } catch {
        /*
          OFFLINE, OR THE ENDPOINT IS DOWN. Leave the optimistic state alone:
          a buyer who is offline keeps seeing Download, and the download route
          is what actually authorises the file either way.
        */
      } finally {
        if (!cancelled) setIsChecking(false)
      }
    })()

    return () => { cancelled = true }
  }, [productId, serverHasPurchased])

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

"use client"

import { useEffect, useRef } from "react"

const PURCHASED_PRODUCTS_KEY = "materia_purchased_products"
const SYNC_SESSION_KEY = "materia_purchases_synced"

interface StoredPurchase {
  receiptToken: string
  assets: Array<{ id: string; file_name?: string }>
  variantIds?: string[]
  variantId?: string | null
}

/**
 * Automatically syncs guest purchases (stored in localStorage) to the
 * authenticated user's account by calling /api/purchases/claim for each
 * unclaimed receipt token.
 *
 * Renders nothing — include anywhere inside an authenticated layout.
 * Runs once per browser session (uses sessionStorage flag).
 */
export function PurchaseSyncProvider() {
  const didRun = useRef(false)

  useEffect(() => {
    // Only run once per component mount & browser session
    if (didRun.current) return
    if (typeof window === "undefined") return

    // Skip if we already synced in this browser session
    if (sessionStorage.getItem(SYNC_SESSION_KEY)) return

    const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
    if (!stored) {
      sessionStorage.setItem(SYNC_SESSION_KEY, "1")
      return
    }

    let purchases: Record<string, StoredPurchase>
    try {
      purchases = JSON.parse(stored)
    } catch {
      sessionStorage.setItem(SYNC_SESSION_KEY, "1")
      return
    }

    const tokens = Object.entries(purchases)
      .filter(([, info]) => !!info.receiptToken)
      .map(([productId, info]) => ({ productId, receiptToken: info.receiptToken }))

    if (tokens.length === 0) {
      sessionStorage.setItem(SYNC_SESSION_KEY, "1")
      return
    }

    didRun.current = true

    // Claim all tokens concurrently
    async function syncPurchases() {
      const results = await Promise.allSettled(
        tokens.map(async ({ receiptToken }) => {
          const res = await fetch("/api/purchases/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            /*
              Only an order paid with this account's own address (match:
              "email", app/api/purchases/claim). This runs with no press, for
              whoever signs in on this browser next: on a shared computer that
              collected the last person's guest purchases into a stranger's
              library. Another address keeps Add to library on its receipt.
            */
            body: JSON.stringify({ receiptToken, match: "email" }),
          })
          return res.json()
        })
      )

      if (process.env.NODE_ENV === "development") {
        console.log("[PurchaseSyncProvider] Sync results:", results)
      }

      // Mark session as synced regardless of individual results
      // (the endpoint is idempotent so re-running next session is safe)
      sessionStorage.setItem(SYNC_SESSION_KEY, "1")
    }

    syncPurchases()
  }, [])

  return null
}

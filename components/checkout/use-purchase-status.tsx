"use client"

import { useState, useEffect, useCallback } from "react"
import { mayBeSignedIn, mayOwnAsGuest } from "@/lib/auth/session-hint"

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
  /** Bought in this browser without an account (the signed sl_owned), and the account does not own it: the "save it to an account" offer. */
  guest: { orderId: string; maskedEmail: string | null } | null
  /** Somebody is signed in (the server's answer). */
  signedIn: boolean
  /** A membership the signed in person has: their own link, in place of Join. */
  memberHref: string | null
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
  serverPurchasedVariantIds: string[] = [], // Now an array
  opts: { membership?: boolean } = {},
): UsePurchaseStatusResult {
  const membership = opts.membership === true
  const [hasPurchased, setHasPurchased] = useState(serverHasPurchased)
  const [assetId, setAssetId] = useState<string | null>(serverAssetId)
  const [receiptToken, setReceiptToken] = useState<string | null>(null)
  const [purchasedVariantIds, setPurchasedVariantIds] = useState<string[]>(serverPurchasedVariantIds)
  const [isChecking, setIsChecking] = useState(!serverHasPurchased)
  const [guest, setGuest] = useState<{ orderId: string; maskedEmail: string | null } | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [memberHref, setMemberHref] = useState<string | null>(null)

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
      /* Settled here only when the server will not be asked below (round 49); otherwise its answer settles it. */
      if (!worthAsking(productId)) setIsChecking(false)
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
      ONLY WHEN THERE IS SOMETHING TO ASK ABOUT (round 49): a stored token,
      which is a claim this browser made that nothing has confirmed, a
      Storelib session, or a guest purchase in this browser. The page no
      longer computes ownership on the server, so a session alone is now
      reason to ask; a stranger with none of the three has bought nothing
      and asks nothing.
    */
    if (!worthAsking(productId)) {
      setIsChecking(false)
      return
    }

    ;(async () => {
      try {
        const data = await verifyPurchase(productId, tokens, membership)
        if (!data || cancelled) return

        setHasPurchased(!!data.hasPurchased)
        setSignedIn(!!data.isLoggedIn)
        setPurchasedVariantIds(Array.isArray(data.variantIds) ? (data.variantIds as string[]) : [])
        if (Array.isArray(data.assets) && data.assets.length > 0) {
          setAssetId((data.assets[0] as { id: string }).id)
        }
        if (data.hasPurchased && mayOwnAsGuest()) {
          const g = await guestOwned(productId)
          if (!cancelled) setGuest(g)
        }
        setMemberHref(typeof data.memberHref === "string" && data.memberHref.startsWith("/") ? data.memberHref : null)

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
  }, [productId, serverHasPurchased, membership])

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
    guest,
    signedIn,
    memberHref,
    hasVariantAccess,
    addPurchasedVariant
  }
}

/*
  ROUND 49: THE PRODUCT PAGE IS ONE HTML FOR EVERYBODY (a CDN holds it), so
  the server no longer says who owns what: `serverHasPurchased` is false on
  the creator's product page, and the answer comes from
  /api/purchases/verify, asked after load whenever there is anything to ask
  about: a receipt this browser holds, a Storelib session, or the guest
  buyer's sl_owned (its readable companion sl_owned_hint says so;
  lib/auth/session-hint). A stranger asks nothing. While the question is out
  `isChecking` stays true, so the buy box keeps its Loading button and a
  buyer goes from Loading to Download, never through Buy.

  One question per product and page view, however many parts ask (the buy
  box and the sticky bar both do).
*/
interface VerifyAnswer {
  hasPurchased?: boolean
  isLoggedIn?: boolean
  variantIds?: unknown
  assets?: unknown
  staleTokens?: unknown
  memberHref?: unknown
}
const verifying = new Map<string, Promise<VerifyAnswer | null>>()
function verifyPurchase(productId: string, tokens: string[], membership: boolean): Promise<VerifyAnswer | null> {
  const key = `${productId}|${tokens.join(",")}|${membership ? 1 : 0}`
  const hit = verifying.get(key)
  if (hit) return hit
  const ask = fetch("/api/purchases/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ productId, receiptTokens: tokens, ...(membership ? { membership: true } : {}) }),
  })
    .then((res) => (res.ok ? (res.json() as Promise<VerifyAnswer>) : null))
    .catch(() => null)
  verifying.set(key, ask)
  void ask.finally(() => setTimeout(() => verifying.delete(key), 0))
  return ask
}

/** Whether this browser has anything worth asking the server about (a session, a guest purchase, a stored receipt). */
function worthAsking(productId: string): boolean {
  if (mayBeSignedIn() || mayOwnAsGuest()) return true
  try {
    const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
    if (stored && (JSON.parse(stored) as Record<string, PurchaseInfo>)[productId]?.receiptToken) return true
  } catch {
    /* private mode */
  }
  try {
    return new URLSearchParams(window.location.search).has("purchaseToken")
  } catch {
    return false
  }
}

/* The guest buyer's own row (/api/purchases/guest-owned), asked only by a browser whose sl_owned_hint says it bought here as a guest. */
const guestAsked = new Map<string, Promise<{ orderId: string; maskedEmail: string | null } | null>>()
function guestOwned(productId: string): Promise<{ orderId: string; maskedEmail: string | null } | null> {
  const hit = guestAsked.get(productId)
  if (hit) return hit
  const ask = fetch(`/api/purchases/guest-owned?productId=${encodeURIComponent(productId)}`, { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { guest?: { orderId?: unknown; maskedEmail?: unknown } | null } | null) =>
      d?.guest && typeof d.guest.orderId === "string" ? { orderId: d.guest.orderId, maskedEmail: typeof d.guest.maskedEmail === "string" ? d.guest.maskedEmail : null } : null,
    )
    .catch(() => null)
  guestAsked.set(productId, ask)
  void ask.finally(() => setTimeout(() => guestAsked.delete(productId), 0))
  return ask
}

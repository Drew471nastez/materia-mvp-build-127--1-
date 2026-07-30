"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * localStorage-backed "recently viewed" listings.
 *
 * This has to live client-side: public.product_views exists, but its RLS policy
 * only grants SELECT to the product owner, so a buyer cannot read back their own
 * view history from the database.
 *
 * ── Integration ───────────────────────────────────────────────────────────────
 * Read side (search dropdown / explore panel):
 *   const { products, remove, clear } = useRecentlyViewed()
 *
 * Write side — call once from the product detail page, next to the existing
 * /api/track-view call so the two stay consistent:
 *   addRecentlyViewed({
 *     productId: product.id,
 *     slug: product.slug,
 *     title: product.title,
 *     thumbnail: product.thumbnail_url,
 *     price: product.price_cents,
 *     category: product.category,
 *   })
 *
 * NOT wired into the product page here — that file belongs to another agent.
 *
 * Storage mechanics (versioned key, module-level snapshot, cross-tab `storage`
 * sync, frozen empty server snapshot) mirror lib/hooks/use-recent-searches.ts.
 */

const STORAGE_KEY = "storelib_recently_viewed_v1"

/** Two full rows of the horizontal thumb strip; beyond that it's history, not context. */
const MAX_ENTRIES = 20

/** Anything older is stale intent; dropped on the next read. */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export interface RecentlyViewedProduct {
  productId: string
  slug: string
  title: string
  /** products.thumbnail_url — null for listings with no photo yet. */
  thumbnail: string | null
  /** products.price_cents, kept in cents so the display formatter stays the one in product-card. */
  price: number
  /** products.category — powers getInterestCategories(). */
  category?: string | null
  /** Epoch ms of the most recent view. */
  ts: number
}

/** What a caller has to supply; `ts` is stamped for them. */
export type RecentlyViewedInput = Omit<RecentlyViewedProduct, "ts">

const EMPTY: readonly RecentlyViewedProduct[] = Object.freeze([])

// Cached snapshot — useSyncExternalStore needs a referentially stable value
// between mutations.
let cache: readonly RecentlyViewedProduct[] | null = null

const listeners = new Set<() => void>()

function isRecentlyViewed(value: unknown): value is RecentlyViewedProduct {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.productId === "string" &&
    entry.productId.length > 0 &&
    typeof entry.slug === "string" &&
    typeof entry.title === "string" &&
    typeof entry.price === "number" &&
    typeof entry.ts === "number"
  )
}

function read(): readonly RecentlyViewedProduct[] {
  if (typeof window === "undefined") return EMPTY

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY

    const cutoff = Date.now() - MAX_AGE_MS
    const entries = parsed.filter(isRecentlyViewed).filter((entry) => entry.ts >= cutoff)

    return entries.length > 0 ? entries.slice(0, MAX_ENTRIES) : EMPTY
  } catch {
    // Malformed JSON, or storage blocked entirely (Safari private mode, iframe).
    return EMPTY
  }
}

function write(entries: readonly RecentlyViewedProduct[]) {
  cache = entries
  try {
    if (entries.length > 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Quota exceeded or storage disabled — the in-memory cache still serves this session.
  }
  for (const listener of listeners) listener()
}

function getSnapshot(): readonly RecentlyViewedProduct[] {
  if (cache === null) cache = read()
  return cache
}

function getServerSnapshot(): readonly RecentlyViewedProduct[] {
  return EMPTY
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  if (listeners.size === 1) {
    window.addEventListener("storage", onStorageEvent)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorageEvent)
    }
  }
}

function onStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return
  cache = read()
  for (const listener of listeners) listener()
}

/**
 * Record a product view. Most-recent-first, de-duped by productId (re-viewing an
 * item moves it to the front and refreshes its timestamp), capped at MAX_ENTRIES.
 * Safe to call from anywhere, including outside React. No-op on the server.
 */
export function addRecentlyViewed(product: RecentlyViewedInput) {
  if (typeof window === "undefined") return
  if (!product?.productId || !product.slug) return

  const entry: RecentlyViewedProduct = {
    productId: product.productId,
    slug: product.slug,
    title: product.title || "",
    thumbnail: product.thumbnail || null,
    price: Number.isFinite(product.price) ? product.price : 0,
    ...(product.category ? { category: product.category } : {}),
    ts: Date.now(),
  }

  const next = [entry, ...getSnapshot().filter((item) => item.productId !== entry.productId)]
  write(next.slice(0, MAX_ENTRIES))
}

export function removeRecentlyViewed(productId: string) {
  if (typeof window === "undefined") return

  const current = getSnapshot()
  const next = current.filter((item) => item.productId !== productId)

  if (next.length !== current.length) write(next)
}

export function clearRecentlyViewed() {
  if (typeof window === "undefined") return
  if (getSnapshot().length > 0) write(EMPTY)
}

/**
 * Top categories by view count, most-viewed first.
 *
 * A zero-cost interest signal for "recommended for you" style suggestions —
 * derived entirely from what's already in localStorage, no extra DB work.
 */
export function getInterestCategories(max = 3): string[] {
  const counts = new Map<string, number>()

  for (const item of getSnapshot()) {
    const category = item.category?.trim().toLowerCase()
    if (!category || category === "all") continue
    counts.set(category, (counts.get(category) || 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([category]) => category)
}

export function useRecentlyViewed() {
  const products = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const add = useCallback((product: RecentlyViewedInput) => addRecentlyViewed(product), [])
  const remove = useCallback((productId: string) => removeRecentlyViewed(productId), [])
  const clear = useCallback(() => clearRecentlyViewed(), [])

  return { products, add, remove, clear }
}

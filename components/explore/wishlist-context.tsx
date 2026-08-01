"use client"

import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react"

const GUEST_ID_KEY = "materia_guest_id"
const GUEST_ID_MAX_AGE = 365 * 24 * 60 * 60
// Tags the events this store dispatches so the provider can skip re-fetching after
// its own optimistic toggle. Other listeners (header badge, /wishlist) ignore it.
const STORE_EVENT_SOURCE = "wishlist-store"

// Module-scoped store — deliberately NOT React state inside a context.
// A Set held in state re-renders every memo()'d card in the grid on each toggle,
// which kills the press animation on a 30-card feed. useSyncExternalStore with a
// per-id snapshot re-renders only the card that actually changed.
/**
 * What was saved last time this browser looked.
 *
 * The store is authoritative once it has answered, but until then every heart on
 * the screen is drawn from nothing — and "nothing" renders as not-saved, so a
 * listing you saved last week comes up hollow and fills in a second later when
 * the fetch lands. That is not a slow heart, it is a WRONG heart: for the length
 * of that round trip the page is actively telling you something untrue about
 * your own account.
 *
 * So the last known answer is kept and read back synchronously, at module load,
 * before anything renders. It is a cache and it is treated as one — the fetch
 * still runs and still wins — but it means the common case, opening the app as
 * the same person on the same phone, is correct on the first painted frame
 * rather than eventually.
 */
const CACHE_KEY = "storelib_wishlist_ids_v1"

function readCache(): Set<string> {
  if (typeof localStorage === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set()
  } catch {
    return new Set()
  }
}

function writeCache(ids: Set<string>): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...ids]))
  } catch {
    /* quota, private mode — the store still works, it is just cold next time */
  }
}

let wishlistedIds = readCache()
let loaded = false
let inflight: Promise<void> | null = null
// /api/wishlist/ids is the one-query endpoint; fall back to the existing list route
// (still a single request, just heavier server-side) when it isn't deployed yet.
let useIdsEndpoint = true

// Ids the user just toggled, re-applied on top of a bulk load that may have been in
// flight during the click so an optimistic change is never clobbered by stale data.
const pendingToggles = new Map<string, boolean>()

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Mirrors the helper in components/wishlist/wishlist-button.tsx — duplicated on purpose
// so a product card never pulls the whole PDP button into its bundle.
function saveGuestId(guestId: string): void {
  if (typeof document !== "undefined") {
    document.cookie = `${GUEST_ID_KEY}=${guestId}; path=/; max-age=${GUEST_ID_MAX_AGE}; samesite=lax`
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(GUEST_ID_KEY, guestId)
  }
}

async function fetchWishlistedIds(): Promise<string[]> {
  if (useIdsEndpoint) {
    try {
      const res = await fetch("/api/wishlist/ids", { credentials: "include" })
      if (res.ok) {
        const data: { ids?: string[] } = await res.json()
        if (Array.isArray(data.ids)) return data.ids
      }
    } catch {
      // Fall through to the list endpoint below
    }
    // Remember the fallback so the 404 is paid at most once per session.
    useIdsEndpoint = false
  }

  const res = await fetch("/api/wishlist", { credentials: "include" })
  if (!res.ok) return []
  const data: { items?: { product_id?: string | null }[] } = await res.json()
  return (data.items ?? []).map((item) => item.product_id).filter((id): id is string => !!id)
}

function applyPendingToggles(base: Set<string>): Set<string> {
  for (const [productId, wanted] of pendingToggles) {
    if (wanted) base.add(productId)
    else base.delete(productId)
  }
  return base
}

/** One fetch per session, shared by every mounted card. Safe to call from anywhere. */
function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (inflight) return inflight

  inflight = fetchWishlistedIds()
    .then((ids) => {
      wishlistedIds = applyPendingToggles(new Set(ids))
      // The server has spoken; that is what the next cold start starts from,
      // including when the answer is "nothing" — a wishlist emptied on another
      // device must not come back the next time this one opens.
      writeCache(wishlistedIds)
    })
    // Fail closed: on any error nothing renders as wishlisted rather than blocking the grid.
    .catch(() => undefined)
    .finally(() => {
      loaded = true
      inflight = null
      emit()
    })

  return inflight
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void ensureLoaded()

    const handleExternalUpdate = (event: Event) => {
      // Our own optimistic toggles already updated the store — only resync for
      // changes made elsewhere (the PDP button, the wishlist page).
      const detail = (event as CustomEvent<{ source?: string }>).detail
      if (detail?.source === STORE_EVENT_SOURCE) return
      loaded = false
      void ensureLoaded()
    }

    window.addEventListener("wishlist-updated", handleExternalUpdate)
    return () => window.removeEventListener("wishlist-updated", handleExternalUpdate)
  }, [])

  return <>{children}</>
}

/**
 * Subscribes to a single product id so a toggle re-renders one card, not the grid.
 * Works with or without <WishlistProvider> mounted — the bulk fetch is kicked off
 * lazily here and de-duplicated at module scope.
 */
export function useIsWishlisted(productId: string): boolean {
  useEffect(() => {
    void ensureLoaded()
  }, [])

  return useSyncExternalStore(
    subscribe,
    () => wishlistedIds.has(productId),
    // SSR/first paint: nothing is wishlisted yet, so markup matches on hydration.
    () => false,
  )
}

// Stable empty snapshot for SSR / first paint so useSyncExternalStore doesn't loop.
const EMPTY_IDS: ReadonlySet<string> = new Set()

/**
 * The full set of wishlisted ids. Identity only changes when the set changes
 * (toggles build a fresh Set), so consumers re-render exactly when needed.
 * Used by the mobile feed's "Saved" tab to show the user's saved listings.
 */
export function useWishlistedIds(): ReadonlySet<string> {
  useEffect(() => {
    void ensureLoaded()
  }, [])

  return useSyncExternalStore(
    subscribe,
    () => wishlistedIds as ReadonlySet<string>,
    () => EMPTY_IDS,
  )
}

/** Optimistic add/remove. Guests are covered by the materia_guest_id cookie. */
export function useToggleWishlist(): (productId: string) => Promise<void> {
  return useCallback(async (productId: string) => {
    const wasWishlisted = wishlistedIds.has(productId)
    pendingToggles.set(productId, !wasWishlisted)

    // New Set so the snapshot identity changes for subscribers.
    const optimistic = new Set(wishlistedIds)
    if (wasWishlisted) optimistic.delete(productId)
    else optimistic.add(productId)
    wishlistedIds = optimistic
    writeCache(optimistic)
    emit()

    try {
      const res = wasWishlisted
        ? await fetch(`/api/wishlist?productId=${encodeURIComponent(productId)}`, {
            method: "DELETE",
            credentials: "include",
          })
        : await fetch("/api/wishlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId }),
            credentials: "include",
          })

      const data: { success?: boolean; count?: number; guestId?: string; error?: string } = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Wishlist update failed")

      if (data.guestId) saveGuestId(data.guestId)

      // The header badge and /wishlist page already listen for this event.
      window.dispatchEvent(
        new CustomEvent("wishlist-updated", {
          detail: { count: data.count, guestId: data.guestId, source: STORE_EVENT_SOURCE },
        })
      )
    } catch (err) {
      console.error("[WishlistStore] Toggle error:", err)
      const rolledBack = new Set(wishlistedIds)
      if (wasWishlisted) rolledBack.add(productId)
      else rolledBack.delete(productId)
      wishlistedIds = rolledBack
      writeCache(rolledBack)
      emit()
    } finally {
      pendingToggles.delete(productId)
    }
  }, [])
}

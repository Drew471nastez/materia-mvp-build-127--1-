"use client"

/**
 * ===========================================================================
 *  THE LISTINGS THIS PERSON HAS SAVED
 * ===========================================================================
 *
 * Two screens draw the same list — the feed's Salvate tab and the Salvate tab
 * on your own profile — and this is the one place either of them gets it from.
 *
 * It began inside components/explore/mobile-feed.tsx as four module-scoped
 * values and a fetch, which was right while the feed was the only caller. A
 * second copy for the profile would have been a second cache, a second
 * in-flight promise and a second sessionStorage key: two tabs showing the same
 * heading with different contents, and two requests for one list on any session
 * that visits both. It is lifted here instead, unchanged in behaviour, so the
 * profile and the feed are literally reading the same array.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A CACHE AT ALL
 * ---------------------------------------------------------------------------
 * Saved is a tab, not a page. A tab that shows a spinner every time you touch
 * it is a tab you stop touching — and the list is small, already fetched once,
 * and almost never different from what it was thirty seconds ago. So the
 * snapshot lives at module scope for the session and is mirrored into
 * sessionStorage for a reload, and the fetch behind it refreshes the cache for
 * NEXT time rather than rearranging what you are currently looking at.
 *
 * The in-flight promise is what stops the feed and the profile both asking at
 * once when a tab change mounts them in the same tick.
 *
 * ---------------------------------------------------------------------------
 * IT IS ALWAYS YOUR OWN
 * ---------------------------------------------------------------------------
 * /api/wishlist answers for whoever is holding the cookie — a signed-in user or
 * a guest id — and there is no form of it that reads somebody else's. That is a
 * property worth stating rather than discovering: it means this module can be
 * called from a page ABOUT another person and still only ever return the
 * reader's own list, so the profile's Salvate tab is drawn for the owner and
 * for nobody else. See components/member/saved-shelf.tsx.
 */

/**
 * WHERE THE BOOKMARK GOES.
 *
 * The saved list is a TAB on your profile — beside your listings and your
 * reviews — and it has an address: /member/<handle>/saved. Every bookmark and
 * heart in the product's chrome points there rather than at /wishlist, so
 * pressing it lands you on your own profile with that tab open instead of on a
 * separate page wearing different chrome and showing the same items.
 *
 * /wishlist has NOT been deleted and is the honest fallback, because there are
 * two states in which there is no handle to build a URL from: a guest, who has
 * a wishlist (it hangs off the `materia_guest_id` cookie) and no profile to put
 * it on, and a session that has not resolved yet. Sending either of those to
 * /member/undefined/saved is worse than sending them to the page that works.
 *
 * One function rather than the same template string in four headers: the day
 * this route changes, it changes once.
 */
export function savedShelfHref(username?: string | null): string {
  const handle = (username ?? "").trim()
  return handle ? `/member/${encodeURIComponent(handle)}/saved` : "/wishlist"
}

const SAVED_SS_KEY = "storelib_saved_items_v1"

let cache: any[] | null = null
let inflight: Promise<any[]> | null = null

export function persistSavedCache(list: any[] | null): void {
  cache = list
  try {
    if (list) sessionStorage.setItem(SAVED_SS_KEY, JSON.stringify(list))
    else sessionStorage.removeItem(SAVED_SS_KEY)
  } catch {
    /* storage unavailable */
  }
}

/** Best-effort synchronous read so a tab can paint before any fetch resolves. */
export function readSavedCache(): any[] | null {
  if (cache) return cache
  try {
    const raw = sessionStorage.getItem(SAVED_SS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      cache = parsed
      return parsed
    }
  } catch {
    /* ignore */
  }
  return null
}

/** The cache as it stands, without reaching for sessionStorage. */
export function peekSavedCache(): any[] | null {
  return cache
}

/**
 * Force the next `loadSavedItems()` past the in-flight guard.
 *
 * Pull-to-refresh means "ask again now", and without this it would join a
 * request that is already on its way back with the answer being refreshed away
 * from.
 */
export function invalidateSavedItems(): void {
  inflight = null
}

export function loadSavedItems(): Promise<any[]> {
  if (inflight) return inflight
  inflight = fetch("/api/wishlist", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((data) => {
      const mapped = ((data?.items ?? []) as any[]).map(mapWishlistItem).filter(Boolean)
      persistSavedCache(mapped)
      return mapped
    })
    .catch(() => cache ?? [])
    .finally(() => {
      inflight = null
    })
  return inflight
}

/**
 * A wishlist row, in the shape ProductCard expects.
 *
 * The API returns the join — a wishlist row with its product and that product's
 * creator nested inside it — and every card in the marketplace takes a listing.
 * This is the seam between the two, and it is written once because a card drawn
 * from a slightly different shape is a card with a missing seller name or a
 * price that formats as NaN.
 */
export function mapWishlistItem(item: any) {
  const p = item?.products
  if (!p?.id) return null
  const prof = p.creator_profile
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    price_cents: p.price_cents,
    thumbnail_url: p.thumbnail_url ?? null,
    gallery_urls: p.gallery_urls ?? null,
    type: p.type,
    category: p.category ?? null,
    saves_count: p.saves_count ?? 0,
    creator: {
      id: p.creators?.id,
      slug: p.creators?.slug,
      profile: prof
        ? { display_name: prof.display_name, username: prof.username, avatar_url: prof.avatar_url }
        : null,
    },
  }
}

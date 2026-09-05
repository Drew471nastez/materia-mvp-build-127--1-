"use client"

import { useEffect, useRef, useState } from "react"
import { Bookmark } from "lucide-react"

import { ListingCard } from "@/components/member/listing-card"
import { useWishlistedIds } from "@/components/explore/wishlist-context"
import {
  loadSavedItems,
  peekSavedCache,
  persistSavedCache,
  readSavedCache,
} from "@/lib/marketplace/saved-items"

/**
 * ===========================================================================
 *  THE SALVATE TAB ON A PROFILE
 * ===========================================================================
 *
 * The third tab in the shelf strip, between what somebody is selling and what
 * people have said about them. Same list the feed's Salvate tab draws, same
 * cache, same mapper — see lib/marketplace/saved-items.ts, which exists because
 * this screen is the second caller.
 *
 * ---------------------------------------------------------------------------
 * IT IS ONLY EVER DRAWN ON YOUR OWN PROFILE, AND THAT IS NOT A UI PREFERENCE
 * ---------------------------------------------------------------------------
 * A wishlist is a list of things somebody has not bought yet. It says what they
 * want, what they can afford, what size they are and who they follow closely
 * enough to watch — which is more than most people would publish about
 * themselves deliberately, and none of it is something they have been asked
 * about. Every marketplace in this category keeps it private for that reason.
 *
 * The plumbing agrees, which is worth stating so nobody "fixes" it later:
 * /api/wishlist answers for whoever is holding the cookie and has no form that
 * reads another account's list. So a Salvate tab rendered on a stranger's
 * profile would not show a privacy leak — it would show YOUR OWN saved items
 * under THEIR name, which is worse than either alternative because it is
 * confidently wrong. The tab is gated on `isOwner` in member-profile.tsx and
 * this component is never mounted anywhere else.
 *
 * ---------------------------------------------------------------------------
 * THE LIST IS A SNAPSHOT, AND UNSAVING DOES NOT EMPTY IT UNDER YOU
 * ---------------------------------------------------------------------------
 * Exactly the rule the feed's tab follows, for exactly the reason: tapping the
 * heart on a card you are looking at is not a request for the card to vanish
 * and everything below it to jump up a row. The heart unfills — that reads the
 * live wishlist store, which is optimistic and instant — and the card leaves on
 * the next rebuild, which is the next time this tab is opened. The persisted
 * cache is pruned immediately so that next open is already correct.
 */
export function SavedShelf({ reloadSignal = 0 }: { reloadSignal?: number }) {
  const savedIds = useWishlistedIds()
  /**
   * Seeded synchronously from the cache, so a session that has already been to
   * the feed's Salvate tab paints this one with no request and no skeleton. The
   * `null` state means "nothing known yet" and is the only one that draws the
   * placeholder — an empty ARRAY is a real answer and draws the empty state.
   */
  const [snapshot, setSnapshot] = useState<any[] | null>(() => readSavedCache())
  const loadedOnce = useRef(false)

  // Cold load only. With a cached snapshot the list stays frozen for this visit
  // — nothing reorders or appears a second after you land — while the fetch
  // still refreshes the cache underneath for the next open.
  useEffect(() => {
    let cancelled = false
    const cold = snapshot === null
    void loadSavedItems().then((list) => {
      if (!cancelled && cold) setSnapshot(list)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Prune the PERSISTED cache when something is un-saved, never the visible
  // snapshot. Guarded on having seen a non-empty store at least once, so the
  // store's own empty first render cannot wipe the cache.
  useEffect(() => {
    if (savedIds.size > 0) loadedOnce.current = true
    const cached = peekSavedCache()
    if (!loadedOnce.current || !cached) return
    const pruned = cached.filter((p) => p?.id && savedIds.has(p.id))
    if (pruned.length !== cached.length) persistSavedCache(pruned)
  }, [savedIds])

  // The tab was re-entered. The list is rebuilt from the cache the effect above
  // has been keeping correct, which is what makes an un-saved item disappear on
  // the visit AFTER the one you un-saved it in rather than under your finger.
  useEffect(() => {
    if (reloadSignal === 0) return
    const cached = peekSavedCache()
    if (cached) setSnapshot(cached)
  }, [reloadSignal])

  if (snapshot === null) {
    // A calm skeleton in the grid's own geometry, not a centred spinner: this
    // panel replaces a grid of photographs and a spinner in the middle of the
    // page is a different shape from what is about to be there.
    return (
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 pb-10 md:mt-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 md:pb-16 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[3/4] w-full rounded-xl bg-neutral-100" />
            <div className="mt-2.5 h-3 w-1/2 rounded bg-neutral-100" />
            <div className="mt-1.5 h-3 w-3/4 rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    )
  }

  if (snapshot.length === 0) {
    // The same language as the empty shelf beside it — circle, one line, one
    // sentence — rather than the wishlist page's own empty state, because this
    // is a panel inside a profile and it has to look like the panel next to it.
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <Bookmark className="h-7 w-7" strokeWidth={1.7} />
        </span>
        <p className="text-[17px] font-semibold text-neutral-900">Niciun articol salvat</p>
        <p className="mt-1.5 max-w-[280px] text-[14px] leading-relaxed text-neutral-500">
          Apasă inima pe un anunț și îl găsești aici.
        </p>
      </div>
    )
  }

  return (
    // The LISTINGS grid's geometry, to the pixel — two up on a phone, three at
    // md, four at lg, the same gaps and the same bottom padding. Two panels
    // under one tab strip that lay their cards out differently read as two
    // pages, and switching between them would move every card on the screen.
    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 pb-10 md:mt-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 md:pb-16 lg:grid-cols-4">
      {snapshot.map((product, i) => (
        <ListingCard
          key={product.id}
          product={product}
          origin="wishlist"
          // The seller's name STAYS here, unlike the listings panel beside it.
          // There every card belongs to the person named at the top of the page,
          // so repeating it would be noise; here every card belongs to somebody
          // different, and whose it is is half of what you saved it for.
          priority={i < 4}
        />
      ))}
    </div>
  )
}

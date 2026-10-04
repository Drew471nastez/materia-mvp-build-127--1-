"use client"

/**
 * ===========================================================================
 *  THE GRID IN COMMUNITIES MODE
 * ===========================================================================
 * The products are all in the page already and are filtered where they sit.
 * Communities are not: there can be any number of them, so the server finds
 * them (lib/communities/server/explore.ts) a page at a time, by the pill,
 * the search word, the order and the price the page hands in here.
 *
 * The first page usually came with the page: /explore?type=communities draws
 * it on the server, and the query it was drawn for travels with it. While
 * the choices still describe that page nothing is fetched. A different pill,
 * word, order or price asks GET /api/explore/communities for a new first
 * page; the answer to a question that has since been replaced is dropped
 * (an aborted request), so tapping through the pills quickly never lands on
 * an older list. "Show more" asks for the next page by its cursor.
 */
import * as React from "react"
import type { CommunityCard } from "@/lib/communities/types"
import { communitiesQuery } from "@/lib/explore/communities-mode"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { ExploreCommunityGrid } from "./community-card"

export interface CommunitiesFirstPage {
  /** communitiesQuery() of the choices it was drawn for. */
  query: string
  items: CommunityCard[]
  next: string | null
}

const PAGE = 24

export function ExploreCommunitiesResults({
  initial,
  q,
  category,
  srt,
  price,
  categoryLabel,
  onClearFilters,
  filtersOn,
}: {
  initial: CommunitiesFirstPage | null
  q: string
  category: string
  srt: string
  price: string
  /** The pill's name, for "No communities in Design yet". */
  categoryLabel: string | null
  onClearFilters: () => void
  filtersOn: boolean
}) {
  const query = communitiesQuery({ q, category, srt, price })
  const fresh = initial && initial.query === query ? initial : null
  const [items, setItems] = React.useState<CommunityCard[] | null>(fresh ? fresh.items : null)
  const [next, setNext] = React.useState<string | null>(fresh ? fresh.next : null)
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [loadedFor, setLoadedFor] = React.useState<string | null>(fresh ? query : null)
  /* A new list is a new question; the request for the old one is cancelled. */
  React.useEffect(() => {
    if (loadedFor === query) return
    if (initial && initial.query === query) {
      setItems(initial.items)
      setNext(initial.next)
      setLoadedFor(query)
      setFailed(false)
      return
    }
    const ctrl = new AbortController()
    setItems(null)
    setFailed(false)
    fetch(`/api/explore/communities?${query}${query ? "&" : ""}limit=${PAGE}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { items: CommunityCard[]; next: string | null }
        setItems(body.items)
        setNext(body.next)
        setLoadedFor(query)
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return
        setItems([])
        setNext(null)
        setFailed(true)
        setLoadedFor(query)
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const more = async () => {
    if (!next || loading) return
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/explore/communities?${query}${query ? "&" : ""}limit=${PAGE}&cursor=${encodeURIComponent(next)}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { items: CommunityCard[]; next: string | null }
      setItems((list) => {
        const have = list ?? []
        const seen = new Set(have.map((c) => c.id))
        return [...have, ...body.items.filter((c) => !seen.has(c.id))]
      })
      setNext(body.next)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  if (items === null) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" data-communities-loading="" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    const what = q
      ? `No communities found for "${q}"`
      : failed
        ? "Communities did not load."
        : filtersOn
          ? "No communities match your filters."
          : categoryLabel
            ? `No communities in ${categoryLabel} yet.`
            : "No communities yet."
    return (
      <div className="flex min-h-[60svh] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-12 text-center" data-communities-empty="">
        <p className="text-neutral-500">{what}</p>
        {!q && !failed && !filtersOn && !categoryLabel ? <p className="mt-1 text-[14px] text-neutral-400">When creators open one, it shows up here.</p> : null}
        {filtersOn ? (
          <button type="button" onClick={onClearFilters} className="mt-3 cursor-pointer text-sm font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900">
            Clear filters
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div data-communities-results="">
      <ExploreCommunityGrid cards={items} />
      {next ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={more}
            disabled={loading}
            data-show-more=""
            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full bg-neutral-100 px-6 text-sm font-medium text-neutral-700 outline-none transition-colors hover:bg-neutral-200 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:cursor-default disabled:opacity-60"
          >
            {loading ? "Loading" : "Show more"}
          </button>
          {failed ? <p className="text-[13px] text-[#b42318]">That did not load. Try again.</p> : null}
        </div>
      ) : null}
    </div>
  )
}

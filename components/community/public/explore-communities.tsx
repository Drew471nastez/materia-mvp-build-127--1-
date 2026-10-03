"use client"

/**
 * ===========================================================================
 *  /explore/communities
 * ===========================================================================
 * Explore's own ground, pills and search field, with communities in the
 * grid. The first page is drawn on the server; "Show more" asks for the
 * next one by its cursor (GET /api/explore/communities), so the hundredth
 * page costs what the first did. Search and the order are addresses
 * (?q=, ?sort=), so Back, a shared link and a reload all land on the same
 * list.
 *
 * The orders say what they are: Trending (the trending job's score), Most
 * members (active members), Newest. Nothing is ranked by a number the page
 * cannot show.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import type { CommunityCard } from "@/lib/communities/types"
import { cn } from "@/lib/utils"
import { CommunityGrid } from "./community-card"

export type ExploreSortId = "trending" | "popular" | "new"

const SORTS: { id: ExploreSortId; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "popular", label: "Most members" },
  { id: "new", label: "Newest" },
]

/* Explore's pill (components/explore/explore-page-client.tsx), so the two rows read as one. 40px on a phone, a thumb's size; Explore's own 38px from 640px. */
const PILL = "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm sm:h-[38px] font-medium outline-none transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
const PILL_ON = "border-[#d7dadf] bg-[#e2e4e8] text-neutral-900 shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
const PILL_OFF = "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-800"

function hrefFor(q: string, sort: ExploreSortId): string {
  const p = new URLSearchParams()
  if (q.trim()) p.set("q", q.trim())
  if (sort !== "trending") p.set("sort", sort)
  const s = p.toString()
  return `/explore/communities${s ? `?${s}` : ""}`
}

export function ExploreCommunities({ initial, next: firstNext, q, sort }: { initial: CommunityCard[]; next: string | null; q: string; sort: ExploreSortId }) {
  const router = useRouter()
  const [items, setItems] = React.useState(initial)
  const [next, setNext] = React.useState(firstNext)
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [draft, setDraft] = React.useState(q)

  /* A new search or order is a new first page from the server. */
  React.useEffect(() => {
    setItems(initial)
    setNext(firstNext)
    setFailed(false)
  }, [initial, firstNext])
  React.useEffect(() => setDraft(q), [q])

  const more = async () => {
    if (!next || loading) return
    setLoading(true)
    setFailed(false)
    try {
      const p = new URLSearchParams({ cursor: next, sort })
      if (q) p.set("q", q)
      const res = await fetch(`/api/explore/communities?${p.toString()}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { items: CommunityCard[]; next: string | null }
      setItems((list) => {
        const seen = new Set(list.map((c) => c.id))
        return [...list, ...body.items.filter((c) => !seen.has(c.id))]
      })
      setNext(body.next)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div data-explore-communities="">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Communities</h1>
          <p className="mt-1 text-[14px] text-[#6b7280]">Groups run by creators on Storelib.</p>
        </div>
        <form
          role="search"
          className="relative w-full sm:w-[320px]"
          onSubmit={(e) => {
            e.preventDefault()
            router.push(hrefFor(draft, sort))
          }}
        >
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <input
            type="search"
            name="q"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search communities"
            aria-label="Search communities"
            className="h-11 w-full rounded-full border border-[#e4e7ec] bg-white pl-10 pr-4 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd2] focus:ring-2 focus:ring-[#1a1a2e]/10 sm:text-[14px]"
          />
        </form>
      </div>

      <nav aria-label="Order" className="-mx-4 mt-5 overflow-x-auto px-4 py-0.5 scrollbar-hide sm:mx-0 sm:px-0">
        <div className="flex w-max items-center gap-2">
          <Link href="/explore" className={cn(PILL, PILL_OFF)}>
            <span aria-hidden className="text-[15px] leading-none">{"\u{1F30D}"}</span>
            All products
          </Link>
          <span aria-hidden className="mx-1 h-5 w-px bg-[#e4e7ec]" />
          {SORTS.map((s) => (
            <Link key={s.id} href={hrefFor(q, s.id)} replace scroll={false} aria-current={s.id === sort ? "page" : undefined} data-sort={s.id} className={cn(PILL, s.id === sort ? PILL_ON : PILL_OFF)}>
              {s.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mt-6">
        {q && items.length > 0 ? <p className="mb-4 text-[14px] text-[#6b7280]">Communities matching “{q}”</p> : null}
        {items.length > 0 ? (
          <CommunityGrid cards={items} />
        ) : (
          <div className="rounded-2xl border border-[#e5e7eb]/70 bg-white px-6 py-14 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-explore-communities-empty="">
            <p className="text-[16px] font-semibold text-[#1a1a2e]">{q ? `No communities found for “${q}”` : "No communities yet."}</p>
            <p className="mx-auto mt-1.5 max-w-[340px] text-[14px] text-[#6b7280]">{q ? "Try a shorter word, or look through all of them." : "When creators open one, it shows up here."}</p>
            {q ? (
              <Link href={hrefFor("", sort)} className="mt-5 inline-flex h-10 items-center rounded-xl border border-[#e5e7eb] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa]">
                See all communities
              </Link>
            ) : null}
          </div>
        )}
        {next ? (
          <div className="mt-8 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={more}
              disabled={loading}
              data-show-more=""
              className="inline-flex h-11 items-center justify-center rounded-full border border-[#e4e7ec] bg-white px-6 text-[14px] font-medium text-[#1a1a2e] outline-none transition-[border-color,background-color] duration-150 hover:border-[#d0d4da] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:opacity-60"
            >
              {loading ? "Loading" : "Show more"}
            </button>
            {failed ? <p className="text-[13px] text-[#b42318]">That did not load. Try again.</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

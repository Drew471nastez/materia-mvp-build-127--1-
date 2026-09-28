"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronRight, Mail, Search, Store, X } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { creatorKey, visibleItems, type LibraryCreator, type LibraryItem, type LibrarySort } from "@/lib/library/library-view"
import { contactOf, storeOf } from "./creator-links"
import { ProductRow } from "./product-row"
import { CARD, MUTED, SECONDARY, SMALL, TEXT_LINK, VIOLET } from "./library-ui"

/**
 * ===========================================================================
 *  THE LIBRARY: EVERYTHING THEY BOUGHT, READY TO USE
 * ===========================================================================
 * One list, newest first, because the thing bought yesterday is the thing
 * most often opened today. Above it a search, an order, and the sellers
 * they bought from, so "everything from Dee" is one press: on a phone a
 * row of sellers that scrolls, on a computer a column beside the list,
 * where the chosen seller also offers Email or Message and their store.
 *
 * Nothing here is a dashboard. There are no totals to admire: the count
 * under the heading is only there so an empty search is not a surprise.
 */

const SORTS: Array<{ value: LibrarySort; label: string }> = [
  { value: "recent", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Name" },
  { value: "creator", label: "Creator" },
]

/* ─── The sellers ──────────────────────────────────────────────────────── */

function CreatorActions({ creator, stacked = false }: { creator: LibraryCreator; stacked?: boolean }) {
  const contact = contactOf(creator)
  const store = storeOf(creator)
  if (!contact && !store) return null
  return (
    <div className={`flex gap-2 ${stacked ? "flex-col" : "flex-wrap"}`}>
      {contact ? (
        <a href={contact.href} data-creator-contact="" className={`${SECONDARY} ${SMALL} ${stacked ? "w-full" : ""}`}>
          <Mail className="h-3.5 w-3.5" aria-hidden />
          {contact.label}
        </a>
      ) : null}
      {store ? (
        <Link href={store} data-creator-store="" className={`${SECONDARY} ${SMALL} ${stacked ? "w-full" : ""}`}>
          <Store className="h-3.5 w-3.5" aria-hidden />
          Visit store
        </Link>
      ) : null}
    </div>
  )
}

/** A phone's row of sellers: All, then each with their face and how many. */
function CreatorChips({ creators, chosen, onChoose }: { creators: LibraryCreator[]; chosen: string | null; onChoose: (key: string | null) => void }) {
  const chip = (active: boolean) =>
    `inline-flex h-9 shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3 text-[13px] font-medium transition-colors duration-150 ${
      active ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e4e7ec] bg-white text-[#374151] hover:border-[#d0d4db]"
    }`
  return (
    <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide lg:hidden" data-creator-chips="">
      <div className="flex w-max gap-2">
        <button type="button" onClick={() => onChoose(null)} aria-pressed={!chosen} className={`${chip(!chosen)} pl-3`}>
          All
        </button>
        {creators.map((c) => {
          const key = creatorKey(c)
          const active = chosen === key
          return (
            <button key={key} type="button" onClick={() => onChoose(active ? null : key)} aria-pressed={active} className={chip(active)}>
              <AppAvatar src={c.avatarUrl} name={c.name} alt="" size={24} markWhileLoading />
              <span className="max-w-[140px] truncate">{c.name}</span>
              <span className={`tabular-nums ${active ? "text-white/70" : "text-[#9ca3af]"}`}>{c.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A computer's column of sellers, with the chosen one's Contact and store. */
function CreatorColumn({ creators, chosen, onChoose }: { creators: LibraryCreator[]; chosen: string | null; onChoose: (key: string | null) => void }) {
  return (
    <section aria-label="Creators" className={`${CARD} overflow-hidden`} data-creator-column="">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <h2 className="text-[13px] font-semibold text-[#1a1a2e]">Creators</h2>
        {chosen ? (
          <button type="button" onClick={() => onChoose(null)} className="text-[12.5px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
            Show all
          </button>
        ) : null}
      </div>
      <ul className="pb-2">
        {creators.map((c) => {
          const key = creatorKey(c)
          const active = chosen === key
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onChoose(active ? null : key)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-100 ${active ? "bg-[#f3f4f6]" : "hover:bg-[#f8f9fa]"}`}
              >
                <AppAvatar src={c.avatarUrl} name={c.name} alt="" size={32} markWhileLoading />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{c.name}</span>
                  <span className="block text-[12px] text-[#6b7280]">
                    {c.count} {c.count === 1 ? "product" : "products"}
                  </span>
                </span>
                {active ? <Check className="h-4 w-4 text-[#1a1a2e]" aria-hidden /> : <ChevronRight className="h-4 w-4 text-[#c4c8cf]" aria-hidden />}
              </button>
              {active ? (
                <div className="px-4 pb-3 pt-1">
                  <CreatorActions creator={c} stacked />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ─── Empty ───────────────────────────────────────────────────────────── */

function NothingYet({ wishlistCount }: { wishlistCount: number }) {
  return (
    <div data-library-empty="" className={`${CARD} px-5 py-10 text-center sm:px-10 sm:py-14`}>
      {/* Three blank spines on a shelf: the one picture on this page, and it says what the page is for. */}
      <div aria-hidden className="mx-auto flex h-14 w-24 items-end justify-center gap-1.5 border-b-2 border-[#e4e7ec] pb-0.5">
        <span className="h-9 w-4 rounded-t-[3px] bg-[#ede9fe]" />
        <span className="h-12 w-4 rounded-t-[3px] bg-[#e4e7ec]" />
        <span className="h-10 w-4 -rotate-6 origin-bottom-left rounded-t-[3px] bg-[#f3f4f6]" />
      </div>
      <h2 className="mt-5 text-[18px] font-semibold text-[#1a1a2e]">Nothing bought yet</h2>
      <p className="mx-auto mt-1.5 max-w-[340px] text-[14px] leading-relaxed text-[#6b7280]">
        What you buy on Storelib lands here, with its files, its receipt and a place to review it.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link href="/explore" className={VIOLET}>
          Discover products
        </Link>
        {wishlistCount > 0 ? (
          <Link href="/library/wishlist" className={SECONDARY}>
            Your wishlist ({wishlistCount})
          </Link>
        ) : null}
      </div>
      <p className="mx-auto mt-5 max-w-[340px] text-[13px] leading-relaxed text-[#8a919c]">
        Bought without an account? Sign in with the email on the receipt and it shows up here.
      </p>
    </div>
  )
}

/* ─── The page ────────────────────────────────────────────────────────── */

export function LibraryHome({
  items,
  creators,
  highlight = null,
  purchased = false,
  toReview = 0,
  wishlistCount = 0,
}: {
  items: LibraryItem[]
  creators: LibraryCreator[]
  /** The product just bought (?highlight=), scrolled to and tinted once. */
  highlight?: string | null
  /** Arrived from a checkout (?purchase=success). */
  purchased?: boolean
  /** Purchases with no review yet, for the column's nudge. */
  toReview?: number
  /** Saved products still on sale, which an empty library points at. */
  wishlistCount?: number
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<LibrarySort>("recent")
  const [creator, setCreator] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const shown = useMemo(() => visibleItems(items, { query, sort, creator }), [items, query, sort, creator])
  const chosen = creator ? creators.find((c) => creatorKey(c) === creator) ?? null : null

  /* The product just bought, brought into view once. */
  useEffect(() => {
    if (!highlight) return
    const el = document.getElementById(`p-${highlight}`)
    el?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [highlight])

  if (items.length === 0) return <NothingYet wishlistCount={wishlistCount} />

  return (
    <div data-library-home="" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
      <div className="min-w-0 space-y-3">
        {purchased ? (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-[#ecfdf3] px-3.5 py-2.5 text-[14px] font-medium text-[#067647]">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            Bought. It&apos;s in your library.
          </p>
        ) : null}

        {/* Search and order: one line on every width. */}
        <div className="flex items-center gap-2" data-library-toolbar="">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search your products</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              enterKeyHint="search"
              className="h-10 w-full rounded-[10px] border border-[#e4e7ec] bg-white pl-9 pr-9 text-[16px] text-[#1a1a2e] placeholder:text-[#9ca3af] focus:border-[#c4c8cf] focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 sm:text-[14px]"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#9ca3af] hover:text-[#4b5563]">
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </label>
          <label className="relative shrink-0">
            <span className="sr-only">Order</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as LibrarySort)}
              className="h-10 appearance-none rounded-[10px] border border-[#e4e7ec] bg-white pl-3 pr-8 text-[14px] font-medium text-[#1a1a2e] focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronRight aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-[#6b7280]" />
          </label>
        </div>

        {creators.length > 1 ? <CreatorChips creators={creators} chosen={creator} onChoose={setCreator} /> : null}

        {/* On a phone, the chosen seller's way to write and their store, above their products. */}
        {chosen ? (
          <div data-creator-strip="" className={`${CARD} flex flex-wrap items-center gap-3 px-4 py-3 lg:hidden`}>
            <AppAvatar src={chosen.avatarUrl} name={chosen.name} alt="" size={40} markWhileLoading />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-[#1a1a2e]">{chosen.name}</p>
              <p className={MUTED}>
                {chosen.count} {chosen.count === 1 ? "product" : "products"} in your library
              </p>
            </div>
            <div className="basis-full">
              <CreatorActions creator={chosen} />
            </div>
          </div>
        ) : null}

        <p className="px-0.5 text-[13px] text-[#6b7280]" aria-live="polite">
          {shown.length === items.length
            ? `${items.length} ${items.length === 1 ? "product" : "products"}`
            : `${shown.length} of ${items.length}`}
        </p>

        {shown.length > 0 ? (
          <ul ref={listRef} data-library-list="" className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
            {shown.map((item) => (
              <ProductRow
                key={item.productId}
                item={item}
                highlight={highlight === item.productId}
                creator={creators.find((c) => creatorKey(c) === creatorKey(item.creator))}
              />
            ))}
          </ul>
        ) : (
          <div data-library-no-match="" className={`${CARD} px-5 py-10 text-center`}>
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{query ? `Nothing matches "${query.trim()}"` : "Nothing here"}</p>
            <p className="mt-1 text-[14px] text-[#6b7280]">Search looks through names, creators and file names.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setCreator(null)
              }}
              className={`${SECONDARY} ${SMALL} mt-4`}
            >
              Show everything
            </button>
          </div>
        )}
      </div>

      {/* A computer's column: the sellers, and what is waiting for a review. */}
      <aside className="hidden space-y-4 lg:block" data-library-aside="">
        {creators.length > 0 ? <CreatorColumn creators={creators} chosen={creator} onChoose={setCreator} /> : null}
        {toReview > 0 ? (
          <Link href="/library/reviews" className={`${CARD} flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#fcfcfd]`}>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-[#1a1a2e]">
                {toReview} {toReview === 1 ? "purchase" : "purchases"} to review
              </span>
              <span className="block text-[12.5px] text-[#6b7280]">A few words help the next buyer.</span>
            </span>
            <ChevronRight className="h-4 w-4 text-[#9ca3af]" aria-hidden />
          </Link>
        ) : null}
        <p className="px-1 text-[12.5px] leading-relaxed text-[#8a919c]">
          Courses and memberships have their own tabs. Every receipt is under{" "}
          <Link href="/library/receipts" className={TEXT_LINK}>
            Receipts
          </Link>
          .
        </p>
      </aside>
    </div>
  )
}

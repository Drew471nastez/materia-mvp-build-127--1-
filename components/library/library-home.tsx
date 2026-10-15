"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronRight, Search, X } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { creatorKey, visibleItems, type LibraryCreator, type LibraryItem, type LibrarySort } from "@/lib/library/library-view"
import type { MembershipCard } from "@/lib/memberships/view-types"
import { LibraryMembershipRow, membershipMatches } from "./library-memberships"
import { contactOf, memberProfileOf } from "./creator-links"
import { ProductRow } from "./product-row"
import { useStoreLinkProps } from "./use-store-link"
import { CARD, SECONDARY, SMALL, TEXT_LINK, VIOLET } from "./library-ui"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE LIBRARY: EVERYTHING THEY BOUGHT, READY TO USE
 * ===========================================================================
 * One list, newest first, because the thing bought yesterday is the thing
 * most often opened today. Above it a search and an order when the list is
 * long enough to need them. The sellers they bought from sit under the
 * products as text links to profiles on a computer only — not a
 * filter dressed up as rows, and not mixed into the product list.
 *
 * Nothing here is a dashboard. There are no totals to admire: the count
 * under the heading is only there so an empty search is not a surprise.
 *
 * MEMBERSHIPS ARE ROWS HERE TOO. There is no Memberships pill any more
 * (memberships are communities), so a membership bought on its own sits at
 * the top of this list, labelled Membership (./library-memberships.tsx),
 * found by the same search, and counted with the rest.
 */

/**
 * How many products a library needs before the search field and the order
 * are drawn over it. Under this the whole list is on the screen already and
 * both are chrome; past it the list stops being scannable and they start
 * being the way through it. A phone shows about six rows at a time, so this
 * is the first size where something is always out of sight.
 */
const CONTROLS_FROM = 8
/** The rows a phone shows at once (the "about six" above): round 29 asks for their pictures eagerly, the rest lazily. */
const FIRST_SCREEN_ROWS = 6

const SORTS: Array<{ value: LibrarySort; label: string }> = [
  { value: "recent", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Name" },
  { value: "creator", label: "Creator" },
]

/* ─── The sellers ──────────────────────────────────────────────────────── */

function CreatorRowLinks({ creator }: { creator: LibraryCreator }) {
  const contact = contactOf(creator)
  if (!contact) return null
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-[13px] font-medium">
      <a href={contact.href} data-creator-contact="" className={TEXT_LINK}>
        {contact.short}
      </a>
    </div>
  )
}

/**
 * On a computer only: who they bought from, with text links to a profile or
 * email. On a phone each product row already shows the seller; a second
 * block of chunky buttons under the list was noise.
 */
function CreatorsList({ creators }: { creators: LibraryCreator[] }) {
  return (
    <section aria-label="People you bought from" className={`${CARD} hidden overflow-hidden lg:block`} data-creator-list="">
      <div className="px-4 pb-2 pt-3.5">
        <h2 className="text-[13px] font-semibold text-[#1a1a2e]">People you bought from</h2>
      </div>
      <ul className="divide-y divide-[#eef0f3] pb-1">
        {creators.map((c) => {
          const profileHref = memberProfileOf(c)
          return (
          <li key={creatorKey(c)} className="flex items-center gap-3 px-4 py-3">
            <AppAvatar src={c.avatarUrl} name={c.name} alt="" size={36} markWhileLoading />
            <div className="min-w-0 flex-1">
              {profileHref ? (
                <Link href={profileHref} data-creator-profile="" className="truncate text-[14px] font-medium text-[#1a1a2e] hover:underline">
                  {c.name}
                </Link>
              ) : (
                <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{c.name}</p>
              )}
              <p className="text-[12px] text-[#6b7280]">
                {c.count} {c.count === 1 ? "purchase" : "purchases"}
              </p>
            </div>
            <CreatorRowLinks creator={c} />
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
          <Link href="/account/library/wishlist" className={SECONDARY}>
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

/** "3 products", "3 products · 1 membership", "1 membership": what the list holds. */
export function countLine(products: number, memberships: number): string {
  const parts: string[] = []
  if (products > 0 || memberships === 0) parts.push(`${products} ${products === 1 ? "product" : "products"}`)
  if (memberships > 0) parts.push(`${memberships} ${memberships === 1 ? "membership" : "memberships"}`)
  return parts.join(" · ")
}

export function LibraryHome({
  items,
  creators,
  highlight = null,
  purchased = false,
  toReview = 0,
  wishlistCount = 0,
  memberships = [],
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
  /** Memberships bought on their own (lib/library/library-memberships.ts), drawn above the products. */
  memberships?: MembershipCard[]
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<LibrarySort>("recent")
  const listRef = useRef<HTMLUListElement>(null)

  const shown = useMemo(() => visibleItems(items, { query, sort, creator: null }), [items, query, sort])
  const shownMemberships = useMemo(() => memberships.filter((m) => membershipMatches(m, query)), [memberships, query])
  const total = items.length + memberships.length
  const showing = shown.length + shownMemberships.length

  /* The product just bought, brought into view once. */
  useEffect(() => {
    if (!highlight) return
    const el = document.getElementById(`p-${highlight}`)
    el?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [highlight])

  if (total === 0) return <NothingYet wishlistCount={wishlistCount} />

  return (
    <div data-library-home="" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6">
      <div className="min-w-0 space-y-3">
        {purchased ? (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-[#ecfdf3] px-3.5 py-2.5 text-[14px] font-medium text-[#067647]">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            Bought. It&apos;s in your library.
          </p>
        ) : null}

        {total >= CONTROLS_FROM ? (
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
        ) : null}

        <p className="px-0.5 text-[13px] text-[#6b7280]" aria-live="polite">
          {showing === total ? countLine(items.length, memberships.length) : `${showing} of ${total}`}
        </p>

        {showing > 0 ? (
          <ul ref={listRef} data-library-list="" className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
            {/* The first screen's rows (FIRST_SCREEN_ROWS) ask for their pictures at once; the rest when the browser reaches them. */}
            {shownMemberships.map((card, i) => (
              <LibraryMembershipRow key={`m-${card.id}`} card={card} eager={i < FIRST_SCREEN_ROWS} />
            ))}
            {shown.map((item, i) => (
              <ProductRow
                key={item.productId}
                eager={shownMemberships.length + i < FIRST_SCREEN_ROWS}
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
            <button type="button" onClick={() => setQuery("")} className={cn(SECONDARY, SMALL, "mt-4")}>
              Show everything
            </button>
          </div>
        )}

        {creators.length > 0 ? <CreatorsList creators={creators} /> : null}
      </div>

      {/* A computer's column: what is waiting for a review, and where receipts live. */}
      <aside className="hidden space-y-4 lg:block lg:pt-7 lg:self-start" data-library-aside="">
        {toReview > 0 ? (
          <Link href="/account/library/reviews" className={`${CARD} flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#fcfcfd]`}>
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
          Courses have their own tab. Every receipt is under{" "}
          <Link href="/account/library/receipts" className={TEXT_LINK}>
            Receipts
          </Link>
          .
        </p>
      </aside>
    </div>
  )
}

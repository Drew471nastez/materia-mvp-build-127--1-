/**
 * ===========================================================================
 *  WHAT THIS PERSON HAS ON STORELIB
 * ===========================================================================
 * The page of /account, under the person themselves (components/account/
 * account-hub.tsx). The owner: make it "less AI and more matching our
 * Storelib UI. Good, clean."
 *
 * What it was: three white cards of the same size stacked, the first a list
 * of five rows each with its own grey icon square and a chevron, the second
 * titled Recent purchases, the third a single row. Icons beside every
 * label, a card for each heading, and the word "purchases" written twice on
 * one screen. CLAUDE.md names most of that by name.
 *
 * What it is now, two surfaces and no icon squares:
 *
 *   YOUR LIBRARY   one card. Its heading carries the purchase count, so
 *                  that fact needs no row of its own; then the newest
 *                  purchases as covers, the way /library shows them; then,
 *                  under a hairline, the rest of what they have here
 *                  (courses, memberships, reviews, the wishlist) as plain
 *                  label and number rows that open the library page each
 *                  one is about. A fact about something they have never
 *                  had is not listed at all (lib/account/overview.ts).
 *
 *   SELLING        one row, on its own, because it is an action and not a
 *                  fact: Dashboard for a seller, Finish setting up your
 *                  store for an onboarding left half way, Become a seller
 *                  for everybody else, that one in the violet.
 *
 * The card is /app's card (white, rounded-2xl, a #e5e7eb hairline, a soft
 * shadow), so the profile and the rest of Storelib read as one product.
 */

import Link from "next/link"
import { ChevronRight, ShoppingBag } from "lucide-react"
import type { AccountOverviewData, OverviewFact, OverviewPurchase, SellingEntry } from "@/lib/account/overview"
import { optimizedImageUrl, isOptimizableImage } from "@/lib/images/optimized-url"
import { secondaryDepth } from "@/components/ui/depth-button"
import { FreshOnReturn } from "@/components/account/account-fresh"
import { cn } from "@/lib/utils"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e7eb]/60"
const CARD_TITLE = "text-[15px] font-semibold text-[#1a1a2e]"
const CHEVRON = "h-4 w-4 shrink-0 text-[#c4c8cf] transition-colors group-hover/row:text-[#1a1a2e]"

function Cover({ src }: { src: string | null }) {
  const url = src && isOptimizableImage(src) ? optimizedImageUrl(src, 320) : src
  return (
    <span className="relative block aspect-square w-full overflow-hidden rounded-xl border border-[#e5e7eb]/70 bg-[#f3f4f6]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <ShoppingBag aria-hidden="true" className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-[#c4c8cf]" strokeWidth={1.5} />
      )}
    </span>
  )
}

function PurchaseTile({ item }: { item: OverviewPurchase }) {
  return (
    <li className="min-w-0">
      <Link href={item.href} data-account-recent={item.productId} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25">
        <Cover src={item.thumbnailUrl} />
        <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-[1.35] text-[#1a1a2e] [overflow-wrap:anywhere]">{item.title}</p>
        <p className="mt-0.5 truncate text-[12px] leading-[1.4] text-[#6b7280]">{item.creatorName}</p>
      </Link>
    </li>
  )
}

/**
 * A fact, as a settings list writes one: the label, what is worth saying
 * about it, and its number on the right. No mark beside it. Five rows each
 * carrying its own icon was five icons explaining five words that already
 * explain themselves.
 */
function FactRow({ fact }: { fact: OverviewFact }) {
  return (
    <li>
      <Link href={fact.href} data-account-fact={fact.key} className="group/row flex min-h-[48px] items-center gap-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{fact.label}</span>
          {fact.detail ? <span className="mt-0.5 block truncate text-[13px] leading-[1.45] text-[#6b7280]">{fact.detail}</span> : null}
        </span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[#1a1a2e]" data-account-fact-value="">
          {fact.value}
        </span>
        <ChevronRight aria-hidden="true" className={CHEVRON} />
      </Link>
    </li>
  )
}

/** The way into selling: an action, so it sits on its own and not in the list of facts. */
function SellRow({ entry }: { entry: SellingEntry }) {
  /* Become a seller in the violet, as the header's account sheet draws it: noticed, not shouted. */
  const invite = entry.key === "become"
  return (
    <Link
      href={entry.href}
      data-account-row={entry.key === "dashboard" ? "dashboard" : "sell"}
      data-account-selling={entry.key}
      className={cn(CARD, "group/row flex min-h-[64px] items-center gap-3")}
    >
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14px] font-semibold leading-[1.4]", invite ? "text-[#6d28d9]" : "text-[#1a1a2e]")}>{entry.title}</span>
        <span className="mt-0.5 block text-[13px] leading-[1.45] text-[#6b7280]">{entry.detail}</span>
      </span>
      <ChevronRight aria-hidden="true" className={cn(CHEVRON, invite && "text-[#c4b5fd]")} />
    </Link>
  )
}

/**
 * `drawnAt` is when the server drew this copy (app/account/page.tsx); with
 * it, a copy the router kept is asked for again (components/account/
 * account-fresh.tsx), so selling is never an old answer.
 */
export function AccountOverview({ data, drawnAt }: { data: AccountOverviewData; drawnAt?: number }) {
  const { facts, recent, selling } = data
  /* Purchases is the card's own subject, so it is in the heading rather than a row of its own. */
  const purchases = facts.find((f) => f.key === "purchases")?.value ?? 0
  const rest = facts.filter((f) => f.key !== "purchases")

  return (
    <div className="space-y-4 sm:space-y-5" data-account-overview="">
      {drawnAt ? <FreshOnReturn drawnAt={drawnAt} /> : null}

      <section className={CARD} aria-labelledby="account-library" data-account-card="library">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="account-library" className={CARD_TITLE}>
              Your library
            </h2>
            <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]" data-account-purchases="">
              {purchases === 1 ? "1 purchase" : `${purchases} purchases`}
            </p>
          </div>
          {recent.length > 0 ? (
            <Link
              href="/library"
              className="-my-1 -mr-2 inline-flex h-10 shrink-0 items-center rounded-lg px-2 text-[13px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e]"
              data-account-see-all=""
            >
              Open library
            </Link>
          ) : null}
        </div>

        {recent.length > 0 ? (
          <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-[repeat(3,minmax(0,168px))] sm:gap-4">
            {recent.map((item) => (
              <PurchaseTile key={item.productId} item={item} />
            ))}
          </ul>
        ) : (
          <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between" data-account-recent-empty="">
            {/* The line whole, then the button under it: side by side at 360 it broke into three lines beside a button. */}
            <p className="text-[13px] leading-[1.45] text-[#6b7280]">What you buy on Storelib shows up here.</p>
            <Link href="/explore" className={cn(secondaryDepth, "h-10 shrink-0 rounded-xl px-4 text-[14px]")}>
              Browse Explore
            </Link>
          </div>
        )}

        {rest.length > 0 ? (
          <ul className="mt-4 divide-y divide-[#f0f1f3] border-t border-[#f0f1f3]">
            {rest.map((f) => (
              <FactRow key={f.key} fact={f} />
            ))}
          </ul>
        ) : null}
      </section>

      <SellRow entry={selling} />
    </div>
  )
}

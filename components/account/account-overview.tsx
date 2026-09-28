/**
 * ===========================================================================
 *  THE PROFILE'S OVERVIEW
 * ===========================================================================
 * /account under the person's photo and name (components/account/
 * account-hub.tsx): what they have on Storelib, the newest things they
 * bought, and selling. Nothing to type here; the photo and the name are
 * changed on Settings, which Edit profile opens.
 *
 *   YOUR LIBRARY      one row per fact (lib/account/overview.ts), each with
 *                     a small mark of what it is, its number on the right
 *                     the way a list of settings shows a value, and a way
 *                     into the library page it is about
 *   RECENT PURCHASES  the newest three as their covers, three across, the
 *                     way the library shows them; with none yet, a short
 *                     line and a way to Explore instead of an empty box
 *   SELLING           Dashboard for a seller, Finish setting up your store
 *                     for an onboarding left half way, Become a seller for
 *                     everybody else (sellingEntry, the one rule)
 *
 * The cards are the account's cards (/app Settings' white, hairline and
 * radius), so Overview and Settings read as one place.
 */

import Link from "next/link"
import { BadgeCheck, ChevronRight, GraduationCap, Heart, LayoutDashboard, ShoppingBag, Star, Store } from "lucide-react"
import type { AccountOverviewData, OverviewFact, OverviewPurchase, SellingEntry } from "@/lib/account/overview"
import { optimizedImageUrl, isOptimizableImage } from "@/lib/images/optimized-url"
import { secondaryDepth } from "@/components/ui/depth-button"
import { FreshOnReturn } from "@/components/account/account-fresh"
import { cn } from "@/lib/utils"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-sm border border-[#e5e7eb]"
const CARD_TITLE = "text-[15px] font-semibold text-[#1a1a2e]"
const CHEVRON = "h-4 w-4 shrink-0 text-[#9ca3af] transition-colors group-hover/row:text-[#1a1a2e]"
/** A fact's mark: one ink on one quiet square, so a list of five is not a row of colours. */
const MARK = "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"

const FACT_ICON: Record<OverviewFact["key"], typeof ShoppingBag> = {
  purchases: ShoppingBag,
  courses: GraduationCap,
  memberships: BadgeCheck,
  reviews: Star,
  wishlist: Heart,
}

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

function FactRow({ fact }: { fact: OverviewFact }) {
  const Icon = FACT_ICON[fact.key]
  return (
    <li>
      <Link href={fact.href} data-account-fact={fact.key} className="group/row flex min-h-[60px] items-center gap-3 py-2.5">
        <span aria-hidden="true" className={cn(MARK, "bg-[#f3f4f6] text-[#1a1a2e]")}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{fact.label}</p>
          {fact.detail ? <p className="mt-0.5 truncate text-[13px] leading-[1.45] text-[#6b7280]">{fact.detail}</p> : null}
        </div>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[#1a1a2e]" data-account-fact-value="">
          {fact.value}
        </span>
        <ChevronRight aria-hidden="true" className={CHEVRON} />
      </Link>
    </li>
  )
}

function SellRow({ entry }: { entry: SellingEntry }) {
  const Icon = entry.key === "dashboard" ? LayoutDashboard : Store
  /* Become a seller in the purple, as the header's account sheet draws it: noticed, not shouted. */
  const invite = entry.key === "become"
  return (
    <Link
      href={entry.href}
      data-account-row={entry.key === "dashboard" ? "dashboard" : "sell"}
      data-account-selling={entry.key}
      className="group/row flex min-h-[60px] items-center gap-3 py-2.5"
    >
      <span aria-hidden="true" className={cn(MARK, invite ? "bg-[#f5f3ff] text-[#7c3aed]" : "bg-[#f3f4f6] text-[#1a1a2e]")}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[14px] font-medium leading-[1.4]", invite ? "text-[#6d28d9]" : "text-[#1a1a2e]")}>{entry.title}</p>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">{entry.detail}</p>
      </div>
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
  return (
    <div className="space-y-4 sm:space-y-5" data-account-overview="">
      {drawnAt ? <FreshOnReturn drawnAt={drawnAt} /> : null}
      <section className={CARD} aria-labelledby="account-library" data-account-card="library">
        <h2 id="account-library" className={`${CARD_TITLE} mb-1`}>
          Your library
        </h2>
        <ul className="divide-y divide-[#f0f1f3]">
          {facts.map((f) => (
            <FactRow key={f.key} fact={f} />
          ))}
        </ul>
      </section>

      <section className={CARD} aria-labelledby="account-recent" data-account-card="recent">
        <div className="flex items-center justify-between gap-3">
          <h2 id="account-recent" className={CARD_TITLE}>
            Recent purchases
          </h2>
          {recent.length > 0 ? (
            <Link
              href="/library"
              className="-my-2 -mr-2 inline-flex h-10 items-center rounded-lg px-2 text-[13px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e]"
              data-account-see-all=""
            >
              See all
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
          <div className="flex flex-col items-center px-4 pb-2 pt-5 text-center" data-account-recent-empty="">
            <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f3f4f6] text-[#6b7280]">
              <ShoppingBag className="h-[22px] w-[22px]" strokeWidth={1.75} />
            </span>
            <p className="mt-3 text-[14px] font-medium text-[#1a1a2e]">Nothing bought yet</p>
            <p className="mt-1 max-w-[280px] text-[13px] leading-[1.45] text-[#6b7280]">What you buy on Storelib shows up here and in your library.</p>
            <Link href="/explore" className={cn(secondaryDepth, "mt-4 h-10 rounded-xl px-4 text-[14px]")}>
              Browse Explore
            </Link>
          </div>
        )}
      </section>

      <section className={CARD} aria-labelledby="account-selling" data-account-card="selling">
        <h2 id="account-selling" className="sr-only">
          Selling
        </h2>
        <div className="-my-1.5 sm:-my-1">
          <SellRow entry={selling} />
        </div>
      </section>
    </div>
  )
}

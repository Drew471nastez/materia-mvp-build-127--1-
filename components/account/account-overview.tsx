/**
 * ===========================================================================
 *  THE PROFILE'S OVERVIEW
 * ===========================================================================
 * /account under the person's photo and name (components/account/
 * account-hub.tsx): what they have on Storelib, each fact a way into the
 * place it is about, the newest things they bought, and selling. Nothing to
 * type here; the photo and the name are changed in Settings, which the
 * header's Edit profile opens.
 *
 * The cards are the account's cards (/app Settings' white, hairline and
 * radius), so Overview and Settings read as one place. The numbers are the
 * library's own (lib/account/overview.ts), each on the right of its row the
 * way a list of settings shows a value, not a wall of big figures.
 */

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { AccountOverviewData, OverviewPurchase } from "@/lib/account/overview"
import { optimizedImageUrl, isOptimizableImage } from "@/lib/images/optimized-url"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-sm border border-[#e5e7eb]"
const CARD_TITLE = "text-[15px] font-semibold text-[#1a1a2e]"
const CHEVRON = "h-4 w-4 shrink-0 text-[#9ca3af] transition-colors group-hover/row:text-[#1a1a2e]"

function Thumb({ src, title }: { src: string | null; title: string }) {
  const url = src && isOptimizableImage(src) ? optimizedImageUrl(src, 112) : src
  return (
    <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb]/70 bg-[#f3f4f6]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : null}
    </span>
  )
}

function boughtOn(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

function PurchaseRow({ item }: { item: OverviewPurchase }) {
  const on = boughtOn(item.purchasedAt)
  return (
    <li>
      <Link href={item.href} data-account-recent={item.productId} className="group/row flex min-h-[72px] items-center gap-3 py-3">
        <Thumb src={item.thumbnailUrl} title="" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{item.title}</p>
          <p className="mt-0.5 truncate text-[13px] leading-[1.45] text-[#6b7280]">
            {item.creatorName}
            {on ? ` · ${on}` : ""}
          </p>
        </div>
        <ChevronRight aria-hidden="true" className={CHEVRON} />
      </Link>
    </li>
  )
}

export function AccountOverview({ data }: { data: AccountOverviewData }) {
  const { facts, recent, seller } = data
  return (
    <div className="space-y-4 sm:space-y-5" data-account-overview="">
      <section className={CARD} aria-labelledby="account-library" data-account-card="library">
        <h2 id="account-library" className={`${CARD_TITLE} mb-1`}>
          Your library
        </h2>
        <ul className="divide-y divide-[#f0f1f3]">
          {facts.map((f) => (
            <li key={f.key}>
              <Link href={f.href} data-account-fact={f.key} className="group/row flex min-h-[56px] items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{f.label}</p>
                  {f.detail ? <p className="mt-0.5 truncate text-[13px] leading-[1.45] text-[#6b7280]">{f.detail}</p> : null}
                </div>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[#1a1a2e]" data-account-fact-value="">
                  {f.value}
                </span>
                <ChevronRight aria-hidden="true" className={CHEVRON} />
              </Link>
            </li>
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
          <ul className="mt-1 divide-y divide-[#f0f1f3]">
            {recent.map((item) => (
              <PurchaseRow key={item.productId} item={item} />
            ))}
          </ul>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-3" data-account-recent-empty="">
            <p className="text-[13px] leading-[1.45] text-[#6b7280]">What you buy on Storelib shows up here.</p>
            <Link
              href="/explore"
              className="inline-flex h-10 shrink-0 items-center rounded-xl bg-[#f3f4f6] px-4 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#e5e7eb]"
            >
              Explore
            </Link>
          </div>
        )}
      </section>

      <section className={CARD} aria-labelledby="account-selling" data-account-card="selling">
        <h2 id="account-selling" className="sr-only">
          Selling
        </h2>
        <div className="-my-2 sm:-my-1">
          {seller === "seller" ? (
            <SellRow href="/app" title="Dashboard" detail="Your store, products and sales." testId="dashboard" />
          ) : seller === "started" ? (
            /* /sell opens the onboarding again where it was left. */
            <SellRow href="/sell" title="Finish setting up your store" detail="Pick up seller setup where you left it." testId="sell" />
          ) : (
            /* /sell decides: seller onboarding for this account, which keeps
               everything bought and saved exactly as it is. */
            <SellRow href="/sell" title="Become a seller" detail="Sell your own products on Storelib with this account." testId="sell" />
          )}
        </div>
      </section>
    </div>
  )
}

function SellRow({ href, title, detail, testId }: { href: string; title: string; detail: string; testId: string }) {
  return (
    <Link href={href} data-account-row={testId} className="group/row flex min-h-[56px] items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{title}</p>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">{detail}</p>
      </div>
      <ChevronRight aria-hidden="true" className={CHEVRON} />
    </Link>
  )
}

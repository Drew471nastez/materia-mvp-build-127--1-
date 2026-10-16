"use client"

/**
 * ===========================================================================
 *  REVIEWS › OVERVIEW
 * ===========================================================================
 * What a store wants at a glance, every number counted by the database
 * (lib/reviews/dashboard-server.ts loadOverview), none made up:
 *
 *   the rating     the average the website's review sections show, the five
 *                  rows under it (each opens that rating in Reviews), and,
 *                  when it differs, the Storelib rating Explore and the
 *                  product page show (verified buyers only)
 *   the counts     waiting for approval (the one that asks for something),
 *                  published, hidden, request emails sent, and how many of
 *                  those led to a review
 *   lately         reviews in, replies, request emails and reminders out
 *
 * One card for the numbers, one list for what happened: no tiles.
 */
import Link from "next/link"
import { Stars } from "@/components/reviews/stars"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatNumber, formatPercent, formatRelative } from "@/lib/i18n/format"
import { recentActivity, responseRate, type ActivityItem } from "@/lib/reviews/dashboard"
import type { OverviewData, SellerProduct } from "@/lib/reviews/dashboard-server"
import { publicName } from "@/lib/reviews/app-settings"
import { buttonPrimary, card } from "@/app/app/orders/order-parts"
import { REVIEWS_BODY, reviewsHref } from "./reviews-nav"

export function ReviewsOverview({ data, products, app }: { data: OverviewData; products: SellerProduct[]; app: { enabled: boolean; ready: boolean } }) {
  const titles = new Map(products.map((p) => [p.id, p.title]))
  const list = reviewsHref("reviews")
  const w = data.website
  const most = Math.max(1, ...([1, 2, 3, 4, 5] as const).map((n) => w.stars[n]))
  const rate = data.requests ? responseRate(data.requests.sent, data.requests.reviewed) : null
  const showStorelib = data.storelib.count > 0 && (data.storelib.count !== w.count || Math.abs(data.storelib.average - w.average) >= 0.05)
  const activity = recentActivity(data.recentReviews, data.recentRequests, 8)
  const hidden = data.rejected + data.reported

  const rows: { label: string; value: string; href?: string; note?: string; strong?: boolean }[] = [
    { label: tt("Waiting for approval"), value: formatNumber(data.pending), href: data.pending ? `${list}?tab=pending` : undefined, strong: data.pending > 0 },
    { label: tt("Published"), value: formatNumber(w.count), href: `${list}?tab=published` },
    { label: tt("Hidden"), value: formatNumber(hidden), href: hidden ? `${list}?tab=${data.reported && !data.rejected ? "reported" : "rejected"}` : undefined },
    { label: tt("All reviews"), value: formatNumber(data.total), href: list },
    ...(data.requests
      ? [
          { label: tt("Request emails sent"), value: formatNumber(data.requests.sent), href: reviewsHref("requests"), note: data.requests.scheduled ? tt("{n} scheduled", { n: data.requests.scheduled }) : undefined },
          { label: tt("Response rate"), value: rate === null ? tt("No emails yet") : formatPercent(rate, 0), note: rate === null ? undefined : tt("{reviewed} reviews from {sent} emails", { reviewed: data.requests.reviewed, sent: data.requests.sent }) },
        ]
      : []),
  ]

  return (
    <div className={REVIEWS_BODY} data-reviews-overview="">
      {!app.enabled ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white px-4 py-3 text-[14px] text-[#4b5563] shadow-[0_0_0_1px_rgba(16,24,40,0.06)]" data-reviews-app-off="">
          <span className="min-w-0 flex-1">{tt("Storelib Reviews is off. Your website shows no reviews and buyers are not asked for one.")}</span>
          <Link href={reviewsHref("settings")} className={cn(buttonPrimary, "h-9 px-3.5 max-md:h-10")}>
            {tt("Turn on")}
          </Link>
        </div>
      ) : null}

      <section aria-label={tt("Rating")} className={cn(card, "mt-3 grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
        <div className="p-4 sm:p-6">
          <div className="flex items-end gap-4">
            <p className="text-[44px] font-bold leading-none text-[#1a1a2e]" data-overview-average={w.average}>
              {formatNumber(w.count ? w.average : 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </p>
            <div className="pb-1">
              <Stars rating={w.average} size={16} />
              <p className="mt-1 text-[13px] text-[#6b7280]">{tt("{count, plural, one {# review on your website} other {# reviews on your website}}", { count: w.count })}</p>
            </div>
          </div>
          {showStorelib ? (
            <p className="mt-2 text-[13px] text-[#6b7280]" data-overview-storelib="">
              {tt("Storelib rating {average} from {count, plural, one {# verified buyer} other {# verified buyers}}", { average: formatNumber(data.storelib.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), count: data.storelib.count })}
            </p>
          ) : null}
          <ul className="mt-5 space-y-1" aria-label={tt("Ratings")}>
            {([5, 4, 3, 2, 1] as const).map((n) => (
              <li key={n}>
                <Link
                  href={`${list}?tab=published&rating=${n}`}
                  className="-mx-2 grid h-8 grid-cols-[52px_minmax(0,1fr)_40px] items-center gap-3 rounded-lg px-2 text-[13px] text-[#4b5563] transition-colors hover:bg-[#f7f7f8]"
                  aria-label={tt("{n, plural, one {# star} other {# stars}}: {count}", { n, count: w.stars[n] })}
                >
                  <span className="tabular-nums">{tt("{n, plural, one {# star} other {# stars}}", { n })}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-[#f1f2f4]">
                    <span className="block h-full rounded-full bg-[#1a1a2e]" style={{ width: `${(w.stars[n] / most) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{formatNumber(w.stars[n])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <dl className="border-t border-[#f1f2f4] px-4 py-2 sm:px-6 md:border-l md:border-t-0 md:py-4">
          {rows.map((r) => (
            <div key={r.label} className="flex min-h-[48px] items-center justify-between gap-4 border-b border-[#f1f2f4] py-2 last:border-b-0">
              <dt className="min-w-0 text-[14px] text-[#4b5563]">
                {r.label}
                {r.note ? <span className="block text-[12.5px] text-[#9ca3af]">{r.note}</span> : null}
              </dt>
              <dd className={cn("shrink-0 text-[15px] font-semibold tabular-nums", r.strong ? "text-[#8b5cf6]" : "text-[#1a1a2e]")}>
                {r.href ? (
                  <Link href={r.href} className="-mx-1.5 rounded-md px-1.5 py-1 hover:bg-[#f4f5f7]">
                    {r.value}
                  </Link>
                ) : (
                  r.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {data.pending > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f3f0ff] px-4 py-3 sm:px-5" data-overview-waiting="">
          <p className="text-[14px] text-[#3b2a7a]">{tt("{n, plural, one {# review is waiting for you to approve it.} other {# reviews are waiting for you to approve them.}}", { n: data.pending })}</p>
          <Link href={`${list}?tab=pending`} className={cn(buttonPrimary, "h-9 px-3.5 max-md:h-10")}>
            {tt("Review them")}
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="reviews-latest" className={cn(card, "mt-3 overflow-hidden")}>
        <h2 id="reviews-latest" className="border-b border-[#f1f2f4] px-4 py-3 text-[15px] font-semibold text-[#1a1a2e] sm:px-6">
          {tt("Lately")}
        </h2>
        {activity.length ? (
          <ul className="divide-y divide-[#f1f2f4]">
            {activity.map((a) => (
              <ActivityRow key={`${a.kind}:${a.id}:${a.at}`} item={a} product={a.productId ? titles.get(a.productId) ?? "" : ""} />
            ))}
          </ul>
        ) : (
          <div className="px-4 py-10 text-center sm:px-6">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Nothing yet")}</p>
            <p className="mx-auto mt-1 max-w-[420px] text-[14px] text-[#6b7280]">
              {app.enabled ? tt("New reviews and request emails show here as they happen. Have reviews from another app? Bring them in from a CSV.") : tt("Turn Storelib Reviews on and buyers are asked for a review by email after they buy.")}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {app.enabled ? (
                <Link href="/app/reviews/import" className={cn(buttonPrimary, "h-9 px-3.5 max-md:h-10")}>
                  {tt("Import reviews")}
                </Link>
              ) : (
                <Link href={reviewsHref("settings")} className={cn(buttonPrimary, "h-9 px-3.5 max-md:h-10")}>
                  {tt("Turn on")}
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function ActivityRow({ item, product }: { item: ActivityItem; product: string }) {
  const who = publicName(item.name) ?? (item.kind === "review" || item.kind === "reply" ? tt("A customer") : tt("a buyer"))
  const what = product || tt("a product")
  const text =
    item.kind === "review"
      ? tt("{name} left {n, plural, one {# star} other {# stars}} on {product}", { name: who, n: item.rating ?? 0, product: what })
      : item.kind === "reply"
        ? tt("You replied to {name} on {product}", { name: who, product: what })
        : item.kind === "request"
          ? tt("Asked {name} to review {product}", { name: who, product: what })
          : tt("Reminded {name} about {product}", { name: who, product: what })
  const href = item.kind === "review" || item.kind === "reply" ? `${reviewsHref("reviews")}?review=${item.id}` : reviewsHref("requests")
  return (
    <li>
      <Link href={href} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#fafafb] sm:px-6" data-activity={item.kind}>
        <span className="min-w-0 flex-1 text-[14px] text-[#1a1a2e] [overflow-wrap:anywhere]">
          {text}
          {item.kind === "review" && item.bucket === "pending" ? <span className="ml-2 text-[13px] font-medium text-[#8b5cf6]">{tt("Waiting")}</span> : null}
        </span>
        <time suppressHydrationWarning dateTime={item.at} className="shrink-0 text-[13px] text-[#9ca3af]">
          {formatRelative(item.at)}
        </time>
      </Link>
    </li>
  )
}

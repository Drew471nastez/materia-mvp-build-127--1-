"use client"

/**
 * STORELIB REVIEWS › OVERVIEW. What a store looks at first: the average of
 * what its website shows and how it spreads, how many reviews there are and
 * what waits for it, how many review emails went and how many became a
 * review, and the latest reviews. Every number is a count from the server
 * (lib/reviews/manage-server reviewsOverview), the same counts the Reviews
 * tabs show, so the two never disagree.
 */
import * as React from "react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { Stars } from "@/components/reviews/stars"
import { StatusBadge, buttonSecondary } from "@/app/(storelib)/app/orders/order-parts"
import type { RequestFunnel, ReviewTab, ReviewsSummary } from "@/lib/reviews/manage"
import type { ManageView } from "./views"
import { CARD, CARD_HEAD, Distribution, Figure, H3, MUTED, Placeholder, ReadFailed, formatCount, shortDate, useRead } from "./parts"

interface Overview {
  summary: ReviewsSummary
  funnel: RequestFunnel
  recent: { id: string; rating: number; title: string | null; excerpt: string; name: string | null; created_at: string; status: "published" | "pending" | "hidden"; verified: boolean; product: string | null }[]
  ready: boolean
  app: { enabled: boolean; ready: boolean }
}

export function OverviewView({ onGo }: { onGo: (view: ManageView, opts?: { status?: ReviewTab }) => void }) {
  const { data, error, reload } = useRead<Overview>("/api/app/reviews/overview")
  if (error && !data) return <ReadFailed error={error} onRetry={reload} />
  if (!data) {
    return (
      <div className="space-y-4" aria-label={tt("Loading")}>
        <Placeholder className="h-[188px]" />
        <Placeholder className="h-[260px]" />
      </div>
    )
  }
  const s = data.summary
  const f = data.funnel
  return (
    <div className="space-y-4 sm:space-y-5" data-reviews-overview="">
      {!data.app.enabled ? (
        <div className={cn(CARD, "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5")} data-reviews-app-off="">
          <p className="text-[14px] leading-[20px] text-[#374151]">{tt("Storelib Reviews is off. Buyers can still review on Storelib, but your website doesn't show reviews and nobody is asked by email.")}</p>
          <button type="button" onClick={() => onGo("settings")} className={cn(buttonSecondary, "h-9 shrink-0 px-3.5 text-[14px]")}>
            {tt("Turn it on")}
          </button>
        </div>
      ) : null}

      <section className={cn(CARD, "grid gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]")} aria-label={tt("Summary")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="shrink-0">
            <p className="text-[40px] font-bold leading-none tabular-nums tracking-[-0.02em] text-[#1a1a2e]" data-reviews-average="">
              {s.average.toFixed(1)}
            </p>
            <div className="mt-2">
              <Stars rating={s.average} size={16} />
            </div>
            <p className="mt-1.5 text-[13px] text-[#6b7280]">{tt("{count, plural, one {# review on your website} other {# reviews on your website}}", { count: s.published })}</p>
          </div>
          <div className="min-w-0 flex-1">
            <Distribution rows={s.distribution} total={s.published} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <Figure label={tt("All reviews")} value={formatCount(s.total)} />
          <Figure label={tt("Published")} value={formatCount(s.published)} sub={s.published ? tt("{n} from verified buyers", { n: formatCount(s.verifiedPublished) }) : undefined} />
          <button type="button" onClick={() => onGo("reviews", { status: "pending" })} className="min-w-0 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-overview-pending="">
            <Figure label={tt("Waiting for approval")} value={<span className={s.pending ? "text-[#92400e]" : undefined}>{formatCount(s.pending)}</span>} sub={s.pending ? tt("Review them") : undefined} />
          </button>
          <Figure label={tt("Requests sent")} value={formatCount(f.sent)} sub={f.scheduled ? tt("{n} scheduled", { n: formatCount(f.scheduled) }) : undefined} />
          <Figure label={tt("Response rate")} value={f.sent ? `${f.responseRate}%` : "–"} sub={f.sent ? tt("{n} became a review", { n: formatCount(f.submitted) }) : tt("No requests yet")} />
          <Figure label={tt("Without a reply")} value={formatCount(s.unanswered)} />
        </div>
      </section>

      <section className={cn(CARD, "overflow-hidden")} aria-labelledby="reviews-recent">
        <div className={CARD_HEAD}>
          <h3 id="reviews-recent" className={H3}>
            {tt("Recent reviews")}
          </h3>
          <button type="button" onClick={() => onGo("reviews")} className="inline-flex items-center gap-1 text-[13.5px] font-medium text-[#1a1a2e] hover:underline">
            {tt("See all")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {data.recent.length ? (
          <ul className="divide-y divide-[#f1f2f4]">
            {data.recent.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#6b7280]">
                    <Stars rating={r.rating} size={13} />
                    <span className="font-medium text-[#1a1a2e]">{r.name || (r.verified ? tt("Verified buyer") : tt("Customer"))}</span>
                    {r.product ? <span className="truncate">{tt("on {title}", { title: r.product })}</span> : null}
                    {r.status === "pending" ? <StatusBadge tone="attention">{tt("Waiting")}</StatusBadge> : r.status === "hidden" ? <StatusBadge tone="neutral">{tt("Hidden")}</StatusBadge> : null}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[14px] leading-[20px] text-[#374151] [overflow-wrap:anywhere]">{r.title ? <span className="font-semibold text-[#1a1a2e]">{r.title} </span> : null}{r.excerpt}</p>
                </div>
                <span className="shrink-0 pt-0.5 text-[12px] tabular-nums text-[#9ca3af]">{shortDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("No reviews yet")}</p>
            <p className={cn(MUTED, "mx-auto mt-1 max-w-[380px]")}>{tt("Buyers are asked by email after they buy. You can also import reviews from another app under Reviews.")}</p>
          </div>
        )}
      </section>

      <p className={cn(MUTED, "px-1")} data-reviews-trust="">
        {tt("Only verified buyers count toward your Storelib rating and get the Verified purchase label. Imported and visitor reviews can show on your website, but never count there.")}
      </p>
    </div>
  )
}

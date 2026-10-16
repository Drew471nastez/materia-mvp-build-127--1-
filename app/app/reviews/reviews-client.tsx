"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Loader2, Play, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { Stars } from "@/components/reviews/stars"
import { REVIEWS_BODY, reviewsHref } from "@/components/app/reviews/reviews-nav"
import { sellerView } from "@/lib/reviews/app-settings"
import { MAX_REPLY_CHARS, REPORT_REASONS, RATING_WORDS, reviewerOf, type ReportReason } from "@/lib/reviews/rules"
import { BULK_ACTIONS, MAX_BULK, PAGE_SIZE, applyChange, bucketOf, filtersToQuery, optimisticRow, planModeration, type BulkAction, type ModerationAction, type ReviewFilters, type ReviewTab } from "@/lib/reviews/dashboard"
import { RowMenuButton, StatusBadge, buttonPrimary, buttonSecondary, card } from "../orders/order-parts"
import { Pill, Tick, usePill } from "../coupons/coupon-parts"
import type { SellerProduct, SellerReview } from "./load-reviews"
import type { ReviewList } from "@/lib/reviews/dashboard-server"
import { tt } from "@/lib/i18n/text"
import { appLocale, formatNumber, zoned } from "@/lib/i18n/format"

/**
 * ===========================================================================
 *  REVIEWS › REVIEWS
 * ===========================================================================
 * Every review of everything the store sells, one page at a time, filtered
 * in the database (lib/reviews/dashboard-server.ts listReviews):
 *
 *   tabs       All, Pending, Published, Rejected, Reported (while there are
 *              any), No reply, each with its count under the same filters
 *   filters    words (in the review, its title, the name, the product),
 *              rating, product, verified or not, with photos or a video
 *   the page   kept in the address (?tab=pending&rating=1&page=2), so a
 *              link, a refresh and Back land on the same list
 *
 * WHAT A STORE CAN DO, as on Judge.me, Shopify and the App Store:
 *
 *   approve, reject, publish, unpublish, feature: one review from its menu
 *            or many from the bar a selection raises. lib/reviews/dashboard
 *            planModeration says what each does; here it is drawn at once
 *            (optimistic) and put back as it was if the server says no.
 *   reply    once, in public, under the review on the product page and the
 *            website; the reply can be changed or taken down
 *   media    each photo and the video hidden (kept, restorable), shown
 *            again, or removed for good. A video waits for the store before
 *            the website ever shows it.
 *   report   a review that is abusive, spam, not about the product, not
 *            from a real buyer or that shares private details. It is hidden
 *            at once and Storelib decides; the store cannot bring it back
 *            or delete it, so reporting is not a way to lose bad reviews.
 *
 * A store never edits a buyer's words. A verified buyer's review is hidden
 * or approved on the store's own website only: it stays on Storelib and in
 * its ratings, and it cannot be deleted (report it instead). A visitor's or
 * an imported review is the store's own, hidden everywhere and deletable.
 * "Verified purchase" is said only of a review tied to a real order.
 *
 * `?review=<id>` (the bell, the new review email) shows that one review
 * first, tinted for a moment, above the list.
 */

const shortDate = (iso?: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: "numeric" }))
}

const TAB = (selected: boolean) =>
  cn(
    "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:text-[13px]",
    selected ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
  )

const SELECT =
  "h-10 w-full cursor-pointer appearance-none truncate md:h-8 md:w-auto md:max-w-[200px] rounded-lg border border-[#e3e4e8] bg-white py-0 pl-3 pr-8 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:text-[13px]"

const SETTINGS_HREF = reviewsHref("settings")

type Row = SellerReview

const TAB_LABEL: Record<ReviewTab, () => string> = {
  all: () => tt("All"),
  pending: () => tt("Pending"),
  published: () => tt("Published"),
  rejected: () => tt("Rejected"),
  reported: () => tt("Reported"),
  unanswered: () => tt("No reply"),
}

const BULK_LABEL: Record<BulkAction, () => string> = {
  approve: () => tt("Approve"),
  reject: () => tt("Reject"),
  publish: () => tt("Publish"),
  unpublish: () => tt("Unpublish"),
  feature: () => tt("Feature"),
  unfeature: () => tt("Stop featuring"),
  delete: () => tt("Delete"),
}

export function ReviewsClient({
  initialList,
  initialFilters,
  products,
  app = { enabled: false, ready: false, requestsOn: false },
  focus = null,
}: {
  initialList: ReviewList
  initialFilters: ReviewFilters
  products: SellerProduct[]
  app?: { enabled: boolean; ready: boolean; requestsOn: boolean }
  focus?: Row | null
}) {
  const router = useRouter()
  const [filters, setFilters] = useState(initialFilters)
  const [list, setList] = useState(initialList)
  const [rows, setRows] = useState<Row[]>(initialList.rows)
  const [focused, setFocused] = useState<Row | null>(focus)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [replying, setReplying] = useState<string | null>(null)
  const [reporting, setReporting] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState<Row[] | null>(null)
  const [removingMedia, setRemovingMedia] = useState<{ review: Row; path: string; video: boolean } | null>(null)
  const [search, setSearch] = useState(initialFilters.q)
  const [notice, say] = usePill()
  const ask = useRef(0)
  const ready = list.ready.replies
  const moderation = app.ready

  const byProduct = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  /* Read a page of the list again: the filters it is asked with, the address kept the same, an older answer never drawn over a newer one. */
  const load = useCallback(async (next: ReviewFilters, opts: { quiet?: boolean } = {}) => {
    const n = ++ask.current
    if (!opts.quiet) setLoading(true)
    const q = filtersToQuery(next)
    try {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${q}`)
    } catch {
      /* A frame that will not let the address change: the list still loads. */
    }
    const res = await fetch(`/api/app/reviews${q}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null)
    const data = (res?.ok ? await res.json().catch(() => null) : null) as ReviewList | null
    if (n !== ask.current) return
    setLoading(false)
    if (!data) return say(tt("The list did not load. Check your connection and try again."), "error")
    setList(data)
    setRows(data.rows)
    setSelected((s) => new Set([...s].filter((id) => data.rows.some((r) => r.id === id))))
    if (data.page !== next.page) setFilters((f) => ({ ...f, page: data.page }))
  }, [say])

  const change = (patch: Partial<ReviewFilters>) => {
    const next = { ...filters, ...patch, page: patch.page ?? 1 }
    setFilters(next)
    setSelected(new Set())
    void load(next)
  }

  /* The search box asks once typing stops. */
  useEffect(() => {
    if (search === filters.q) return
    const t = window.setTimeout(() => change({ q: search.trim() }), 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  /* After a change the counts and the list are read again, once the presses stop. */
  const settle = useRef<number | null>(null)
  const refreshSoon = () => {
    if (settle.current) window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      void load(filters, { quiet: true })
      router.refresh()
    }, 600)
  }

  /* From the bell or an email: the one review, tinted for a moment. */
  const focusRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = focusRef.current
    if (!el) return
    el.scrollIntoView({ block: "center" })
    el.animate?.([{ backgroundColor: "#eceef1" }, { backgroundColor: "rgba(236,238,241,0)" }], { duration: 1600, delay: 300, easing: "ease-out", fill: "backwards" })
  }, [])

  const patchRow = (id: string, fn: (r: Row) => Row) => {
    setRows((prev) => prev.map((r) => (r.id === id ? fn(r) : r)))
    setFocused((f) => (f && f.id === id ? fn(f) : f))
  }
  const rowById = (id: string) => rows.find((r) => r.id === id) ?? (focused?.id === id ? focused : null)

  const saveReply = async (review: Row, text: string): Promise<boolean> => {
    const before = review
    patchRow(review.id, (r) => ({ ...r, seller_reply: text, seller_reply_at: new Date().toISOString() }))
    setReplying(null)
    const res = await fetch(`/api/reviews/${review.id}/reply`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      patchRow(review.id, () => before)
      setReplying(review.id)
      say(data.error || tt("The reply did not save."), "error")
      return false
    }
    patchRow(review.id, (r) => ({ ...r, seller_reply: data.review?.seller_reply ?? text, seller_reply_at: data.review?.seller_reply_at ?? r.seller_reply_at }))
    say(before.seller_reply ? tt("Reply updated") : tt("Reply posted"))
    refreshSoon()
    return true
  }

  const removeReply = async (review: Row) => {
    const before = review
    patchRow(review.id, (r) => ({ ...r, seller_reply: null, seller_reply_at: null }))
    const res = await fetch(`/api/reviews/${review.id}/reply`, { method: "DELETE" }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      patchRow(review.id, () => before)
      return say(data.error || tt("The reply was not removed."), "error")
    }
    say(tt("Reply removed"))
    refreshSoon()
  }

  const report = async (review: Row, reason: ReportReason, note: string): Promise<boolean> => {
    const res = await fetch(`/api/reviews/${review.id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, note }) }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      say(data.error || tt("The report did not save."), "error")
      return false
    }
    patchRow(review.id, (r) => ({ ...r, status: "hidden", hidden_by: "report", on_storelib: false, site_status: r.site_status }))
    say(tt("Reported. The review is hidden while Storelib looks at it."))
    refreshSoon()
    return true
  }

  /* One review: drawn as it will be at once, put back if the server says no. */
  const moderate = async (review: Row, action: ModerationAction, photo?: string) => {
    const plan = planModeration(review, action, { photo })
    if (plan.kind === "refuse") return say(plan.error, "error")
    if (plan.kind === "noop") return
    const before = review
    patchRow(review.id, (r) => mergeMedia(applyChange(r, plan.change) as Row, r))
    const res = await fetch(`/api/app/reviews/${review.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, photo }) }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      patchRow(review.id, () => before)
      return say(data.error || tt("That did not save."), "error")
    }
    const r = data.review ?? {}
    patchRow(review.id, (row) => mergeMedia({ ...row, ...sellerView(r), site_status: r.site_status ?? row.site_status, featured: r.featured === true, ...(Array.isArray(r.photos) ? { photos: r.photos } : {}) }, row))
    say(MODERATED[action](review))
    refreshSoon()
  }

  const removeOne = async (review: Row): Promise<boolean> => {
    const res = await fetch(`/api/app/reviews/${review.id}`, { method: "DELETE" }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      say(data.error || tt("That did not delete."), "error")
      return false
    }
    setRows((prev) => prev.filter((r) => r.id !== review.id))
    if (focused?.id === review.id) setFocused(null)
    say(tt("Review deleted"))
    refreshSoon()
    return true
  }

  /* Many: each row drawn as the action leaves it, the rows the server left alone put back, then the counts read again. */
  const bulk = async (action: BulkAction, ids: string[] = [...selected]): Promise<boolean> => {
    if (!ids.length) return false
    const before = new Map(ids.map((id) => [id, rowById(id)]).filter((e): e is [string, Row] => !!e[1]))
    if (action === "delete") setRows((prev) => prev.filter((r) => !ids.includes(r.id) || !planDeletes(r)))
    else for (const [id, row] of before) {
      const next = optimisticRow(row, action)
      if (next) patchRow(id, () => mergeMedia(next, row))
    }
    const res = await fetch("/api/app/reviews/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action }) }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      setRows((prev) => {
        const kept = new Set(prev.map((r) => r.id))
        const restored = prev.map((r) => before.get(r.id) ?? r)
        return [...restored, ...[...before.values()].filter((r) => !kept.has(r.id))].sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
      })
      say(data.error || tt("That did not save."), "error")
      return false
    }
    const changed = (data.changed?.length ?? 0) + (data.deleted?.length ?? 0)
    const left = data.skipped?.length ?? 0
    setSelected(new Set())
    say(
      left
        ? tt("{done, plural, one {# review} other {# reviews}} changed, {left} left as they were", { done: changed, left })
        : tt("{done, plural, one {# review} other {# reviews}} changed", { done: changed }),
    )
    void load(filters, { quiet: true })
    router.refresh()
    return true
  }

  const visible = rows
  const allOnPage = visible.length > 0 && visible.every((r) => selected.has(r.id))
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(visible.map((r) => r.id).slice(0, MAX_BULK)))
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else if (n.size < MAX_BULK) n.add(id)
      return n
    })
  const chosen = visible.filter((r) => selected.has(r.id))
  const offered = BULK_ACTIONS.filter((a) => chosen.some((r) => (a === "delete" ? planDeletes(r) : planModeration(r, a).kind === "change")))

  const tabs = (["all", "pending", "published", "rejected", "reported", "unanswered"] as ReviewTab[]).filter((t) => t !== "reported" || list.counts.reported > 0 || filters.tab === "reported")
  const filtered = !!(filters.q || filters.rating || filters.product || filters.verified || filters.media)
  const nothingAtAll = list.counts.all === 0 && !filtered

  const rowProps = (review: Row) => ({
    review,
    product: byProduct.get(review.product_id) ?? null,
    ready,
    moderation,
    selected: selected.has(review.id),
    onSelect: () => toggle(review.id),
    replying: replying === review.id,
    onReply: () => setReplying(review.id),
    onCancelReply: () => setReplying(null),
    onSaveReply: (text: string) => saveReply(review, text),
    onRemoveReply: () => removeReply(review),
    onReport: () => setReporting(review),
    onModerate: (action: ModerationAction, photo?: string) => moderate(review, action, photo),
    onRemoveMedia: (path: string, video: boolean) => setRemovingMedia({ review, path, video }),
    onDelete: () => setDeleting([review]),
  })

  return (
    <div className={REVIEWS_BODY} data-reviews-list="">
      <Pill notice={notice} />

      {!ready ? (
        <p className="mt-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]">{tt("Replies and reports turn on after the database update (run-now part 52).")}</p>
      ) : !app.enabled ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-3.5 py-2.5 text-[13px] text-[#4b5563] shadow-[0_0_0_1px_rgba(16,24,40,0.06)]" data-reviews-app-off="">
          <span>{tt("Show these reviews on your website and ask buyers for one by email with Storelib Reviews.")}</span>
          <Link href={SETTINGS_HREF} className="font-medium text-[#1a1a2e] underline underline-offset-4">
            {tt("Turn it on")}
          </Link>
        </p>
      ) : null}

      {focused ? (
        <section aria-label={tt("The review you opened")} className={cn(card, "mt-3 overflow-hidden")} data-reviews-focus="">
          <div className="flex items-center justify-between gap-2 border-b border-[#eef0f2] px-4 py-2 md:px-5">
            <p className="text-[13px] font-medium text-[#6b7280]">{tt("The review you opened")}</p>
            <button type="button" onClick={() => setFocused(null)} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-[#4b5563] hover:bg-[#f4f5f7]">
              <X className="h-4 w-4" aria-hidden />
              {tt("Close")}
            </button>
          </div>
          <div ref={focusRef}>
            <ReviewRow {...rowProps(focused)} selectable={false} />
          </div>
        </section>
      ) : null}

      <section aria-label={tt("Reviews")} className={cn(card, "mt-3 overflow-hidden")}>
        <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-[#eef0f2] px-2 py-1.5 md:min-h-12">
          <div role="tablist" aria-label={tt("Filter reviews")} className="orders-strip -my-2 flex min-w-0 flex-1 basis-full items-center gap-0.5 overflow-x-auto py-2 lg:basis-auto">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={filters.tab === t} onClick={() => change({ tab: t })} className={TAB(filters.tab === t)} data-reviews-tab={t}>
                {TAB_LABEL[t]()}
                <span className={cn("tabular-nums", t === "pending" && list.counts.pending > 0 ? "text-[#8b5cf6]" : "text-[#9ca3af]")}>{formatNumber(list.counts[t])}</span>
              </button>
            ))}
          </div>
          {app.ready ? (
            <Link href="/app/reviews/import" className={cn(buttonSecondary, "mr-1 max-lg:hidden")} data-reviews-import="">
              {tt("Import")}
            </Link>
          ) : null}
        </div>

        <div className="grid gap-2 border-b border-[#eef0f2] px-3 py-2.5 md:flex md:flex-wrap md:items-center md:px-3">
          <label className="relative block md:w-[260px]">
            <span className="sr-only">{tt("Search reviews")}</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tt("Search words, names, products")}
              className="h-10 w-full rounded-lg border border-[#e3e4e8] bg-white pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] md:h-8 md:text-[13px]"
              data-reviews-search=""
            />
          </label>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
            <Select label={tt("Rating")} value={String(filters.rating)} onChange={(v) => change({ rating: Number(v) })} data="rating">
              <option value="0">{tt("Any rating")}</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {tt("{n, plural, one {# star} other {# stars}}", { n })}
                </option>
              ))}
            </Select>
            {products.length > 1 ? (
              <Select label={tt("Product")} value={filters.product} onChange={(v) => change({ product: v })} data="product">
                <option value="">{tt("All products")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select label={tt("Purchase")} value={filters.verified} onChange={(v) => change({ verified: v as ReviewFilters["verified"] })} data="verified">
              <option value="">{tt("Verified or not")}</option>
              <option value="yes">{tt("Verified buyers")}</option>
              <option value="no">{tt("Not verified")}</option>
            </Select>
            <Select label={tt("Photos and video")} value={filters.media} onChange={(v) => change({ media: v as ReviewFilters["media"] })} data="media">
              <option value="">{tt("With or without photos")}</option>
              <option value="yes">{tt("With photos or video")}</option>
            </Select>
          </div>
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setSearch("")
                change({ q: "", rating: 0, product: "", verified: "", media: "" })
              }}
              className="h-10 rounded-lg px-2 text-left text-[13px] font-medium text-[#4b5563] underline-offset-4 hover:underline md:h-8"
            >
              {tt("Clear filters")}
            </button>
          ) : null}
        </div>

        {visible.length > 0 ? (
          <>
            {moderation ? (
              <div className="flex min-h-11 items-center gap-3 border-b border-[#f1f2f4] px-4 py-1.5 md:px-5" data-reviews-select-all="">
                <button type="button" onClick={toggleAll} className="-ml-1 flex h-9 items-center gap-2.5 rounded-lg px-1 text-[13px] font-medium text-[#4b5563]" aria-pressed={allOnPage}>
                  <Tick on={allOnPage} />
                  {selected.size ? tt("{n} selected", { n: selected.size }) : tt("Select all on this page")}
                </button>
              </div>
            ) : null}
            <div className={cn("divide-y divide-[#f1f2f4] transition-opacity duration-150", loading && "opacity-55")} aria-busy={loading}>
              {visible.map((review) => (
                <ReviewRow key={review.id} {...rowProps(review)} selectable={moderation} />
              ))}
            </div>
            <Pager list={list} loading={loading} onPage={(page) => change({ page })} />
          </>
        ) : (
          <EmptyList tab={filters.tab} filtered={filtered} nothing={nothingAtAll} app={app} loading={loading} onClear={() => {
            setSearch("")
            change({ tab: "all", q: "", rating: 0, product: "", verified: "", media: "" })
          }} />
        )}
      </section>

      {selected.size > 0 ? (
        <div className="pointer-events-none sticky bottom-[calc(var(--app-nav-room,0px)+12px)] z-20 mt-3 flex justify-center" data-reviews-bulk="">
          <div className="pointer-events-auto flex w-full flex-wrap items-center gap-1 rounded-2xl bg-[#111113] p-1.5 pl-3.5 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_12px_32px_-8px_rgba(0,0,0,0.45)] md:w-auto md:flex-nowrap">
            <span className="flex-1 pr-1 text-[13px] font-medium tabular-nums max-md:basis-[calc(100%-48px)] md:flex-none">{tt("{n} selected", { n: selected.size })}</span>
            {offered.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => (a === "delete" ? setDeleting(chosen.filter(planDeletes)) : void bulk(a))}
                className={cn("h-10 shrink-0 rounded-xl px-3 text-[14px] font-medium transition-colors max-md:order-2 md:h-9 md:text-[13px]", a === "delete" ? "text-[#ffb4a8] hover:bg-white/10" : "hover:bg-white/10")}
                data-bulk-action={a}
              >
                {BULK_LABEL[a]()}
              </button>
            ))}
            {offered.length === 0 ? <span className="shrink-0 px-2 text-[13px] text-white/60 max-md:order-2">{tt("Nothing to change for these")}</span> : null}
            <button type="button" onClick={() => setSelected(new Set())} aria-label={tt("Clear selection")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-white/10 max-md:order-1 md:h-9 md:w-9">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {reporting ? <ReportDialog review={reporting} onClose={() => setReporting(null)} onReport={(reason, note) => report(reporting, reason, note)} /> : null}
      {deleting ? (
        <DeleteDialog
          reviews={deleting}
          onClose={() => setDeleting(null)}
          onDelete={() => (deleting.length === 1 && !selected.has(deleting[0].id) ? removeOne(deleting[0]) : bulk("delete", deleting.map((r) => r.id)))}
        />
      ) : null}
      {removingMedia ? (
        <ConfirmDialog
          title={removingMedia.video ? tt("Remove this video for good?") : tt("Remove this photo for good?")}
          body={tt("It is deleted from the review and can't be brought back. To take it off your website and keep it, hide it instead.")}
          action={tt("Remove")}
          onClose={() => setRemovingMedia(null)}
          onConfirm={async () => {
            await moderate(removingMedia.review, "delete_photo", removingMedia.path)
            return true
          }}
        />
      ) : null}
    </div>
  )
}

/** A photo's signed address survives a change the server answers without one (a review's list reads them again after). */
function mergeMedia(next: Row, before: Row): Row {
  const views = new Map(before.photos.map((p) => [p.path, p.view]))
  return { ...next, photos: next.photos.map((p) => ({ ...p, view: p.view ?? views.get(p.path) })) }
}

const planDeletes = (r: Row) => planModeration(r, "delete").kind === "change"

const MODERATED: Record<ModerationAction, (r: Row) => string> = {
  approve: () => tt("Approved"),
  reject: () => tt("Rejected"),
  publish: () => tt("Published"),
  unpublish: (r) => (r.verified ? tt("Hidden on your website") : tt("Hidden from your store")),
  hide: (r) => (r.verified ? tt("Hidden on your website") : tt("Hidden from your store")),
  feature: () => tt("Featured"),
  unfeature: () => tt("No longer featured"),
  remove_photo: () => tt("Hidden from the review"),
  restore_photo: () => tt("Shown with the review"),
  delete_photo: () => tt("Removed"),
}

function Select({ label, value, onChange, children, data }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; data: string }) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT} data-reviews-filter={data}>
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  )
}

function Pager({ list, loading, onPage }: { list: ReviewList; loading: boolean; onPage: (page: number) => void }) {
  if (list.pages <= 1) return null
  const first = (list.page - 1) * PAGE_SIZE + 1
  const last = Math.min(list.total, list.page * PAGE_SIZE)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[#eef0f2] px-4 py-2.5 md:px-5" data-reviews-pager="">
      <p className="text-[13px] tabular-nums text-[#6b7280]">{tt("{first} to {last} of {total}", { first: formatNumber(first), last: formatNumber(last), total: formatNumber(list.total) })}</p>
      <div className="flex gap-2">
        <button type="button" disabled={loading || list.page <= 1} onClick={() => onPage(list.page - 1)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")}>
          {tt("Previous")}
        </button>
        <button type="button" disabled={loading || list.page >= list.pages} onClick={() => onPage(list.page + 1)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")}>
          {tt("Next")}
        </button>
      </div>
    </div>
  )
}

function EmptyList({ tab, filtered, nothing, app, loading, onClear }: { tab: ReviewTab; filtered: boolean; nothing: boolean; app: { enabled: boolean; ready: boolean; requestsOn: boolean }; loading: boolean; onClear: () => void }) {
  const title = nothing ? tt("No reviews yet") : filtered ? tt("No reviews match") : tab === "pending" ? tt("Nothing waiting") : tab === "unanswered" ? tt("Every review has a reply") : tt("No reviews here")
  const body = nothing
    ? app.enabled
      ? app.requestsOn
        ? tt("Buyers are asked by email after they buy, on the schedule in Requests. Reviews you already have elsewhere can come in from a CSV.")
        : tt("Request emails are off, so buyers are not asked. Turn them on in Requests, or bring in reviews from a CSV.")
      : tt("Buyers review from their receipt or their library. Turn on Storelib Reviews to ask them by email and show reviews on your website.")
    : filtered
      ? tt("Try other words, or clear the filters.")
      : tab === "pending"
        ? tt("New reviews that need your approval show here.")
        : tab === "rejected"
          ? tt("Reviews you reject or unpublish wait here, in case you change your mind.")
          : tt("Try another tab.")
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", loading && "opacity-55")} data-reviews-empty={tab}>
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <p className="mt-1 max-w-[420px] text-[14px] text-[#6b7280] md:text-[13px]">{body}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {filtered ? (
          <button type="button" onClick={onClear} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")}>
            {tt("Clear filters")}
          </button>
        ) : nothing && app.enabled ? (
          <>
            {app.ready ? (
              <Link href="/app/reviews/import" className={cn(buttonPrimary, "max-md:h-10 max-md:px-4")}>
                {tt("Import reviews")}
              </Link>
            ) : null}
            <Link href={reviewsHref("requests")} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")}>
              {tt("Request emails")}
            </Link>
          </>
        ) : nothing ? (
          <Link href={SETTINGS_HREF} className={cn(buttonPrimary, "max-md:h-10 max-md:px-4")}>
            {tt("Turn it on")}
          </Link>
        ) : null}
      </div>
    </div>
  )
}

const SOURCE_WORD: Record<string, string> = { get import() { return tt("Imported") }, get site() { return tt("From your website") }, get request() { return tt("From a review email") }, get website() { return tt("From your website") } }

function ReviewRow({
  review,
  product,
  ready,
  moderation,
  selectable,
  selected,
  onSelect,
  replying,
  onReply,
  onCancelReply,
  onSaveReply,
  onRemoveReply,
  onReport,
  onModerate,
  onRemoveMedia,
  onDelete,
}: {
  review: Row
  product: SellerProduct | null
  ready: boolean
  moderation: boolean
  selectable: boolean
  selected: boolean
  onSelect: () => void
  replying: boolean
  onReply: () => void
  onCancelReply: () => void
  onSaveReply: (text: string) => Promise<boolean>
  onRemoveReply: () => void
  onReport: () => void
  onModerate: (action: ModerationAction, photo?: string) => void
  onRemoveMedia: (path: string, video: boolean) => void
  onDelete: () => void
}) {
  const { name, avatarUrl, avatarName } = reviewerOf(review)
  const bucket = bucketOf(review)
  const hidden = review.status === "hidden"
  const pending = review.status === "pending"
  const reported = bucket === "reported"
  const live = review.status === "published"
  /* A verified buyer's review the store hid or has not approved on its website is still on Storelib: it can be answered and reported there, never deleted. */
  const keptOnStorelib = review.verified && review.on_storelib && !live
  const open = !hidden || keptOnStorelib
  const canReport = ready && open && review.source !== "import"
  /* "Verified purchase" only for a review tied to a real order. */
  const purchase = review.verified && !!review.order_id
  const items = [
    ...(moderation && pending ? [{ label: review.verified ? tt("Approve for your website") : tt("Approve"), onClick: () => onModerate("approve") }] : []),
    ...(moderation && pending ? [{ label: tt("Reject"), onClick: () => onModerate("reject") }] : []),
    ...(moderation && hidden && !reported ? [{ label: review.verified ? tt("Show on your website") : tt("Publish"), onClick: () => onModerate("publish") }] : []),
    ...(moderation && live ? [{ label: review.verified ? tt("Hide on your website") : tt("Unpublish"), onClick: () => onModerate("unpublish") }] : []),
    ...(moderation && live ? [{ label: review.featured ? tt("Stop featuring") : tt("Feature"), onClick: () => onModerate(review.featured ? "unfeature" : "feature") }] : []),
    ...(ready && open ? [{ label: review.seller_reply ? tt("Edit reply") : tt("Reply"), onClick: onReply, separatorBefore: moderation }] : []),
    ...(ready && review.seller_reply ? [{ label: tt("Remove reply"), onClick: onRemoveReply }] : []),
    ...(product?.slug && review.on_storelib ? [{ label: tt("View on product page"), href: `/p/${product.slug}#reviews`, target: "_blank" as const, separatorBefore: true }] : []),
    ...(purchase ? [{ label: tt("View order"), href: `/app/orders/${review.order_id}`, separatorBefore: !(product?.slug && review.on_storelib) }] : []),
    ...(canReport ? [{ label: tt("Report review"), variant: "destructive" as const, separatorBefore: true, onClick: onReport }] : []),
    ...(moderation && !reported && !review.verified ? [{ label: tt("Delete"), variant: "destructive" as const, separatorBefore: !canReport, onClick: onDelete }] : []),
  ]
  const media = review.photos ?? []

  return (
    <article data-review-row={review.id} data-review-status={review.status} data-review-bucket={bucket} className={cn("px-4 py-4 md:px-5", (hidden || pending) && "bg-[#fafbfb]", selected && "bg-[#f6f5ff]")}>
      <div className="flex items-start gap-3">
        {selectable ? (
          <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={tt("Select the review by {name}", { name })} className="-ml-1.5 -mt-0.5 flex h-10 w-8 shrink-0 items-center justify-center md:h-9" data-review-select="">
            <Tick on={selected} />
          </button>
        ) : null}
        <AppAvatar src={avatarUrl} name={avatarName} alt="" size={36} markWhileLoading />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="truncate text-[14px] font-semibold text-[#1a1a2e]">{name}</span>
                {pending ? <StatusBadge tone="attention">{keptOnStorelib ? tt("Waiting for approval on your website") : tt("Waiting for approval")}</StatusBadge> : null}
                {hidden ? <StatusBadge tone={reported ? "attention" : "neutral"}>{reported ? tt("Hidden, reported") : keptOnStorelib ? tt("Hidden on your website") : tt("Rejected")}</StatusBadge> : null}
                {review.featured && live ? <StatusBadge tone="success">{tt("Featured")}</StatusBadge> : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[#6b7280]">
                <Stars rating={review.rating} size={14} />
                <span className="text-[#4b5563] max-sm:hidden">{RATING_WORDS[review.rating] ? tt(RATING_WORDS[review.rating]) : ""}</span>
                <span aria-hidden className="max-sm:hidden">·</span>
                <span>
                  {shortDate(review.created_at)}
                  {review.edited_at ? tt(" · Edited") : ""}
                </span>
                <span aria-hidden className="max-sm:hidden">·</span>
                <span className={cn("max-sm:basis-full", purchase && "font-medium text-[#067647]")} data-review-verified={purchase ? "yes" : "no"}>
                  {purchase ? (
                    <>
                      <Check className="-mt-0.5 mr-1 inline h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      {tt("Verified purchase")}
                    </>
                  ) : review.verified ? (
                    tt("Verified buyer")
                  ) : (
                    SOURCE_WORD[review.source] ?? tt("Not verified")
                  )}
                </span>
              </p>
            </div>
            {items.length ? (
              <ResponsiveActionMenu title={tt("Review by {name}", { name })} align="end" trigger={<RowMenuButton label={tt("Actions for the review by {name}", { name })} className="-mr-1.5 -mt-1 h-9 w-9 max-md:h-11 max-md:w-11 max-md:rounded-xl" />} items={items} />
            ) : null}
          </div>

          {product ? (
            <p className="mt-2 flex min-w-0 items-center gap-2 text-[13px] text-[#6b7280]">
              {product.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.thumbnail_url} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
              ) : null}
              <span className="truncate">{product.title}</span>
            </p>
          ) : null}
          {review.title ? <p className="mt-2 text-[14px] font-semibold text-[#1a1a2e] [overflow-wrap:anywhere]">{review.title}</p> : null}
          <p className={cn(review.title ? "mt-1" : "mt-2", "whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]")}>{review.content}</p>

          {media.length ? (
            <div className="mt-3 flex flex-wrap gap-2" data-review-photos="">
              {media.map((m) => (
                <MediaTile key={m.path} item={m} moderation={moderation} onModerate={onModerate} onRemove={() => onRemoveMedia(m.path, m.kind === "video")} />
              ))}
            </div>
          ) : null}

          {pending && moderation ? (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => onModerate("approve")} className={cn(buttonPrimary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")} data-review-publish="">
                {tt("Approve")}
              </button>
              <button type="button" onClick={() => onModerate("reject")} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")} data-review-reject="">
                {tt("Reject")}
              </button>
            </div>
          ) : replying ? (
            <ReplyEditor initial={review.seller_reply ?? ""} onCancel={onCancelReply} onSave={onSaveReply} />
          ) : review.seller_reply ? (
            <div className="mt-3 rounded-xl bg-[#f6f7f9] px-3.5 py-3">
              <p className="text-[12px] font-semibold text-[#1a1a2e]">
                {tt("Your reply")} <span className="font-normal text-[#6b7280]">· {shortDate(review.seller_reply_at)} · {tt("Shown under the review")}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{review.seller_reply}</p>
            </div>
          ) : ready && open ? (
            <button type="button" onClick={onReply} className={cn(buttonSecondary, "mt-3 max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
              {tt("Reply")}
            </button>
          ) : null}

          {reported ? <p className="mt-2 text-[13px] text-[#6b7280]">{tt("Not on your product page or in its rating while Storelib looks at your report.")}</p> : null}
          {hidden && !reported && keptOnStorelib ? (
            <p className="mt-2 text-[13px] text-[#6b7280]" data-review-kept="">
              {tt("Hidden on your website. Still shown on Storelib because it's from a verified buyer.")}
            </p>
          ) : null}
          {hidden && !reported && !keptOnStorelib ? <p className="mt-2 text-[13px] text-[#6b7280]">{tt("Not on your store or in its rating. Publish it to show it again.")}</p> : null}
          {pending && keptOnStorelib ? (
            <p className="mt-2 text-[13px] text-[#6b7280]" data-review-kept="">
              {tt("Not on your website until you publish it. Already shown on Storelib because it's from a verified buyer.")}
            </p>
          ) : null}
          {pending && !keptOnStorelib ? <p className="mt-2 text-[13px] text-[#6b7280]">{tt("Not on your store until you publish it.")}</p> : null}
        </div>
      </div>
    </article>
  )
}

/** One photo or the video: what it is now (shown, hidden, waiting), and the store's three choices. */
function MediaTile({ item, moderation, onModerate, onRemove }: { item: Row["photos"][number]; moderation: boolean; onModerate: (action: ModerationAction, photo?: string) => void; onRemove: () => void }) {
  const video = item.kind === "video"
  const off = item.status === "removed"
  const held = item.status === "held"
  const src = item.view ?? item.url
  const items = [
    ...(off || held ? [{ label: video ? tt("Show the video") : tt("Show the photo"), onClick: () => onModerate("restore_photo", item.path) }] : []),
    ...(!off ? [{ label: video ? tt("Hide the video") : tt("Hide the photo"), onClick: () => onModerate("remove_photo", item.path) }] : []),
    { label: tt("Open full size"), href: src, target: "_blank" as const },
    { label: tt("Remove for good"), variant: "destructive" as const, separatorBefore: true, onClick: onRemove },
  ]
  const tile = (
    <span className={cn("relative block h-16 w-16 overflow-hidden rounded-lg bg-[#f1f2f4] md:h-[72px] md:w-[72px]", video && "w-24 md:w-28")}>
      {video ? (
        <>
          <video src={src} muted playsInline preload="metadata" className={cn("h-full w-full object-cover", off && "opacity-35 grayscale")} />
          <span aria-hidden className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
              <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
            </span>
          </span>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className={cn("h-full w-full object-cover", off && "opacity-35 grayscale")} />
      )}
      {off || held ? (
        <span className="absolute inset-x-1 bottom-1 truncate rounded-md bg-white/90 px-1 py-0.5 text-center text-[11px] font-medium text-[#1a1a2e]">{off ? tt("Hidden") : tt("Waiting")}</span>
      ) : null}
    </span>
  )
  if (!moderation) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {tile}
      </a>
    )
  }
  return <ResponsiveActionMenu title={video ? tt("Video") : tt("Photo")} align="start" trigger={<button type="button" aria-label={video ? tt("Video options") : tt("Photo options")} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30" data-review-media={item.status}>{tile}</button>} items={items} />
}

function ConfirmDialog({ title, body, action, onClose, onConfirm }: { title: string; body: string; action: string; onClose: () => void; onConfirm: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative w-full rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5">
        <h3 id="confirm-title" className="text-[17px] font-semibold text-[#1a1a2e]">
          {title}
        </h3>
        <p className="mt-1 text-[14px] text-[#6b7280]">{body}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const ok = await onConfirm()
              setBusy(false)
              if (ok) onClose()
            }}
            className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#c4290c] text-[15px] font-medium text-white transition-colors hover:bg-[#a82309] disabled:cursor-default disabled:opacity-50 sm:h-10 sm:text-[14px]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : action}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteDialog({ reviews, onClose, onDelete }: { reviews: Row[]; onClose: () => void; onDelete: () => Promise<boolean> }) {
  const { name } = reviewerOf(reviews[0])
  return (
    <ConfirmDialog
      title={reviews.length === 1 ? tt("Delete the review by {name}?", { name }) : tt("Delete {n} reviews?", { n: reviews.length })}
      body={tt("It is gone for good, with its photos. To take it off your store and keep it, hide it instead.")}
      action={tt("Delete")}
      onClose={onClose}
      onConfirm={onDelete}
    />
  )
}

function ReplyEditor({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  const trimmed = text.trim()
  return (
    <div className="mt-3">
      <label className="sr-only" htmlFor="review-reply">
        {tt("Your reply")}
      </label>
      <textarea
        id="review-reply"
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_REPLY_CHARS))}
        rows={3}
        placeholder={tt("Thank them, or say what you changed. Everyone who reads the review sees this.")}
        className="block min-h-[88px] w-full resize-y rounded-xl border border-[#e3e4e8] bg-white px-3.5 py-2.5 text-[16px] leading-relaxed text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] md:text-[14px]"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[12px] tabular-nums text-[#9ca3af]">
          {text.length} / {MAX_REPLY_CHARS}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            disabled={saving || trimmed.length < 2}
            onClick={async () => {
              setSaving(true)
              const ok = await onSave(trimmed)
              if (!ok) setSaving(false)
            }}
            className={cn(buttonPrimary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {initial ? tt("Save reply") : tt("Post reply")}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReportDialog({ review, onClose, onReport }: { review: Row; onClose: () => void; onReport: (reason: ReportReason, note: string) => Promise<boolean> }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const { name } = reviewerOf(review)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5">
        <h3 id="report-title" className="text-[17px] font-semibold text-[#1a1a2e]">
          {tt("Report the review by {name}", { name })}
        </h3>
        <p className="mt-1 text-[14px] text-[#6b7280]">{tt("It is hidden from your product page and its rating now. Storelib reads it and either brings it back or keeps it hidden.")}</p>
        <fieldset className="mt-4">
          <legend className="sr-only">{tt("Reason")}</legend>
          <div className="space-y-1">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[14px] text-[#1a1a2e] transition-colors duration-100",
                  reason === r.id ? "bg-[#f1f2f4]" : "hover:bg-[#f7f7f8]",
                )}
              >
                <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="sr-only" />
                <span aria-hidden className={cn("flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border", reason === r.id ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#c4c9d2] bg-white")}>
                  {reason === r.id ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
                </span>
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="report-note" className="mt-3 block text-[13px] font-medium text-[#4b5563]">
          {tt("Anything Storelib should know")} <span className="font-normal text-[#9ca3af]">{tt("(optional)")}</span>
        </label>
        <textarea
          id="report-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={2}
          className="mt-1 block w-full resize-none rounded-xl border border-[#e3e4e8] px-3.5 py-2.5 text-[16px] text-[#1a1a2e] outline-none focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] md:text-[14px]"
        />
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            disabled={!reason || busy}
            onClick={async () => {
              if (!reason) return
              setBusy(true)
              const ok = await onReport(reason, note.trim())
              setBusy(false)
              if (ok) onClose()
            }}
            className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#c4290c] text-[15px] font-medium text-white transition-colors hover:bg-[#a82309] disabled:cursor-default disabled:opacity-50 sm:h-10 sm:text-[14px]"
          >
            {busy ? tt("Reporting") : tt("Report and hide")}
          </button>
        </div>
      </div>
    </div>
  )
}

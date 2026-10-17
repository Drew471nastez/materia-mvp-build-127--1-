"use client"

/**
 * ===========================================================================
 *  STORELIB REVIEWS › REVIEWS
 * ===========================================================================
 * Every review of everything the store sells, a page at a time from the
 * server (GET /api/app/reviews): the tabs say where each stands on the
 * store's website and how many, the toolbar searches and filters, and the
 * counts follow the filters.
 *
 * WHAT A STORE CAN DO, as on Judge.me, Etsy and the App Store:
 *
 *   publish / hide   one, or several at once. A verified buyer's review is
 *                    hidden or approved on the store's own website only: it
 *                    stays on Storelib and in its rating, and it cannot be
 *                    deleted (report it instead). A visitor's or an imported
 *                    review is the store's own: hidden everywhere, deletable.
 *   feature          first in Featured order and in the reviews carousel
 *   photos           each one off the website or back, one at a time
 *   reply            once, in public, under the review on the product page
 *                    and the website's review sections; changed or removed
 *   report           abusive, spam, not about the product: hidden at once,
 *                    and Storelib decides. Not a way to lose bad reviews.
 *   import           a CSV from another app, mapped, previewed, then imported
 *
 * A change shows at once and is put back if the server says no (the pill
 * says why). A seller never edits a buyer's words.
 */
import * as React from "react"
import { Check, Loader2, Search, SlidersHorizontal, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { api } from "@/components/physical/ui"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { Stars } from "@/components/reviews/stars"
import { sellerView } from "@/lib/reviews/app-settings"
import { MAX_REPLY_CHARS, REPORT_REASONS, RATING_WORDS, reviewerOf, type ReportReason } from "@/lib/reviews/rules"
import { listQueryString, type BulkAction, type ManagedReview, type Moderation, type ReviewListAnswer, type ReviewListQuery, type ReviewTab } from "@/lib/reviews/manage"
import { Checkbox, RowMenuButton, StatusBadge, buttonPrimary, buttonSecondary } from "@/app/app/orders/order-parts"
import { Pill, usePill } from "@/app/app/coupons/coupon-parts"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range"
import { appTimeZone } from "@/lib/i18n/format"
import { CARD, MUTED, Placeholder, SEG, Sheet, ToolbarSelect, formatCount, shortDate, useRead } from "./parts"
import { ImportDialog } from "./import-dialog"

const TAB_LABEL: Record<ReviewTab, () => string> = {
  all: () => tt("All"),
  published: () => tt("Published"),
  pending: () => tt("Pending"),
  hidden: () => tt("Hidden"),
  reported: () => tt("Reported"),
  unanswered: () => tt("No reply"),
}

const BLANK: ReviewListQuery = { tab: "all", q: "", rating: 0, product: "", verified: "any", source: "any", media: false, from: "", to: "", sort: "newest", page: 1, id: "" }

const SOURCE_WORD: Record<string, () => string> = { import: () => tt("Imported"), site: () => tt("From your website"), website: () => tt("From your website"), request: () => tt("From a review email") }

/** What a store's action will show, before the server answers. The server's answer replaces it (sellerView). */
function predicted(r: ManagedReview, action: Moderation, photo?: string): Partial<ManagedReview> {
  switch (action) {
    case "publish":
      return { status: "published", hidden_by: null, on_storelib: true }
    case "hide":
      return { status: "hidden", hidden_by: "seller", on_storelib: r.verified }
    case "feature":
      return { featured: true }
    case "unfeature":
      return { featured: false }
    case "remove_photo":
    case "restore_photo":
      return { photos: r.photos.map((p) => (p.path === photo ? { ...p, status: action === "remove_photo" ? "removed" : "approved" } : p)) }
  }
}

function fromServer(r: Record<string, unknown>, before: ManagedReview): Partial<ManagedReview> {
  return {
    ...sellerView(r),
    featured: r.featured === true,
    ...(Array.isArray(r.photos) ? { photos: (r.photos as ManagedReview["photos"]).map((p) => ({ ...p, url: before.photos.find((b) => b.path === p.path)?.url ?? p.url })) } : {}),
  }
}

export function ReviewsView({ initialTab = "all", highlight = null }: { initialTab?: ReviewTab; highlight?: string | null }) {
  const [query, setQuery] = React.useState<ReviewListQuery>(() => ({ ...BLANK, tab: highlight ? "all" : initialTab, id: highlight ?? "" }))
  const [typed, setTyped] = React.useState("")
  const today = React.useMemo(() => todayIn(appTimeZone(), Date.now()), [])
  const [period, setPeriod] = React.useState<RangeValue>(() => resolveValue({ preset: "all_time" }, today))
  const [showFilters, setShowFilters] = React.useState(false)
  const { data, error, loading, set } = useRead<ReviewListAnswer>(`/api/app/reviews?${listQueryString(query)}`)
  /* The product filter's list, once, beside the first page. */
  const products = useRead<{ products: { id: string; title: string }[] }>("/api/app/reviews?only=products").data?.products ?? null
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [replying, setReplying] = React.useState<string | null>(null)
  const [reporting, setReporting] = React.useState<ManagedReview | null>(null)
  const [deleting, setDeleting] = React.useState<ManagedReview | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [notice, say] = usePill()

  /* The search waits for a pause in typing. */
  React.useEffect(() => {
    const t = window.setTimeout(() => setQuery((q) => (q.q === typed.trim() ? q : { ...q, q: typed.trim(), page: 1, id: "" })), 300)
    return () => window.clearTimeout(t)
  }, [typed])

  const change = (patch: Partial<ReviewListQuery>) => {
    setSelected(new Set())
    setQuery((q) => ({ ...q, page: 1, id: "", ...patch }))
  }

  const rows = data?.rows ?? []
  const counts = data?.counts
  const patchRow = (id: string, p: Partial<ManagedReview>) => set((d) => (d ? { ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) } : d))
  const restore = (before: ManagedReview[]) => set((d) => (d ? { ...d, rows: d.rows.map((r) => before.find((b) => b.id === r.id) ?? r) } : d))

  const moderate = async (review: ManagedReview, action: Moderation, photo?: string) => {
    patchRow(review.id, predicted(review, action, photo))
    const r = await api<{ review: Record<string, unknown> }>(`/api/app/reviews/${review.id}`, { method: "PATCH", body: { action, photo } })
    if (!r.ok) {
      restore([review])
      return say(r.error || tt("That did not save."), "error")
    }
    patchRow(review.id, fromServer(r.data.review ?? {}, review))
    say(
      action === "publish" ? (review.verified ? tt("Shown on your website") : tt("Published")) : action === "hide" ? (review.verified ? tt("Hidden on your website") : tt("Hidden from your store")) : action === "feature" ? tt("Featured") : action === "unfeature" ? tt("No longer featured") : action === "remove_photo" ? tt("Photo hidden") : tt("Photo shown"),
    )
  }

  const bulk = async (action: BulkAction) => {
    const ids = [...selected]
    const before = rows.filter((r) => selected.has(r.id))
    for (const r of before) patchRow(r.id, predicted(r, action))
    setBulkBusy(true)
    const res = await api<{ done: { id: string; review: Record<string, unknown> }[]; skipped: { id: string; error: string }[] }>("/api/app/reviews/bulk", { method: "POST", body: { action, ids } })
    setBulkBusy(false)
    if (!res.ok) {
      restore(before)
      return say(res.error || tt("That did not save."), "error")
    }
    for (const d of res.data.done) {
      const b = before.find((x) => x.id === d.id)
      if (b) patchRow(d.id, fromServer(d.review, b))
    }
    const skipped = res.data.skipped ?? []
    restore(before.filter((b) => skipped.some((s) => s.id === b.id)))
    setSelected(new Set())
    say(skipped.length ? tt("{done} changed, {skipped} left as they were: {why}", { done: res.data.done.length, skipped: skipped.length, why: skipped[0].error }) : tt("{n, plural, one {# review changed} other {# reviews changed}}", { n: res.data.done.length }), skipped.length ? "error" : "ok")
  }

  const saveReply = async (review: ManagedReview, text: string): Promise<boolean> => {
    const was = { seller_reply: review.seller_reply, seller_reply_at: review.seller_reply_at }
    patchRow(review.id, { seller_reply: text, seller_reply_at: new Date().toISOString() })
    setReplying(null)
    const r = await api<{ review?: { seller_reply?: string; seller_reply_at?: string } }>(`/api/reviews/${review.id}/reply`, { method: "PUT", body: { text } })
    if (!r.ok) {
      patchRow(review.id, was)
      setReplying(review.id)
      say(r.error || tt("The reply did not save."), "error")
      return false
    }
    patchRow(review.id, { seller_reply: r.data.review?.seller_reply ?? text, seller_reply_at: r.data.review?.seller_reply_at ?? new Date().toISOString() })
    say(was.seller_reply ? tt("Reply updated") : tt("Reply posted"))
    return true
  }

  const removeReply = async (review: ManagedReview) => {
    const was = { seller_reply: review.seller_reply, seller_reply_at: review.seller_reply_at }
    patchRow(review.id, { seller_reply: null, seller_reply_at: null })
    const r = await api(`/api/reviews/${review.id}/reply`, { method: "DELETE" })
    if (!r.ok) {
      patchRow(review.id, was)
      return say(r.error || tt("The reply was not removed."), "error")
    }
    say(tt("Reply removed"))
  }

  const report = async (review: ManagedReview, reason: ReportReason, note: string): Promise<boolean> => {
    const r = await api(`/api/reviews/${review.id}/report`, { method: "POST", body: { reason, note } })
    if (!r.ok) {
      say(r.error || tt("The report did not save."), "error")
      return false
    }
    patchRow(review.id, { status: "hidden", hidden_by: "report", on_storelib: false })
    say(tt("Reported. The review is hidden while Storelib looks at it."))
    return true
  }

  const remove = async (review: ManagedReview): Promise<boolean> => {
    const r = await api(`/api/app/reviews/${review.id}`, { method: "DELETE" })
    if (!r.ok) {
      say(r.error || tt("That did not delete."), "error")
      return false
    }
    set((d) => (d ? { ...d, rows: d.rows.filter((x) => x.id !== review.id), total: Math.max(0, d.total - 1) } : d))
    say(tt("Review deleted"))
    return true
  }

  const pageIds = rows.map((r) => r.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someOnPage = pageIds.some((id) => selected.has(id))
  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 25
  const firstShown = total ? (query.page - 1) * pageSize + 1 : 0
  const lastShown = Math.min(total, query.page * pageSize)
  const filtered = !!(query.q || query.rating || query.product || query.verified !== "any" || query.source !== "any" || query.media || query.from || query.to)
  const chosen = rows.filter((r) => selected.has(r.id))
  const anyReported = chosen.some((r) => r.status === "hidden" && r.hidden_by !== "seller")

  return (
    <div className="space-y-3" data-reviews-list-view="">
      <Pill notice={notice} />

      {data && !data.ready ? <p className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]">{tt("Status tabs, filters and moderation turn on after the database update (SQL part 134).")}</p> : null}

      <section aria-label={tt("Reviews")} className={cn(CARD, "overflow-hidden")}>
        <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-[#eef0f2] px-2 py-1.5">
          <div role="tablist" aria-label={tt("Filter reviews")} className="-my-2 flex min-w-0 flex-1 basis-full items-center gap-0.5 overflow-x-auto py-2 [scrollbar-width:none] md:basis-auto [&::-webkit-scrollbar]:hidden">
            {(["all", "published", "pending", "hidden", "reported", "unanswered"] as ReviewTab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={query.tab === t} onClick={() => change({ tab: t })} className={SEG(query.tab === t)} data-reviews-tab={t}>
                {TAB_LABEL[t]()}
                <span className={cn("tabular-nums", t === "pending" && (counts?.pending ?? 0) > 0 ? "text-[#92400e]" : "text-[#9ca3af]")}>{counts ? formatCount(counts[t]) : ""}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setImporting(true)} className={cn(buttonSecondary, "mx-1 max-md:hidden")} data-reviews-import="">
            <Upload className="h-3.5 w-3.5" aria-hidden />
            {tt("Import")}
          </button>
        </div>

        <div className="space-y-2 border-b border-[#eef0f2] px-3 py-2.5">
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{tt("Search reviews")}</span>
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                type="search"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={tt("Search words, names or products")}
                className="h-10 w-full rounded-lg border border-[#e3e4e8] bg-white pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] md:h-8 md:text-[13px]"
                data-reviews-search=""
              />
            </label>
            <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className={cn(buttonSecondary, "max-md:h-10 max-md:px-3 md:hidden", filtered && "border-[#1a1a2e]")}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              <span className="sr-only md:not-sr-only">{tt("Filters")}</span>
            </button>
            <button type="button" onClick={() => setImporting(true)} className={cn(buttonSecondary, "h-10 px-3 md:hidden")} aria-label={tt("Import")}>
              <Upload className="h-4 w-4" aria-hidden />
            </button>
            <ToolbarSelect label={tt("Sort")} value={query.sort} onChange={(v) => change({ sort: v as ReviewListQuery["sort"] })} className="hidden md:block">
              <option value="newest">{tt("Newest first")}</option>
              <option value="oldest">{tt("Oldest first")}</option>
              <option value="highest">{tt("Highest rating")}</option>
              <option value="lowest">{tt("Lowest rating")}</option>
            </ToolbarSelect>
          </div>
          <div className={cn("flex-wrap gap-2", showFilters ? "flex" : "hidden md:flex")} data-reviews-filters="">
            <ToolbarSelect label={tt("Rating")} value={String(query.rating)} onChange={(v) => change({ rating: Number(v) })} data-reviews-stars="">
              <option value="0">{tt("Any rating")}</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {tt("{n, plural, one {# star} other {# stars}}", { n })}
                </option>
              ))}
            </ToolbarSelect>
            {products && products.length > 1 ? (
              <ToolbarSelect label={tt("Product")} value={query.product} onChange={(v) => change({ product: v })}>
                <option value="">{tt("All products")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </ToolbarSelect>
            ) : null}
            <ToolbarSelect label={tt("Who wrote it")} value={query.source === "import" ? "import" : query.verified} onChange={(v) => change(v === "import" ? { source: "import", verified: "any" } : { source: "any", verified: v as ReviewListQuery["verified"] })}>
              <option value="any">{tt("Everyone")}</option>
              <option value="yes">{tt("Verified buyers")}</option>
              <option value="no">{tt("Not verified")}</option>
              <option value="import">{tt("Imported")}</option>
            </ToolbarSelect>
            <button type="button" aria-pressed={query.media} onClick={() => change({ media: !query.media })} className={cn(buttonSecondary, "max-md:h-10 max-md:flex-1 max-md:text-[14px]", query.media && "border-[#1a1a2e] bg-[#f4f5f7]")} data-reviews-media="">
              {query.media ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
              {tt("With photos")}
            </button>
            <DateRangePicker
              value={period}
              today={today}
              onChange={(v) => {
                setPeriod(v)
                change(v.preset === "all_time" ? { from: "", to: "" } : { from: v.start, to: v.end })
              }}
              className="max-md:h-10 max-md:flex-1"
            />
            <ToolbarSelect label={tt("Sort")} value={query.sort} onChange={(v) => change({ sort: v as ReviewListQuery["sort"] })} className="md:hidden">
              <option value="newest">{tt("Newest first")}</option>
              <option value="oldest">{tt("Oldest first")}</option>
              <option value="highest">{tt("Highest rating")}</option>
              <option value="lowest">{tt("Lowest rating")}</option>
            </ToolbarSelect>
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setTyped("")
                  setPeriod(resolveValue({ preset: "all_time" }, today))
                  change({ q: "", rating: 0, product: "", verified: "any", source: "any", media: false, from: "", to: "" })
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-[#4b5563] hover:bg-[#f1f2f4]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                {tt("Clear filters")}
              </button>
            ) : null}
          </div>
        </div>

        {query.id ? (
          <div className="flex items-center justify-between gap-2 border-b border-[#eef0f2] bg-[#fafbfb] px-4 py-2 text-[13px] text-[#4b5563]">
            <span>{tt("Showing one review")}</span>
            <button type="button" onClick={() => change({ id: "" })} className="font-medium text-[#1a1a2e] underline underline-offset-4">
              {tt("Show all reviews")}
            </button>
          </div>
        ) : null}

        {someOnPage ? (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[#eef0f2] bg-white/95 px-4 py-2 backdrop-blur" data-reviews-bulk="">
            <span className="mr-1 text-[13px] font-medium text-[#1a1a2e]">{tt("{n} selected", { n: selected.size })}</span>
            <button type="button" disabled={bulkBusy || anyReported} onClick={() => void bulk("publish")} className={buttonPrimary} data-bulk="publish">
              {tt("Publish")}
            </button>
            <button type="button" disabled={bulkBusy} onClick={() => void bulk("hide")} className={buttonSecondary} data-bulk="hide">
              {tt("Hide")}
            </button>
            <button type="button" disabled={bulkBusy} onClick={() => void bulk("feature")} className={buttonSecondary}>
              {tt("Feature")}
            </button>
            <button type="button" disabled={bulkBusy} onClick={() => void bulk("unfeature")} className={buttonSecondary}>
              {tt("Stop featuring")}
            </button>
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" aria-hidden /> : null}
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[13px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
              {tt("Clear")}
            </button>
            {chosen.some((r) => r.verified) ? <p className="basis-full text-[12px] text-[#6b7280]">{tt("Verified buyers' reviews are hidden on your website only. They stay on Storelib.")}</p> : null}
          </div>
        ) : null}

        {error && !data ? (
          <p className="m-4 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">{error}</p>
        ) : !data ? (
          <div className="space-y-3 p-4" aria-label={tt("Loading")}>
            <Placeholder className="h-24" />
            <Placeholder className="h-24" />
            <Placeholder className="h-24" />
          </div>
        ) : rows.length ? (
          <>
            <div className="flex items-center gap-3 border-b border-[#f1f2f4] px-4 py-2 md:px-5">
              <Checkbox checked={allOnPage} indeterminate={someOnPage && !allOnPage} onChange={(on) => setSelected(on ? new Set(pageIds) : new Set())} label={tt("Select every review on this page")} />
              <span className="text-[12.5px] text-[#6b7280]">{tt("{first} to {last} of {total}", { first: formatCount(firstShown), last: formatCount(lastShown), total: formatCount(total) })}</span>
              {loading ? <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-[#9ca3af]" aria-label={tt("Loading")} /> : null}
            </div>
            <div className={cn("divide-y divide-[#f1f2f4] transition-opacity duration-150", loading && "opacity-60")}>
              {rows.map((review) => (
                <ReviewRow
                  key={review.id}
                  review={review}
                  highlighted={review.id === highlight}
                  selected={selected.has(review.id)}
                  onSelect={(on) => setSelected((s) => { const n = new Set(s); if (on) n.add(review.id); else n.delete(review.id); return n })}
                  ready={data.ready}
                  replying={replying === review.id}
                  onReply={() => setReplying(review.id)}
                  onCancelReply={() => setReplying(null)}
                  onSaveReply={(text) => saveReply(review, text)}
                  onRemoveReply={() => void removeReply(review)}
                  onReport={() => setReporting(review)}
                  onModerate={(action, photo) => void moderate(review, action, photo)}
                  onDelete={() => setDeleting(review)}
                />
              ))}
            </div>
            {total > pageSize ? (
              <div className="flex items-center justify-between gap-2 border-t border-[#f1f2f4] px-4 py-3">
                <button type="button" disabled={query.page <= 1 || loading} onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")}>
                  {tt("Previous")}
                </button>
                <span className="text-[13px] tabular-nums text-[#6b7280]">{tt("Page {page} of {pages}", { page: query.page, pages: Math.max(1, Math.ceil(total / pageSize)) })}</span>
                <button type="button" disabled={lastShown >= total || loading} onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4")} data-reviews-next="">
                  {tt("Next")}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{counts && counts.all === 0 && !filtered ? tt("No reviews yet") : query.tab === "pending" && !filtered ? tt("Nothing waiting") : tt("No reviews here")}</p>
            <p className={cn(MUTED, "mt-1 max-w-[380px]")}>{counts && counts.all === 0 && !filtered ? tt("Buyers are asked by email after they buy. Bring reviews from another app with Import.") : query.tab === "pending" && !filtered ? tt("New reviews that need your approval show here.") : tt("Try another filter.")}</p>
          </div>
        )}
      </section>

      {reporting ? <ReportDialog review={reporting} onClose={() => setReporting(null)} onReport={(reason, note) => report(reporting, reason, note)} /> : null}
      {deleting ? <DeleteDialog review={deleting} onClose={() => setDeleting(null)} onDelete={() => remove(deleting)} /> : null}
      {importing ? (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDone={(n) => {
            say(tt("{n, plural, one {# review imported} other {# reviews imported}}", { n }))
            change({})
          }}
          onUndone={() => change({})}
        />
      ) : null}
    </div>
  )
}

function ReviewRow({
  review,
  highlighted,
  selected,
  onSelect,
  ready,
  replying,
  onReply,
  onCancelReply,
  onSaveReply,
  onRemoveReply,
  onReport,
  onModerate,
  onDelete,
}: {
  review: ManagedReview
  highlighted: boolean
  selected: boolean
  onSelect: (on: boolean) => void
  ready: boolean
  replying: boolean
  onReply: () => void
  onCancelReply: () => void
  onSaveReply: (text: string) => Promise<boolean>
  onRemoveReply: () => void
  onReport: () => void
  onModerate: (action: Moderation, photo?: string) => void
  onDelete: () => void
}) {
  const { name, avatarUrl, avatarName } = reviewerOf(review)
  const hidden = review.status === "hidden"
  const pending = review.status === "pending"
  const reported = hidden && review.hidden_by !== "seller"
  const live = review.status === "published"
  /* A verified buyer's review the store hid or has not approved on its website is still on Storelib: it can be answered and reported there, never deleted. */
  const keptOnStorelib = review.verified && review.on_storelib && !live
  const open = !hidden || keptOnStorelib
  const canReport = open && review.source !== "import"
  const ref = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    if (!highlighted || !ref.current) return
    ref.current.scrollIntoView({ block: "center" })
    ref.current.animate?.([{ backgroundColor: "#eceef1" }, { backgroundColor: "rgba(236,238,241,0)" }], { duration: 1600, delay: 300, easing: "ease-out", fill: "backwards" })
  }, [highlighted])
  const items = [
    ...(ready && (pending || (hidden && !reported)) ? [{ label: review.verified ? tt("Show on your website") : tt("Publish"), onClick: () => onModerate("publish") }] : []),
    ...(ready && !hidden ? [{ label: review.verified ? tt("Hide on your website") : pending ? tt("Hide") : tt("Hide from store"), onClick: () => onModerate("hide") }] : []),
    ...(ready && live ? [{ label: review.featured ? tt("Stop featuring") : tt("Feature"), onClick: () => onModerate(review.featured ? "unfeature" : "feature") }] : []),
    ...(open ? [{ label: review.seller_reply ? tt("Edit reply") : tt("Reply"), onClick: onReply, separatorBefore: true }] : []),
    ...(review.seller_reply ? [{ label: tt("Delete reply"), onClick: onRemoveReply }] : []),
    ...(review.product?.slug && review.on_storelib ? [{ label: tt("View on product page"), href: `/p/${review.product.slug}#reviews`, target: "_blank" as const, separatorBefore: true }] : []),
    ...(canReport ? [{ label: tt("Report review"), variant: "destructive" as const, separatorBefore: true, onClick: onReport }] : []),
    ...(ready && !reported && !review.verified ? [{ label: tt("Delete"), variant: "destructive" as const, separatorBefore: !canReport, onClick: onDelete }] : []),
  ]

  return (
    <article ref={ref} data-review-row={review.id} data-review-status={review.status} className={cn("flex gap-3 px-4 py-4 md:px-5", (hidden || pending) && "bg-[#fafbfb]", selected && "bg-[#f6f7fb]")}>
      <div className="pt-2.5">
        <Checkbox checked={selected} onChange={onSelect} label={tt("Select the review by {name}", { name })} />
      </div>
      <AppAvatar src={avatarUrl} name={avatarName} alt="" size={36} markWhileLoading />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-[14px] font-semibold text-[#1a1a2e]">{name}</span>
              {review.verified ? (
                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#067647]" data-review-verified="yes">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  {tt("Verified purchase")}
                </span>
              ) : (
                <span className="text-[12px] text-[#6b7280]" data-review-verified="no">
                  {SOURCE_WORD[review.source]?.() ?? tt("Not verified")}
                </span>
              )}
              {pending ? <StatusBadge tone="attention">{keptOnStorelib ? tt("Waiting for approval on your website") : tt("Waiting for approval")}</StatusBadge> : null}
              {hidden ? <StatusBadge tone={reported ? "attention" : "neutral"}>{reported ? tt("Hidden, reported") : keptOnStorelib ? tt("Hidden on your website") : tt("Hidden")}</StatusBadge> : null}
              {review.featured && live ? <StatusBadge tone="success">{tt("Featured")}</StatusBadge> : null}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[#6b7280]">
              <Stars rating={review.rating} size={14} />
              <span className="text-[#4b5563] max-sm:hidden">{RATING_WORDS[review.rating] ? tt(RATING_WORDS[review.rating]) : ""}</span>
              <span aria-hidden>·</span>
              <span>
                {shortDate(review.created_at)}
                {review.edited_at ? tt(" · Edited") : ""}
              </span>
            </p>
          </div>
          {items.length ? (
            <ResponsiveActionMenu title={tt("Review by {name}", { name })} align="end" trigger={<RowMenuButton label={tt("Actions for the review by {name}", { name })} className="-mr-1.5 -mt-1 h-9 w-9 max-md:h-11 max-md:w-11 max-md:rounded-xl" />} items={items} />
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#6b7280]">
          {review.product ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {review.product.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={review.product.thumbnail_url} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
              ) : null}
              <span className="truncate font-medium text-[#374151]">{review.product.title}</span>
            </span>
          ) : null}
          {review.customer?.email ? <span className="truncate" title={tt("Only you see this")}>{review.customer.email}</span> : null}
        </div>

        {review.title ? <p className="mt-2 text-[14px] font-semibold text-[#1a1a2e] [overflow-wrap:anywhere]">{review.title}</p> : null}
        <p className={cn(review.title ? "mt-1" : "mt-2", "whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]")}>{review.content}</p>

        {review.photos.length ? (
          <div className="mt-3 flex flex-wrap gap-2" data-review-photos="">
            {review.photos.map((ph) => (
              <div key={ph.path} className="relative">
                <a href={ph.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt="" className={cn("h-[72px] w-[72px] rounded-lg object-cover", ph.status === "removed" && "opacity-35 grayscale")} />
                </a>
                {ready ? (
                  <button
                    type="button"
                    onClick={() => onModerate(ph.status === "removed" ? "restore_photo" : "remove_photo", ph.path)}
                    className="absolute inset-x-1 bottom-1 rounded-md bg-white/90 px-1 py-0.5 text-[11px] font-medium text-[#1a1a2e] shadow-[0_0_0_1px_rgba(16,24,40,0.08)]"
                    data-photo-toggle=""
                  >
                    {ph.status === "removed" ? tt("Show") : tt("Hide")}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {pending && ready ? (
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onModerate("publish")} className={cn(buttonPrimary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")} data-review-publish="">
              {tt("Publish")}
            </button>
            <button type="button" onClick={() => onModerate("hide")} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
              {tt("Hide")}
            </button>
          </div>
        ) : null}

        {replying ? (
          <ReplyEditor initial={review.seller_reply ?? ""} onCancel={onCancelReply} onSave={onSaveReply} />
        ) : review.seller_reply ? (
          <div className="mt-3 rounded-xl bg-[#f6f7f9] px-3.5 py-3" data-review-reply="">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-[#1a1a2e]">
                {tt("Your reply")} <span className="font-normal text-[#6b7280]">· {shortDate(review.seller_reply_at)}</span>
              </p>
              <span className="flex gap-3 text-[12px] font-medium">
                <button type="button" onClick={onReply} className="text-[#1a1a2e] hover:underline">
                  {tt("Edit")}
                </button>
                <button type="button" onClick={onRemoveReply} className="text-[#b42318] hover:underline">
                  {tt("Delete")}
                </button>
              </span>
            </div>
            <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{review.seller_reply}</p>
          </div>
        ) : open && !pending ? (
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
    </article>
  )
}

function ReplyEditor({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (text: string) => Promise<boolean> }) {
  const [text, setText] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  const trimmed = text.trim()
  const id = React.useId()
  return (
    <div className="mt-3">
      <label className="sr-only" htmlFor={id}>
        {tt("Your reply")}
      </label>
      <textarea
        id={id}
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
      <p className="mt-1.5 text-[12px] text-[#6b7280]">{tt("Shown under the review on your product page and in your website's review sections.")}</p>
    </div>
  )
}

function DeleteDialog({ review, onClose, onDelete }: { review: ManagedReview; onClose: () => void; onDelete: () => Promise<boolean> }) {
  const [busy, setBusy] = React.useState(false)
  const { name } = reviewerOf(review)
  return (
    <Sheet
      labelId="review-delete-title"
      title={tt("Delete the review by {name}?", { name })}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const ok = await onDelete()
              setBusy(false)
              if (ok) onClose()
            }}
            className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#c4290c] text-[15px] font-medium text-white transition-colors hover:bg-[#a82309] disabled:cursor-default disabled:opacity-50 sm:h-10 sm:text-[14px]"
          >
            {busy ? tt("Deleting") : tt("Delete")}
          </button>
        </>
      }
    >
      <p className="text-[14px] text-[#6b7280]">{tt("It is gone for good, with its photos. To take it off your store and keep it, hide it instead.")}</p>
    </Sheet>
  )
}

function ReportDialog({ review, onClose, onReport }: { review: ManagedReview; onClose: () => void; onReport: (reason: ReportReason, note: string) => Promise<boolean> }) {
  const [reason, setReason] = React.useState<ReportReason | null>(null)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const { name } = reviewerOf(review)
  return (
    <Sheet
      labelId="review-report-title"
      title={tt("Report the review by {name}", { name })}
      onClose={onClose}
      busy={busy}
      footer={
        <>
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
        </>
      }
    >
      <p className="text-[14px] text-[#6b7280]">{tt("It is hidden from your product page and its rating now. Storelib reads it and either brings it back or keeps it hidden.")}</p>
      <fieldset className="mt-4">
        <legend className="sr-only">{tt("Reason")}</legend>
        <div className="space-y-1">
          {REPORT_REASONS.map((r) => (
            <label key={r.id} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[14px] text-[#1a1a2e] transition-colors duration-100", reason === r.id ? "bg-[#f1f2f4]" : "hover:bg-[#f7f7f8]")}>
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
    </Sheet>
  )
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { Stars } from "@/components/reviews/stars"
import { MAX_REPLY_CHARS, REPORT_REASONS, RATING_WORDS, reviewerOf, summarize, type ReportReason } from "@/lib/reviews/rules"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, RowMenuButton, StatusBadge, buttonPrimary, buttonSecondary, card } from "../orders/order-parts"
import { Pill, usePill } from "../coupons/coupon-parts"
import type { SellerProduct, SellerReview } from "./load-reviews"

/**
 * ===========================================================================
 *  REVIEWS, IN THE APP
 * ===========================================================================
 * Every review of everything the creator sells, under Products in the menu.
 * The frame is the Coupons and Orders one: the pane's bar with the title,
 * then one card whose toolbar holds the filters (by stars, and by product
 * when there is more than one).
 *
 * WHAT A SELLER CAN DO, as on Etsy, Shopify and the App Store:
 *
 *   reply    once, in public, under the review on the product page; the
 *            reply can be changed or taken down
 *   report   a review that is abusive, spam, not about the product, not
 *            from a real buyer or that shares private details. It is hidden
 *            at once and Storelib decides; the seller cannot bring it back
 *            or delete it, so reporting is not a way to lose bad reviews.
 *
 * A seller never edits or deletes a buyer's words.
 *
 * `?review=<id>` (the bell and the new review email link here) brings that
 * review into view with a short grey tint.
 */

type Filter = "all" | "1" | "2" | "3" | "4" | "5" | "unanswered" | "hidden"

const shortDate = (iso?: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const TAB = (selected: boolean) =>
  cn(
    "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:text-[13px]",
    selected ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
  )

export function ReviewsClient({ initialReviews, products, ready }: { initialReviews: SellerReview[]; products: SellerProduct[]; ready: boolean }) {
  const router = useRouter()
  const [reviews, setReviews] = useState(initialReviews)
  const [seen, setSeen] = useState(initialReviews)
  if (seen !== initialReviews) {
    setSeen(initialReviews)
    setReviews(initialReviews)
  }
  const [filter, setFilter] = useState<Filter>("all")
  const [productId, setProductId] = useState<string>("")
  const [replying, setReplying] = useState<string | null>(null)
  const [reporting, setReporting] = useState<SellerReview | null>(null)
  const [notice, say] = usePill()
  const listRef = useRef<HTMLDivElement>(null)

  const byProduct = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const inProduct = useMemo(() => (productId ? reviews.filter((r) => r.product_id === productId) : reviews), [reviews, productId])
  const published = useMemo(() => inProduct.filter((r) => r.status === "published"), [inProduct])
  const stats = useMemo(() => summarize(published.map((r) => r.rating)), [published])
  const unanswered = published.filter((r) => !r.seller_reply).length
  const hiddenCount = inProduct.length - published.length

  const shown = useMemo(() => {
    switch (filter) {
      case "all":
        return inProduct
      case "unanswered":
        return published.filter((r) => !r.seller_reply)
      case "hidden":
        return inProduct.filter((r) => r.status === "hidden")
      default:
        return published.filter((r) => r.rating === Number(filter))
    }
  }, [filter, inProduct, published])

  /* From the bell or the email: bring that review into view, tinted for a moment. */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("review")
    if (!id) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-review-row="${CSS.escape(id)}"]`)
    if (!el) return
    el.scrollIntoView({ block: "center" })
    el.animate?.([{ backgroundColor: "#eceef1" }, { backgroundColor: "rgba(236,238,241,0)" }], { duration: 1600, delay: 300, easing: "ease-out", fill: "backwards" })
  }, [])

  const patch = (id: string, change: Partial<SellerReview>) => setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, ...change } : r)))

  const saveReply = async (review: SellerReview, text: string): Promise<boolean> => {
    const res = await fetch(`/api/reviews/${review.id}/reply`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      say(data.error || "The reply did not save.", "error")
      return false
    }
    patch(review.id, { seller_reply: data.review?.seller_reply ?? text, seller_reply_at: data.review?.seller_reply_at ?? new Date().toISOString() })
    say(review.seller_reply ? "Reply updated" : "Reply posted")
    setReplying(null)
    return true
  }

  const removeReply = async (review: SellerReview) => {
    const res = await fetch(`/api/reviews/${review.id}/reply`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return say(data.error || "The reply was not removed.", "error")
    patch(review.id, { seller_reply: null, seller_reply_at: null })
    say("Reply removed")
  }

  const report = async (review: SellerReview, reason: ReportReason, note: string): Promise<boolean> => {
    const res = await fetch(`/api/reviews/${review.id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, note }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      say(data.error || "The report did not save.", "error")
      return false
    }
    patch(review.id, { status: "hidden" })
    say("Reported. The review is hidden while Storelib looks at it.")
    router.refresh()
    return true
  }

  const TABS: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: inProduct.length },
    { value: "unanswered", label: "No reply", count: unanswered },
    ...([5, 4, 3, 2, 1] as const).map((n) => ({ value: String(n) as Filter, label: `${n} star`, count: stats.stars[n] })),
    ...(hiddenCount > 0 ? [{ value: "hidden" as Filter, label: "Hidden", count: hiddenCount }] : []),
  ]

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <Pill notice={notice} />

      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Reviews</h1>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {stats.count > 0 ? (
          <p data-reviews-summary="" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[#6b7280]">
            <Stars rating={stats.average} size={15} />
            <span className="font-semibold tabular-nums text-[#1a1a2e]">{stats.average.toFixed(1)}</span>
            <span>
              from {stats.count} {stats.count === 1 ? "review" : "reviews"}
              {unanswered > 0 ? ` · ${unanswered} without a reply` : ""}
            </span>
          </p>
        ) : null}

        {!ready ? (
          <p className="mt-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]">Replies and reports turn on after the database update (run-now part 52).</p>
        ) : null}

        <section aria-label="Reviews" className={cn(card, "mt-3 overflow-hidden")}>
          <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-[#eef0f2] px-2 py-1.5 md:min-h-12">
            <div role="tablist" aria-label="Filter by stars" className="orders-strip -my-2 flex min-w-0 flex-1 basis-full items-center gap-0.5 overflow-x-auto py-2 md:basis-auto">
              {TABS.map((t) => (
                <button key={t.value} type="button" role="tab" aria-selected={filter === t.value} onClick={() => setFilter(t.value)} className={TAB(filter === t.value)}>
                  {t.label}
                  <span className="tabular-nums text-[#9ca3af]">{t.count}</span>
                </button>
              ))}
            </div>
            {products.length > 1 ? (
              <label className="relative mx-1 mb-1 w-full shrink-0 md:mb-0 md:ml-0 md:w-auto">
                <span className="sr-only">Product</span>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="h-10 w-full cursor-pointer appearance-none truncate md:h-8 md:w-auto md:max-w-[220px] rounded-lg border border-[#e3e4e8] bg-white py-0 pl-3 pr-8 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:text-[13px]"
                >
                  <option value="">All products</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]">
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </label>
            ) : null}
          </div>

          {shown.length > 0 ? (
            <div ref={listRef} className="divide-y divide-[#f1f2f4]">
              {shown.map((review) => (
                <ReviewRow
                  key={review.id}
                  review={review}
                  product={byProduct.get(review.product_id) ?? null}
                  ready={ready}
                  replying={replying === review.id}
                  onReply={() => setReplying(review.id)}
                  onCancelReply={() => setReplying(null)}
                  onSaveReply={(text) => saveReply(review, text)}
                  onRemoveReply={() => removeReply(review)}
                  onReport={() => setReporting(review)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{reviews.length === 0 ? "No reviews yet" : "No reviews here"}</p>
              <p className="mt-1 max-w-[380px] text-[14px] text-[#6b7280] md:text-[13px]">
                {reviews.length === 0
                  ? "Buyers review from their receipt or their library. Storelib asks them a week after they buy on Storelib, and again a week later if they have not."
                  : "Try another filter."}
              </p>
            </div>
          )}
        </section>
      </div>

      {reporting ? <ReportDialog review={reporting} onClose={() => setReporting(null)} onReport={(reason, note) => report(reporting, reason, note)} /> : null}
    </div>
  )
}

function ReviewRow({
  review,
  product,
  ready,
  replying,
  onReply,
  onCancelReply,
  onSaveReply,
  onRemoveReply,
  onReport,
}: {
  review: SellerReview
  product: SellerProduct | null
  ready: boolean
  replying: boolean
  onReply: () => void
  onCancelReply: () => void
  onSaveReply: (text: string) => Promise<boolean>
  onRemoveReply: () => void
  onReport: () => void
}) {
  const { name, avatarUrl, avatarName } = reviewerOf(review)
  const hidden = review.status === "hidden"
  const items = [
    ...(ready && !hidden ? [{ label: review.seller_reply ? "Edit reply" : "Reply", onClick: onReply }] : []),
    ...(ready && review.seller_reply ? [{ label: "Remove reply", onClick: onRemoveReply }] : []),
    ...(product?.slug && !hidden ? [{ label: "View on product page", href: `/p/${product.slug}#reviews`, target: "_blank" as const, separatorBefore: true }] : []),
    ...(ready && !hidden ? [{ label: "Report review", variant: "destructive" as const, separatorBefore: true, onClick: onReport }] : []),
  ]

  return (
    <article data-review-row={review.id} className={cn("px-4 py-4 md:px-5", hidden && "bg-[#fafbfb]")}>
      <div className="flex items-start gap-3">
        <AppAvatar src={avatarUrl} name={avatarName} alt="" size={36} markWhileLoading />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="truncate text-[14px] font-semibold text-[#1a1a2e]">{name}</span>
                {hidden ? <StatusBadge tone="attention">Hidden, reported</StatusBadge> : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[#6b7280]">
                <Stars rating={review.rating} size={14} />
                <span className="text-[#4b5563] max-sm:hidden">{RATING_WORDS[review.rating] ?? ""}</span>
                <span aria-hidden className="max-sm:hidden">·</span>
                <span>
                  {shortDate(review.created_at)}
                  {review.edited_at ? " · Edited" : ""}
                </span>
              </p>
            </div>
            {items.length ? (
              <ResponsiveActionMenu title={`Review by ${name}`} align="end" trigger={<RowMenuButton label={`Actions for the review by ${name}`} className="-mr-1.5 -mt-1 h-9 w-9 max-md:h-11 max-md:w-11 max-md:rounded-xl" />} items={items} />
            ) : null}
          </div>

          {product ? <p className="mt-1.5 truncate text-[13px] text-[#6b7280]">On {product.title}</p> : null}
          <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{review.content}</p>

          {replying ? (
            <ReplyEditor initial={review.seller_reply ?? ""} onCancel={onCancelReply} onSave={onSaveReply} />
          ) : review.seller_reply ? (
            <div className="mt-3 rounded-xl bg-[#f6f7f9] px-3.5 py-3">
              <p className="text-[12px] font-semibold text-[#1a1a2e]">
                Your reply <span className="font-normal text-[#6b7280]">· {shortDate(review.seller_reply_at)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{review.seller_reply}</p>
            </div>
          ) : ready && !hidden ? (
            <button type="button" onClick={onReply} className={cn(buttonSecondary, "mt-3 max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
              Reply
            </button>
          ) : null}

          {hidden ? <p className="mt-2 text-[13px] text-[#6b7280]">Not on your product page or in its rating while Storelib looks at your report.</p> : null}
        </div>
      </div>
    </article>
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
        Your reply
      </label>
      <textarea
        id="review-reply"
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_REPLY_CHARS))}
        rows={3}
        placeholder="Thank them, or say what you changed. Everyone who reads the review sees this."
        className="block min-h-[88px] w-full resize-y rounded-xl border border-[#e3e4e8] bg-white px-3.5 py-2.5 text-[16px] leading-relaxed text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] md:text-[14px]"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[12px] tabular-nums text-[#9ca3af]">
          {text.length} / {MAX_REPLY_CHARS}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
            Cancel
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
            {initial ? "Save reply" : "Post reply"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReportDialog({ review, onClose, onReport }: { review: SellerReview; onClose: () => void; onReport: (reason: ReportReason, note: string) => Promise<boolean> }) {
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
          Report the review by {name}
        </h3>
        <p className="mt-1 text-[14px] text-[#6b7280]">It is hidden from your product page and its rating now. Storelib reads it and either brings it back or keeps it hidden.</p>
        <fieldset className="mt-4">
          <legend className="sr-only">Reason</legend>
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
          Anything Storelib should know <span className="font-normal text-[#9ca3af]">(optional)</span>
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
            Cancel
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
            {busy ? "Reporting" : "Report and hide"}
          </button>
        </div>
      </div>
    </div>
  )
}

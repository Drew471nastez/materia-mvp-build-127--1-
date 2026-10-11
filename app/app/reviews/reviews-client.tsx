"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { Stars } from "@/components/reviews/stars"
import { sellerView } from "@/lib/reviews/app-settings"
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
 * A seller never edits a buyer's words.
 *
 * WITH STORELIB REVIEWS ON (Settings › Integrations, run-now part 134) the
 * store moderates as on Judge.me: a review that waits for approval is under
 * Pending with Publish and Hide beside it; any review can be hidden (kept),
 * published again, featured (first in Featured order and in the website's
 * reviews carousel) or have a photo taken off. A verified buyer's review is
 * hidden or approved on the store's own website only: it stays on Storelib
 * and in its ratings, and it cannot be deleted (report it instead). A
 * visitor's or an imported review is the store's own, hidden everywhere and
 * deletable. A review hidden by a report stays Storelib's to bring back.
 * Import takes a CSV of reviews from another app.
 *
 * `?review=<id>` (the bell and the new review email link here) brings that
 * review into view with a short grey tint.
 */

type Filter = "all" | "pending" | "published" | "unanswered" | "hidden"

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

const SELECT =
  "h-10 w-full cursor-pointer appearance-none truncate md:h-8 md:w-auto md:max-w-[220px] rounded-lg border border-[#e3e4e8] bg-white py-0 pl-3 pr-8 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:text-[13px]"

const SETTINGS_HREF = "/app/settings?tab=integrations&integration=storelib-reviews"

type Moderation = "publish" | "hide" | "feature" | "unfeature" | "remove_photo" | "restore_photo"

export function ReviewsClient({
  initialReviews,
  products,
  ready,
  app = { enabled: false, ready: false },
}: {
  initialReviews: SellerReview[]
  products: SellerProduct[]
  ready: boolean
  app?: { enabled: boolean; ready: boolean }
}) {
  const router = useRouter()
  const [reviews, setReviews] = useState(initialReviews)
  const [seen, setSeen] = useState(initialReviews)
  if (seen !== initialReviews) {
    setSeen(initialReviews)
    setReviews(initialReviews)
  }
  const [filter, setFilter] = useState<Filter>("all")
  /* ?status=pending from the bell's "waiting for approval": that list, once the page is in the browser. */
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("status")
    if (asked === "pending" || asked === "hidden" || asked === "published") setFilter(asked)
  }, [])
  const [stars, setStars] = useState(0)
  const [productId, setProductId] = useState<string>("")
  const [replying, setReplying] = useState<string | null>(null)
  const [reporting, setReporting] = useState<SellerReview | null>(null)
  const [deleting, setDeleting] = useState<SellerReview | null>(null)
  const [importing, setImporting] = useState(false)
  const [notice, say] = usePill()
  const listRef = useRef<HTMLDivElement>(null)

  const byProduct = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const inProduct = useMemo(() => (productId ? reviews.filter((r) => r.product_id === productId) : reviews), [reviews, productId])
  const published = useMemo(() => inProduct.filter((r) => r.status === "published"), [inProduct])
  const stats = useMemo(() => summarize(published.map((r) => r.rating)), [published])
  const unanswered = published.filter((r) => !r.seller_reply).length
  const pendingCount = inProduct.filter((r) => r.status === "pending").length
  const hiddenCount = inProduct.filter((r) => r.status === "hidden").length

  const shown = useMemo(() => {
    const byStatus = (() => {
      switch (filter) {
        case "pending":
          return inProduct.filter((r) => r.status === "pending")
        case "published":
          return published
        case "unanswered":
          return published.filter((r) => !r.seller_reply)
        case "hidden":
          return inProduct.filter((r) => r.status === "hidden")
        default:
          return inProduct
      }
    })()
    return stars ? byStatus.filter((r) => r.rating === stars) : byStatus
  }, [filter, stars, inProduct, published])

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
    patch(review.id, { status: "hidden", hidden_by: "report", on_storelib: false })
    say("Reported. The review is hidden while Storelib looks at it.")
    router.refresh()
    return true
  }

  /* Publish, hide, feature, a photo off or back (Storelib Reviews). */
  const moderate = async (review: SellerReview, action: Moderation, photo?: string) => {
    const res = await fetch(`/api/app/reviews/${review.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, photo }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return say(data.error || "That did not save.", "error")
    const r = data.review ?? {}
    patch(review.id, {
      ...sellerView(r),
      featured: r.featured === true,
      ...(Array.isArray(r.photos) ? { photos: r.photos } : {}),
    })
    say(
      action === "publish" ? "Published" : action === "hide" ? (review.verified ? "Hidden on your website" : "Hidden from your store") : action === "feature" ? "Featured" : action === "unfeature" ? "No longer featured" : action === "remove_photo" ? "Photo removed" : "Photo back",
    )
  }

  const remove = async (review: SellerReview): Promise<boolean> => {
    const res = await fetch(`/api/app/reviews/${review.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      say(data.error || "That did not delete.", "error")
      return false
    }
    setReviews((prev) => prev.filter((r) => r.id !== review.id))
    say("Review deleted")
    return true
  }

  const TABS: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: inProduct.length },
    ...(app.ready || pendingCount > 0 ? [{ value: "pending" as Filter, label: "Pending", count: pendingCount }] : []),
    { value: "published", label: "Published", count: published.length },
    { value: "unanswered", label: "No reply", count: unanswered },
    ...(hiddenCount > 0 || app.ready ? [{ value: "hidden" as Filter, label: "Hidden", count: hiddenCount }] : []),
  ]

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <Pill notice={notice} />

      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Reviews</h1>
        <div className="flex items-center gap-2">
          {app.ready ? (
            <button type="button" onClick={() => setImporting(true)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-3.5 max-md:text-[14px]")} data-reviews-import="">
              Import
            </button>
          ) : null}
          <a href={SETTINGS_HREF} className={cn(buttonSecondary, "max-md:h-10 max-md:px-3.5 max-md:text-[14px]")} data-reviews-settings="">
            Settings
          </a>
        </div>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {stats.count > 0 ? (
          <p data-reviews-summary="" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[#6b7280]">
            <Stars rating={stats.average} size={15} />
            <span className="font-semibold tabular-nums text-[#1a1a2e]">{stats.average.toFixed(1)}</span>
            <span>
              from {stats.count} {stats.count === 1 ? "review" : "reviews"}
              {unanswered > 0 ? ` · ${unanswered} without a reply` : ""}
              {pendingCount > 0 ? ` · ${pendingCount} waiting for you` : ""}
            </span>
          </p>
        ) : null}

        {!ready ? (
          <p className="mt-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]">Replies and reports turn on after the database update (run-now part 52).</p>
        ) : !app.enabled ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-3.5 py-2.5 text-[13px] text-[#4b5563] shadow-[0_0_0_1px_rgba(16,24,40,0.06)]" data-reviews-app-off="">
            <span>Show these reviews on your website and ask buyers for one by email with Storelib Reviews.</span>
            <a href={SETTINGS_HREF} className="font-medium text-[#1a1a2e] underline underline-offset-4">
              Turn it on
            </a>
          </p>
        ) : null}

        <section aria-label="Reviews" className={cn(card, "mt-3 overflow-hidden")}>
          <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-[#eef0f2] px-2 py-1.5 md:min-h-12">
            <div role="tablist" aria-label="Filter reviews" className="orders-strip -my-2 flex min-w-0 flex-1 basis-full items-center gap-0.5 overflow-x-auto py-2 md:basis-auto">
              {TABS.map((t) => (
                <button key={t.value} type="button" role="tab" aria-selected={filter === t.value} onClick={() => setFilter(t.value)} className={TAB(filter === t.value)} data-reviews-tab={t.value}>
                  {t.label}
                  <span className="tabular-nums text-[#9ca3af]">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="mx-1 mb-1 flex w-full gap-2 md:mb-0 md:ml-0 md:w-auto">
              <label className="relative flex-1 md:flex-none">
                <span className="sr-only">Stars</span>
                <select value={stars} onChange={(e) => setStars(Number(e.target.value))} className={SELECT} data-reviews-stars="">
                  <option value={0}>Any rating</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "star" : "stars"} ({inProduct.filter((r) => r.rating === n).length})
                    </option>
                  ))}
                </select>
                <Chevron />
              </label>
              {products.length > 1 ? (
                <label className="relative flex-1 md:flex-none">
                  <span className="sr-only">Product</span>
                  <select value={productId} onChange={(e) => setProductId(e.target.value)} className={SELECT}>
                    <option value="">All products</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <Chevron />
                </label>
              ) : null}
            </div>
          </div>

          {shown.length > 0 ? (
            <div ref={listRef} className="divide-y divide-[#f1f2f4]">
              {shown.map((review) => (
                <ReviewRow
                  key={review.id}
                  review={review}
                  product={byProduct.get(review.product_id) ?? null}
                  ready={ready}
                  moderation={app.ready}
                  replying={replying === review.id}
                  onReply={() => setReplying(review.id)}
                  onCancelReply={() => setReplying(null)}
                  onSaveReply={(text) => saveReply(review, text)}
                  onRemoveReply={() => removeReply(review)}
                  onReport={() => setReporting(review)}
                  onModerate={(action, photo) => moderate(review, action, photo)}
                  onDelete={() => setDeleting(review)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{reviews.length === 0 ? "No reviews yet" : filter === "pending" ? "Nothing waiting" : "No reviews here"}</p>
              <p className="mt-1 max-w-[380px] text-[14px] text-[#6b7280] md:text-[13px]">
                {reviews.length === 0
                  ? app.enabled
                    ? "Buyers are asked by email after they buy, on your schedule in Storelib Reviews."
                    : "Buyers review from their receipt or their library. Storelib asks them a week after they buy on Storelib, and again a week later if they have not."
                  : filter === "pending"
                    ? "New reviews that need your approval show here."
                    : "Try another filter."}
              </p>
            </div>
          )}
        </section>
      </div>

      {reporting ? <ReportDialog review={reporting} onClose={() => setReporting(null)} onReport={(reason, note) => report(reporting, reason, note)} /> : null}
      {deleting ? <DeleteDialog review={deleting} onClose={() => setDeleting(null)} onDelete={() => remove(deleting)} /> : null}
      {importing ? (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDone={(n) => {
            say(`${n} ${n === 1 ? "review" : "reviews"} imported`)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const SOURCE_WORD: Record<string, string> = { import: "Imported", site: "From your website", request: "From a review email", website: "From your website" }

function ReviewRow({
  review,
  product,
  ready,
  moderation,
  replying,
  onReply,
  onCancelReply,
  onSaveReply,
  onRemoveReply,
  onReport,
  onModerate,
  onDelete,
}: {
  review: SellerReview
  product: SellerProduct | null
  ready: boolean
  moderation: boolean
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
  const canReport = ready && open && review.source !== "import"
  const items = [
    ...(moderation && (pending || (hidden && !reported)) ? [{ label: review.verified ? "Show on your website" : "Publish", onClick: () => onModerate("publish") }] : []),
    ...(moderation && !hidden ? [{ label: review.verified ? "Hide on your website" : pending ? "Hide" : "Hide from store", onClick: () => onModerate("hide") }] : []),
    ...(moderation && live ? [{ label: review.featured ? "Stop featuring" : "Feature", onClick: () => onModerate(review.featured ? "unfeature" : "feature") }] : []),
    ...(ready && open ? [{ label: review.seller_reply ? "Edit reply" : "Reply", onClick: onReply, separatorBefore: moderation }] : []),
    ...(ready && review.seller_reply ? [{ label: "Remove reply", onClick: onRemoveReply }] : []),
    ...(product?.slug && review.on_storelib ? [{ label: "View on product page", href: `/p/${product.slug}#reviews`, target: "_blank" as const, separatorBefore: true }] : []),
    ...(canReport ? [{ label: "Report review", variant: "destructive" as const, separatorBefore: true, onClick: onReport }] : []),
    ...(moderation && !reported && !review.verified ? [{ label: "Delete", variant: "destructive" as const, separatorBefore: !canReport, onClick: onDelete }] : []),
  ]
  const photos = review.photos ?? []

  return (
    <article data-review-row={review.id} data-review-status={review.status} className={cn("px-4 py-4 md:px-5", (hidden || pending) && "bg-[#fafbfb]")}>
      <div className="flex items-start gap-3">
        <AppAvatar src={avatarUrl} name={avatarName} alt="" size={36} markWhileLoading />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="truncate text-[14px] font-semibold text-[#1a1a2e]">{name}</span>
                {pending ? <StatusBadge tone="attention">{keptOnStorelib ? "Waiting for approval on your website" : "Waiting for approval"}</StatusBadge> : null}
                {hidden ? <StatusBadge tone={reported ? "attention" : "neutral"}>{reported ? "Hidden, reported" : keptOnStorelib ? "Hidden on your website" : "Hidden"}</StatusBadge> : null}
                {review.featured && live ? <StatusBadge tone="success">Featured</StatusBadge> : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[#6b7280]">
                <Stars rating={review.rating} size={14} />
                <span className="text-[#4b5563] max-sm:hidden">{RATING_WORDS[review.rating] ?? ""}</span>
                <span aria-hidden className="max-sm:hidden">·</span>
                <span>
                  {shortDate(review.created_at)}
                  {review.edited_at ? " · Edited" : ""}
                </span>
                <span aria-hidden className="max-sm:hidden">·</span>
                <span className="max-sm:basis-full" data-review-verified={review.verified ? "yes" : "no"}>{review.verified ? "Verified buyer" : SOURCE_WORD[review.source] ?? "Not verified"}</span>
              </p>
            </div>
            {items.length ? (
              <ResponsiveActionMenu title={`Review by ${name}`} align="end" trigger={<RowMenuButton label={`Actions for the review by ${name}`} className="-mr-1.5 -mt-1 h-9 w-9 max-md:h-11 max-md:w-11 max-md:rounded-xl" />} items={items} />
            ) : null}
          </div>

          {product ? <p className="mt-1.5 truncate text-[13px] text-[#6b7280]">On {product.title}</p> : null}
          {review.title ? <p className="mt-2 text-[14px] font-semibold text-[#1a1a2e] [overflow-wrap:anywhere]">{review.title}</p> : null}
          <p className={cn(review.title ? "mt-1" : "mt-2", "whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]")}>{review.content}</p>

          {photos.length ? (
            <div className="mt-3 flex flex-wrap gap-2" data-review-photos="">
              {photos.map((ph) => (
                <div key={ph.path} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt="" className={cn("h-16 w-16 rounded-lg object-cover", ph.status === "removed" && "opacity-35 grayscale")} />
                  {moderation ? (
                    <button
                      type="button"
                      onClick={() => onModerate(ph.status === "removed" ? "restore_photo" : "remove_photo", ph.path)}
                      className="absolute inset-x-1 bottom-1 rounded-md bg-white/90 px-1 py-0.5 text-[11px] font-medium text-[#1a1a2e] shadow-[0_0_0_1px_rgba(16,24,40,0.08)]"
                    >
                      {ph.status === "removed" ? "Show" : "Remove"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {pending && moderation ? (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => onModerate("publish")} className={cn(buttonPrimary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")} data-review-publish="">
                Publish
              </button>
              <button type="button" onClick={() => onModerate("hide")} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
                Hide
              </button>
            </div>
          ) : replying ? (
            <ReplyEditor initial={review.seller_reply ?? ""} onCancel={onCancelReply} onSave={onSaveReply} />
          ) : review.seller_reply ? (
            <div className="mt-3 rounded-xl bg-[#f6f7f9] px-3.5 py-3">
              <p className="text-[12px] font-semibold text-[#1a1a2e]">
                Your reply <span className="font-normal text-[#6b7280]">· {shortDate(review.seller_reply_at)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{review.seller_reply}</p>
            </div>
          ) : ready && open ? (
            <button type="button" onClick={onReply} className={cn(buttonSecondary, "mt-3 max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
              Reply
            </button>
          ) : null}

          {reported ? <p className="mt-2 text-[13px] text-[#6b7280]">Not on your product page or in its rating while Storelib looks at your report.</p> : null}
          {hidden && !reported && keptOnStorelib ? (
            <p className="mt-2 text-[13px] text-[#6b7280]" data-review-kept="">
              Hidden on your website. Still shown on Storelib because it&apos;s from a verified buyer.
            </p>
          ) : null}
          {hidden && !reported && !keptOnStorelib ? <p className="mt-2 text-[13px] text-[#6b7280]">Not on your store or in its rating. Publish it to show it again.</p> : null}
          {pending && keptOnStorelib ? (
            <p className="mt-2 text-[13px] text-[#6b7280]" data-review-kept="">
              Not on your website until you publish it. Already shown on Storelib because it&apos;s from a verified buyer.
            </p>
          ) : null}
          {pending && !keptOnStorelib ? <p className="mt-2 text-[13px] text-[#6b7280]">Not on your store until you publish it.</p> : null}
        </div>
      </div>
    </article>
  )
}

function DeleteDialog({ review, onClose, onDelete }: { review: SellerReview; onClose: () => void; onDelete: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false)
  const { name } = reviewerOf(review)
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative w-full rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5">
        <h3 id="delete-title" className="text-[17px] font-semibold text-[#1a1a2e]">
          Delete the review by {name}?
        </h3>
        <p className="mt-1 text-[14px] text-[#6b7280]">It is gone for good, with its photos. To take it off your store and keep it, hide it instead.</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}>
            Cancel
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
            {busy ? "Deleting" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const run = async (file: File) => {
    setBusy(true)
    setError(null)
    const csv = await file.text().catch(() => "")
    const res = await fetch("/api/app/reviews/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) return setError(data.error || "The file did not import.")
    setResult({ imported: data.imported ?? 0, skipped: data.skippedCount ?? 0 })
    if (data.imported) onDone(data.imported)
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative w-full rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5" data-reviews-import-dialog="">
        <h3 id="import-title" className="text-[17px] font-semibold text-[#1a1a2e]">
          Import reviews
        </h3>
        {result ? (
          <p className="mt-2 text-[14px] text-[#374151]">
            {result.imported} imported{result.skipped ? `, ${result.skipped} skipped (no matching product, or no rating or words)` : ""}.
          </p>
        ) : (
          <p className="mt-1 text-[14px] leading-relaxed text-[#6b7280]">
            A CSV with a row per review and columns for the product (its address or title), the rating and the review. Judge.me exports and the usual product reviews CSV work as they are. Imported reviews are not marked Verified buyer.
          </p>
        )}
        {error ? <p className="mt-3 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">{error}</p> : null}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (f) void run(f)
          }}
        />
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}>
            {result ? "Done" : "Cancel"}
          </button>
          {!result ? (
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {busy ? "Importing" : "Choose CSV"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
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

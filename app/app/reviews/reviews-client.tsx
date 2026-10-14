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
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

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
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: "numeric" }))
}

const TAB = (selected: boolean) =>
  cn(
    "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:text-[13px]",
    selected ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
  )

const SELECT =
  "h-10 w-full cursor-pointer appearance-none truncate md:h-8 md:w-auto md:max-w-[220px] rounded-lg border border-[#e3e4e8] bg-white py-0 pl-3 pr-8 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:text-[13px]"

const SETTINGS_HREF = "/app/integrations?integration=storelib-reviews"

type Moderation = "publish" | "hide" | "feature" | "unfeature" | "remove_photo" | "restore_photo"

export function ReviewsClient({
  initialReviews,
  products,
  ready,
  app = { enabled: false, ready: false },
  requests = null,
}: {
  initialReviews: SellerReview[]
  products: SellerProduct[]
  ready: boolean
  app?: { enabled: boolean; ready: boolean }
  /** Review request emails sent, and how many led to a review (review_requests); null when there is no table to read. */
  requests?: { sent: number; reviewed: number } | null
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
      say(data.error || tt("The reply did not save."), "error")
      return false
    }
    patch(review.id, { seller_reply: data.review?.seller_reply ?? text, seller_reply_at: data.review?.seller_reply_at ?? new Date().toISOString() })
    say(review.seller_reply ? tt("Reply updated") : tt("Reply posted"))
    setReplying(null)
    return true
  }

  const removeReply = async (review: SellerReview) => {
    const res = await fetch(`/api/reviews/${review.id}/reply`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return say(data.error || tt("The reply was not removed."), "error")
    patch(review.id, { seller_reply: null, seller_reply_at: null })
    say(tt("Reply removed"))
  }

  const report = async (review: SellerReview, reason: ReportReason, note: string): Promise<boolean> => {
    const res = await fetch(`/api/reviews/${review.id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, note }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      say(data.error || tt("The report did not save."), "error")
      return false
    }
    patch(review.id, { status: "hidden", hidden_by: "report", on_storelib: false })
    say(tt("Reported. The review is hidden while Storelib looks at it."))
    router.refresh()
    return true
  }

  /* Publish, hide, feature, a photo off or back (Storelib Reviews). */
  const moderate = async (review: SellerReview, action: Moderation, photo?: string) => {
    const res = await fetch(`/api/app/reviews/${review.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, photo }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return say(data.error || tt("That did not save."), "error")
    const r = data.review ?? {}
    patch(review.id, {
      ...sellerView(r),
      featured: r.featured === true,
      ...(Array.isArray(r.photos) ? { photos: r.photos } : {}),
    })
    say(
      action === "publish" ? tt("Published") : action === "hide" ? (review.verified ? tt("Hidden on your website") : tt("Hidden from your store")) : action === "feature" ? tt("Featured") : action === "unfeature" ? tt("No longer featured") : action === "remove_photo" ? tt("Photo removed") : tt("Photo back"),
    )
  }

  const remove = async (review: SellerReview): Promise<boolean> => {
    const res = await fetch(`/api/app/reviews/${review.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      say(data.error || tt("That did not delete."), "error")
      return false
    }
    setReviews((prev) => prev.filter((r) => r.id !== review.id))
    say(tt("Review deleted"))
    return true
  }

  const TABS: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: tt("All"), count: inProduct.length },
    ...(app.ready || pendingCount > 0 ? [{ value: "pending" as Filter, label: tt("Pending"), count: pendingCount }] : []),
    { value: "published", label: tt("Published"), count: published.length },
    { value: "unanswered", label: tt("No reply"), count: unanswered },
    ...(hiddenCount > 0 || app.ready ? [{ value: "hidden" as Filter, label: tt("Hidden"), count: hiddenCount }] : []),
  ]

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <Pill notice={notice} />

      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Reviews")}</h1>
        <div className="flex items-center gap-2">
          {app.ready ? (
            <button type="button" onClick={() => setImporting(true)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-3.5 max-md:text-[14px]")} data-reviews-import="">
              {tt("Import")}
            </button>
          ) : null}
          <a href={SETTINGS_HREF} className={cn(buttonSecondary, "max-md:h-10 max-md:px-3.5 max-md:text-[14px]")} data-reviews-settings="">
            {tt("Settings")}
          </a>
        </div>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {stats.count > 0 || (requests && requests.sent > 0) ? (
          <ReviewsOverview reviews={inProduct} published={published} pending={pendingCount} unanswered={unanswered} requests={requests} />
        ) : null}

        {!ready ? (
          <p className="mt-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]">{tt("Replies and reports turn on after the database update (run-now part 52).")}</p>
        ) : !app.enabled ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-3.5 py-2.5 text-[13px] text-[#4b5563] shadow-[0_0_0_1px_rgba(16,24,40,0.06)]" data-reviews-app-off="">
            <span>{tt("Show these reviews on your website and ask buyers for one by email with Storelib Reviews.")}</span>
            <a href={SETTINGS_HREF} className="font-medium text-[#1a1a2e] underline underline-offset-4">
              {tt("Turn it on")}
            </a>
          </p>
        ) : null}

        <section aria-label={tt("Reviews")} className={cn(card, "mt-3 overflow-hidden")}>
          <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-[#eef0f2] px-2 py-1.5 md:min-h-12">
            <div role="tablist" aria-label={tt("Filter reviews")} className="orders-strip -my-2 flex min-w-0 flex-1 basis-full items-center gap-0.5 overflow-x-auto py-2 md:basis-auto">
              {TABS.map((t) => (
                <button key={t.value} type="button" role="tab" aria-selected={filter === t.value} onClick={() => setFilter(t.value)} className={TAB(filter === t.value)} data-reviews-tab={t.value}>
                  {t.label}
                  <span className="tabular-nums text-[#9ca3af]">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="mx-1 mb-1 flex w-full gap-2 md:mb-0 md:ml-0 md:w-auto">
              <label className="relative flex-1 md:flex-none">
                <span className="sr-only">{tt("Stars")}</span>
                <select value={stars} onChange={(e) => setStars(Number(e.target.value))} className={SELECT} data-reviews-stars="">
                  <option value={0}>{tt("Any rating")}</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {tt("{n, plural, one {# star} other {# stars}}", { n })} ({inProduct.filter((r) => r.rating === n).length})
                    </option>
                  ))}
                </select>
                <Chevron />
              </label>
              {products.length > 1 ? (
                <label className="relative flex-1 md:flex-none">
                  <span className="sr-only">{tt("Product")}</span>
                  <select value={productId} onChange={(e) => setProductId(e.target.value)} className={SELECT}>
                    <option value="">{tt("All products")}</option>
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
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{reviews.length === 0 ? tt("No reviews yet") : filter === "pending" ? tt("Nothing waiting") : tt("No reviews here")}</p>
              <p className="mt-1 max-w-[380px] text-[14px] text-[#6b7280] md:text-[13px]">
                {reviews.length === 0
                  ? app.enabled
                    ? tt("Buyers are asked by email after they buy, on your schedule in Storelib Reviews.")
                    : tt("Buyers review from their receipt or their library. Storelib asks them a week after they buy on Storelib, and again a week later if they have not.")
                  : filter === "pending"
                    ? tt("New reviews that need your approval show here.")
                    : tt("Try another filter.")}
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
            say(tt("{n, plural, one {# review} other {# reviews}} imported", { n }))
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

const SOURCE_WORD: Record<string, string> = { get import() { return tt("Imported") }, get site() { return tt("From your website") }, get request() { return tt("From a review email") }, get website() { return tt("From your website") } }

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
    ...(moderation && (pending || (hidden && !reported)) ? [{ label: review.verified ? tt("Show on your website") : tt("Publish"), onClick: () => onModerate("publish") }] : []),
    ...(moderation && !hidden ? [{ label: review.verified ? tt("Hide on your website") : pending ? tt("Hide") : tt("Hide from store"), onClick: () => onModerate("hide") }] : []),
    ...(moderation && live ? [{ label: review.featured ? tt("Stop featuring") : tt("Feature"), onClick: () => onModerate(review.featured ? "unfeature" : "feature") }] : []),
    ...(ready && open ? [{ label: review.seller_reply ? tt("Edit reply") : tt("Reply"), onClick: onReply, separatorBefore: moderation }] : []),
    ...(ready && review.seller_reply ? [{ label: tt("Remove reply"), onClick: onRemoveReply }] : []),
    ...(product?.slug && review.on_storelib ? [{ label: tt("View on product page"), href: `/p/${product.slug}#reviews`, target: "_blank" as const, separatorBefore: true }] : []),
    ...(canReport ? [{ label: tt("Report review"), variant: "destructive" as const, separatorBefore: true, onClick: onReport }] : []),
    ...(moderation && !reported && !review.verified ? [{ label: tt("Delete"), variant: "destructive" as const, separatorBefore: !canReport, onClick: onDelete }] : []),
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
                {pending ? <StatusBadge tone="attention">{keptOnStorelib ? tt("Waiting for approval on your website") : tt("Waiting for approval")}</StatusBadge> : null}
                {hidden ? <StatusBadge tone={reported ? "attention" : "neutral"}>{reported ? tt("Hidden, reported") : keptOnStorelib ? tt("Hidden on your website") : tt("Hidden")}</StatusBadge> : null}
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
                <span className="max-sm:basis-full" data-review-verified={review.verified ? "yes" : "no"}>{review.verified ? tt("Verified buyer") : SOURCE_WORD[review.source] ?? tt("Not verified")}</span>
              </p>
            </div>
            {items.length ? (
              <ResponsiveActionMenu title={tt("Review by {name}", { name })} align="end" trigger={<RowMenuButton label={tt("Actions for the review by {name}", { name })} className="-mr-1.5 -mt-1 h-9 w-9 max-md:h-11 max-md:w-11 max-md:rounded-xl" />} items={items} />
            ) : null}
          </div>

          {product ? <p className="mt-1.5 truncate text-[13px] text-[#6b7280]">{tt("On {title}", { title: product.title })}</p> : null}
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
                      {ph.status === "removed" ? tt("Show") : tt("Remove")}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {pending && moderation ? (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => onModerate("publish")} className={cn(buttonPrimary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")} data-review-publish="">
                {tt("Publish")}
              </button>
              <button type="button" onClick={() => onModerate("hide")} className={cn(buttonSecondary, "max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
                {tt("Hide")}
              </button>
            </div>
          ) : replying ? (
            <ReplyEditor initial={review.seller_reply ?? ""} onCancel={onCancelReply} onSave={onSaveReply} />
          ) : review.seller_reply ? (
            <div className="mt-3 rounded-xl bg-[#f6f7f9] px-3.5 py-3">
              <p className="text-[12px] font-semibold text-[#1a1a2e]">
                {tt("Your reply")} <span className="font-normal text-[#6b7280]">· {shortDate(review.seller_reply_at)}</span>
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

function DeleteDialog({ review, onClose, onDelete }: { review: SellerReview; onClose: () => void; onDelete: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false)
  const { name } = reviewerOf(review)
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative w-full rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5">
        <h3 id="delete-title" className="text-[17px] font-semibold text-[#1a1a2e]">
          {tt("Delete the review by {name}?", { name })}
        </h3>
        <p className="mt-1 text-[14px] text-[#6b7280]">{tt("It is gone for good, with its photos. To take it off your store and keep it, hide it instead.")}</p>
        <div className="mt-5 flex gap-2">
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
    if (!res?.ok) return setError(data.error || tt("The file did not import."))
    setResult({ imported: data.imported ?? 0, skipped: data.skippedCount ?? 0 })
    if (data.imported) onDone(data.imported)
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative w-full rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5" data-reviews-import-dialog="">
        <h3 id="import-title" className="text-[17px] font-semibold text-[#1a1a2e]">
          {tt("Import reviews")}
        </h3>
        {result ? (
          <p className="mt-2 text-[14px] text-[#374151]">
            {tt("{imported} imported", { imported: result.imported })}{result.skipped ? tt(", {skipped} skipped (no matching product, or no rating or words)", { skipped: result.skipped }) : ""}.
          </p>
        ) : (
          <p className="mt-1 text-[14px] leading-relaxed text-[#6b7280]">
            {tt("A CSV with a row per review and columns for the product (its address or title), the rating and the review. Judge.me exports and the usual product reviews CSV work as they are. Imported reviews are not marked Verified buyer.")}
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
            {result ? tt("Done") : tt("Cancel")}
          </button>
          {!result ? (
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {busy ? tt("Importing") : tt("Choose CSV")}
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

/**
 * ===========================================================================
 *  THE OVERVIEW: WHAT A STORE WANTS TO KNOW AT A GLANCE
 * ===========================================================================
 * Read from the reviews on this page and the request rows, nothing else: the
 * average and how many, how they spread over the five ratings, how many came
 * in each of the last six months, what is waiting, how many are from buyers,
 * how many have a reply, and how many request emails led to a review. No
 * figure is shown that the data does not hold (no revenue, no "trust score").
 */
function ReviewsOverview({
  reviews,
  published,
  pending,
  unanswered,
  requests,
}: {
  reviews: SellerReview[]
  published: SellerReview[]
  pending: number
  unanswered: number
  requests: { sent: number; reviewed: number } | null
}) {
  const count = published.length
  const average = count ? published.reduce((n, r) => n + r.rating, 0) / count : 0
  const byStar = [5, 4, 3, 2, 1].map((n) => ({ n, count: published.filter((r) => r.rating === n).length }))
  const most = Math.max(1, ...byStar.map((b) => b.count))
  const verified = published.filter((r) => r.verified).length
  const replied = count - unanswered
  /* The last six calendar months, oldest first, in the browser's own time. */
  const months = (() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const n = reviews.filter((r) => {
        const at = new Date(r.created_at)
        return at >= d && at < next
      }).length
      return { label: d.toLocaleDateString(undefined, { month: "short" }), n }
    })
  })()
  const monthMost = Math.max(1, ...months.map((m) => m.n))
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "0%")
  const facts: { label: string; value: string; hint?: string }[] = [
    { label: tt("Waiting for you"), value: String(pending) },
    { label: tt("From buyers"), value: pct(verified, count), hint: tt("{verified} of {count} are verified purchases", { verified, count }) },
    { label: tt("With a reply"), value: pct(replied, count) },
    ...(requests ? [{ label: tt("Requests sent"), value: String(requests.sent), hint: requests.sent ? tt("{reviewed} led to a review", { reviewed: requests.reviewed }) : undefined }] : []),
  ]
  return (
    <section data-reviews-overview="" aria-label={tt("Overview")} className={cn(card, "mt-1 grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="shrink-0">
          <p className="text-[34px] font-bold leading-none tabular-nums text-[#1a1a2e]">{average.toFixed(1)}</p>
          <div className="mt-2"><Stars rating={average} size={15} /></div>
          <p className="mt-1.5 text-[13px] text-[#6b7280]">{tt("{count, plural, one {# review} other {# reviews}}", { count })}</p>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5" aria-label={tt("Ratings")}>
          {byStar.map((b) => (
            <li key={b.n} className="grid grid-cols-[14px_minmax(0,1fr)_28px] items-center gap-2 text-[12.5px] text-[#6b7280]">
              <span className="tabular-nums">{b.n}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[#f1f2f4]">
                <span className="block h-full rounded-full bg-[#1a1a2e]" style={{ width: `${(b.count / most) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums">{b.count}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0" title={f.hint}>
              <p className="truncate text-[12px] text-[#6b7280]">{f.label}</p>
              <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-[#1a1a2e]">{f.value}</p>
            </div>
          ))}
        </div>
        <div aria-label={tt("Reviews by month")}>
          <div className="flex h-12 items-end gap-1.5">
            {months.map((m) => (
              <span key={m.label} className="flex-1 rounded-t-[3px] bg-[#e5e7eb]" style={{ height: `${Math.max(6, (m.n / monthMost) * 100)}%`, background: m.n ? "#1a1a2e" : undefined }} title={`${m.label}: ${m.n}`} />
            ))}
          </div>
          <div className="mt-1 flex gap-1.5">
            {months.map((m) => (
              <span key={m.label} className="flex-1 text-center text-[11px] text-[#9ca3af]">{m.label}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

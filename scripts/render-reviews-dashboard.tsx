/**
 * Reviews in /app (app/app/reviews), every tab with made up data, for
 * scripts/check-reviews-dashboard.mjs. The page's path picks the tab, as the
 * area's own tabs do (components/app/reviews/reviews-nav.tsx):
 *
 *   /app/reviews             Overview
 *   /app/reviews/list        Reviews, ?empty=1 for a store with none
 *   /app/reviews/import      Import
 *   /app/reviews/requests    Requests
 *   /app/reviews/widgets     Widgets
 *   /app/reviews/analytics   Analytics
 *   /app/reviews/settings    Settings
 *   /review/demo             the buyer's review page
 *
 * The probe's server answers the area's routes.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ReviewsShell } from "@/components/app/reviews/reviews-shell"
import { ReviewsOverview } from "@/components/app/reviews/overview"
import { ReviewsClient } from "@/app/app/reviews/reviews-client"
import { ImportFlow } from "@/components/app/reviews/import-flow"
import { RequestsPanel } from "@/components/app/reviews/requests-panel"
import { ReviewsWidgetsTab } from "@/components/app/reviews/widgets-tab"
import { ReviewsAnalytics } from "@/components/app/reviews/analytics-view"
import { ReviewsSettingsForm } from "@/components/app/reviews/settings-form"
import { ReviewPageForm } from "@/app/review/[token]/review-form"
import { readReviewsApp } from "@/lib/reviews/app-settings"
import { NO_FILTERS, tabCounts } from "@/lib/reviews/dashboard"
import { periodFor, previousPeriod } from "@/lib/reviews/analytics"

const path = location.pathname.replace(/\/+$/, "")
const params = new URLSearchParams(location.search)
const NOW = Date.parse("2026-10-16T12:00:00Z")
const days = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const P = ["11111111-0000-4000-8000-000000000001", "11111111-0000-4000-8000-000000000002", "11111111-0000-4000-8000-000000000003"]
const products = [
  { id: P[0], title: "Linen apron", slug: "linen-apron", thumbnail_url: null },
  { id: P[1], title: "Oak serving board, large", slug: "oak-board", thumbnail_url: null },
  { id: P[2], title: "Hand thrown mug", slug: "mug", thumbnail_url: null },
]
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`
const base = { edited_at: null, title: null, featured: false, source: "request", seller_reply: null, seller_reply_at: null, hidden_by: null, on_storelib: true, site_status: "shown", buyer: null, photos: [] as never[] }
const rows = [
  { ...base, id: id(1), product_id: P[0], rating: 5, content: "Thick linen, deep pockets and it washes well. I wear it every day in the studio.", created_at: days(1), status: "published", verified: true, order_id: id(901), reviewer_name: "Maya R.", title: "Exactly right", photos: [{ path: "c/a.jpg", url: `${location.origin}/photo.svg`, status: "approved", view: `${location.origin}/photo.svg` }], featured: true },
  { ...base, id: id(2), product_id: P[1], rating: 2, content: "Arrived with a crack along the edge. Buy at cheap-boards.shop instead.", created_at: days(2), status: "pending", verified: false, order_id: null, source: "site", reviewer_name: "Tom", on_storelib: false },
  { ...base, id: id(3), product_id: P[2], rating: 4, content: "Lovely glaze, a little smaller than I expected.", created_at: days(3), status: "pending", site_status: "pending", verified: true, order_id: id(903), reviewer_name: "Ana L.", photos: [{ path: "c/v.mp4", url: `${location.origin}/clip.mp4`, status: "held", kind: "video", view: `${location.origin}/clip.mp4` }] },
  { ...base, id: id(4), product_id: P[0], rating: 5, content: "Second one I have bought. The straps hold up.", created_at: days(6), status: "published", verified: true, order_id: id(904), reviewer_name: "Jonas", seller_reply: "Thank you Jonas, glad the straps last.", seller_reply_at: days(5) },
  { ...base, id: id(5), product_id: P[1], rating: 3, content: "Fine board.", created_at: days(9), status: "hidden", hidden_by: "seller", verified: false, order_id: null, source: "import", reviewer_name: "Priya S.", on_storelib: false },
  { ...base, id: id(6), product_id: P[1], rating: 1, content: "Scam, call me on 0722 000 000.", created_at: days(12), status: "hidden", hidden_by: "report", verified: false, order_id: null, source: "site", reviewer_name: null, on_storelib: false },
]
const empty = params.get("empty") === "1"
const list = (() => {
  const r = empty ? [] : rows
  return { rows: r, total: r.length, page: 1, pages: 1, counts: tabCounts(r as never), ready: { replies: true, app: true } }
})()

function page(): React.ReactNode {
  if (path === "/app/reviews") {
    return (
      <ReviewsOverview
        data={{
          website: { count: 128, average: 4.6, stars: { 5: 96, 4: 21, 3: 6, 2: 3, 1: 2 } },
          storelib: { count: 101, average: 4.7 },
          total: 137,
          pending: 3,
          rejected: 4,
          reported: 1,
          unanswered: 40,
          requests: { sent: 412, reviewed: 87, scheduled: 18 },
          recentReviews: rows.slice(0, 4) as never,
          recentRequests: [{ id: id(70), product_id: P[0], sent_at: days(0.2), reminded_at: null, first_name: "Lena Novak" }, { id: id(71), product_id: P[2], sent_at: days(4), reminded_at: days(0.5), first_name: "Sam" }],
        }}
        products={products}
        app={{ enabled: params.get("off") !== "1", ready: true }}
      />
    )
  }
  if (path === "/app/reviews/list") return <ReviewsClient initialList={list as never} initialFilters={NO_FILTERS} products={products} app={{ enabled: true, ready: true, requestsOn: true }} />
  if (path === "/app/reviews/import") return <ImportFlow />
  if (path === "/app/reviews/requests") {
    const r = (n: number, status: string, over: Record<string, unknown> = {}) => ({ id: id(100 + n), order_id: id(800 + n), product_id: P[n % 3], email: `buyer${n}@example.com`, first_name: ["Lena", "Sam", "Maya", "Jonas", "Ana", "Tom"][n % 6], status, skip_reason: null, due_at: days(n), sent_at: status === "scheduled" ? null : days(n), reminded_at: null, last_sent_at: null, review_id: null, created_at: days(n + 7), ...over })
    const reqs = [r(0, "scheduled", { due_at: days(-2) }), r(1, "sent"), r(2, "reminded", { reminded_at: days(1) }), r(3, "reviewed"), r(4, "skipped", { skip_reason: "unsubscribed" }), r(5, "skipped", { skip_reason: "cancelled" }), r(6, "failed", { skip_reason: "send_failed", sent_at: null })]
    return <RequestsPanel initial={{ rows: reqs, total: reqs.length, page: 1, pages: 1, counts: { all: 7, scheduled: 1, sent: 2, reviewed: 1, stopped: 3 }, ready: true }} products={products} settings={readReviewsApp({ enabled: true })} ready />
  }
  if (path === "/app/reviews/widgets") return <ReviewsWidgetsTab enabled productPage />
  if (path === "/app/reviews/analytics") {
    const period = periodFor("30d", NOW)
    const previous = previousPeriod(period)
    const reviews = Array.from({ length: 140 }, (_, i) => ({ created_at: new Date(previous.from + ((i * 37) % 60) * 86_400_000 + (i % 7) * 3_600_000).toISOString(), rating: [5, 5, 4, 5, 3, 5, 4, 1, 5, 2][i % 10], verified: i % 4 !== 0, media: i % 6 === 0 }))
    const requests = Array.from({ length: 90 }, (_, i) => ({ status: i % 5 === 0 ? "reviewed" : i % 13 === 0 ? "failed" : "sent", skip_reason: null, sent_at: i % 13 === 0 ? null : new Date(previous.from + i * 0.66 * 86_400_000).toISOString(), reminded_at: i % 3 === 0 ? new Date(previous.from + i * 0.66 * 86_400_000).toISOString() : null, due_at: new Date(previous.from + i * 0.66 * 86_400_000).toISOString(), updated_at: null }))
    return <ReviewsAnalytics initial={{ range: "30d", period, previous, reviews, requests, capped: false }} />
  }
  if (path === "/app/reviews/settings") return <ReviewsSettingsForm initial={readReviewsApp({ enabled: true, publish: "auto", minStars: 4, videos: true, spam: { words: ["promo code"] } })} ready />
  return null
}

function App() {
  if (path.startsWith("/review/")) {
    return <ReviewPageForm token="AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA" storeName="Drew Studio" product={{ title: "Linen apron", image: null }} starColor="#f5a623" photosAllowed videosAllowed initialRating={4} suggestedName="Ana L." closed={false} review={null} />
  }
  return (
    <div className="h-screen" style={{ height: "100dvh" }}>
      <ReviewsShell pending={3}>{page()}</ReviewsShell>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<App />)

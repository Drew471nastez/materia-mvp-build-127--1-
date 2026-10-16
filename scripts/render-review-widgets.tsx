/**
 * The Storelib Reviews widgets with a store's reviews, for
 * scripts/check-review-widgets.mjs. `?view=` picks one:
 *
 *   section    one widget as a live page draws it: the section's markup and
 *              CSS from the website's renderer, at the page's own width,
 *              `page.in_editor` off (?type=reviews_grid&settings=<json>)
 *   gallery    Reviews › Widgets (components/app/reviews/widgets)
 *   widget     one widget's screen there (?type=)
 *
 * The reviews are a store's own, made the way the website makes them
 * (lib/reviews/storefront.ts buildStorefrontReviews), never sample ones;
 * ?sample=1 hands the gallery the builder's sample reviews instead.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { buildStorefrontReviews, sampleStorefrontReviews, type StorefrontReviewRow } from "@/lib/reviews/storefront"
import { readReviewsApp } from "@/lib/reviews/app-settings"
import { sampleWidgetReviews } from "@/lib/reviews/widgets"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { WidgetsClient } from "@/components/app/reviews/widgets/widgets-client"
import type { WidgetsPageData } from "@/app/app/reviews/widgets/load-widgets"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "section"
const origin = location.origin
const days = (n: number) => new Date(Date.parse("2026-10-10T10:00:00Z") - n * 86_400_000).toISOString()

const P1 = "10000000-0000-4000-8000-000000000001"
const P2 = "10000000-0000-4000-8000-000000000002"
const words = [
  ["Exactly right", "The linen is heavier than I expected and the stitching is neat. It has been through the wash six times and still looks new."],
  ["Bought two", "One for me and one for my sister. The colour is the same as the photos."],
  ["Good, a little long", "Fits well, though it is longer than I thought. I am short, so that is on me."],
  ["Lovely", "Soft, well made and it came quickly."],
  ["Use it every day", "I bake most mornings and this is the one I reach for. The pocket is deep enough for a phone."],
  ["Not for me", "The strap rubbed my neck after an hour. Returned without fuss."],
  ["Great gift", "Wrapped nicely, arrived on time for a birthday."],
  ["Second one", "My first lasted three years. Ordered the same again."],
]
const rows: StorefrontReviewRow[] = words.map(([title, content], i) => ({
  id: `r${i + 1}`,
  product_id: i % 3 === 2 ? P2 : P1,
  rating: [5, 5, 4, 5, 5, 2, 5, 4][i],
  title,
  content,
  created_at: days(i * 4 + 1),
  reviewer_name: ["Maya Ross", "Jonas Klein", "Priya Shah", "Sam Torres", "Elena Varga", "Tom Baker", "Ana Lima", "Drew Hall"][i],
  verified: i !== 3,
  featured: i === 0 || i === 4,
  photos: [],
  seller_reply: i === 2 ? "Thank you Priya. A shorter one is coming in spring." : null,
}))
const settings = readReviewsApp({ enabled: true })
const real = buildStorefrontReviews({
  settings,
  creatorId: "c",
  rows,
  products: [
    { id: P1, title: "Linen apron", slug: "linen-apron", thumbnail_url: `${origin}/product.svg` },
    { id: P2, title: "Oak board", slug: "oak-board", thumbnail_url: `${origin}/product2.svg` },
  ],
  product: { id: P1, title: "Linen apron", rows: rows.filter((r) => r.product_id === P1), ratings: rows.filter((r) => r.product_id === P1).map((r) => r.rating) },
})
/* Photos a buyer added, served by the probe (a live page's are on Storelib's storage). */
const photos: Record<string, string[]> = { r1: [`${origin}/photo-1.svg`, `${origin}/photo-2.svg`], r2: [`${origin}/photo-3.svg`], r5: [`${origin}/photo-4.svg`], r7: [`${origin}/photo-5.svg`] }
const dress = <T extends { id: string; photos: string[]; has_photos: boolean }>(r: T): T => (photos[r.id] ? { ...r, photos: photos[r.id], has_photos: true } : r)
real.all.items = real.all.items.map(dress)
real.all.featured_items = real.all.featured_items.map(dress)
if (real.product) real.product.items = real.product.items.map(dress)
real.here = { ...real.here, items: real.here.items.map(dress) }

const sample = sampleWidgetReviews({ ...sampleStorefrontReviews(settings, "c", { id: P1, title: "Linen apron" }), enabled: true })
const reviews = params.get("sample") === "1" ? sample : real

const root = document.getElementById("app")!
if (view === "section") {
  const type = params.get("type") || "reviews_grid"
  let own: Record<string, unknown> = {}
  try {
    own = JSON.parse(params.get("settings") || "{}")
  } catch {
    own = {}
  }
  const template = params.get("template") || (type === "reviews_product" || type === "reviews_badge" ? "product" : "index")
  const out = renderStorelibSection({ id: "w1", type, name: type, settings: own, blocks: [], hidden: false }, {} as never, { template, in_editor: params.get("editor") === "1" }, undefined, [], { reviews } as never)
  if (out.ok === false) root.textContent = `FAILED ${JSON.stringify(out)}`
  else root.innerHTML = `<style>${out.css}</style>${out.html}`
  document.body.dataset.ready = "1"
} else {
  const data: WidgetsPageData = {
    state: "ok",
    reviews: reviews as WidgetsPageData["reviews"],
    appEnabled: params.get("off") !== "1",
    installId: "inst-1",
    installName: "My website",
    compat: params.get("compat") === "1",
    theme: {},
    presets: { ready: true, list: [{ id: "11111111-1111-4111-8111-111111111111", widget: "reviews_grid", name: "Home page grid", settings: { columns: { desktop: 2, tablet: 2, mobile: 1 }, layout: "masonry" }, created_at: days(1), updated_at: days(1) }] },
  }
  if (view === "widget") history.replaceState(null, "", `?view=widget&widget=${params.get("type") || "reviews_grid"}`)
  createRoot(root).render(<div style={{ height: "100vh" }}><WidgetsClient data={data} /></div>)
  setTimeout(() => (document.body.dataset.ready = "1"), 300)
}

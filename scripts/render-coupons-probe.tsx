/**
 * The Coupons list and the coupon form (app/app/coupons), with a creator's
 * worth of codes in every state, for scripts/check-coupons-page.mjs.
 * `?form` mounts the form for a new code, `?edit` the form for a saved one.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CouponsClient, type Coupon } from "@/app/app/coupons/coupons-client"
import { CreateCouponClient } from "@/app/app/coupons/new/create-coupon-client"

const day = 86_400_000
const at = (d: number) => new Date(Date.now() + d * day).toISOString()
const PIC = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#c7b8f5"/></svg>')

const products = Array.from({ length: 6 }, (_, i) => ({
  id: `0000000${i}-0000-4000-8000-000000000000`,
  title: i === 1 ? "The complete portrait retouching course, with every raw file" : `Product ${i + 1}`,
  price_cents: 1200 + i * 500,
  thumbnail_url: i % 3 === 2 ? null : PIC,
  status: "published",
}))

const base = { creator_id: "c1", product_ids: null, usage_limit: null, usage_count: 0, starts_at: null, expires_at: null, min_purchase_cents: null, is_active: true, created_at: at(-10) }
const coupons: Coupon[] = [
  { ...base, id: "a1", code: "SUMMER20", discount_type: "percentage", discount_value: 20, usage_count: 14, usage_limit: 100, expires_at: at(20) },
  { ...base, id: "a2", code: "WELCOME5", discount_type: "fixed", discount_value: 5, usage_count: 3, min_purchase_cents: 2500 },
  { ...base, id: "a3", code: "BLACKFRIDAY", discount_type: "percentage", discount_value: 40, starts_at: at(30), expires_at: at(34) },
  { ...base, id: "a4", code: "SPRING10", discount_type: "percentage", discount_value: 10, expires_at: at(-40), usage_count: 57 },
  { ...base, id: "a5", code: "FIRST50", discount_type: "percentage", discount_value: 50, usage_limit: 50, usage_count: 50 },
  { ...base, id: "a6", code: "PORTRAIT15", discount_type: "percentage", discount_value: 15, product_ids: [products[1].id], is_active: false },
]

const q = location.search
createRoot(document.getElementById("app")!).render(
  <div style={{ position: "fixed", inset: 0 }}>
    <div className="h-full app-content-scroll">
      {q.includes("form") ? (
        <CreateCouponClient products={products} initialCoupon={null} />
      ) : q.includes("edit") ? (
        <CreateCouponClient products={products} initialCoupon={{ ...coupons[0], product_ids: [products[0].id, products[1].id] }} />
      ) : (
        <CouponsClient creatorId="c1" initialCoupons={coupons} products={products} />
      )}
    </div>
  </div>,
)

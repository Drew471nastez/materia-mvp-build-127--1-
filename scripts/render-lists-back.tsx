/**
 * The Orders, Products and Coupons lists (the real ones: app/app/orders/
 * orders-client.tsx, app/app/products/products-client.tsx, app/app/coupons/
 * coupons-client.tsx) inside the real shell pieces that decide how an /app
 * page arrives (NavigationLoadingBar and AppStage), over a shell shaped like
 * app/app/layout.tsx, for scripts/check-lists-back.mjs.
 *
 * The router is scripts/render-emails-back.tsx's: `push` and `replace` write
 * the address after `__delay` ms and the page for it commits with it; back
 * and forward are the browser's own, committed a moment after the popstate.
 * A query written by the page itself (an order opened over the list) is seen
 * at once, as Next.js syncs history.pushState and replaceState.
 *
 * The pages the lists go to are stand ins, which is all the lists need from
 * the way there and back:
 *
 *   /app/products/<id>   the product editor's side of the round trip
 *                        (useListOrigin, and returnToProducts on Back)
 *   /app/coupons/<id>    the coupon editor's (useCouponListOrigin,
 *                        returnToCoupons)
 *   /app/payouts         somewhere else in the app, left by the browser's
 *                        back, for Orders: the link in its payouts note
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname, useRouter } from "next/navigation"
import { LanguageProvider } from "@/lib/i18n"
import { NavigationLoadingBar } from "@/components/app/navigation-loading-bar"
import { AppStage } from "@/components/app/app-stage"
import { OrdersClient } from "./fixtures/orders-client"
import { ProductsClient } from "@/app/app/products/products-client"
import { CouponsClient, type Coupon } from "@/app/app/coupons/coupons-client"
import { returnToProducts, useListOrigin } from "@/app/app/products/list-return"
import { returnToCoupons, useCouponListOrigin } from "@/app/app/coupons/list-return"
import { fixtureRows } from "./render-orders-probe"

const NOW = Date.now()
const ORDER_ROWS = fixtureRows(NOW)

const products = Array.from({ length: 40 }, (_, i) => ({
  id: `p${i}`,
  creator_id: "c1",
  title: `Product ${i + 1}`,
  type: "digital",
  price_cents: 1200 + i * 350,
  status: "published",
  thumbnail_url: null,
  slug: `product-${i}`,
  created_at: new Date(NOW - i * 86400000).toISOString(),
  archived: false,
  sales_count: 0,
}))

const couponBase = { creator_id: "c1", product_ids: null, usage_limit: null, usage_count: 0, starts_at: null, expires_at: null, min_purchase_cents: null, is_active: true, created_at: new Date(NOW - 10 * 86400000).toISOString() }
const coupons: Coupon[] = Array.from({ length: 30 }, (_, i) => ({
  ...couponBase,
  id: `c${i}`,
  code: `CODE${String(i).padStart(2, "0")}`,
  discount_type: i % 2 ? "fixed" : "percentage",
  discount_value: 5 + i,
}))

window.fetch = (async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch

function EditorBody({ onBack }: { onBack: () => void }) {
  return (
    <div data-page="editor" className="page-scroll h-full overflow-y-auto bg-[#f8f9fa] p-8">
      <button type="button" data-editor-back="" onClick={onBack}>
        Back
      </button>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="mt-3 h-24 rounded-2xl border border-[#e5e7eb]/60 bg-white" />
      ))}
    </div>
  )
}

/* Each editor's own side of "the list opened me", as the real one calls it. */
function ProductEditorStandIn() {
  const router = useRouter()
  useListOrigin()
  return <EditorBody onBack={() => returnToProducts(router, null)} />
}

function CouponEditorStandIn() {
  const router = useRouter()
  useCouponListOrigin()
  return <EditorBody onBack={() => returnToCoupons(router, { id: null })} />
}

function Elsewhere() {
  return (
    <div data-page="elsewhere" className="page-scroll h-full overflow-y-auto bg-[#f8f9fa] p-8">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="mt-3 h-24 rounded-2xl border border-[#e5e7eb]/60 bg-white" />
      ))}
    </div>
  )
}

function Page({ path }: { path: string }) {
  if (path === "/app/orders")
    return (
      <OrdersClient
        key="orders"
        rows={ORDER_ROWS}
        products={[
          { id: "p1", title: "Lightroom preset pack" },
          { id: "p2", title: "Brush set for Procreate" },
          { id: "p3", title: "Portrait course" },
        ]}
        stripeConnected
        hiddenColumns={[]}
        initialRange={null}
        timeZone="Europe/Bucharest"
        now={NOW}
      />
    )
  if (path === "/app/products") return <ProductsClient key="products" products={products} creatorUsername="astrid" />
  if (path === "/app/coupons") return <CouponsClient key="coupons" creatorId="c1" initialCoupons={coupons} products={[]} />
  if (path.startsWith("/app/products/")) return <ProductEditorStandIn key={path} />
  if (path.startsWith("/app/coupons/")) return <CouponEditorStandIn key={path} />
  return <Elsewhere key={path} />
}

function Shell() {
  const path = usePathname()
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          <Page path={path} />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Suspense fallback={null}>
      <NavigationLoadingBar />
      <AppStage />
    </Suspense>
    <Shell />
  </LanguageProvider>,
)

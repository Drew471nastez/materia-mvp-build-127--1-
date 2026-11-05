/**
 * The Coupons list and the coupon editor (app/(storelib)/app/coupons), with a creator's
 * worth of codes in every state, for scripts/check-coupons-page.mjs. The
 * editor is drawn through its real layouts (../new/layout, ../[id]/layout),
 * in a shell shaped like app/(storelib)/app/layout.tsx: the phone header and the
 * desktop header ([data-shell-chrome], z 50), the rail, and a nav pill at
 * z 55, as scripts/render-page-layer.tsx draws them.
 *
 *   ?page=list | new | edit     which page (list by default; `?form` and
 *                               `?edit` still work, as before). Leaving the
 *                               editor draws the list in its place.
 *
 * The API is stood in for: window.fetch records what the editor sends in
 * window.__sent and answers as the routes do.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CouponsClient, type Coupon } from "@/app/(storelib)/app/coupons/coupons-client"
import { CouponEditor } from "@/app/(storelib)/app/coupons/coupon-editor"
import NewCouponLayout from "@/app/(storelib)/app/coupons/new/layout"
import EditCouponLayout from "@/app/(storelib)/app/coupons/[id]/layout"

const day = 86_400_000
const at = (d: number) => new Date(Date.now() + d * day).toISOString()
const PIC = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#d9dbe0"/></svg>')

const products = Array.from({ length: 8 }, (_, i) => ({
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

type Sent = { url: string; method: string; body: unknown }
const w = window as unknown as { __sent: Sent[]; __answer?: { status: number; body: unknown } }
w.__sent = []
window.fetch = (async (url: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(String(init.body)) : null
  w.__sent.push({ url: String(url), method: init?.method || "GET", body })
  const id = String(url).match(/\/api\/coupons\/([^/?]+)/)?.[1] ?? "new1"
  const answer = w.__answer ?? { status: init?.method === "POST" ? 201 : 200, body: init?.method === "DELETE" ? { ok: true } : { coupon: { ...base, id, usage_count: id === "a1" ? 14 : 0, ...(body as object) } } }
  return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } })
}) as typeof fetch

const q = new URLSearchParams(location.search)
const which = q.get("page") || (q.has("form") ? "new" : q.has("edit") ? "edit" : "list")
const saved = { ...coupons[0], product_ids: [products[0].id, products[1].id] }

/* The way back: the router's replace or back (the stub in scripts/check-coupons-page.mjs) draws the list, with this bundle's module state, as the app would. */
function Page() {
  const [page, setPage] = React.useState(which)
  React.useEffect(() => {
    const go = (e: Event) => {
      const to = (e as CustomEvent<string>).detail
      if (to === "/app/coupons" || to === "back") setPage("list")
    }
    window.addEventListener("probe-nav", go)
    return () => window.removeEventListener("probe-nav", go)
  }, [])
  return <Shown which={page} />
}

function Shown({ which }: { which: string }) {
  if (which === "new") return <NewCouponLayout><CouponEditor products={products} initialCoupon={null} /></NewCouponLayout>
  if (which === "edit") return <EditCouponLayout><CouponEditor products={products} initialCoupon={saved} /></EditCouponLayout>
  return <CouponsClient creatorId="c1" initialCoupons={coupons} products={products} />
}

createRoot(document.getElementById("app")!).render(
  <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
    <header data-shell-chrome="" data-desktop-header="" className="fixed left-0 right-0 top-0 z-50 hidden pt-[env(safe-area-inset-top,_0px)] md:block">
      <div className="h-[58px] bg-[#131316]" />
    </header>
    <header data-shell-chrome="" className="fixed left-0 right-0 top-0 z-50 bg-[#111111] md:hidden" style={{ height: "calc(68px + env(safe-area-inset-top, 0px))", transform: "translateZ(0)" }}>
      <div className="flex h-[68px] items-center px-4" style={{ marginTop: "env(safe-area-inset-top, 0px)" }}>
        <span className="text-[13px] text-white/90">AndrewRullz</span>
      </div>
    </header>
    <aside data-shell-chrome="" data-rail="" className="fixed left-0 z-40 hidden w-[240px] bg-white md:flex" style={{ top: "calc(58px + env(safe-area-inset-top, 0px))", height: "calc(100svh - 58px - env(safe-area-inset-top, 0px))" }} />
    <div data-app-nav-pill="" className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden" style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom, 0px))" }}>
      <button data-pill-tab="" className="pointer-events-auto mb-1.5 h-[58px] w-[300px] rounded-full bg-black" />
    </div>
    <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[240px] bg-[#f8f9fa] md:bg-white rounded-t-[20px] md:rounded-none overflow-hidden app-main-content">
      <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
        <Page />
      </div>
    </main>
  </div>,
)

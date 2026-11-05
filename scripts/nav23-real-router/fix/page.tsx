import Link from "next/link"
import { Mounts } from "./mounts"
/* A plain /app page: heading, a few cards, links the probe presses. */
export function PlainPage({ title, rows = 8, pane = false }: { title: string; rows?: number; pane?: boolean }) {
  /* `pane`: the list pages' own scroller and fade, as app/(storelib)/app/products/products-client.tsx draws them. */
  if (pane) return <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter"><PlainPage title={title} rows={rows} /></div>
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 lg:px-8" data-harness-page={title}>
      <Mounts name={`page:${title}`} />
      <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">{title}</h1>
      <div className="mt-4 flex flex-wrap gap-3 text-[14px]">
        <Link href="/app" data-go="home">Home</Link>
        <Link href="/app/settings" data-go="settings">Settings</Link>
        <Link href="/app/settings?tab=checkout" data-go="settings-checkout">Checkout settings</Link>
        <Link href="/app/website-builder" data-go="website">Website</Link>
        <Link href="/app/products" data-go="products">Products</Link>
        <Link href="/app/products/p1" data-go="product">A product</Link>
        <Link href="/website-builder/editor/inst1" data-go="editor">Edit website</Link>
      </div>
      <div className="mt-6 grid gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 text-[14px] text-[#6b7280]">{title} row {i + 1}</div>
        ))}
      </div>
    </div>
  )
}

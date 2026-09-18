import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } }

/**
 * ===========================================================================
 *  A BASKET'S RECEIPT
 * ===========================================================================
 * A receipt is one order, because until now a purchase was one product. A
 * basket is several orders taken in one payment, so this is the page that
 * says so: what was bought, what it came to, and a receipt each.
 *
 * It is keyed by the Stripe Checkout Session rather than by a token of its
 * own. The session id is already the thing every one of those orders
 * carries, it is in the URL Stripe sent the buyer back to, and inventing a
 * second identifier for the same set of rows would be a column to keep in
 * step for no gain.
 *
 * NOT A SECRET, AND IT DOES NOT NEED TO BE. Nothing here is more than the
 * buyer's own basket: product names, what each cost, and links to receipts
 * that carry their own unguessable tokens. The downloads are behind those.
 */
export default async function CartReceiptPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const admin = createAdminClient()

  const { data: orders } = await admin
    .from("orders")
    .select("id, amount_cents, receipt_token, created_at, product:products(title, thumbnail_url, slug)")
    .eq("stripe_session_id", sessionId)
    .order("created_at", { ascending: true })

  if (!orders || orders.length === 0) notFound()

  const total = orders.reduce((n: number, o: any) => n + (o.amount_cents ?? 0), 0)
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

  return (
    <main className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6">
        <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">Thanks, your order is done</h1>
        <p className="mt-1 text-[14px] text-[#6b7280]">
          {orders.length === 1 ? "One item" : `${orders.length} items`}, paid in one go. Each has its own receipt and
          downloads.
        </p>

        <div className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <ul>
            {orders.map((o: any) => (
              <li key={o.id} className="flex items-center gap-4 border-b border-[#e5e7eb]/60 px-4 py-4 last:border-b-0 sm:px-5">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#f1f3f5]">
                  {o.product?.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.product.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[#1a1a2e]">
                    {o.product?.title ?? "Your purchase"}
                  </p>
                  <Link
                    href={`/receipt/${o.receipt_token}`}
                    className="text-[13px] font-medium text-[#8b5cf6] hover:underline"
                  >
                    Receipt and downloads
                  </Link>
                </div>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[#1a1a2e]">
                  {money(o.amount_cents ?? 0)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between px-4 py-4 sm:px-5">
            <span className="text-[14px] text-[#6b7280]">Paid</span>
            <span className="text-[18px] font-bold tabular-nums text-[#1a1a2e]">{money(total)}</span>
          </div>
        </div>

        <Link
          href="/library"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white"
        >
          Go to your library
        </Link>
      </div>
    </main>
  )
}

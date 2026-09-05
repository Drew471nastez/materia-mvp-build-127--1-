import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, ShoppingBag } from "lucide-react"

import { requireVerifiedUser } from "@/lib/auth/current-user"
import { resolveOrderParty } from "@/lib/orders/access"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * One order, from whichever side is looking.
 *
 * The access check is `resolveOrderParty` (lib/orders/access.ts), so the page
 * and anything else reading an order can never disagree about
 * who is allowed to see one. Anyone who is neither the buyer nor the
 * seller gets a 404, identical to the answer for an id that does not exist.
 *
 * The product is fetched with the admin client on purpose: a listing that has
 * since been unpublished or sold is invisible to the buyer under RLS, and a
 * receipt that blanks out because the seller took the listing down would be a
 * bug. Only the fields shown below are read.
 */

export const metadata: Metadata = {
  title: "Comanda mea | Storelib",
  robots: { index: false, follow: false },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatDate(iso: string | null): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })
  } catch {
    return ""
  }
}

function formatRon(cents: number | null): string {
  if (cents === null || cents === undefined) return ""
  return new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 2 }).format(
    cents / 100,
  )
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const supabase = await createClient()
  // Verified rather than session-read: the id decides access to somebody's
  // order and is passed to a function that queries with the service role.
  const userId = await requireVerifiedUser(supabase)
  if (!userId) redirect(`/login?next=/orders/${id}`)

  const resolved = await resolveOrderParty(id, userId)
  if (!resolved.ok) notFound()

  const { order, party } = resolved

  type ProductCard = { title: string | null; slug: string | null; thumbnail_url: string | null }
  let product: ProductCard | null = null
  if (order.product_id) {
    const { data } = await createAdminClient()
      .from("products")
      .select("title, slug, thumbnail_url")
      .eq("id", order.product_id)
      .maybeSingle()
    product = (data as unknown as ProductCard) ?? null
  }

  const backHref = party === "buyer" ? "/purchases" : "/sales"

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-3 md:pb-12">
      <Link
        href={backHref}
        className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold text-neutral-600 transition-colors active:bg-neutral-100"
      >
        <ArrowLeft className="h-4 w-4" />
        {party === "buyer" ? "Achizițiile mele" : "Vânzările mele"}
      </Link>

      <h1 className="mt-2 text-[22px] font-bold leading-tight text-neutral-900">
        {party === "buyer" ? "Comanda ta" : "Vânzarea ta"}
      </h1>
      <p className="mt-1 text-[13.5px] text-neutral-500">
        {formatDate(order.created_at)}
        {order.amount_cents !== null && order.amount_cents !== undefined
          ? ` · ${formatRon(order.amount_cents)}`
          : ""}
      </p>

      {/* The item */}
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-neutral-200 p-3">
        {product?.thumbnail_url ? (
          <Image
            src={product.thumbnail_url}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-300">
            <ShoppingBag className="h-6 w-6" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-neutral-900">
            {product?.title ?? "Articol indisponibil"}
          </span>
          {product?.slug && (
            <Link
              href={`/products/${encodeURIComponent(product.slug)}`}
              className="mt-0.5 inline-block text-[13px] font-medium text-[#7c3aed]"
            >
              Vezi anunțul
            </Link>
          )}
        </span>
      </div>

      {/* Shipping. Renders nothing at all when the shipping migration has not
          been run, so this page is safe to ship before the SQL is applied. */}
      <div className="mt-4">
      </div>
    </div>
  )
}

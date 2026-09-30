import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1))
  const pageSize = 25
  const from = (page - 1) * pageSize
  try {
    const { data, error, count } = await createAdminClient()
      .from("orders")
      .select(
        "id, created_at, status, amount_cents, currency, fee_cents, product:products(title, creator:creators(id, slug, display_name))",
        { count: "exact" },
      )
      .eq("status", "disputed")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) return adminFailure("payments disputes", error, "Disputes could not be read.")
    const rows =
      data?.map((o) => ({
        orderId: o.id,
        amount: o.amount_cents ?? 0,
        currency: (o.currency || "usd").toUpperCase(),
        storelibFee: o.fee_cents ?? 0,
        created: o.created_at,
        product: (o as { product?: { title?: string } }).product?.title ?? null,
        creator: (o as { product?: { creator?: { id: string; slug: string | null; display_name: string | null } } }).product?.creator ?? null,
        stripeStatus: "disputed",
        financialImpact: "Funds may be held per Stripe dispute rules",
      })) ?? []
    return NextResponse.json({ rows, total: count ?? rows.length, page }, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments disputes", e, "Disputes could not be read.")
  }
}

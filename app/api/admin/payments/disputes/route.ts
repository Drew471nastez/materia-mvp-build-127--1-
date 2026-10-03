import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

type CreatorRef = { id: string; slug: string | null; display_name: string | null }

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
    /* Every recorded case (run-now part 82): the deadline, what the creator sent, and whether the money was taken back and given back. Admin only. */
    const recorded = await createAdminClient()
      .from("payment_disputes")
      .select("stripe_dispute_id, amount_minor, currency, reason, status, inquiry, evidence_due_by, product_title, reversed_minor, restored_minor, recovery, outcome, creator_note, creator_note_at, opened_at, closed_at, creator:creators(id, slug, display_name)")
      .order("opened_at", { ascending: false })
      .limit(100)
    const cases = recorded.error
      ? []
      : (recorded.data ?? []).map((d) => ({
          disputeId: d.stripe_dispute_id,
          amount: d.amount_minor ?? 0,
          currency: String(d.currency || "usd").toUpperCase(),
          reason: d.reason,
          status: d.status,
          inquiry: !!d.inquiry,
          evidenceDueBy: d.evidence_due_by,
          product: d.product_title,
          reversed: d.reversed_minor ?? 0,
          restored: d.restored_minor ?? 0,
          recovery: d.recovery,
          outcome: d.outcome,
          creatorNote: d.creator_note,
          creatorNoteAt: d.creator_note_at,
          opened: d.opened_at,
          closed: d.closed_at,
          creator: (() => {
            const c = (d as unknown as { creator?: CreatorRef | CreatorRef[] | null }).creator
            return (Array.isArray(c) ? c[0] : c) ?? null
          })(),
        }))
    return NextResponse.json({ rows, total: count ?? rows.length, page, cases }, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments disputes", e, "Disputes could not be read.")
  }
}

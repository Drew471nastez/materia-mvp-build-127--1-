import "server-only"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireTeamPermission } from "@/lib/team/server"
import { escapeLike, isMissingColumn, type CouponValues } from "@/lib/checkout/coupons"

/**
 * ===========================================================================
 *  WRITING A CREATOR'S CODES
 * ===========================================================================
 * Shared by the create and edit routes. The owner reads and writes on their
 * own client, so row-level security still decides what they can touch. A
 * team member given Marketing (lib/team) works in the store through the
 * service role, and every query here names the store's id, found by the
 * server from their membership, never from the request. The checks below
 * are the ones a policy cannot make: a code is one per creator whatever its
 * case, and a code can only name their products. Database errors are logged
 * by code and never sent back as text.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function signedInCreator(): Promise<
  { ok: true; supabase: Supabase; creatorId: string } | { ok: false; response: NextResponse }
> {
  const gate = await requireTeamPermission("marketing")
  if (gate instanceof NextResponse) return { ok: false, response: gate }
  const supabase = gate.isOwner ? await createClient() : (gate.db as Supabase)
  return { ok: true, supabase, creatorId: gate.creatorId }
}

/** Another of this creator's codes already reads the same, ignoring case. */
export async function codeTaken(supabase: Supabase, creatorId: string, code: string, exceptId: string | null): Promise<boolean> {
  let query = supabase.from("coupons").select("id, code").eq("creator_id", creatorId).ilike("code", escapeLike(code))
  if (exceptId) query = query.neq("id", exceptId)
  const { data } = await query.limit(5)
  return (data ?? []).some((row: { code: string }) => row.code.toLowerCase() === code.toLowerCase())
}

/** Every product the code names is one of this creator's. */
export async function productsAreTheirs(supabase: Supabase, creatorId: string, ids: string[] | null): Promise<boolean> {
  if (!ids || ids.length === 0) return true
  const { data, error } = await supabase.from("products").select("id").eq("creator_id", creatorId).in("id", ids)
  if (error) return false
  return new Set((data ?? []).map((row: { id: string }) => row.id)).size === ids.length
}

export const TAKEN = () => NextResponse.json({ error: "You already have a code that reads the same." }, { status: 409 })

/**
 * Inserts or updates, and when the minimum order column has not been added
 * yet (supabase/sql/RUN_COUPONS.sql) writes everything else, as long as no
 * minimum was asked for. The coupon form keeps working before the SQL runs.
 */
export async function writeCoupon(
  supabase: Supabase,
  creatorId: string,
  values: CouponValues,
  id: string | null,
): Promise<NextResponse> {
  const attempt = async (row: Record<string, unknown>) =>
    id
      ? supabase.from("coupons").update(row).eq("id", id).eq("creator_id", creatorId).select().maybeSingle()
      : supabase.from("coupons").insert({ ...row, creator_id: creatorId }).select().single()

  let result = await attempt({ ...values })
  if (result.error && isMissingColumn(result.error, "min_purchase_cents")) {
    if (values.min_purchase_cents !== null) {
      return NextResponse.json({ error: "A minimum order needs one database update first. Save without it for now." }, { status: 409 })
    }
    const { min_purchase_cents: _unused, ...rest } = values
    result = await attempt(rest)
  }
  if (result.error) {
    if (result.error.code === "23505") return TAKEN()
    console.error("[coupons] write failed", result.error.code)
    return NextResponse.json({ error: "The coupon could not be saved. Try again." }, { status: 500 })
  }
  if (!result.data) return NextResponse.json({ error: "That coupon is gone." }, { status: 404 })
  return NextResponse.json({ coupon: result.data }, { status: id ? 200 : 201 })
}

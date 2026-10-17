import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { UUID } from "@/lib/memberships/server"
import { buyerCountry, buyerIp, membershipTaxQuote } from "@/lib/tax/membership"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * GET /api/memberships/tax-quote?productId=<uuid>&interval=month|year (round AG)
 *
 * The tax a membership's price carries for the person asking, worked out the
 * way the subscription will charge it (lib/tax/membership.ts), so every
 * membership checkout shows the same total it charges. Answers { tax: null }
 * when there is none. Public: a price and a buyer's own location, nothing
 * else; never cached.
 */
export async function GET(request: Request) {
  const limited = await rateLimit({ bucket: "tax-quote", subjects: [addressSubject(request)], windows: [{ limit: 60, seconds: 600 }], message: "Too many requests. Try again in a few minutes." })
  if (limited) return limited
  const q = new URL(request.url).searchParams
  const productId = q.get("productId") ?? ""
  const interval = q.get("interval") === "year" ? "year" : "month"
  if (!UUID.test(productId)) return NextResponse.json({ tax: null }, { headers: NO_STORE })
  const admin = createAdminClient()
  const [{ data: product }, { data: plan }] = await Promise.all([
    admin.from("products").select("id, creator_id, status, type").eq("id", productId).maybeSingle(),
    admin.from("membership_plans").select("monthly_price_cents, yearly_price_cents, currency").eq("product_id", productId).maybeSingle(),
  ])
  if (!product || product.status !== "published" || product.type !== "membership" || !plan) return NextResponse.json({ tax: null }, { headers: NO_STORE })
  const amount = (interval === "year" ? plan.yearly_price_cents : plan.monthly_price_cents) as number | null
  if (!amount) return NextResponse.json({ tax: null }, { headers: NO_STORE })
  const h = await headers()
  const quote = await membershipTaxQuote(admin, { creatorId: product.creator_id as string, productId, amountCents: amount, currency: (plan.currency as string) || "usd", country: buyerCountry(h), ip: buyerIp(h) }).catch(() => null)
  return NextResponse.json({ tax: quote ? { taxCents: quote.taxCents, included: quote.included, label: quote.label } : null }, { headers: NO_STORE })
}

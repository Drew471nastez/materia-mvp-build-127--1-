import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { visitorOfRequest } from "@/lib/site-accounts/session"
import { customerById } from "@/lib/site-accounts/customers"
import { privateResponse } from "@/lib/site-accounts/respond"
import { customerOwns } from "@/lib/site-accounts/owned-products"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  GET /api/site-account/owned?ids=<product>,<product>
 * ===========================================================================
 * Which of these products the visitor signed in to THIS website already
 * owns, for the product page's "You already own this" (lib/site-accounts/
 * owned-products). Who is the website's own session cookie, nothing in the
 * request; a guest is `signedIn: false` and nothing else, so the answer
 * never says anything about anybody's email.
 */
export async function GET(request: Request) {
  const visitor = visitorOfRequest(request)
  if (!visitor) return privateResponse(NextResponse.json({ signedIn: false, owned: {} }))
  const db = createAdminClient()
  const customer = await customerById(db, visitor)
  if (!customer?.email) return privateResponse(NextResponse.json({ signedIn: false, owned: {} }))
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const owned = await customerOwns(db, { creatorId: visitor.creatorId, email: customer.email }, ids)
  return privateResponse(NextResponse.json({ signedIn: true, owned, account: "/account" }))
}

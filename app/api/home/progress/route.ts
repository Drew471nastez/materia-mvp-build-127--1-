import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
/* Round 52: the token's verified signature, with no Supabase Auth round trip (lib/auth/route-user). */
import { readerForRequest } from "@/lib/auth/route-user"
import { readProgressFacts } from "@/lib/home/progress-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/home/progress
 *
 * What the signed in creator has done, as lib/home/progress reads it:
 * `{ facts }`. Home asks again when it comes back into view or is landed on
 * from another page, because the router may hand it a page fetched minutes
 * ago, and a step done in the meantime (a domain verified, Stripe
 * connected, a website published) must tick without a reload.
 *
 * `?sales=0` leaves the orders unread: Home keeps its own over realtime and
 * counts the sales from those. Everything is read on the service role, as
 * Home reads it, always by the creator row found by the caller's own id.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const current = await readerForRequest()
  if (current.state === "indeterminate") {
    return NextResponse.json({ error: "Could not reach Storelib. Try again in a moment." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
  if (!current.user) return NextResponse.json({ error: "Sign in again to see this." }, { status: 401, headers: { "Cache-Control": "no-store" } })

  const withSales = request.nextUrl.searchParams.get("sales") !== "0"
  try {
    const facts = await readProgressFacts(createAdminClient(), {
      userId: current.user.id,
      userMetadata: current.user.user_metadata ?? null,
      withSales,
    })
    if (!facts) return NextResponse.json({ error: "No store on this account yet." }, { status: 404, headers: { "Cache-Control": "no-store" } })
    return NextResponse.json({ facts, sales: withSales }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[home/progress] not read:", error instanceof Error ? error.name : "unknown")
    return NextResponse.json({ error: "Could not read your progress." }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}

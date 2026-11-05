import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
/* Round 52: the token's verified signature, with no Supabase Auth round trip (lib/auth/route-user). */
import { readerForRequest } from "@/lib/auth/route-user"
import { GUIDE_OPENED_KEY, guideOpenedFrom } from "@/lib/home/progress"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/home/guide
 *
 * The setup guide on Home was opened: kept on the account (its metadata,
 * GUIDE_OPENED_KEY), so the step stays done on every device, not only in
 * this browser. Written once with the person's own session, which is the
 * only thing that can write their metadata; asking again after that changes
 * nothing and writes nothing. No SQL needed.
 */
export async function POST() {
  const supabase = await createClient()
  const current = await readerForRequest()
  if (current.state === "indeterminate") {
    return NextResponse.json({ error: "Could not reach Storelib. Try again in a moment." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
  if (!current.user) return NextResponse.json({ error: "Sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } })

  if (guideOpenedFrom(current.user.user_metadata)) {
    return NextResponse.json({ ok: true, already: true }, { headers: { "Cache-Control": "no-store" } })
  }
  const { error } = await supabase.auth.updateUser({ data: { [GUIDE_OPENED_KEY]: new Date().toISOString() } })
  if (error) {
    console.error(`[home/guide] not kept on the account (${error.code ?? error.status ?? "unknown"})`)
    return NextResponse.json({ error: "That did not save. It will be asked again next time." }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}

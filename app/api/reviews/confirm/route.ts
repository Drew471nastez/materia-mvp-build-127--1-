import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { confirmPagePath, verifyDraft } from "@/lib/reviews/request-token"
import { confirmDraft } from "@/lib/reviews/site-server"
import { returnWithState } from "@/lib/reviews/return-page"
import { storeOriginFor } from "@/lib/physical/order-link-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  CONFIRMING A WEBSITE REVIEW (Storelib Reviews)
 * ===========================================================================
 *   POST form { token }   from the button on /review/confirm/<token>
 *
 * The token is the link emailed to the address typed into the website's
 * form (lib/reviews/digest-server sendConfirmEmail): holding it is the
 * proof. A press posts the held review once (lib/reviews/site-server
 * confirmDraft); the answer is the page again, which then says what
 * happened. A link scanner that only opens the page posts nothing.
 *
 * BACK TO THE PAGE IT WAS WRITTEN ON (round AH). With `back` (the website
 * page the form was on, lib/reviews/return-page) and that page on a host
 * that serves this store's website, a posted review sends the buyer there,
 * at the reviews (?slr=posted), instead of to a Storelib page.
 */
const HEADERS = { "Cache-Control": "no-store" }

export async function POST(request: NextRequest) {
  const limited = await rateLimit({ bucket: "review-confirm", subjects: [addressSubject(request)], windows: [{ limit: 10, seconds: 600 }, { limit: 40, seconds: 86_400 }], message: "That is a lot at once. Try again later." })
  if (limited) return limited
  let token: unknown = null
  let back: unknown = null
  try {
    const form = await request.formData()
    token = form.get("token")
    back = form.get("back")
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: HEADERS })
  }
  const id = verifyDraft(token)
  if (!id || typeof token !== "string") return NextResponse.json({ error: "This link doesn't work." }, { status: 404, headers: HEADERS })
  const db = createAdminClient()
  const done = await confirmDraft(db, id)
  if (done.ok) {
    const home = await backHome(db, id, back)
    if (home) return NextResponse.redirect(returnWithState(home, done.status === "published" ? "posted" : "waiting"), { status: 303, headers: HEADERS })
  }
  const to = new URL(confirmPagePath(token), request.url)
  if (!done.ok) to.searchParams.set("error", String(done.status))
  return NextResponse.redirect(to, { status: 303, headers: HEADERS })
}

/** `back`, when it is a page on a host that serves this draft's store's website; else null. */
async function backHome(db: ReturnType<typeof createAdminClient>, draftId: string, back: unknown): Promise<string | null> {
  if (typeof back !== "string" || back.length > 1000) return null
  let origin: string
  try {
    const u = new URL(back)
    if (u.protocol !== "https:") return null
    origin = u.origin
  } catch {
    return null
  }
  try {
    const { data } = await db.from("review_drafts").select("creator_id").eq("id", draftId).maybeSingle()
    const creatorId = (data as { creator_id?: string } | null)?.creator_id
    if (!creatorId) return null
    return (await storeOriginFor(db, creatorId, origin)) === origin ? back : null
  } catch {
    return null
  }
}

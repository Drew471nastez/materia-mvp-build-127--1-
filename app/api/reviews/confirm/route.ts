import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { confirmPagePath, verifyDraft } from "@/lib/reviews/request-token"
import { confirmDraft } from "@/lib/reviews/site-server"

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
 */
const HEADERS = { "Cache-Control": "no-store" }

export async function POST(request: NextRequest) {
  const limited = await rateLimit({ bucket: "review-confirm", subjects: [addressSubject(request)], windows: [{ limit: 10, seconds: 600 }, { limit: 40, seconds: 86_400 }], message: "That is a lot at once. Try again later." })
  if (limited) return limited
  let token: unknown = null
  try {
    const form = await request.formData()
    token = form.get("token")
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: HEADERS })
  }
  const id = verifyDraft(token)
  if (!id || typeof token !== "string") return NextResponse.json({ error: "This link doesn't work." }, { status: 404, headers: HEADERS })
  const done = await confirmDraft(createAdminClient(), id)
  const to = new URL(confirmPagePath(token), request.url)
  if (!done.ok) to.searchParams.set("error", String(done.status))
  return NextResponse.redirect(to, { status: 303, headers: HEADERS })
}

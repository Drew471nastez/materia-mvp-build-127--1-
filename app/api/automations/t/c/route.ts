import { NextResponse, after, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/email-automation"
import { decodeTarget, isToken, verifyTarget } from "@/lib/automations/tracking"
import { recordClick } from "@/lib/automations/track-events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A link in an automated email. It goes where the email said, and only
 * there: the target is signed with the send's token when the email is made
 * (lib/automations/tracking.ts), so an edited link goes to Storelib's home
 * page rather than wherever somebody wanted to send people.
 *
 * A click is also an open (the pixel is often blocked), so both are written
 * where they are still empty (lib/automations/track-events recordClick).
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const token = q.get("k")
  const target = decodeTarget(q.get("u"))
  if (!isToken(token) || !target || !verifyTarget(token, target, q.get("s"))) {
    return NextResponse.redirect(APP_URL, 302)
  }
  after(async () => {
    try {
      await recordClick(createAdminClient(), token)
    } catch {
      /* A click that is not counted still arrives. */
    }
  })
  return NextResponse.redirect(target, 302)
}

import { NextResponse, after, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_URL } from "@/lib/email-automation"
import { isToken, readTarget, verifyTarget } from "@/lib/automations/tracking"
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
  const target = readTarget(q.get("u"))
  const sig = q.get("s")
  /* Signed over the URL's reading of the address, or, in an email sent
     before that, over the address as it was written (readTarget). */
  if (!target || !isToken(token) || !(verifyTarget(token, target.href, sig) || verifyTarget(token, target.written, sig))) {
    return NextResponse.redirect(APP_URL, 302)
  }
  after(async () => {
    try {
      await recordClick(createAdminClient(), token)
    } catch {
      /* A click that is not counted still arrives. */
    }
  })
  return NextResponse.redirect(target.href, 302)
}

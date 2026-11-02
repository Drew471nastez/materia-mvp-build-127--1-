/**
 * ===========================================================================
 *  GET /api/explore/interests: WHAT "FOR YOU" IS BUILT FROM, FOR THIS PERSON (round 49)
 * ===========================================================================
 * /explore is one HTML for everybody now, held by the CDN (next.config.mjs,
 * tests/cdnpages-r49). The page used to read the signed in person's
 * interests on the server and open on For you; it now opens on All for
 * everybody and the page asks here after load, for a browser that has a
 * session (lib/auth/session-hint). The same rules as before: the person's
 * own setting (Settings: personalised recommendations), the same threshold
 * (lib/explore/interests), and the same 1.5s ceiling, after which the
 * ordinary Explore stands.
 *
 * Private and never stored: the answer is this person's.
 */
import { NextResponse } from "next/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { settleWithin } from "@/lib/net/request"
import { EMPTY_INTERESTS } from "@/lib/explore/interests"
import { readInterests } from "@/lib/explore/read-interests"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRIVATE = { "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store" }
const INTERESTS_WAIT_MS = 1_500

/* The viewer's own setting, a private column: read by the server for this signed in id (lib/security/public-columns). */
async function personalizationOn(userId: string, kept?: boolean): Promise<boolean> {
  const { data: pref } = await createAdminClient().from("profiles").select("personalized_recommendations").eq("id", userId).maybeSingle()
  const column = (pref as { personalized_recommendations?: boolean } | null)?.personalized_recommendations
  /* No column yet: the choice Settings kept on the account (app/api/account/preferences). */
  return typeof column === "boolean" ? column : kept !== false
}

export async function GET() {
  const interests = await settleWithin(
    (async () => {
      const { user } = await currentUserForRequest()
      if (!user) return EMPTY_INTERESTS
      if (!(await personalizationOn(user.id, user.user_metadata?.personalized_recommendations))) return EMPTY_INTERESTS
      return readInterests(user.id, user.email)
    })().catch(() => EMPTY_INTERESTS),
    INTERESTS_WAIT_MS,
    EMPTY_INTERESTS,
  )
  return NextResponse.json({ interests }, { headers: PRIVATE })
}

import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { loadAccountEmail, loadCreatorForUser, loadProfileByUsername } from "@/lib/commerce/creator-page-data"
import { hasBoughtFromCreator } from "@/lib/commerce/has-bought-from-creator"
import { CONTACT_EMAIL_HEADERS, contactEmailFor } from "@/lib/commerce/contact-email"
import { creatorIsBanned } from "@/lib/seo/bans"
import { loadTypedContactEmail } from "@/lib/store-builder/public-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  GET /api/creator-contact?handle=<name>   -> { email } | 404
 * ===========================================================================
 * The creator page's Contact button asks this when it is pressed, so the
 * page itself never carries the address (lib/commerce/contact-email.ts).
 * The same rule as the page: a creator page that is up and not banned, an
 * address to give, and a viewer who has bought from them. Anything else is
 * one plain 404, whichever part said no.
 *
 * Not under /api/public: that prefix is for handlers that read no session
 * (lib/auth/no-session-paths.ts), and this one has to know who is asking.
 *
 * Counted per address (lib/api/rate-limit.ts): a buyer presses it once or
 * twice; a script walking handles is stopped long before it gets anywhere,
 * and each try needs a purchase from that creator to be worth anything.
 * Never cached, never indexed.
 */
const WINDOWS = [
  { limit: 10, seconds: 60 },
  { limit: 60, seconds: 3600 },
]

export async function GET(request: NextRequest) {
  const limited = await rateLimit({
    bucket: "creator-contact",
    subjects: [addressSubject(request)],
    windows: WINDOWS,
    message: "That is a lot of asking. Try again in a minute.",
  })
  if (limited) {
    for (const [k, v] of Object.entries(CONTACT_EMAIL_HEADERS)) limited.headers.set(k, v)
    return limited
  }

  const { user } = await currentUserForRequest()
  const supabase = await createClient()
  const email = await contactEmailFor(request.nextUrl.searchParams.get("handle"), user?.id ?? null, {
    profile: (handle) => loadProfileByUsername(handle),
    creator: (userId) => loadCreatorForUser(userId),
    banned: (creatorId) => creatorIsBanned(creatorId),
    /* The published config the pages read carries no address (round 48); the typed one is read on its own, by the server. */
    typedEmail: (creatorId) => loadTypedContactEmail(creatorId),
    accountEmail: (userId) => loadAccountEmail(userId),
    viewerBought: (viewerId, creatorId) => hasBoughtFromCreator(supabase, viewerId, creatorId),
  })
  if (!email) return NextResponse.json({ error: "No contact address." }, { status: 404, headers: CONTACT_EMAIL_HEADERS })
  return NextResponse.json({ email }, { headers: CONTACT_EMAIL_HEADERS })
}

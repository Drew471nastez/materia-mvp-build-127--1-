/**
 * GET /api/profile/contributions?userId=<person>[&only=<communityId>,...]
 * -> { sections: [{ community, stats, page, own }] }: what that person gave
 * to each community the signed in viewer may read them in (their own
 * communities when it is the person themselves, else the ones the two
 * share), with the first page of their posts there (lib/profile/
 * contributions.ts). For a creator's page, which is the same for everyone
 * and asks for the viewer's part once it is in the browser. 404
 * communities_off while the switch is off; signed out, no sections.
 */
import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { contributionsFor } from "@/lib/profile/contributions"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const limited = await rateLimit({ bucket: "profile-contributions", subjects: [addressSubject(request)], windows: [{ limit: 60, seconds: 60 }] })
  if (limited) return limited
  const params = new URL(request.url).searchParams
  const targetId = params.get("userId") || ""
  if (!UUID.test(targetId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user?.id) return NextResponse.json({ sections: [] }, { headers: NO_STORE })
  const only = (params.get("only") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID.test(s))
    .slice(0, 24)
  const sections = await contributionsFor(createAdminClient(), { viewerId: user.id, targetId, only: only.length ? only : null }).catch(() => [])
  return NextResponse.json({ sections }, { headers: NO_STORE })
}

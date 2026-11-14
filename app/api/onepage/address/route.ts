/**
 * GET /api/onepage/address?name=mara
 *
 * The editor's live check while somebody types their link, storelib.me/
 * {name}: whether it may be picked (lib/onepage/username checkOnePageName)
 * and whether it is free for them (lib/onepage/name-availability, the same
 * check the save runs). Signed in only, per person rate limited, never
 * cached, and never on storelib.me (the proxy answers 404 for it there).
 *
 *   { name, available: true }
 *   { name, available: false, taken: true, error: "That page address is taken" }
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { onePageActor } from "@/lib/team/onepage"
import { checkOnePageName } from "@/lib/onepage/username"
import { onePageNameTaken } from "@/lib/onepage/name-availability"
import { rateLimit } from "@/lib/api/rate-limit"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: Request) {
  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Sign in again to check a name." }, { status: 401, headers: NO_STORE })

  const raw = new URL(request.url).searchParams.get("name")
  const verdict = checkOnePageName(raw)
  if (!verdict.ok) return NextResponse.json({ name: raw ?? "", available: false, error: verdict.error }, { headers: NO_STORE })

  /* A check per pause in typing: a person makes a few a word, a script walking names makes thousands. */
  const limited = await rateLimit({
    bucket: "onepage-address",
    subjects: [`user:${user.id}`],
    windows: [{ limit: 60, seconds: 60 }, { limit: 600, seconds: 3600 }],
    message: "That is a lot of checks at once. Wait a moment and try again.",
  })
  if (limited) return limited

  /* Whose page the name is for (lib/team/onepage): the owner's own, or for a team member with OnePage the store owner's. */
  const actor = await onePageActor(supabase, user.id)
  if (actor instanceof NextResponse) return actor
  const { data: page } = await actor.db.from("onepages").select("id, slug").eq("owner_id", actor.pageOwnerId).maybeSingle()
  const own = page as { id?: string; slug?: string | null } | null
  if (own?.slug && own.slug.toLowerCase() === verdict.value) {
    return NextResponse.json({ name: verdict.value, available: true, current: true }, { headers: NO_STORE })
  }

  const taken = await onePageNameTaken(verdict.value, { onepageId: own?.id ?? null, userId: actor.pageOwnerId })
  if (taken === "unknown") {
    return NextResponse.json({ name: verdict.value, available: null, error: "Could not check that name just now" }, { status: 503, headers: NO_STORE })
  }
  return NextResponse.json(
    taken === "taken" ? { name: verdict.value, available: false, taken: true, error: "That page address is taken" } : { name: verdict.value, available: true },
    { headers: NO_STORE },
  )
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { emptyResult, isSearchable, normalizeQuery, searchCreator, type SearchGroupId } from "@/lib/search/app-search"
import { createAdminClient } from "@/lib/supabase/admin"
import { actingStoreRead, storeUnavailableResponse } from "@/lib/team/server"
import { permits, type TeamArea } from "@/lib/team/permissions"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { communitiesEnabled } from "@/lib/communities/flag"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

/**
 * Which part of a store each group belongs to (lib/team/permissions), so a
 * teammate finds only what their permissions open, and nobody another
 * store's anything. Null is everyone's: the Help Center's articles.
 * Integrations are the store's own ("store"), which no teammate is given.
 */
const GROUP_AREA: Record<SearchGroupId, TeamArea | null> = {
  orders: "orders",
  customers: "customers",
  products: "products",
  collections: "products",
  offers: "marketing",
  coupons: "marketing",
  size_charts: "products",
  emails: "marketing",
  automations: "marketing",
  communities: "community",
  integrations: "store",
  help: null,
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * THE /app HEADER SEARCH
 *
 *   POST { q }   signed in. Answers the creator's own orders, customers,
 *                products, emails and automations that match, five of each
 *                (lib/search/app-search.ts).
 *
 * A POST and not a GET, because the query can be a buyer's email address and
 * a GET puts it in the address, which request logs keep. Nothing here logs it
 * either.
 *
 * The creator is read from the session, on the person's own client, so row
 * level security holds on top of the explicit scoping in searchCreator.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Sign in again to search." }, { status: 401, headers: NO_STORE })

  const body = await request.json().catch(() => null)
  const q = normalizeQuery(body?.q)
  /* Something was saved in the browser since its last search (components/app/app-search.tsx): nothing kept is used. */
  const fresh = body?.fresh === true
  if (!isSearchable(q)) return NextResponse.json(emptyResult(), { headers: NO_STORE })

  const limited = await rateLimit({
    bucket: "app-search",
    subjects: [`user:${user.id}`],
    windows: LIMITS.search,
    message: "That is a lot of searching at once. Wait a moment and try again.",
  })
  if (limited) return limited

  /*
    WORKING IN SOMEBODY ELSE'S STORE (lib/team): that store, read with the
    service role and held to it by the creator id every query names, and
    only the groups the role opens. It used to search the teammate's own
    account, which has nothing in it, so search found nothing at all.
  */
  const admin = createAdminClient()
  const [actingRead, physical, communities] = await Promise.all([
    actingStoreRead(admin, user.id),
    isPhysicalCommerceEnabled().catch(() => false),
    communitiesEnabled().catch(() => false),
  ])
  /* The membership read failed: 503, never a search of their own account in the store's place (round rel2-auth). */
  if (actingRead.failed) return storeUnavailableResponse()
  const acting = actingRead.acting
  if (acting) {
    /* A teammate never finds the owner's communities: those are the owner's account, not the store. */
    const groups = new Set((Object.keys(GROUP_AREA) as SearchGroupId[]).filter((g) => {
      const area = GROUP_AREA[g]
      return g !== "communities" && (area === null || permits(acting.permissions, area))
    }))
    try {
      return NextResponse.json(await searchCreator(admin, acting.creatorId, q, { groups, physical, fresh }), { headers: NO_STORE })
    } catch (err) {
      console.error("[app-search] failed", err instanceof Error ? err.name : "error")
      return NextResponse.json({ error: "Search is not working right now." }, { status: 500, headers: NO_STORE })
    }
  }

  const { data: creator, error: creatorError } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (creatorError) {
    console.error(`[app-search] could not read the creator (${creatorError.code || "error"})`)
    return NextResponse.json({ error: "Search is not working right now." }, { status: 500, headers: NO_STORE })
  }
  /* Signed in without a store yet: there is nothing of theirs to find. */
  if (!creator?.id) return NextResponse.json(emptyResult(), { headers: NO_STORE })

  try {
    return NextResponse.json(await searchCreator(supabase, creator.id, q, { ownerUserId: communities ? user.id : null, physical, fresh }), { headers: NO_STORE })
  } catch (err) {
    console.error("[app-search] failed", err instanceof Error ? err.name : "error")
    return NextResponse.json({ error: "Search is not working right now." }, { status: 500, headers: NO_STORE })
  }
}

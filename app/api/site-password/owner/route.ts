/**
 * ===========================================================================
 *  THE OWNER, PAST THEIR OWN PASSWORD PAGE
 * ===========================================================================
 * Linked from the password page as "Enter as the owner", the way Shopify's
 * password page says "Are you the store owner? Log in here". Answered on
 * storelib.com, where the creator's session lives:
 *
 *   signed out          to the login page, and back here afterwards
 *   not the owner       back to the password page, which says so
 *   the owner           on to the website with a two minute note
 *                       (lib/site-password/enter ownerHandOff), which the
 *                       website spends once for a pass
 *
 * `host` is only ever a host a creator's published website answers at,
 * looked up in the database; anything else goes back to storelib.com.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { classifySiteHost, siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { originOf, privateResponse } from "@/lib/site-accounts/respond"
import { ownerHandOff } from "@/lib/site-password/enter"
import { passReturnPath } from "@/lib/site-password/gate"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const main = `https://${getMainDomain()}`
  const site = classifySiteHost(url.searchParams.get("host"))
  if (!site) return privateResponse(NextResponse.redirect(main, 303))
  const back = passReturnPath(url.searchParams.get("return"))

  /* Supabase Auth itself, as before (round rel2-auth). Auth not answering: back to the site, never to sign in for nothing. */
  const who = await routeUser({ fresh: true })
  if (who.kind === "unavailable") return privateResponse(authUnavailableResponse())
  const auth = { user: who.kind === "user" ? who.user : null }
  if (!auth.user) {
    const here = `/api/site-password/owner?${new URLSearchParams({ host: site.host, ...(back !== "/" ? { return: back } : {}) }).toString()}`
    return privateResponse(NextResponse.redirect(`${main}/login?next=${encodeURIComponent(here)}`, 303))
  }

  const db = createAdminClient()
  const result = await ownerHandOff(
    { host: site.host, userId: auth.user.id, returnTo: back, origin: originOf },
    {
      db,
      owner: (h) => siteOwnerOfHost(db, h),
      ownsCreator: async (userId, creatorId) => {
        const { data } = await db.from("creators").select("id").eq("id", creatorId).eq("user_id", userId).maybeSingle()
        return !!data
      },
    },
  )
  if (result.ok) return privateResponse(NextResponse.redirect(result.url, 303))
  const to = new URL(result.why === "open" ? back : "/password", originOf(site.host))
  if (result.why === "owner") to.searchParams.set("error", "owner")
  if (result.why !== "open" && back !== "/") to.searchParams.set("return", back)
  return privateResponse(NextResponse.redirect(result.why === "site" ? main : to.toString(), 303))
}

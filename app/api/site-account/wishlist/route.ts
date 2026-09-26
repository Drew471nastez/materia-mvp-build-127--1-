import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { hostOf, visitorOfRequest, type SiteVisitor } from "@/lib/site-accounts/session"
import { customerById } from "@/lib/site-accounts/customers"
import { privateResponse, sameOriginWrite } from "@/lib/site-accounts/respond"
import { rateLimit } from "@/lib/api/rate-limit"
import {
  addToSiteWishlist,
  listSiteWishlist,
  mergeIntoSiteWishlist,
  removeFromSiteWishlist,
} from "@/lib/site-accounts/wishlist-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A SIGNED-IN CUSTOMER'S SAVED ITEMS, ON A CREATOR'S WEBSITE
 * ===========================================================================
 *   GET                                  the ids saved on this website
 *   POST { action: "add", productId }    save one
 *   POST { action: "remove", productId } take one out
 *   POST { action: "merge", ids }        the guest list this browser kept
 *
 * WHO is the website's own session cookie and nothing in the request: there
 * is no customer id to send. The session names a customer of one creator,
 * and that customer must still be there (lib/site-accounts/customers.ts);
 * every write is checked against that creator's published products in
 * lib/site-accounts/wishlist-store.ts. A visitor who is not signed in gets
 * `signedIn: false` and keeps their list in the browser.
 *
 * Writes come from this website's own page: JSON with this host's Origin
 * (lib/site-accounts/respond.ts). Another website on storelib.com is the
 * same site as far as cookies go, so the Origin is what tells them apart.
 */

/** The session's customer, when the session is good and the customer is still there. */
async function signedIn(request: Request): Promise<SiteVisitor | null> {
  const visitor = visitorOfRequest(request)
  if (!visitor) return null
  const customer = await customerById(createAdminClient(), visitor)
  return customer ? visitor : null
}

export async function GET(request: Request) {
  const visitor = await signedIn(request)
  if (!visitor) return privateResponse(NextResponse.json({ signedIn: false, ids: [] }))
  const list = await listSiteWishlist(createAdminClient(), visitor)
  return privateResponse(NextResponse.json({ signedIn: true, available: list.available, ids: list.ids }))
}

export async function POST(request: Request) {
  const host = hostOf(request)
  if (!sameOriginWrite(request, host)) {
    return privateResponse(NextResponse.json({ error: "Not allowed" }, { status: 403 }))
  }
  const visitor = await signedIn(request)
  if (!visitor) return privateResponse(NextResponse.json({ signedIn: false, ids: [] }, { status: 401 }))

  let body: { action?: unknown; productId?: unknown; ids?: unknown }
  try {
    body = await request.json()
  } catch {
    return privateResponse(NextResponse.json({ error: "Bad request" }, { status: 400 }))
  }

  /* A person pressing hearts does a few a minute; a script does thousands. */
  const limited = await rateLimit({
    bucket: "site-wishlist",
    subjects: [`customer:${visitor.customerId}`],
    windows: [{ limit: 60, seconds: 60 }, { limit: 600, seconds: 3600 }],
    message: "That is a lot of changes at once. Try again in a minute.",
  })
  if (limited) return privateResponse(limited)

  const db = createAdminClient()
  const productId = typeof body.productId === "string" ? body.productId : ""
  const result =
    body.action === "add"
      ? await addToSiteWishlist(db, visitor, productId)
      : body.action === "remove"
        ? await removeFromSiteWishlist(db, visitor, productId)
        : body.action === "merge"
          ? await mergeIntoSiteWishlist(db, visitor, body.ids)
          : null
  if (!result) return privateResponse(NextResponse.json({ error: "Bad request" }, { status: 400 }))
  return privateResponse(NextResponse.json({ signedIn: true, available: result.available, ids: result.ids }))
}

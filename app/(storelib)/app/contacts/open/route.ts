import { NextResponse } from "next/server"
import { NO_STORE, requireContacts } from "@/lib/contacts/gate"
import { gatherPerson, ownedSeed } from "@/lib/contacts/profile-server"
import { isUuid, type KeyKind } from "@/lib/contacts/identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  /app/contacts/open?from=<kind>&id=<record id>  (round 51)
 * ===========================================================================
 * The one way the rest of the app links to a person: an order, a community
 * member, a lead, a form answer, a subscriber names its own row, and this
 * finds the person that row belongs to and opens their profile
 * (/app/contacts/<contactId>).
 *
 *   signed out                 to sign in, and back here after
 *   no access to Contacts      to /app/contacts, which says so
 *   the row is not this store's, or not there
 *                              to the People list with notice=not_found;
 *                              nothing of the row is read or shown
 *   the row is this store's but makes nobody (an order with no address
 *   or account)               to the People list with notice=no_person
 *
 * Every read names the store the session works in (lib/contacts/gate).
 */
const KINDS: Record<string, KeyKind | "site_form_submission"> = {
  community_member: "community_member",
  customer: "customer",
  subscriber: "subscriber",
  lead: "lead",
  form_submission: "form_submission",
  site_form_submission: "site_form_submission",
  message: "message",
  order: "order",
  membership: "membership",
  enrollment: "enrollment",
  contact: "contact",
  user: "user",
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin), { status: 303, headers: NO_STORE })
  const kind = KINDS[url.searchParams.get("from") ?? ""]
  const id = (url.searchParams.get("id") ?? "").trim().toLowerCase()
  const gate = await requireContacts({ read: true })
  if (gate instanceof NextResponse) {
    if (gate.status === 401) return to(`/login?next=${encodeURIComponent(url.pathname + url.search)}`)
    return to("/app/contacts")
  }
  if (!kind || !isUuid(id)) return to("/app/contacts?notice=not_found")
  const seed = await ownedSeed(gate.db, gate, kind, id).catch(() => null)
  if (!seed) return to("/app/contacts?notice=not_found")
  const person = await gatherPerson(gate.db, gate, seed).catch(() => null)
  if (!person) return to("/app/contacts?notice=no_person")
  return to(`/app/contacts/${encodeURIComponent(person.person.id)}`)
}

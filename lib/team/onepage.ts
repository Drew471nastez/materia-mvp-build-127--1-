import "server-only"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { permits } from "./permissions"
import { NO_ACCESS, actingStore, type ActingStore } from "./server"

/**
 * ===========================================================================
 *  WHOSE ONEPAGE A ROUTE EDITS (round 40)
 * ===========================================================================
 * A OnePage is kept by account (onepages.owner_id), not by store, and its
 * routes read and write it with the signed in person's own client, under row
 * level security that only answers for the owner. A team member with the
 * OnePage permission edits the store owner's page instead:
 *
 *   their own account    the session's client and their own id, exactly as
 *                        before (no cookie, no extra read)
 *   working in a store,  the service role, and the store owner's account id:
 *   with OnePage         every query the route makes is filtered by it
 *                        (`.eq("owner_id", pageOwnerId)`), so nothing outside
 *                        that one page is reached
 *   working in a store,  403, never their own page in its place
 *   without it
 *
 * The membership and its permissions are read from the database on each
 * request (lib/team/server actingStore), so a member removed or a permission
 * taken away gets nothing on the next save.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any

export interface OnePageActor {
  /** The signed in person: the owner, or the member doing the work. */
  userId: string
  /** The account whose OnePage this is: the signed in owner, or the store's owner. */
  pageOwnerId: string
  /** The client every query goes through: the session's for the owner, the service role (always filtered by pageOwnerId) for a member. */
  db: Client
  isOwner: boolean
  acting: ActingStore | null
}

const noStore = { "Cache-Control": "no-store" }

/** Pure: what a request with this acting store gets. Exported for the suite. */
export function onePageActorFor(userId: string, session: Client, acting: ActingStore | null, admin: () => Client): OnePageActor | { refuse: 403 | 404; error: string } {
  if (!acting) return { userId, pageOwnerId: userId, db: session, isOwner: true, acting: null }
  if (!permits(acting.permissions, "onepage")) return { refuse: 403, error: NO_ACCESS }
  if (!acting.ownerUserId) return { refuse: 404, error: "This store isn't on Storelib any more." }
  return { userId, pageOwnerId: acting.ownerUserId, db: admin(), isOwner: false, acting }
}

/**
 * For a OnePage route that has already read the signed in user with its
 * session client: whose page, through which client. A NextResponse to send
 * when the answer is no.
 */
export async function onePageActor(session: Client, userId: string): Promise<OnePageActor | NextResponse> {
  const acting = await actingStore(createAdminClient(), userId).catch(() => null)
  const out = onePageActorFor(userId, session, acting, createAdminClient)
  if ("refuse" in out) return NextResponse.json({ error: out.error }, { status: out.refuse, headers: noStore })
  return out
}
